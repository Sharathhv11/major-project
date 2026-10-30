"""
Evaluation module for FraudShield GCN.

Runs comprehensive evaluation on the test set, generates plots,
and compares GCN against baseline models.
"""

import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import matplotlib
matplotlib.use("Agg")  # Non-interactive backend
import matplotlib.pyplot as plt
import numpy as np
import torch
from torch_geometric.data import Data

from .metrics import (
    compute_metrics,
    compute_pr_curve,
    compute_roc_curve,
    find_optimal_threshold,
    format_metrics_report,
)
from .model import FraudGCN

logger = logging.getLogger(__name__)


class ModelEvaluator:
    """
    Comprehensive model evaluation with plots and comparisons.
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.reports_dir = config.get("paths", {}).get("reports", "reports/figures")
        Path(self.reports_dir).mkdir(parents=True, exist_ok=True)

    @torch.no_grad()
    def evaluate_gcn(
        self,
        model: FraudGCN,
        data: Data,
        mask: torch.Tensor,
        threshold: Optional[float] = None,
        split_name: str = "test",
    ) -> Dict[str, Any]:
        """
        Evaluate GCN model on a specific split.

        Parameters
        ----------
        model : FraudGCN
            Trained model.
        data : Data
            PyG Data object.
        mask : torch.Tensor
            Boolean mask for the split.
        threshold : float, optional
            Classification threshold. If None, uses 0.5.
        split_name : str
            Name of the split for reporting.

        Returns
        -------
        dict
            Evaluation metrics.
        """
        model.eval()
        device = next(model.parameters()).device
        data = data.to(device)

        logits = model(data.x, data.edge_index)
        probs = torch.softmax(logits, dim=1)

        y_prob = probs[mask][:, 1].cpu().numpy()
        y_true = data.y[mask].cpu().numpy()

        if threshold is None:
            threshold = 0.5

        y_pred = (y_prob >= threshold).astype(int)

        metrics = compute_metrics(y_true, y_pred, y_prob, threshold)
        metrics["split"] = split_name
        metrics["model_type"] = "gcn"

        report = format_metrics_report(metrics, split_name)
        logger.info("\n%s", report)

        return metrics

    def evaluate_baseline(
        self,
        model: Any,
        data: Data,
        mask: torch.Tensor,
        threshold: Optional[float] = None,
        split_name: str = "test",
    ) -> Dict[str, Any]:
        """
        Evaluate baseline sklearn model.
        """
        X = data.x[mask].cpu().numpy()
        y_true = data.y[mask].cpu().numpy()

        y_prob = model.predict_proba(X)[:, 1]

        if threshold is None:
            threshold = 0.5

        y_pred = (y_prob >= threshold).astype(int)

        metrics = compute_metrics(y_true, y_pred, y_prob, threshold)
        metrics["split"] = split_name
        metrics["model_type"] = "baseline"

        report = format_metrics_report(metrics, split_name)
        logger.info("\n%s", report)

        return metrics

    @torch.no_grad()
    def find_threshold_on_validation(
        self,
        model: FraudGCN,
        data: Data,
    ) -> float:
        """
        Find optimal threshold using VALIDATION data only.

        The threshold is then frozen for test evaluation.
        """
        model.eval()
        device = next(model.parameters()).device
        data = data.to(device)

        logits = model(data.x, data.edge_index)
        probs = torch.softmax(logits, dim=1)

        val_probs = probs[data.val_mask][:, 1].cpu().numpy()
        val_labels = data.y[data.val_mask].cpu().numpy()

        eval_config = self.config.get("evaluation", {})
        strategy = eval_config.get("threshold_strategy", "f1_optimal")

        if strategy == "fixed":
            return eval_config.get("fixed_threshold", 0.5)

        return find_optimal_threshold(val_labels, val_probs, strategy)

    def find_baseline_threshold(
        self,
        model: Any,
        data: Data,
    ) -> float:
        """Find optimal threshold for baseline using validation data."""
        X_val = data.x[data.val_mask].cpu().numpy()
        y_val = data.y[data.val_mask].cpu().numpy()

        y_prob = model.predict_proba(X_val)[:, 1]

        eval_config = self.config.get("evaluation", {})
        strategy = eval_config.get("threshold_strategy", "f1_optimal")

        if strategy == "fixed":
            return eval_config.get("fixed_threshold", 0.5)

        return find_optimal_threshold(y_val, y_prob, strategy)

    @torch.no_grad()
    def plot_training_curves(
        self,
        history: Dict[str, List[float]],
        save_path: Optional[str] = None,
    ) -> None:
        """Plot training and validation loss/metric curves."""
        fig, axes = plt.subplots(1, 3, figsize=(18, 5))

        # Loss curves
        axes[0].plot(history["train_loss"], label="Train Loss", color="#e74c3c")
        axes[0].plot(history["val_loss"], label="Val Loss", color="#3498db")
        axes[0].set_xlabel("Epoch")
        axes[0].set_ylabel("Loss")
        axes[0].set_title("Training & Validation Loss")
        axes[0].legend()
        axes[0].grid(True, alpha=0.3)

        # Validation Average Precision
        axes[1].plot(history["val_avg_precision"], label="Val AP", color="#2ecc71")
        axes[1].set_xlabel("Epoch")
        axes[1].set_ylabel("Average Precision")
        axes[1].set_title("Validation Average Precision")
        axes[1].legend()
        axes[1].grid(True, alpha=0.3)

        # Validation F1
        axes[2].plot(history["val_f1"], label="Val F1", color="#9b59b6")
        axes[2].set_xlabel("Epoch")
        axes[2].set_ylabel("F1 Score")
        axes[2].set_title("Validation F1 Score")
        axes[2].legend()
        axes[2].grid(True, alpha=0.3)

        plt.tight_layout()

        if save_path is None:
            save_path = str(Path(self.reports_dir) / "training_curves.png")
        plt.savefig(save_path, dpi=150, bbox_inches="tight")
        plt.close()
        logger.info("Training curves saved to %s", save_path)

    @torch.no_grad()
    def plot_evaluation(
        self,
        model: FraudGCN,
        data: Data,
        mask: torch.Tensor,
        threshold: float,
        split_name: str = "test",
        baseline_model: Any = None,
        baseline_threshold: float = 0.5,
    ) -> None:
        """Generate evaluation plots: PR curve, ROC curve, and confusion matrix."""
        model.eval()
        device = next(model.parameters()).device
        data_dev = data.to(device)

        logits = model(data_dev.x, data_dev.edge_index)
        probs = torch.softmax(logits, dim=1)

        y_prob_gcn = probs[mask][:, 1].cpu().numpy()
        y_true = data.y[mask].cpu().numpy()

        fig, axes = plt.subplots(1, 3, figsize=(18, 5))

        # PR Curve
        pr_p, pr_r, _ = compute_pr_curve(y_true, y_prob_gcn)
        axes[0].plot(pr_r, pr_p, color="#e74c3c", linewidth=2, label="GCN")

        if baseline_model is not None:
            X = data.x[mask].cpu().numpy()
            y_prob_bl = baseline_model.predict_proba(X)[:, 1]
            bl_p, bl_r, _ = compute_pr_curve(y_true, y_prob_bl)
            axes[0].plot(bl_r, bl_p, color="#3498db", linewidth=2, linestyle="--", label="Baseline")

        axes[0].set_xlabel("Recall")
        axes[0].set_ylabel("Precision")
        axes[0].set_title(f"Precision-Recall Curve ({split_name})")
        axes[0].legend()
        axes[0].grid(True, alpha=0.3)

        # ROC Curve
        roc_fpr, roc_tpr, _ = compute_roc_curve(y_true, y_prob_gcn)
        axes[1].plot(roc_fpr, roc_tpr, color="#e74c3c", linewidth=2, label="GCN")
        axes[1].plot([0, 1], [0, 1], "k--", alpha=0.3, label="Random")

        if baseline_model is not None:
            bl_fpr, bl_tpr, _ = compute_roc_curve(y_true, y_prob_bl)
            axes[1].plot(bl_fpr, bl_tpr, color="#3498db", linewidth=2, linestyle="--", label="Baseline")

        axes[1].set_xlabel("False Positive Rate")
        axes[1].set_ylabel("True Positive Rate")
        axes[1].set_title(f"ROC Curve ({split_name})")
        axes[1].legend()
        axes[1].grid(True, alpha=0.3)

        # Confusion Matrix (GCN)
        y_pred = (y_prob_gcn >= threshold).astype(int)
        from sklearn.metrics import confusion_matrix
        cm = confusion_matrix(y_true, y_pred, labels=[0, 1])

        im = axes[2].imshow(cm, interpolation="nearest", cmap=plt.cm.Blues)
        axes[2].set_title(f"Confusion Matrix - GCN ({split_name})")
        plt.colorbar(im, ax=axes[2])
        axes[2].set_xticks([0, 1])
        axes[2].set_yticks([0, 1])
        axes[2].set_xticklabels(["Legitimate", "Fraud"])
        axes[2].set_yticklabels(["Legitimate", "Fraud"])
        axes[2].set_xlabel("Predicted")
        axes[2].set_ylabel("Actual")

        # Annotate cells
        for i in range(2):
            for j in range(2):
                axes[2].text(
                    j, i, str(cm[i, j]),
                    ha="center", va="center",
                    color="white" if cm[i, j] > cm.max() / 2 else "black",
                    fontsize=14,
                )

        plt.tight_layout()
        save_path = str(Path(self.reports_dir) / f"evaluation_{split_name}.png")
        plt.savefig(save_path, dpi=150, bbox_inches="tight")
        plt.close()
        logger.info("Evaluation plots saved to %s", save_path)

    def generate_comparison_report(
        self,
        gcn_metrics: Dict[str, Any],
        baseline_metrics: Dict[str, Any],
        save_path: Optional[str] = None,
    ) -> str:
        """Generate a comparison report between GCN and baseline."""
        lines = [
            "=" * 70,
            "MODEL COMPARISON: GCN vs BASELINE",
            "=" * 70,
            "",
            f"{'Metric':<30} {'GCN':>15} {'Baseline':>15} {'Delta':>10}",
            "-" * 70,
        ]

        compare_keys = [
            ("Precision", "precision"),
            ("Recall", "recall"),
            ("F1 Score", "f1_score"),
            ("PR-AUC", "pr_auc"),
            ("ROC-AUC", "roc_auc"),
            ("False Positive Rate", "false_positive_rate"),
            ("False Negative Rate", "false_negative_rate"),
        ]

        for label, key in compare_keys:
            gcn_val = gcn_metrics.get(key, 0)
            bl_val = baseline_metrics.get(key, 0)
            delta = gcn_val - bl_val
            sign = "+" if delta > 0 else ""
            lines.append(f"{label:<30} {gcn_val:>15.4f} {bl_val:>15.4f} {sign}{delta:>9.4f}")

        lines.append("=" * 70)

        # Interpretation
        gcn_ap = gcn_metrics.get("pr_auc", 0)
        bl_ap = baseline_metrics.get("pr_auc", 0)
        if gcn_ap > bl_ap:
            lines.append("GCN outperforms baseline on PR-AUC, suggesting graph structure helps.")
        elif gcn_ap < bl_ap:
            lines.append(
                "Baseline outperforms GCN on PR-AUC. Graph structure may not help for this dataset, "
                "or the GCN needs further tuning."
            )
        else:
            lines.append("GCN and baseline perform similarly.")

        lines.append("")

        report = "\n".join(lines)

        if save_path is None:
            save_path = str(Path(self.reports_dir) / "comparison_report.txt")
        with open(save_path, "w") as f:
            f.write(report)

        logger.info("Comparison report saved to %s", save_path)
        return report
