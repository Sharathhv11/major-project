"""
GCN Model for FraudShield.

Implements a configurable Graph Convolutional Network for node-level
binary fraud classification using PyTorch Geometric.

Architecture:
- Input projection via first GCNConv layer
- Configurable number of GCNConv layers with ReLU activation and dropout
- Final linear classification head producing 2-class logits
- Returns logits during training; apply softmax for probabilities at inference

The model uses the standard GCNConv which operates on graph structure
(edge_index) without arbitrary edge attributes. Edge features are
aggregated into node features upstream by FeatureEngineer.
"""

import logging
from typing import Any, Dict, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv

logger = logging.getLogger(__name__)


class FraudGCN(nn.Module):
    """
    Graph Convolutional Network for fraud detection.

    Parameters
    ----------
    in_channels : int
        Number of input features per node.
    hidden_channels : int
        Hidden dimension size (default: 128).
    num_layers : int
        Number of GCN layers (default: 2).
    num_classes : int
        Number of output classes (default: 2 for binary).
    dropout : float
        Dropout rate applied after each hidden layer (default: 0.3).
    activation : str
        Activation function: "relu", "elu", or "leaky_relu" (default: "relu").

    Forward pass dimensions:
        Input:  x [num_nodes, in_channels], edge_index [2, num_edges]
        Layer 1 (GCNConv): [num_nodes, in_channels] -> [num_nodes, hidden_channels]
        Layer 2 (GCNConv): [num_nodes, hidden_channels] -> [num_nodes, hidden_channels]
        Classifier: [num_nodes, hidden_channels] -> [num_nodes, num_classes]
        Output: logits [num_nodes, num_classes]
    """

    def __init__(
        self,
        in_channels: int,
        hidden_channels: int = 128,
        num_layers: int = 2,
        num_classes: int = 2,
        dropout: float = 0.3,
        activation: str = "relu",
    ):
        super().__init__()

        self.in_channels = in_channels
        self.hidden_channels = hidden_channels
        self.num_layers = num_layers
        self.num_classes = num_classes
        self.dropout_rate = dropout
        self.activation_name = activation

        # Build GCN layers
        self.convs = nn.ModuleList()

        # First layer: input -> hidden
        self.convs.append(GCNConv(in_channels, hidden_channels))

        # Middle layers: hidden -> hidden
        for _ in range(num_layers - 1):
            self.convs.append(GCNConv(hidden_channels, hidden_channels))

        # Batch normalization layers
        self.bns = nn.ModuleList([
            nn.BatchNorm1d(hidden_channels)
            for _ in range(num_layers)
        ])

        # Classification head: hidden -> num_classes
        self.classifier = nn.Linear(hidden_channels, num_classes)

        # Dropout
        self.dropout = nn.Dropout(p=dropout)

        # Activation
        if activation == "relu":
            self.activation = F.relu
        elif activation == "elu":
            self.activation = F.elu
        elif activation == "leaky_relu":
            self.activation = F.leaky_relu
        else:
            raise ValueError(f"Unknown activation: {activation}")

        logger.info(
            "FraudGCN initialized: %d input -> %d hidden x %d layers -> %d classes (dropout=%.2f)",
            in_channels,
            hidden_channels,
            num_layers,
            num_classes,
            dropout,
        )

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
    ) -> torch.Tensor:
        """
        Forward pass returning logits.

        Parameters
        ----------
        x : torch.Tensor
            Node features [num_nodes, in_channels].
        edge_index : torch.Tensor
            Edge connectivity [2, num_edges].

        Returns
        -------
        torch.Tensor
            Logits [num_nodes, num_classes].
        """
        for i, (conv, bn) in enumerate(zip(self.convs, self.bns)):
            x = conv(x, edge_index)
            x = bn(x)
            x = self.activation(x)
            x = self.dropout(x)

        # Classification head (no activation — raw logits)
        logits = self.classifier(x)

        return logits

    def get_embeddings(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
    ) -> torch.Tensor:
        """
        Get node embeddings (pre-classifier hidden representations).

        Useful for visualization and explainability.

        Parameters
        ----------
        x : torch.Tensor
            Node features [num_nodes, in_channels].
        edge_index : torch.Tensor
            Edge connectivity [2, num_edges].

        Returns
        -------
        torch.Tensor
            Node embeddings [num_nodes, hidden_channels].
        """
        for conv, bn in zip(self.convs, self.bns):
            x = conv(x, edge_index)
            x = bn(x)
            x = self.activation(x)

        return x

    @classmethod
    def from_config(cls, config: Dict[str, Any], in_channels: int) -> "FraudGCN":
        """
        Create a FraudGCN from configuration dictionary.

        Parameters
        ----------
        config : dict
            Configuration with model settings.
        in_channels : int
            Number of input features.

        Returns
        -------
        FraudGCN
            Initialized model.
        """
        model_config = config.get("model", {})
        return cls(
            in_channels=in_channels,
            hidden_channels=model_config.get("hidden_dim", 128),
            num_layers=model_config.get("num_layers", 2),
            num_classes=model_config.get("num_classes", 2),
            dropout=model_config.get("dropout", 0.3),
            activation=model_config.get("activation", "relu"),
        )

    def get_config(self) -> Dict[str, Any]:
        """Return model configuration for serialization."""
        return {
            "in_channels": self.in_channels,
            "hidden_channels": self.hidden_channels,
            "num_layers": self.num_layers,
            "num_classes": self.num_classes,
            "dropout": self.dropout_rate,
            "activation": self.activation_name,
        }
