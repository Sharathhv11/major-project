"""
Feature engineering for FraudShield GCN.

Computes node-level features from transaction data, including transaction
activity, network structure, temporal patterns, and data quality metrics.

Key design decisions:
- Features are computed only from information available at prediction time
- No future leakage: temporal features respect cutoff timestamps
- No label leakage: ground-truth labels are never used as features
- No identifier leakage: raw IDs and row indices are excluded
- Preprocessing (scaling, imputation) is fit on training data only
- Feature names and order are deterministic and saved with artifacts
- Direction of transactions is preserved for feature computation
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import torch
from sklearn.preprocessing import RobustScaler, StandardScaler, MinMaxScaler
import joblib

logger = logging.getLogger(__name__)


class FeatureEngineer:
    """
    Computes node features from transaction data.

    Features are grouped into:
    - Transaction activity (counts, amounts, counterparties)
    - Network structure (degree, neighbors)
    - Temporal patterns (time windows, burst detection)
    - Data quality (coverage, record counts)
    """

    # Canonical feature order
    ALL_FEATURE_NAMES = [
        # Transaction activity
        "in_tx_count",
        "out_tx_count",
        "total_in_amount",
        "total_out_amount",
        "avg_in_amount",
        "avg_out_amount",
        "max_tx_amount",
        "tx_amount_std",
        "unique_in_counterparties",
        "unique_out_counterparties",
        "active_days",
        "recent_tx_freq_7d",
        "time_since_last_tx_days",
        # Network structure
        "in_degree",
        "out_degree",
        "total_degree",
        "distinct_neighbors",
        # Temporal
        "tx_count_1d",
        "tx_count_7d",
        "tx_count_30d",
        "rapid_in_out_count",
        "in_out_volume_ratio",
        # Data quality
        "record_count",
        "coverage_days",
    ]

    def __init__(self, config: Dict[str, Any]):
        """
        Parameters
        ----------
        config : dict
            Configuration dictionary with feature settings.
        """
        feat_config = config.get("features", {})
        self.log_transform_amounts = feat_config.get("log_transform_amounts", True)
        self.scaler_type = feat_config.get("scaler_type", "robust")

        # Select configured features
        configured_features = set()
        for group in ["transaction_features", "network_features", "temporal_features", "quality_features"]:
            configured_features.update(feat_config.get(group, []))

        if configured_features:
            self.feature_names = [f for f in self.ALL_FEATURE_NAMES if f in configured_features]
        else:
            self.feature_names = list(self.ALL_FEATURE_NAMES)

        self.scaler = None
        self._is_fitted = False

    def compute_features(
        self,
        df: pd.DataFrame,
        num_nodes: int,
        reference_time: Optional[pd.Timestamp] = None,
    ) -> Tuple[torch.Tensor, List[str]]:
        """
        Compute node features from transaction data.

        Parameters
        ----------
        df : pd.DataFrame
            Transaction data with sender_node_idx, receiver_node_idx, amount, timestamp.
        num_nodes : int
            Total number of nodes in the graph.
        reference_time : pd.Timestamp, optional
            Reference time for temporal features. Defaults to max timestamp in data.

        Returns
        -------
        Tuple[torch.Tensor, List[str]]
            Feature matrix [num_nodes, num_features] and list of feature names.
        """
        if reference_time is None and "timestamp" in df.columns:
            reference_time = df["timestamp"].max()

        features = {}

        # Transaction activity features
        features.update(self._transaction_activity_features(df, num_nodes))

        # Network structure features
        features.update(self._network_structure_features(df, num_nodes))

        # Temporal features
        if "timestamp" in df.columns and pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            features.update(self._temporal_features(df, num_nodes, reference_time))
        else:
            # Fill temporal features with zeros if no timestamps
            for fname in ["tx_count_1d", "tx_count_7d", "tx_count_30d",
                          "rapid_in_out_count", "in_out_volume_ratio"]:
                features[fname] = np.zeros(num_nodes, dtype=np.float32)

        # Data quality features
        features.update(self._data_quality_features(df, num_nodes))

        # Build feature matrix in canonical order
        feature_matrix = np.column_stack(
            [features.get(name, np.zeros(num_nodes, dtype=np.float32)) for name in self.feature_names]
        )

        # Apply log transform to skewed amount features
        if self.log_transform_amounts:
            amount_cols = [
                i for i, name in enumerate(self.feature_names)
                if "amount" in name or "volume" in name
            ]
            for col_idx in amount_cols:
                feature_matrix[:, col_idx] = np.log1p(np.abs(feature_matrix[:, col_idx]))

        # Replace NaN/Inf with 0
        feature_matrix = np.nan_to_num(feature_matrix, nan=0.0, posinf=0.0, neginf=0.0)

        feature_tensor = torch.tensor(feature_matrix, dtype=torch.float32)

        logger.info(
            "Computed %d features for %d nodes",
            len(self.feature_names),
            num_nodes,
        )

        return feature_tensor, self.feature_names

    def fit_scaler(self, features: torch.Tensor) -> torch.Tensor:
        """
        Fit the scaler on TRAINING data only and transform.

        Parameters
        ----------
        features : torch.Tensor
            Training feature matrix.

        Returns
        -------
        torch.Tensor
            Scaled features.
        """
        arr = features.numpy()

        if self.scaler_type == "robust":
            self.scaler = RobustScaler()
        elif self.scaler_type == "standard":
            self.scaler = StandardScaler()
        elif self.scaler_type == "minmax":
            self.scaler = MinMaxScaler()
        else:
            raise ValueError(f"Unknown scaler type: {self.scaler_type}")

        scaled = self.scaler.fit_transform(arr)
        self._is_fitted = True

        scaled = np.nan_to_num(scaled, nan=0.0, posinf=0.0, neginf=0.0)

        return torch.tensor(scaled, dtype=torch.float32)

    def transform(self, features: torch.Tensor) -> torch.Tensor:
        """
        Transform features using the already-fitted scaler.

        Parameters
        ----------
        features : torch.Tensor
            Feature matrix to transform.

        Returns
        -------
        torch.Tensor
            Scaled features.

        Raises
        ------
        RuntimeError
            If scaler has not been fitted.
        """
        if not self._is_fitted or self.scaler is None:
            raise RuntimeError("Scaler not fitted. Call fit_scaler() first with training data.")

        arr = features.numpy()
        scaled = self.scaler.transform(arr)
        scaled = np.nan_to_num(scaled, nan=0.0, posinf=0.0, neginf=0.0)

        return torch.tensor(scaled, dtype=torch.float32)

    def fit_and_transform_splits(
        self,
        features: torch.Tensor,
        train_mask: torch.Tensor,
    ) -> torch.Tensor:
        """
        Fit scaler on training nodes only, then transform ALL nodes.

        This prevents information leakage from validation/test nodes
        into the scaler statistics.

        Parameters
        ----------
        features : torch.Tensor
            Full feature matrix [num_nodes, num_features].
        train_mask : torch.Tensor
            Boolean mask indicating training nodes.

        Returns
        -------
        torch.Tensor
            Scaled feature matrix for all nodes.
        """
        arr = features.numpy()
        train_arr = arr[train_mask.numpy()]

        if self.scaler_type == "robust":
            self.scaler = RobustScaler()
        elif self.scaler_type == "standard":
            self.scaler = StandardScaler()
        elif self.scaler_type == "minmax":
            self.scaler = MinMaxScaler()
        else:
            raise ValueError(f"Unknown scaler type: {self.scaler_type}")

        # Fit ONLY on training data
        self.scaler.fit(train_arr)
        self._is_fitted = True

        # Transform ALL nodes
        scaled = self.scaler.transform(arr)
        scaled = np.nan_to_num(scaled, nan=0.0, posinf=0.0, neginf=0.0)

        return torch.tensor(scaled, dtype=torch.float32)

    def save_preprocessing(self, path: str) -> None:
        """Save the fitted scaler and feature names."""
        if not self._is_fitted:
            raise RuntimeError("Cannot save: scaler not fitted.")
        joblib.dump(
            {"scaler": self.scaler, "feature_names": self.feature_names},
            path,
        )
        logger.info("Saved preprocessing artifacts to %s", path)

    def load_preprocessing(self, path: str) -> None:
        """Load a previously saved scaler and feature names."""
        data = joblib.load(path)
        self.scaler = data["scaler"]
        self.feature_names = data["feature_names"]
        self._is_fitted = True
        logger.info("Loaded preprocessing artifacts from %s", path)

    # ---- Private feature computation methods ----

    def _transaction_activity_features(
        self,
        df: pd.DataFrame,
        num_nodes: int,
    ) -> Dict[str, np.ndarray]:
        """Compute transaction activity features per node."""
        features = {}

        # Incoming transactions (node is receiver)
        in_groups = df.groupby("receiver_node_idx")
        out_groups = df.groupby("sender_node_idx")

        # Incoming counts
        in_counts = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0:
            gc = in_groups.size()
            in_counts[gc.index.values] = gc.values.astype(np.float32)
        features["in_tx_count"] = in_counts

        # Outgoing counts
        out_counts = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0:
            gc = out_groups.size()
            out_counts[gc.index.values] = gc.values.astype(np.float32)
        features["out_tx_count"] = out_counts

        # Incoming amounts
        total_in = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0:
            ga = in_groups["amount"].sum()
            total_in[ga.index.values] = ga.values.astype(np.float32)
        features["total_in_amount"] = total_in

        # Outgoing amounts
        total_out = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0:
            ga = out_groups["amount"].sum()
            total_out[ga.index.values] = ga.values.astype(np.float32)
        features["total_out_amount"] = total_out

        # Average amounts (safe division)
        features["avg_in_amount"] = np.divide(
            total_in, in_counts, out=np.zeros_like(total_in), where=in_counts > 0
        )
        features["avg_out_amount"] = np.divide(
            total_out, out_counts, out=np.zeros_like(total_out), where=out_counts > 0
        )

        # Max transaction amount
        max_amount = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0:
            # Check max from both incoming and outgoing
            for groups_col, groups in [("receiver_node_idx", in_groups), ("sender_node_idx", out_groups)]:
                ga = groups["amount"].max()
                for idx, val in zip(ga.index.values, ga.values):
                    max_amount[idx] = max(max_amount[idx], val)
        features["max_tx_amount"] = max_amount

        # Transaction amount std
        tx_std = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0:
            all_tx = pd.concat([
                df[["sender_node_idx", "amount"]].rename(columns={"sender_node_idx": "node_idx"}),
                df[["receiver_node_idx", "amount"]].rename(columns={"receiver_node_idx": "node_idx"}),
            ])
            std_groups = all_tx.groupby("node_idx")["amount"].std()
            valid = std_groups.dropna()
            tx_std[valid.index.values] = valid.values.astype(np.float32)
        features["tx_amount_std"] = tx_std

        # Unique counterparties
        unique_in = np.zeros(num_nodes, dtype=np.float32)
        unique_out = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0:
            uc_in = in_groups["sender_node_idx"].nunique()
            unique_in[uc_in.index.values] = uc_in.values.astype(np.float32)
            uc_out = out_groups["receiver_node_idx"].nunique()
            unique_out[uc_out.index.values] = uc_out.values.astype(np.float32)
        features["unique_in_counterparties"] = unique_in
        features["unique_out_counterparties"] = unique_out

        # Active days
        active_days = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0 and "timestamp" in df.columns and pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            all_tx = pd.concat([
                df[["sender_node_idx", "timestamp"]].rename(columns={"sender_node_idx": "node_idx"}),
                df[["receiver_node_idx", "timestamp"]].rename(columns={"receiver_node_idx": "node_idx"}),
            ])
            all_tx["date"] = all_tx["timestamp"].dt.date
            ad = all_tx.groupby("node_idx")["date"].nunique()
            active_days[ad.index.values] = ad.values.astype(np.float32)
        features["active_days"] = active_days

        return features

    def _network_structure_features(
        self,
        df: pd.DataFrame,
        num_nodes: int,
    ) -> Dict[str, np.ndarray]:
        """Compute network structure features per node."""
        features = {}

        in_degree = np.zeros(num_nodes, dtype=np.float32)
        out_degree = np.zeros(num_nodes, dtype=np.float32)

        if len(df) > 0:
            # In-degree: unique senders per receiver
            in_deg = df.groupby("receiver_node_idx")["sender_node_idx"].nunique()
            in_degree[in_deg.index.values] = in_deg.values.astype(np.float32)

            # Out-degree: unique receivers per sender
            out_deg = df.groupby("sender_node_idx")["receiver_node_idx"].nunique()
            out_degree[out_deg.index.values] = out_deg.values.astype(np.float32)

        features["in_degree"] = in_degree
        features["out_degree"] = out_degree
        features["total_degree"] = in_degree + out_degree

        # Distinct neighbors (undirected)
        distinct_neighbors = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0:
            all_edges = pd.concat([
                df[["sender_node_idx", "receiver_node_idx"]].rename(
                    columns={"sender_node_idx": "node", "receiver_node_idx": "neighbor"}
                ),
                df[["receiver_node_idx", "sender_node_idx"]].rename(
                    columns={"receiver_node_idx": "node", "sender_node_idx": "neighbor"}
                ),
            ])
            dn = all_edges.groupby("node")["neighbor"].nunique()
            distinct_neighbors[dn.index.values] = dn.values.astype(np.float32)
        features["distinct_neighbors"] = distinct_neighbors

        return features

    def _temporal_features(
        self,
        df: pd.DataFrame,
        num_nodes: int,
        reference_time: pd.Timestamp,
    ) -> Dict[str, np.ndarray]:
        """Compute temporal features per node."""
        features = {}

        # Recent transaction frequency (last 7 days)
        recent_freq = np.zeros(num_nodes, dtype=np.float32)
        tx_1d = np.zeros(num_nodes, dtype=np.float32)
        tx_7d = np.zeros(num_nodes, dtype=np.float32)
        tx_30d = np.zeros(num_nodes, dtype=np.float32)
        time_since_last = np.full(num_nodes, -1.0, dtype=np.float32)

        if len(df) > 0 and reference_time is not None:
            all_tx = pd.concat([
                df[["sender_node_idx", "timestamp"]].rename(columns={"sender_node_idx": "node_idx"}),
                df[["receiver_node_idx", "timestamp"]].rename(columns={"receiver_node_idx": "node_idx"}),
            ])

            # Time windows
            for days, arr in [(1, tx_1d), (7, tx_7d), (30, tx_30d)]:
                cutoff = reference_time - pd.Timedelta(days=days)
                recent = all_tx[all_tx["timestamp"] >= cutoff]
                if len(recent) > 0:
                    counts = recent.groupby("node_idx").size()
                    arr[counts.index.values] = counts.values.astype(np.float32)

            features["recent_tx_freq_7d"] = tx_7d

            # Time since last transaction
            last_tx = all_tx.groupby("node_idx")["timestamp"].max()
            for idx, ts in last_tx.items():
                delta = (reference_time - ts).total_seconds() / 86400.0
                time_since_last[idx] = delta

        features["tx_count_1d"] = tx_1d
        features["tx_count_7d"] = tx_7d
        features["tx_count_30d"] = tx_30d
        features["time_since_last_tx_days"] = np.where(time_since_last < 0, 0, time_since_last)

        # Rapid in-out transfers (money in then out within 2 hours)
        rapid_count = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0 and "timestamp" in df.columns:
            rapid_count = self._compute_rapid_transfers(df, num_nodes)
        features["rapid_in_out_count"] = rapid_count

        # In/out volume ratio
        in_vol = np.zeros(num_nodes, dtype=np.float32)
        out_vol = np.zeros(num_nodes, dtype=np.float32)
        if len(df) > 0:
            in_g = df.groupby("receiver_node_idx")["amount"].sum()
            in_vol[in_g.index.values] = in_g.values.astype(np.float32)
            out_g = df.groupby("sender_node_idx")["amount"].sum()
            out_vol[out_g.index.values] = out_g.values.astype(np.float32)

        total_vol = in_vol + out_vol
        features["in_out_volume_ratio"] = np.divide(
            in_vol, total_vol, out=np.zeros_like(in_vol), where=total_vol > 0
        )

        return features

    def _compute_rapid_transfers(
        self,
        df: pd.DataFrame,
        num_nodes: int,
        window_hours: float = 2.0,
    ) -> np.ndarray:
        """
        Count rapid in-then-out transfers per entity.

        For each entity, counts instances where money comes in and then
        goes out within `window_hours`.
        """
        rapid_count = np.zeros(num_nodes, dtype=np.float32)

        # Get incoming and outgoing transactions sorted by time
        incoming = df[["receiver_node_idx", "timestamp", "amount"]].copy()
        incoming = incoming.rename(columns={"receiver_node_idx": "node_idx"})
        incoming["direction"] = "in"

        outgoing = df[["sender_node_idx", "timestamp", "amount"]].copy()
        outgoing = outgoing.rename(columns={"sender_node_idx": "node_idx"})
        outgoing["direction"] = "out"

        all_tx = pd.concat([incoming, outgoing]).sort_values(["node_idx", "timestamp"])

        window = pd.Timedelta(hours=window_hours)

        for node_idx, group in all_tx.groupby("node_idx"):
            if len(group) < 2:
                continue

            in_times = group[group["direction"] == "in"]["timestamp"].values
            out_times = group[group["direction"] == "out"]["timestamp"].values

            count = 0
            for in_t in in_times:
                # Count outgoing transactions within the window after this incoming
                matches = (out_times > in_t) & (out_times <= in_t + window)
                count += matches.sum()

            rapid_count[int(node_idx)] = count

        return rapid_count

    def _data_quality_features(
        self,
        df: pd.DataFrame,
        num_nodes: int,
    ) -> Dict[str, np.ndarray]:
        """Compute data quality features per node."""
        features = {}

        record_count = np.zeros(num_nodes, dtype=np.float32)
        coverage_days = np.zeros(num_nodes, dtype=np.float32)

        if len(df) > 0:
            all_tx = pd.concat([
                df[["sender_node_idx"]].rename(columns={"sender_node_idx": "node_idx"}),
                df[["receiver_node_idx"]].rename(columns={"receiver_node_idx": "node_idx"}),
            ])

            rc = all_tx.groupby("node_idx").size()
            record_count[rc.index.values] = rc.values.astype(np.float32)

            if "timestamp" in df.columns and pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
                all_ts = pd.concat([
                    df[["sender_node_idx", "timestamp"]].rename(
                        columns={"sender_node_idx": "node_idx"}
                    ),
                    df[["receiver_node_idx", "timestamp"]].rename(
                        columns={"receiver_node_idx": "node_idx"}
                    ),
                ])
                time_range = all_ts.groupby("node_idx")["timestamp"].agg(["min", "max"])
                cd = (time_range["max"] - time_range["min"]).dt.total_seconds() / 86400.0
                cd_valid = cd.dropna()
                coverage_days[cd_valid.index.values] = cd_valid.values.astype(np.float32)

        features["record_count"] = record_count
        features["coverage_days"] = coverage_days

        return features
