"""
Loss functions for FraudShield GCN.

Provides class-weighted cross-entropy loss and focal loss variants
for handling class imbalance in fraud detection.
"""

import logging
from typing import Any, Dict, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)


def compute_class_weights(
    labels: torch.Tensor,
    mask: torch.Tensor,
    strategy: str = "balanced",
    manual_weights: Optional[list] = None,
    num_classes: int = 2,
) -> torch.Tensor:
    """
    Compute class weights for the loss function.

    IMPORTANT: Only uses labels from the TRAINING set (specified by mask)
    to compute weights. Test/validation labels are never used.

    Parameters
    ----------
    labels : torch.Tensor
        All node labels.
    mask : torch.Tensor
        Training mask (only these labels are used).
    strategy : str
        "balanced" for inverse-frequency weighting, "manual" for fixed weights,
        "none" for uniform weights.
    manual_weights : list, optional
        Manual class weights [w_0, w_1] when strategy="manual".
    num_classes : int
        Number of classes.

    Returns
    -------
    torch.Tensor
        Class weights [num_classes].
    """
    if strategy == "none":
        return torch.ones(num_classes, dtype=torch.float32)

    if strategy == "manual":
        if manual_weights is None or len(manual_weights) != num_classes:
            raise ValueError(f"manual_weights must have {num_classes} entries")
        return torch.tensor(manual_weights, dtype=torch.float32)

    if strategy == "balanced":
        train_labels = labels[mask]
        counts = torch.bincount(train_labels, minlength=num_classes).float()

        # Avoid division by zero
        counts = counts.clamp(min=1.0)

        # Inverse frequency weighting: n_samples / (n_classes * count_per_class)
        n_samples = float(train_labels.shape[0])
        weights = n_samples / (float(num_classes) * counts)

        logger.info(
            "Balanced class weights: %s (from %d training labels: %s)",
            weights.tolist(),
            int(train_labels.shape[0]),
            counts.int().tolist(),
        )
        return weights

    raise ValueError(f"Unknown class weight strategy: {strategy}")


class WeightedCrossEntropyLoss(nn.Module):
    """
    Cross-entropy loss with class weighting for imbalanced fraud detection.
    """

    def __init__(self, weight: Optional[torch.Tensor] = None):
        """
        Parameters
        ----------
        weight : torch.Tensor, optional
            Class weights [num_classes].
        """
        super().__init__()
        self.weight = weight

    def forward(
        self,
        logits: torch.Tensor,
        targets: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        Compute masked, weighted cross-entropy loss.

        Parameters
        ----------
        logits : torch.Tensor
            Model output logits [num_nodes, num_classes].
        targets : torch.Tensor
            Ground-truth labels [num_nodes].
        mask : torch.Tensor, optional
            Boolean mask selecting which nodes contribute to the loss.

        Returns
        -------
        torch.Tensor
            Scalar loss value.
        """
        if mask is not None:
            logits = logits[mask]
            targets = targets[mask]

        if logits.shape[0] == 0:
            return torch.tensor(0.0, requires_grad=True)

        weight = self.weight.to(logits.device) if self.weight is not None else None
        return F.cross_entropy(logits, targets, weight=weight)


class FocalLoss(nn.Module):
    """
    Focal loss for handling extreme class imbalance.

    Reduces the loss contribution from well-classified (easy) examples
    and focuses on hard examples.

    Reference: Lin et al., "Focal Loss for Dense Object Detection", ICCV 2017.
    """

    def __init__(
        self,
        alpha: Optional[torch.Tensor] = None,
        gamma: float = 2.0,
    ):
        """
        Parameters
        ----------
        alpha : torch.Tensor, optional
            Class weights [num_classes].
        gamma : float
            Focusing parameter (default: 2.0). Higher values focus more on hard examples.
        """
        super().__init__()
        self.alpha = alpha
        self.gamma = gamma

    def forward(
        self,
        logits: torch.Tensor,
        targets: torch.Tensor,
        mask: Optional[torch.Tensor] = None,
    ) -> torch.Tensor:
        """
        Compute focal loss.

        Parameters
        ----------
        logits : torch.Tensor
            [num_nodes, num_classes]
        targets : torch.Tensor
            [num_nodes]
        mask : torch.Tensor, optional
            Boolean mask.

        Returns
        -------
        torch.Tensor
            Scalar focal loss.
        """
        if mask is not None:
            logits = logits[mask]
            targets = targets[mask]

        if logits.shape[0] == 0:
            return torch.tensor(0.0, requires_grad=True)

        probs = F.softmax(logits, dim=1)
        targets_one_hot = F.one_hot(targets, num_classes=logits.shape[1]).float()
        pt = (probs * targets_one_hot).sum(dim=1)

        focal_weight = (1 - pt) ** self.gamma

        ce_loss = F.cross_entropy(logits, targets, reduction="none")

        if self.alpha is not None:
            alpha = self.alpha.to(logits.device)
            alpha_t = alpha[targets]
            focal_weight = focal_weight * alpha_t

        loss = (focal_weight * ce_loss).mean()

        return loss
