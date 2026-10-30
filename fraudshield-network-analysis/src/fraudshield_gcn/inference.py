"""
Inference module for FraudShield GCN.

Loads a trained model and all necessary artifacts, and provides
a documented Python API for making predictions on new graphs.

Usage:
    predictor = FraudNetworkPredictor.from_artifacts("artifacts/best_model")
    result = predictor.predict_graph(graph_data)
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
from torch_geometric.data import Data

from .feature_engineering import FeatureEngineer
from .model import FraudGCN

logger = logging.getLogger(__name__)


class FraudNetworkPredictor:
    """
    Standalone inference predictor for fraud detection.

    Loads a trained GCN model, feature preprocessing artifacts,
    threshold configuration, and model metadata. Can make predictions
    in a fresh Python process without access to training data.
    """

    def __init__(
        self,
        model: FraudGCN,
        model_config: Dict[str, Any],
        feature_names: List[str],
        feature_engineer: FeatureEngineer,
        threshold: float,
        risk_categories: Dict[str, Any],
        model_version: str,
        metadata: Dict[str, Any],
    ):
        """
        Parameters
        ----------
        model : FraudGCN
            Trained GCN model (in eval mode).
        model_config : dict
            Model architecture configuration.
        feature_names : list
            Expected feature names in order.
        feature_engineer : FeatureEngineer
            Fitted feature engineer with scaler.
        threshold : float
            Classification threshold.
        risk_categories : dict
            Risk category definitions.
        model_version : str
            Model version string.
        metadata : dict
            Additional model metadata.
        """
        self.model = model
        self.model_config = model_config
        self.feature_names = feature_names
        self.feature_engineer = feature_engineer
        self.threshold = threshold
        self.risk_categories = risk_categories
        self.model_version = model_version
        self.metadata = metadata

        # Ensure eval mode
        self.model.eval()

    @classmethod
    def from_artifacts(cls, artifact_dir: str) -> "FraudNetworkPredictor":
        """
        Load predictor from saved artifacts.

        Parameters
        ----------
        artifact_dir : str
            Path to the artifact directory containing model.pt,
            model_config.json, feature_schema.json, preprocessing.joblib,
            threshold.json.

        Returns
        -------
        FraudNetworkPredictor
            Ready-to-use predictor.

        Raises
        ------
        FileNotFoundError
            If required artifact files are missing.
        ValueError
            If artifacts are incompatible.
        """
        art_path = Path(artifact_dir)

        if not art_path.exists():
            raise FileNotFoundError(f"Artifact directory not found: {artifact_dir}")

        # Load model configuration
        config_path = art_path / "model_config.json"
        if not config_path.exists():
            raise FileNotFoundError(f"Model config not found: {config_path}")
        with open(config_path, "r") as f:
            model_config = json.load(f)

        # Load feature schema
        schema_path = art_path / "feature_schema.json"
        if not schema_path.exists():
            raise FileNotFoundError(f"Feature schema not found: {schema_path}")
        with open(schema_path, "r") as f:
            feature_schema = json.load(f)
        feature_names = feature_schema["feature_names"]

        # Load threshold
        threshold_path = art_path / "threshold.json"
        if not threshold_path.exists():
            raise FileNotFoundError(f"Threshold config not found: {threshold_path}")
        with open(threshold_path, "r") as f:
            threshold_data = json.load(f)
        threshold = threshold_data["threshold"]

        # Load risk categories
        risk_categories = threshold_data.get("risk_categories", {
            "low": {"max_score": 0.3, "label": "Low Risk"},
            "medium": {"max_score": 0.7, "label": "Medium Risk"},
            "high": {"max_score": 1.0, "label": "High Risk"},
        })

        # Initialize model
        model = FraudGCN(
            in_channels=model_config["in_channels"],
            hidden_channels=model_config["hidden_channels"],
            num_layers=model_config["num_layers"],
            num_classes=model_config["num_classes"],
            dropout=model_config["dropout"],
            activation=model_config["activation"],
        )

        # Load weights
        checkpoint_path = art_path / "model.pt"
        if not checkpoint_path.exists():
            raise FileNotFoundError(f"Model checkpoint not found: {checkpoint_path}")

        checkpoint = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
        if "model_state_dict" in checkpoint:
            model.load_state_dict(checkpoint["model_state_dict"])
        else:
            model.load_state_dict(checkpoint)
        model.eval()

        # Verify feature dimensions
        if model.in_channels != len(feature_names):
            raise ValueError(
                f"Model expects {model.in_channels} features but schema has "
                f"{len(feature_names)} features. Artifact mismatch."
            )

        # Load feature engineering artifacts
        feature_engineer = FeatureEngineer.__new__(FeatureEngineer)
        preprocessing_path = art_path / "preprocessing.joblib"
        if preprocessing_path.exists():
            feature_engineer.load_preprocessing(str(preprocessing_path))
        else:
            logger.warning("No preprocessing.joblib found. Features will not be scaled.")
            feature_engineer.feature_names = feature_names
            feature_engineer.scaler = None
            feature_engineer._is_fitted = False

        # Load metadata
        metadata = {}
        metadata_path = art_path / "metrics.json"
        if metadata_path.exists():
            with open(metadata_path, "r") as f:
                metadata = json.load(f)

        # Model version
        model_version = model_config.get("version", feature_schema.get("schema_version", "0.1.0"))

        logger.info("FraudNetworkPredictor loaded from %s", artifact_dir)

        return cls(
            model=model,
            model_config=model_config,
            feature_names=feature_names,
            feature_engineer=feature_engineer,
            threshold=threshold,
            risk_categories=risk_categories,
            model_version=model_version,
            metadata=metadata,
        )

    @torch.no_grad()
    def predict_graph(
        self,
        data: Data,
        target_nodes: Optional[List[int]] = None,
        node_id_mapping: Optional[Dict[int, str]] = None,
    ) -> Dict[str, Any]:
        """
        Run inference on a graph.

        Parameters
        ----------
        data : Data
            PyG Data object with node features and edge_index.
        target_nodes : list of int, optional
            Specific node indices to return predictions for.
            If None, returns predictions for all nodes.
        node_id_mapping : dict, optional
            Mapping from node index to human-readable ID.

        Returns
        -------
        dict
            Prediction results including per-node risk scores, categories,
            and warnings.

        Raises
        ------
        ValueError
            If the graph schema is incompatible.
        """
        # Validate input
        self._validate_input(data)

        # Scale features if scaler is available
        if self.feature_engineer._is_fitted and self.feature_engineer.scaler is not None:
            data = data.clone()
            data.x = self.feature_engineer.transform(data.x)

        # Forward pass
        logits = self.model(data.x, data.edge_index)
        probs = torch.softmax(logits, dim=1)
        fraud_probs = probs[:, 1].cpu().numpy()

        # Select target nodes
        if target_nodes is None:
            target_nodes = list(range(data.num_nodes))

        # Build results
        predictions = []
        warnings = []

        for node_idx in target_nodes:
            if node_idx >= data.num_nodes:
                warnings.append(f"Node index {node_idx} out of range (max: {data.num_nodes - 1})")
                continue

            score = float(fraud_probs[node_idx])
            predicted_class = int(score >= self.threshold)
            risk_category = self._get_risk_category(score)

            # Check for missing/sparse data
            node_warnings = self._check_node_data_quality(data, node_idx)

            pred = {
                "node_idx": node_idx,
                "node_id": node_id_mapping.get(node_idx, str(node_idx)) if node_id_mapping else str(node_idx),
                "predicted_class": predicted_class,
                "risk_score": round(score, 6),
                "risk_category": risk_category,
                "model_version": self.model_version,
                "prediction_timestamp": datetime.now(timezone.utc).isoformat(),
                "threshold": self.threshold,
            }

            if node_warnings:
                pred["warnings"] = node_warnings
                warnings.extend(node_warnings)

            predictions.append(pred)

        result = {
            "predictions": predictions,
            "num_nodes_predicted": len(predictions),
            "model_version": self.model_version,
            "threshold": self.threshold,
            "graph_nodes": data.num_nodes,
            "graph_edges": data.edge_index.shape[1] if data.edge_index is not None else 0,
        }

        if warnings:
            result["warnings"] = list(set(warnings))

        return result

    def predict_single_node(
        self,
        data: Data,
        node_idx: int,
        node_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Predict risk for a single node.

        Parameters
        ----------
        data : Data
            PyG Data object.
        node_idx : int
            Node index to predict.
        node_id : str, optional
            Human-readable node identifier.

        Returns
        -------
        dict
            Single node prediction result.
        """
        mapping = {node_idx: node_id} if node_id else None
        result = self.predict_graph(data, target_nodes=[node_idx], node_id_mapping=mapping)
        if result["predictions"]:
            return result["predictions"][0]
        return {"error": f"No prediction for node {node_idx}"}

    def _validate_input(self, data: Data) -> None:
        """Validate that input graph is compatible."""
        if data.x is None:
            raise ValueError("Input graph has no node features (data.x is None)")

        if data.x.shape[1] != len(self.feature_names):
            raise ValueError(
                f"Feature dimension mismatch: model expects {len(self.feature_names)} features, "
                f"but input has {data.x.shape[1]} features"
            )

        if data.edge_index is None:
            raise ValueError("Input graph has no edge_index")

        if not torch.isfinite(data.x).all():
            logger.warning("Input features contain non-finite values. Clamping.")
            data.x = torch.nan_to_num(data.x, nan=0.0, posinf=0.0, neginf=0.0)

    def _get_risk_category(self, score: float) -> str:
        """Categorize risk score into configured categories."""
        for cat_name, cat_config in sorted(
            self.risk_categories.items(),
            key=lambda x: x[1].get("max_score", 1.0),
        ):
            if score <= cat_config.get("max_score", 1.0):
                return cat_config.get("label", cat_name)
        return "High Risk"

    def _check_node_data_quality(
        self,
        data: Data,
        node_idx: int,
    ) -> List[str]:
        """Check if a node has sufficient data for reliable prediction."""
        warnings = []

        features = data.x[node_idx].numpy()

        # Check if most features are zero (possibly a very new or sparse entity)
        zero_ratio = (features == 0).sum() / len(features)
        if zero_ratio > 0.8:
            warnings.append(
                f"Node {node_idx}: {zero_ratio:.0%} of features are zero. "
                "Prediction may be unreliable for this sparse entity."
            )

        # Check if node is isolated
        node_edges = (data.edge_index[0] == node_idx) | (data.edge_index[1] == node_idx)
        if not node_edges.any():
            warnings.append(
                f"Node {node_idx}: Isolated node with no connections. "
                "GCN prediction relies only on self-features."
            )

        return warnings
