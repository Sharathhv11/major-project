"""
Training pipeline for FraudShield GCN.

Implements reproducible training with early stopping, checkpointing,
class imbalance handling, and training/validation metric logging.

Key design decisions:
- Full-batch GCN training (suitable when graph fits in memory)
- Early stopping on validation average precision
- Class weights computed from training labels only
- Best checkpoint saved based on validation metric
- Test set never used for checkpoint selection or hyperparameter tuning
"""

import logging
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import average_precision_score
from torch_geometric.data import Data

from .losses import WeightedCrossEntropyLoss, compute_class_weights
from .metrics import compute_metrics, find_optimal_threshold
from .model import FraudGCN
from .reproducibility import set_seed

logger = logging.getLogger(__name__)


class EarlyStopping:
    """Early stopping to halt training when validation metric stops improving."""

    def __init__(
        self,
        patience: int = 30,
        min_delta: float = 0.001,
        mode: str = "max",
    ):
        self.patience = patience
        self.min_delta = min_delta
        self.mode = mode
        self.best_score = None
        self.counter = 0
        self.should_stop = False

    def __call__(self, score: float) -> bool:
        if self.best_score is None:
            self.best_score = score
            return False

        if self.mode == "max":
            improved = score > self.best_score + self.min_delta
        else:
            improved = score < self.best_score - self.min_delta

        if improved:
            self.best_score = score
            self.counter = 0
        else:
            self.counter += 1
            if self.counter >= self.patience:
                self.should_stop = True

        return self.should_stop


