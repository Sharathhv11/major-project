"""
Evaluation metrics for FraudShield GCN.

Computes precision, recall, F1, PR-AUC, ROC-AUC, confusion matrix,
false-positive/negative rates, and generates evaluation plots.

Prioritizes precision-recall analysis for imbalanced fraud datasets.
"""

import logging
from typing import Any, Dict, Optional, Tuple

import numpy as np
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    classification_report,
    confusion_matrix,
    f1_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)

logger = logging.getLogger(__name__)


def compute_metrics(
    y_true: np.ndarray,
    y_pred: np.ndarray,
    y_prob: np.ndarray,
    threshold: float = 0.5,
) -> Dict[str, Any]:
    """
    Compute comprehensive evaluation metrics.

    Parameters
    ----------
    y_true : np.ndarray
        Ground-truth binary labels.
    y_pred : np.ndarray
        Predicted binary labels (using the threshold).
    y_prob : np.ndarray
        Predicted fraud probabilities (probability of class 1).
    threshold : float
        Classification threshold used.

    Returns
    -------
    dict
        Dictionary of all computed metrics.
    """
    metrics = {}

    # Basic metrics
    metrics["accuracy"] = float(accuracy_score(y_true, y_pred))
    metrics["precision"] = float(precision_score(y_true, y_pred, zero_division=0))
    metrics["recall"] = float(recall_score(y_true, y_pred, zero_division=0))
    metrics["f1_score"] = float(f1_score(y_true, y_pred, zero_division=0))

    # PR-AUC / Average Precision
    if len(np.unique(y_true)) > 1:
        metrics["pr_auc"] = float(average_precision_score(y_true, y_prob))
        metrics["roc_auc"] = float(roc_auc_score(y_true, y_prob))
    else:
        metrics["pr_auc"] = 0.0
        metrics["roc_auc"] = 0.0
        logger.warning("Only one class present in y_true. AUC metrics set to 0.0.")

    # Confusion matrix
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    tn, fp, fn, tp = cm.ravel() if cm.size == 4 else (0, 0, 0, 0)
    metrics["confusion_matrix"] = cm.tolist()
    metrics["true_negatives"] = int(tn)
    metrics["false_positives"] = int(fp)
    metrics["false_negatives"] = int(fn)
    metrics["true_positives"] = int(tp)

    # Rates
    metrics["false_positive_rate"] = float(fp / (fp + tn)) if (fp + tn) > 0 else 0.0
    metrics["false_negative_rate"] = float(fn / (fn + tp)) if (fn + tp) > 0 else 0.0

    # Threshold used
    metrics["threshold"] = threshold

    # Class distribution
    metrics["total_samples"] = int(len(y_true))
    metrics["num_positive"] = int(y_true.sum())
    metrics["num_negative"] = int(len(y_true) - y_true.sum())
    metrics["positive_ratio"] = float(y_true.mean())

    return metrics


def find_optimal_threshold(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    strategy: str = "f1_optimal",
) -> float:
    """
    Find the optimal classification threshold using VALIDATION data.

    IMPORTANT: This must be called with validation data, NOT test data.
    The chosen threshold is then frozen for test evaluation.

    Parameters
    ----------
    y_true : np.ndarray
        Validation ground-truth labels.
    y_prob : np.ndarray
        Validation predicted probabilities.
    strategy : str
        "f1_optimal": maximize F1 score.
        "pr_based": select threshold at specific recall level.
        "fixed": return 0.5.

    Returns
    -------
    float
        Optimal threshold.
    """
    if strategy == "fixed":
        return 0.5

    if len(np.unique(y_true)) < 2:
        logger.warning("Only one class in validation data. Using default threshold 0.5.")
        return 0.5

    if strategy == "f1_optimal":
        precisions, recalls, thresholds = precision_recall_curve(y_true, y_prob)
        # F1 from precision and recall
        f1_scores = np.where(
            (precisions + recalls) > 0,
            2 * precisions * recalls / (precisions + recalls),
            0.0,
        )
        # precision_recall_curve returns n+1 precisions/recalls but n thresholds
        best_idx = np.argmax(f1_scores[:-1])
        best_threshold = float(thresholds[best_idx])

        logger.info(
            "Optimal F1 threshold: %.4f (F1=%.4f, P=%.4f, R=%.4f)",
            best_threshold,
            f1_scores[best_idx],
            precisions[best_idx],
            recalls[best_idx],
        )
        return best_threshold

    if strategy == "pr_based":
        # Target: at least 80% recall
        precisions, recalls, thresholds = precision_recall_curve(y_true, y_prob)
        valid = recalls[:-1] >= 0.8
        if valid.any():
            # Among those meeting recall threshold, pick highest precision
            idx = np.where(valid)[0]
            best_idx = idx[np.argmax(precisions[:-1][idx])]
            return float(thresholds[best_idx])
        else:
            logger.warning("No threshold achieves 80%% recall. Using F1-optimal.")
            return find_optimal_threshold(y_true, y_prob, "f1_optimal")

    raise ValueError(f"Unknown threshold strategy: {strategy}")


def compute_pr_curve(
    y_true: np.ndarray,
    y_prob: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute precision-recall curve data."""
    if len(np.unique(y_true)) < 2:
        return np.array([0, 1]), np.array([1, 0]), np.array([0.5])
    return precision_recall_curve(y_true, y_prob)


def compute_roc_curve(
    y_true: np.ndarray,
    y_prob: np.ndarray,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Compute ROC curve data."""
    if len(np.unique(y_true)) < 2:
        return np.array([0, 1]), np.array([0, 1]), np.array([0.5])
    return roc_curve(y_true, y_prob)


def format_metrics_report(
    metrics: Dict[str, Any],
    split_name: str = "test",
) -> str:
    """Format metrics as a human-readable report."""
    lines = [
        "=" * 60,
        f"EVALUATION METRICS ({split_name.upper()})",
        "=" * 60,
        f"Accuracy:                 {metrics.get('accuracy', 0):.4f}",
        f"Precision:                {metrics.get('precision', 0):.4f}",
        f"Recall:                   {metrics.get('recall', 0):.4f}",
        f"F1 Score:                 {metrics.get('f1_score', 0):.4f}",
        f"PR-AUC (Avg Precision):   {metrics.get('pr_auc', 0):.4f}",
        f"ROC-AUC:                  {metrics.get('roc_auc', 0):.4f}",
        "-" * 60,
        f"Threshold:                {metrics.get('threshold', 0.5):.4f}",
        f"False Positive Rate:      {metrics.get('false_positive_rate', 0):.4f}",
        f"False Negative Rate:      {metrics.get('false_negative_rate', 0):.4f}",
        "-" * 60,
        f"True Positives:           {metrics.get('true_positives', 0)}",
        f"True Negatives:           {metrics.get('true_negatives', 0)}",
        f"False Positives:          {metrics.get('false_positives', 0)}",
        f"False Negatives:          {metrics.get('false_negatives', 0)}",
        "-" * 60,
        f"Total Samples:            {metrics.get('total_samples', 0)}",
        f"Positive (Fraud):         {metrics.get('num_positive', 0)}",
        f"Negative (Legitimate):    {metrics.get('num_negative', 0)}",
        f"Fraud Ratio:              {metrics.get('positive_ratio', 0):.4f}",
        "=" * 60,
    ]
    return "\n".join(lines)
