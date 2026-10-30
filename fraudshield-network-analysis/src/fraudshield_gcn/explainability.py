"""
Explainability module for FraudShield GCN.

Provides interpretable evidence for fraud risk predictions by
analyzing node features, graph structure, and GCN behavior.

Key design decisions:
- Separates descriptive graph statistics from model prediction explanations
- Does not claim a feature "caused" the prediction merely because it has a high value
- Connected counterparties are NOT labeled fraudulent because the target node is risky
- Initial version prioritizes interpretable descriptive evidence
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
from torch_geometric.data import Data

logger = logging.getLogger(__name__)


class FraudExplainer:
    """
    Generates explanations for fraud risk predictions.

    Provides:
    - Feature-based evidence (which features are unusual)
    - Graph-structure evidence (connectivity patterns)
    - Descriptive statistics (transaction activity)
    """

    def __init__(self, feature_names: List[str], config: Optional[Dict[str, Any]] = None):
        self.feature_names = feature_names
        self.config = config or {}

    def explain_node(
        self,
        data: Data,
        node_idx: int,
        risk_score: float,
        node_id_mapping: Optional[Dict[int, str]] = None,
    ) -> Dict[str, Any]:
        """
        Generate an explanation for a specific node's risk prediction.

        Parameters
        ----------
        data : Data
            PyG Data object with features and graph structure.
        node_idx : int
            Index of the node to explain.
        risk_score : float
            The model's predicted risk score for this node.
        node_id_mapping : dict, optional
            Mapping from node index to human-readable ID.

        Returns
        -------
        dict
            Explanation with evidence categories.
        """
        if node_idx >= data.num_nodes:
            raise ValueError(f"Node index {node_idx} out of range (max: {data.num_nodes - 1})")

        explanation = {
            "node_idx": node_idx,
            "node_id": node_id_mapping.get(node_idx, str(node_idx)) if node_id_mapping else str(node_idx),
            "risk_score": risk_score,
            "feature_evidence": self._feature_evidence(data, node_idx),
            "graph_evidence": self._graph_evidence(data, node_idx),
            "disclaimer": (
                "This explanation describes observed patterns and feature values. "
                "It does not prove fraud. A high risk score means the model considers "
                "the observed pattern suspicious relative to its training data."
            ),
        }

        return explanation

    def _feature_evidence(
        self,
        data: Data,
        node_idx: int,
    ) -> List[Dict[str, Any]]:
        """
        Identify notable feature values for the node.

        Compares the node's feature values against the population distribution
        to identify unusually high or low values.
        """
        features = data.x[node_idx].cpu().numpy()
        all_features = data.x.cpu().numpy()

        evidence = []

        for i, name in enumerate(self.feature_names):
            value = float(features[i])
            population_mean = float(np.mean(all_features[:, i]))
            population_std = float(np.std(all_features[:, i]))

            if population_std > 0:
                z_score = (value - population_mean) / population_std
            else:
                z_score = 0.0

            # Report features that are notably different from population
            if abs(z_score) > 1.5:
                direction = "above" if z_score > 0 else "below"
                evidence.append({
                    "feature": name,
                    "value": round(value, 4),
                    "population_mean": round(population_mean, 4),
                    "z_score": round(z_score, 2),
                    "description": f"{name} is {abs(z_score):.1f} std {direction} average",
                    "note": (
                        "This indicates the feature value is unusual compared to "
                        "the population, but does not by itself indicate fraud."
                    ),
                })

        # Sort by absolute z-score (most unusual first)
        evidence.sort(key=lambda x: abs(x["z_score"]), reverse=True)

        return evidence[:10]  # Top 10 most notable features

    def _graph_evidence(
        self,
        data: Data,
        node_idx: int,
    ) -> Dict[str, Any]:
        """
        Describe graph-structural evidence around the node.

        NOTE: Connected nodes are described but NOT labeled as fraudulent
        merely because this node has a high risk score.
        """
        edge_index = data.edge_index.cpu().numpy()

        # Find direct neighbors
        outgoing_mask = edge_index[0] == node_idx
        incoming_mask = edge_index[1] == node_idx

        outgoing_neighbors = set(edge_index[1][outgoing_mask].tolist())
        incoming_neighbors = set(edge_index[0][incoming_mask].tolist())
        all_neighbors = outgoing_neighbors | incoming_neighbors

        # Remove self if present
        all_neighbors.discard(node_idx)
        outgoing_neighbors.discard(node_idx)
        incoming_neighbors.discard(node_idx)

        # Count edges (excluding reverse edges if available)
        real_outgoing = int(outgoing_mask.sum())
        real_incoming = int(incoming_mask.sum())

        if hasattr(data, "edge_is_reverse"):
            is_reverse = data.edge_is_reverse.cpu().numpy()
            real_outgoing = int((outgoing_mask & ~is_reverse).sum())
            real_incoming = int((incoming_mask & ~is_reverse).sum())

        evidence = {
            "total_neighbors": len(all_neighbors),
            "outgoing_connections": len(outgoing_neighbors),
            "incoming_connections": len(incoming_neighbors),
            "outgoing_edge_count": real_outgoing,
            "incoming_edge_count": real_incoming,
        }

        # Shared counterparties (neighbors that also connect to many others)
        neighbor_degrees = {}
        for n in all_neighbors:
            n_out = int((edge_index[0] == n).sum())
            n_in = int((edge_index[1] == n).sum())
            neighbor_degrees[n] = n_out + n_in

        if neighbor_degrees:
            high_degree_neighbors = [
                n for n, deg in neighbor_degrees.items()
                if deg > np.percentile(list(neighbor_degrees.values()), 75)
            ]
            evidence["high_connectivity_neighbors"] = len(high_degree_neighbors)

        evidence["note"] = (
            "Graph structure shows connectivity patterns. "
            "Connected entities are NOT automatically classified as fraudulent."
        )

        return evidence

    def generate_summary(
        self,
        explanation: Dict[str, Any],
    ) -> str:
        """
        Generate a human-readable summary of the explanation.

        Parameters
        ----------
        explanation : dict
            Output from explain_node().

        Returns
        -------
        str
            Human-readable explanation text.
        """
        lines = [
            f"=== Fraud Risk Explanation for Node {explanation['node_id']} ===",
            f"Risk Score: {explanation['risk_score']:.4f}",
            "",
        ]

        # Feature evidence
        feat_evidence = explanation.get("feature_evidence", [])
        if feat_evidence:
            lines.append("Notable Feature Values:")
            for ev in feat_evidence[:5]:
                lines.append(f"  • {ev['description']}")
            lines.append("")

        # Graph evidence
        graph_ev = explanation.get("graph_evidence", {})
        lines.append("Graph Structure:")
        lines.append(f"  • Total neighbors: {graph_ev.get('total_neighbors', 0)}")
        lines.append(f"  • Outgoing connections: {graph_ev.get('outgoing_connections', 0)}")
        lines.append(f"  • Incoming connections: {graph_ev.get('incoming_connections', 0)}")
        lines.append("")

        # Disclaimer
        lines.append(f"⚠ {explanation.get('disclaimer', '')}")

        return "\n".join(lines)