class GCNTrainer:
    """
    Trains the FraudGCN model with early stopping and checkpointing.
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        training_config = config.get("training", {})
        self.epochs = training_config.get("epochs", 200)
        self.lr = training_config.get("learning_rate", 0.01)
        self.weight_decay = training_config.get("weight_decay", 0.0005)
        self.gradient_clip_norm = training_config.get("gradient_clip_norm", 1.0)

        # Device
        device_setting = training_config.get("device", "auto")
        if device_setting == "auto":
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device_setting)

        # Early stopping
        es_config = training_config.get("early_stopping", {})
        self.early_stopping_enabled = es_config.get("enabled", True)
        self.es_patience = es_config.get("patience", 30)
        self.es_min_delta = es_config.get("min_delta", 0.001)
        self.es_monitor = es_config.get("monitor", "val_avg_precision")

        # Class weights
        self.class_weight_strategy = training_config.get("class_weight_strategy", "balanced")
        self.manual_class_weights = training_config.get("manual_class_weights", [1.0, 10.0])

        # Training history
        self.history: Dict[str, List[float]] = {
            "train_loss": [],
            "val_loss": [],
            "val_avg_precision": [],
            "val_f1": [],
        }

    def train(
        self,
        model: FraudGCN,
        data: Data,
        save_dir: Optional[str] = None,
    ) -> Tuple[FraudGCN, Dict[str, Any]]:
        """
        Train the GCN model.

        Parameters
        ----------
        model : FraudGCN
            Model to train.
        data : Data
            PyG Data object with features, labels, masks.
        save_dir : str, optional
            Directory to save checkpoints.

        Returns
        -------
        Tuple[FraudGCN, Dict]
            Trained model and training results.
        """
        model = model.to(self.device)
        data = data.to(self.device)

        # Compute class weights from TRAINING labels only
        class_weights = compute_class_weights(
            data.y,
            data.train_mask,
            strategy=self.class_weight_strategy,
            manual_weights=self.manual_class_weights,
        ).to(self.device)

        criterion = WeightedCrossEntropyLoss(weight=class_weights)

        # Optimizer
        optimizer_name = self.config.get("training", {}).get("optimizer", "adam")
        if optimizer_name == "adamw":
            optimizer = optim.AdamW(
                model.parameters(), lr=self.lr, weight_decay=self.weight_decay
            )
        else:
            optimizer = optim.Adam(
                model.parameters(), lr=self.lr, weight_decay=self.weight_decay
            )

        # Early stopping
        early_stopper = EarlyStopping(
            patience=self.es_patience,
            min_delta=self.es_min_delta,
            mode="max",
        ) if self.early_stopping_enabled else None

        best_val_score = -float("inf")
        best_state_dict = None
        best_epoch = 0

        logger.info(
            "Starting training: %d epochs, lr=%.4f, device=%s",
            self.epochs,
            self.lr,
            self.device,
        )

        start_time = time.time()

        for epoch in range(1, self.epochs + 1):
            # Training step
            train_loss = self._train_step(model, data, criterion, optimizer)
            self.history["train_loss"].append(train_loss)

            # Validation step
            val_metrics = self._validate(model, data, criterion)
            self.history["val_loss"].append(val_metrics["loss"])
            self.history["val_avg_precision"].append(val_metrics.get("avg_precision", 0.0))
            self.history["val_f1"].append(val_metrics.get("f1", 0.0))

            # Determine monitoring metric
            if self.es_monitor == "val_avg_precision":
                val_score = val_metrics.get("avg_precision", 0.0)
            elif self.es_monitor == "val_f1":
                val_score = val_metrics.get("f1", 0.0)
            else:
                val_score = -val_metrics["loss"]

            # Save best model
            if val_score > best_val_score:
                best_val_score = val_score
                best_state_dict = {k: v.cpu().clone() for k, v in model.state_dict().items()}
                best_epoch = epoch

                if save_dir:
                    self._save_checkpoint(model, save_dir, epoch, val_score)

            # Logging
            if epoch % 10 == 0 or epoch == 1:
                logger.info(
                    "Epoch %3d/%d | Train Loss: %.4f | Val Loss: %.4f | Val AP: %.4f | Val F1: %.4f",
                    epoch,
                    self.epochs,
                    train_loss,
                    val_metrics["loss"],
                    val_metrics.get("avg_precision", 0.0),
                    val_metrics.get("f1", 0.0),
                )

            # Early stopping check
            if early_stopper and early_stopper(val_score):
                logger.info(
                    "Early stopping triggered at epoch %d (best: epoch %d, score: %.4f)",
                    epoch,
                    best_epoch,
                    best_val_score,
                )
                break

        elapsed = time.time() - start_time

        # Restore best model
        if best_state_dict is not None:
            model.load_state_dict(best_state_dict)
            model = model.to(self.device)

        results = {
            "best_epoch": best_epoch,
            "best_val_score": best_val_score,
            "total_epochs": epoch,
            "training_time_seconds": elapsed,
            "history": self.history,
            "class_weights": class_weights.cpu().tolist(),
        }

        logger.info(
            "Training complete: best epoch %d, best val %s: %.4f, time: %.1fs",
            best_epoch,
            self.es_monitor,
            best_val_score,
            elapsed,
        )

        return model, results

    def _train_step(
        self,
        model: FraudGCN,
        data: Data,
        criterion: nn.Module,
        optimizer: optim.Optimizer,
    ) -> float:
        """Single training step."""
        model.train()
        optimizer.zero_grad()

        logits = model(data.x, data.edge_index)
        loss = criterion(logits, data.y, data.train_mask)

        loss.backward()

        if self.gradient_clip_norm > 0:
            nn.utils.clip_grad_norm_(model.parameters(), self.gradient_clip_norm)

        optimizer.step()

        return loss.item()

    @torch.no_grad()
    def _validate(
        self,
        model: FraudGCN,
        data: Data,
        criterion: nn.Module,
    ) -> Dict[str, float]:
        """Validation step."""
        model.eval()

        logits = model(data.x, data.edge_index)
        loss = criterion(logits, data.y, data.val_mask)

        # Compute probabilities
        probs = torch.softmax(logits, dim=1)

        val_probs = probs[data.val_mask][:, 1].cpu().numpy()
        val_labels = data.y[data.val_mask].cpu().numpy()
        val_preds = (val_probs >= 0.5).astype(int)

        metrics = {"loss": loss.item()}

        if len(np.unique(val_labels)) > 1:
            metrics["avg_precision"] = float(average_precision_score(val_labels, val_probs))
            from sklearn.metrics import f1_score
            metrics["f1"] = float(f1_score(val_labels, val_preds, zero_division=0))
        else:
            metrics["avg_precision"] = 0.0
            metrics["f1"] = 0.0

        return metrics

    def _save_checkpoint(
        self,
        model: FraudGCN,
        save_dir: str,
        epoch: int,
        val_score: float,
    ) -> None:
        """Save model checkpoint."""
        save_path = Path(save_dir)
        save_path.mkdir(parents=True, exist_ok=True)

        checkpoint = {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "model_config": model.get_config(),
            "val_score": val_score,
        }

        torch.save(checkpoint, save_path / "model.pt")


class BaselineTrainer:
    """
    Trains a non-graph baseline model for comparison.

    Uses the same node features but ignores graph structure,
    providing a fair comparison to assess the GCN's benefit.
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        baseline_config = config.get("baseline", {})
        self.model_type = baseline_config.get("type", "logistic_regression")
        self.model = None

    def train(
        self,
        data: Data,
    ) -> Tuple[Any, Dict[str, Any]]:
        """
        Train baseline model on node features (no graph structure).

        Parameters
        ----------
        data : Data
            PyG Data with features, labels, and masks.

        Returns
        -------
        Tuple
            Trained sklearn model and training results.
        """
        X_train = data.x[data.train_mask].cpu().numpy()
        y_train = data.y[data.train_mask].cpu().numpy()

        baseline_config = self.config.get("baseline", {})

        if self.model_type == "logistic_regression":
            lr_config = baseline_config.get("logistic_regression", {})
            self.model = LogisticRegression(
                max_iter=lr_config.get("max_iter", 1000),
                class_weight=lr_config.get("class_weight", "balanced"),
                C=lr_config.get("C", 1.0),
                random_state=self.config.get("project", {}).get("random_seed", 42),
            )
        elif self.model_type == "random_forest":
            rf_config = baseline_config.get("random_forest", {})
            self.model = RandomForestClassifier(
                n_estimators=rf_config.get("n_estimators", 200),
                max_depth=rf_config.get("max_depth", 10),
                class_weight=rf_config.get("class_weight", "balanced"),
                random_state=self.config.get("project", {}).get("random_seed", 42),
            )
        else:
            raise ValueError(f"Unknown baseline type: {self.model_type}")

        logger.info("Training baseline model: %s", self.model_type)

        start_time = time.time()
        self.model.fit(X_train, y_train)
        elapsed = time.time() - start_time

        # Training predictions
        train_probs = self.model.predict_proba(X_train)[:, 1]
        train_ap = float(average_precision_score(y_train, train_probs))

        results = {
            "model_type": self.model_type,
            "training_time_seconds": elapsed,
            "train_avg_precision": train_ap,
            "num_train_samples": len(y_train),
        }

        logger.info(
            "Baseline training complete: %s, train AP: %.4f, time: %.1fs",
            self.model_type,
            train_ap,
            elapsed,
        )

        return self.model, results

    @staticmethod
    def predict(
        model: Any,
        data: Data,
        mask: torch.Tensor,
    ) -> Tuple[np.ndarray, np.ndarray]:
        """
        Make predictions with baseline model.

        Returns
        -------
        Tuple[np.ndarray, np.ndarray]
            Predicted probabilities and labels.
        """
        X = data.x[mask].cpu().numpy()
        probs = model.predict_proba(X)[:, 1]
        return probs, data.y[mask].cpu().numpy()
