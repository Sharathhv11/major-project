"""
Graph construction for FraudShield GCN.

Builds a PyTorch Geometric Data object from resolved transaction data.

Key design decisions:
- Nodes represent stable entities (accounts, UPI IDs, phones, etc.)
- Edges represent observed financial relationships/transactions
- Original transaction direction is preserved as edge metadata
- Reverse edges are added for GCN message passing but are NOT counted as real transactions
- Edge attributes include amount, timestamp, direction, count
- Self-loops are removed by default
- Isolated nodes are kept by default
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
import torch
from torch_geometric.data import Data

from .entity_resolution import EntityResolver
from .schemas import GraphSchema

logger = logging.getLogger(__name__)


class GraphBuilder:
    """
    Constructs a PyTorch Geometric graph from resolved transaction data.
    """

    def __init__(self, config: Dict[str, Any], entity_resolver: EntityResolver):
        """
        Parameters
        ----------
        config : dict
            Configuration dictionary with graph construction settings.
        entity_resolver : EntityResolver
            Resolver with entity mappings already built.
        """
        graph_config = config.get("graph", {})
        self.add_reverse_edges = graph_config.get("add_reverse_edges", True)
        self.remove_self_loops = graph_config.get("remove_self_loops", True)
        self.keep_isolated_nodes = graph_config.get("keep_isolated_nodes", True)
        self.edge_aggregation = graph_config.get("edge_aggregation", "multi")
        self.temporal_cutoff = graph_config.get("temporal_cutoff", None)
        self.entity_resolver = entity_resolver

    def build_graph(
        self,
        df: pd.DataFrame,
        node_features: Optional[torch.Tensor] = None,
        node_labels: Optional[torch.Tensor] = None,
        feature_names: Optional[List[str]] = None,
    ) -> Tuple[Data, GraphSchema]:
        """
        Build a PyTorch Geometric Data object from transaction data.

        Parameters
        ----------
        df : pd.DataFrame
            Transaction data with sender_node_idx and receiver_node_idx columns.
        node_features : torch.Tensor, optional
            Node feature matrix [num_nodes, num_features].
        node_labels : torch.Tensor, optional
            Node labels [num_nodes].
        feature_names : list of str, optional
            Feature names for the feature matrix columns.

        Returns
        -------
        Tuple[Data, GraphSchema]
            PyG Data object and graph schema.
        """
        num_nodes = self.entity_resolver.num_entities

        if num_nodes == 0:
            raise ValueError("No entities resolved. Cannot build graph.")

        # Apply temporal cutoff if configured
        if self.temporal_cutoff is not None and "timestamp" in df.columns:
            cutoff = pd.to_datetime(self.temporal_cutoff, utc=True)
            df = df[df["timestamp"] <= cutoff].copy()
            logger.info("Applied temporal cutoff: %s, %d transactions remain", cutoff, len(df))

        # Remove self-loops if configured
        if self.remove_self_loops:
            self_loop_mask = df["sender_node_idx"] == df["receiver_node_idx"]
            if self_loop_mask.any():
                logger.info("Removing %d self-loop transactions", self_loop_mask.sum())
                df = df[~self_loop_mask].copy()

        # Build edge index and edge attributes
        edge_index, edge_attr = self._build_edges(df)

        # Create Data object
        data = Data()
        data.edge_index = edge_index
        data.num_nodes = num_nodes

        # Node features
        if node_features is not None:
            assert node_features.shape[0] == num_nodes, (
                f"Feature matrix has {node_features.shape[0]} rows but graph has {num_nodes} nodes"
            )
            data.x = node_features
        else:
            # Placeholder identity features
            data.x = torch.eye(num_nodes, dtype=torch.float32)

        # Node labels
        if node_labels is not None:
            assert node_labels.shape[0] == num_nodes, (
                f"Label tensor has {node_labels.shape[0]} entries but graph has {num_nodes} nodes"
            )
            data.y = node_labels

        # Edge attributes (stored separately, not used by standard GCNConv)
        data.edge_amount = edge_attr["amounts"]
        data.edge_direction = edge_attr["directions"]
        data.edge_timestamp = edge_attr["timestamps"]
        data.edge_is_reverse = edge_attr["is_reverse"]

        # Store feature names
        if feature_names is not None:
            data.feature_names = feature_names

        # Build graph schema
        schema = self._build_schema(data, feature_names)

        logger.info(
            "Graph built: %d nodes, %d edges (%d real, %d reverse for message passing)",
            data.num_nodes,
            data.edge_index.shape[1],
            int((~edge_attr["is_reverse"]).sum()),
            int(edge_attr["is_reverse"].sum()),
        )

        return data, schema

    def _build_edges(
        self,
        df: pd.DataFrame,
    ) -> Tuple[torch.Tensor, Dict[str, torch.Tensor]]:
        """
        Build edge index and edge attribute tensors.

        Parameters
        ----------
        df : pd.DataFrame
            Transaction data with node indices.

        Returns
        -------
        Tuple[torch.Tensor, Dict[str, torch.Tensor]]
            Edge index [2, num_edges] and dict of edge attributes.
        """
        if len(df) == 0:
            empty_idx = torch.zeros((2, 0), dtype=torch.long)
            empty_attr = {
                "amounts": torch.zeros(0, dtype=torch.float32),
                "directions": torch.zeros(0, dtype=torch.long),
                "timestamps": torch.zeros(0, dtype=torch.float64),
                "is_reverse": torch.zeros(0, dtype=torch.bool),
            }
            return empty_idx, empty_attr

        senders = df["sender_node_idx"].values.astype(np.int64)
        receivers = df["receiver_node_idx"].values.astype(np.int64)

        # Amounts
        amounts = df["amount"].values.astype(np.float32)

        # Timestamps as float (seconds since epoch)
        if "timestamp" in df.columns and pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
            timestamps = df["timestamp"].astype(np.int64).values / 1e9  # nanoseconds to seconds
        else:
            timestamps = np.zeros(len(df), dtype=np.float64)

        # Direction: 1 = forward (sender -> receiver)
        directions = np.ones(len(df), dtype=np.int64)

        # Mark as real edges
        is_reverse = np.zeros(len(df), dtype=bool)

        # Build edge index: sender -> receiver
        edge_src = senders
        edge_dst = receivers

        # Add reverse edges for undirected message passing
        if self.add_reverse_edges:
            rev_src = receivers
            rev_dst = senders
            rev_amounts = amounts.copy()
            rev_timestamps = timestamps.copy()
            rev_directions = np.zeros(len(df), dtype=np.int64)  # 0 = reverse
            rev_is_reverse = np.ones(len(df), dtype=bool)

            edge_src = np.concatenate([edge_src, rev_src])
            edge_dst = np.concatenate([edge_dst, rev_dst])
            amounts = np.concatenate([amounts, rev_amounts])
            timestamps = np.concatenate([timestamps, rev_timestamps])
            directions = np.concatenate([directions, rev_directions])
            is_reverse = np.concatenate([is_reverse, rev_is_reverse])

        edge_index = torch.tensor(
            np.stack([edge_src, edge_dst], axis=0),
            dtype=torch.long,
        )

        edge_attr = {
            "amounts": torch.tensor(amounts, dtype=torch.float32),
            "directions": torch.tensor(directions, dtype=torch.long),
            "timestamps": torch.tensor(timestamps, dtype=torch.float64),
            "is_reverse": torch.tensor(is_reverse, dtype=torch.bool),
        }

        return edge_index, edge_attr

    def _build_schema(
        self,
        data: Data,
        feature_names: Optional[List[str]] = None,
    ) -> GraphSchema:
        """Build GraphSchema from the constructed Data object."""
        import networkx as nx

        schema = GraphSchema()
        schema.num_nodes = data.num_nodes
        schema.num_edges = data.edge_index.shape[1] if data.edge_index is not None else 0

        if data.x is not None:
            schema.num_features = data.x.shape[1]
        if feature_names:
            schema.feature_names = feature_names

        schema.node_types = self.entity_resolver.get_entity_type_counts()

        if data.y is not None:
            labeled = data.y >= 0
            schema.has_labels = True
            schema.num_labeled_nodes = int(labeled.sum())
            schema.num_fraud_nodes = int((data.y == 1).sum())
            schema.num_legitimate_nodes = int((data.y == 0).sum())

        # Count connected components (using only real edges)
        if hasattr(data, "edge_is_reverse"):
            real_mask = ~data.edge_is_reverse
            real_edges = data.edge_index[:, real_mask].numpy()
        else:
            real_edges = data.edge_index.numpy() if data.edge_index.shape[1] > 0 else np.zeros((2, 0))

        G = nx.Graph()
        G.add_nodes_from(range(data.num_nodes))
        if real_edges.shape[1] > 0:
            G.add_edges_from(zip(real_edges[0], real_edges[1]))

        schema.num_connected_components = nx.number_connected_components(G)
        schema.num_isolated_nodes = sum(1 for n in G.nodes() if G.degree(n) == 0)

        return schema

    def assign_labels_from_transactions(
        self,
        df: pd.DataFrame,
        strategy: str = "any_fraud",
    ) -> torch.Tensor:
        """
        Assign node-level labels from transaction-level fraud labels.

        IMPORTANT: This transformation is documented and justified separately.
        Transaction-level labels do not directly map to entity-level labels.
        This method implements a configurable strategy and documents the
        assumption being made.

        Parameters
        ----------
        df : pd.DataFrame
            Transaction data with fraud_label, sender_node_idx, receiver_node_idx.
        strategy : str
            Label assignment strategy:
            - "any_fraud": Entity is labeled fraudulent if it participates in
              ANY fraudulent transaction (as sender or receiver).
              NOTE: This is aggressive and may over-label. Documented in MODEL_CARD.
            - "sender_fraud": Only the sender in a fraudulent transaction
              is labeled fraudulent.

        Returns
        -------
        torch.Tensor
            Node labels [num_nodes], with -1 for unlabeled nodes.
        """
        num_nodes = self.entity_resolver.num_entities
        labels = torch.full((num_nodes,), -1, dtype=torch.long)

        if "fraud_label" not in df.columns:
            logger.warning("No fraud_label column found. All nodes will be unlabeled (-1).")
            return labels

        fraud_df = df.dropna(subset=["fraud_label"])
        fraud_df = fraud_df.copy()
        fraud_df["fraud_label"] = fraud_df["fraud_label"].astype(int)

        # First, mark all entities that appear in labeled transactions as legitimate
        labeled_senders = fraud_df["sender_node_idx"].values
        labeled_receivers = fraud_df["receiver_node_idx"].values
        all_labeled = np.unique(np.concatenate([labeled_senders, labeled_receivers]))
        labels[all_labeled] = 0

        # Then, mark fraud based on strategy
        fraud_txns = fraud_df[fraud_df["fraud_label"] == 1]

        if strategy == "any_fraud":
            fraud_senders = fraud_txns["sender_node_idx"].values
            fraud_receivers = fraud_txns["receiver_node_idx"].values
            fraud_nodes = np.unique(np.concatenate([fraud_senders, fraud_receivers]))
            labels[fraud_nodes] = 1
            logger.info(
                "Label assignment (any_fraud): %d fraud nodes, %d legitimate nodes, %d unlabeled",
                int((labels == 1).sum()),
                int((labels == 0).sum()),
                int((labels == -1).sum()),
            )

        elif strategy == "sender_fraud":
            fraud_senders = fraud_txns["sender_node_idx"].values
            fraud_nodes = np.unique(fraud_senders)
            labels[fraud_nodes] = 1
            logger.info(
                "Label assignment (sender_fraud): %d fraud nodes, %d legitimate nodes, %d unlabeled",
                int((labels == 1).sum()),
                int((labels == 0).sum()),
                int((labels == -1).sum()),
            )

        else:
            raise ValueError(f"Unknown label strategy: {strategy}")

        return labels
