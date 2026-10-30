"""
Calibration utilities for FraudShield GCN.

Provides probability calibration using Platt scaling or isotonic regression,
fitted on validation data (never on test data).

Important: A well-calibrated probability means the predicted probability
closely matches the true frequency of the positive class. This is distinct
from ranking performance (PR-AUC, ROC-AUC).
"""

import logging
from typing import Any, Dict, Optional, Tuple

import numpy as np
from sklearn.calibration import CalibratedClassifierCV
from sklearn.linear_model import LogisticRegression

logger = logging.getLogger(__name__)


class ProbabilityCalibrator:
    """
    Calibrates model probabilities using validation data.

    Uses Platt scaling (logistic regression on raw scores) as the default
    calibration method.
    """

    def __init__(self, method: str = "platt"):
        """
        Parameters
        ----------
        method : str
            Calibration method: "platt" or "isotonic".
        """
        self.method = method
        self.calibrator = None
        self._is_fitted = False

    def fit(self, y_prob: np.ndarray, y_true: np.ndarray) -> None:
        """
        Fit calibrator on validation data.

        Parameters
        ----------
        y_prob : np.ndarray
            Raw predicted probabilities.
        y_true : np.ndarray
            True binary labels.
        """
        if self.method == "platt":
            # Platt scaling: logistic regression on predicted probabilities
            self.calibrator = LogisticRegression()
            self.calibrator.fit(y_prob.reshape(-1, 1), y_true)
        elif self.method == "isotonic":
            from sklearn.isotonic import IsotonicRegression
            self.calibrator = IsotonicRegression(out_of_bounds="clip")
            self.calibrator.fit(y_prob, y_true)
        else:
            raise ValueError(f"Unknown calibration method: {self.method}")

        self._is_fitted = True
        logger.info("Probability calibrator fitted using %s method", self.method)

    def calibrate(self, y_prob: np.ndarray) -> np.ndarray:
        """
        Calibrate probabilities.

        Parameters
        ----------
        y_prob : np.ndarray
            Raw predicted probabilities.

        Returns
        -------
        np.ndarray
            Calibrated probabilities.
        """
        if not self._is_fitted:
            raise RuntimeError("Calibrator not fitted. Call fit() first.")

        if self.method == "platt":
            return self.calibrator.predict_proba(y_prob.reshape(-1, 1))[:, 1]
        elif self.method == "isotonic":
            return self.calibrator.predict(y_prob)

        return y_prob

    def compute_calibration_error(
        self,
        y_prob: np.ndarray,
        y_true: np.ndarray,
        n_bins: int = 10,
    ) -> Tuple[float, np.ndarray, np.ndarray, np.ndarray]:
        """
        Compute Expected Calibration Error (ECE).

        Parameters
        ----------
        y_prob : np.ndarray
            Predicted probabilities.
        y_true : np.ndarray
            True binary labels.
        n_bins : int
            Number of calibration bins.

        Returns
        -------
        Tuple
            ECE, bin confidences, bin accuracies, bin counts.
        """
        bin_boundaries = np.linspace(0, 1, n_bins + 1)
        bin_confidences = np.zeros(n_bins)
        bin_accuracies = np.zeros(n_bins)
        bin_counts = np.zeros(n_bins, dtype=int)

        for i in range(n_bins):
            mask = (y_prob >= bin_boundaries[i]) & (y_prob < bin_boundaries[i + 1])
            if i == n_bins - 1:  # Include right edge for last bin
                mask = (y_prob >= bin_boundaries[i]) & (y_prob <= bin_boundaries[i + 1])

            if mask.sum() > 0:
                bin_confidences[i] = y_prob[mask].mean()
                bin_accuracies[i] = y_true[mask].mean()
                bin_counts[i] = mask.sum()

        # ECE = weighted average of |confidence - accuracy|
        total = bin_counts.sum()
        if total > 0:
            ece = np.sum(bin_counts / total * np.abs(bin_confidences - bin_accuracies))
        else:
            ece = 0.0

        return ece, bin_confidences, bin_accuracies, bin_counts
