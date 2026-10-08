"""Modular text-fraud classifier using Hugging Face sequence classification.

Loads the model once into memory and reuses it across all requests.
Integrates context-aware text normalization to mitigate false positives
caused by benign URLs, phone numbers, and invoice/PDF attachments.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

import torch
import torch.nn.functional as F
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from app.config import (
    ENABLE_PREPROCESSING,
    FRAUD_THRESHOLD,
    MAX_TOKENS,
    MODEL_ID,
    SUSPICIOUS_THRESHOLD,
)
from app.preprocessor import preprocessor

logger = logging.getLogger("fraud.text_classifier")

# Labels that signify fraud / malicious intent across various HF models
_FRAUD_LABELS = {
    "fraud",
    "spam",
    "phishing",
    "scam",
    "malicious",
    "label_1",
    "1",
}


@dataclass(frozen=True)
class ClassificationResult:
    prediction: str
    fraud_probability: float
    confidence: float
    inference_time_ms: float
    model_id: str
    raw_label: str
    risk_level: str
    threshold: float
    normalized_text: Optional[str] = None


class TextFraudClassifier:
    """Loads a Hugging Face sequence classifier once and reuses it in memory."""

    def __init__(
        self,
        model_id: str = MODEL_ID,
        threshold: float = FRAUD_THRESHOLD,
        suspicious_threshold: float = SUSPICIOUS_THRESHOLD,
        enable_preprocessing: bool = ENABLE_PREPROCESSING,
    ) -> None:
        self.model_id = model_id
        self.threshold = threshold
        self.suspicious_threshold = suspicious_threshold
        self.enable_preprocessing = enable_preprocessing
        self.tokenizer = None
        self.model = None
        # Auto-detect CUDA GPU if available, else CPU
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._fraud_index: int = 1
        self._id2label: dict[int, str] = {}

    def load(self) -> None:
        logger.info("Using device: %s", self.device)
        logger.info("Loading tokenizer: %s", self.model_id)
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_id)
        logger.info("Loading model: %s", self.model_id)
        self.model = AutoModelForSequenceClassification.from_pretrained(self.model_id)
        self.model.to(self.device)
        self.model.eval()

        # Map labels dynamically from model config
        if hasattr(self.model.config, "id2label") and self.model.config.id2label:
            self._id2label = {int(k): str(v) for k, v in self.model.config.id2label.items()}
        else:
            self._id2label = {0: "LEGITIMATE", 1: "FRAUD"}

        self._fraud_index = self._resolve_fraud_index()
        logger.info(
            "Model ready on %s | labels=%s | fraud_class_index=%s | fraud_threshold=%.3f | suspicious_threshold=%.3f",
            self.device,
            self._id2label,
            self._fraud_index,
            self.threshold,
            self.suspicious_threshold,
        )

    def _resolve_fraud_index(self) -> int:
        """Dynamically resolve the class index corresponding to FRAUD."""
        # 1. Check label2id if available
        if hasattr(self.model.config, "label2id") and self.model.config.label2id:
            for lbl, idx in self.model.config.label2id.items():
                if lbl.strip().lower() in _FRAUD_LABELS:
                    return int(idx)

        # 2. Check id2label
        for idx, label in self._id2label.items():
            if label.strip().lower() in _FRAUD_LABELS:
                return int(idx)

        # Default fallback to 1 if available
        return 1 if 1 in self._id2label else next(iter(self._id2label))

    def is_ready(self) -> bool:
        return self.tokenizer is not None and self.model is not None

    def predict(self, text: str) -> ClassificationResult:
        if not self.is_ready():
            raise RuntimeError("Classifier is not loaded. Call load() at application startup.")

        if not text or not text.strip():
            raise ValueError("Input text cannot be empty.")

        # 1. Context-aware text preprocessing to normalize FP triggers
        normalized_text = None
        text_for_inference = text
        if self.enable_preprocessing:
            prep_res = preprocessor.preprocess(text)
            text_for_inference = prep_res.normalized_text
            normalized_text = prep_res.normalized_text
            logger.debug("Raw: %s | Normalized: %s", text, text_for_inference)

        # 2. Tokenize input
        encoded = self.tokenizer(
            text_for_inference,
            return_tensors="pt",
            truncation=True,
            max_length=MAX_TOKENS,
            padding=True,
        )
        encoded = {key: value.to(self.device) for key, value in encoded.items()}

        start = time.perf_counter()
        with torch.no_grad():
            logits = self.model(**encoded).logits
            probabilities = F.softmax(logits, dim=-1)[0]
        inference_time_ms = (time.perf_counter() - start) * 1000

        fraud_probability = float(probabilities[self._fraud_index].item())
        predicted_index = int(torch.argmax(probabilities).item())
        raw_label = self._id2label.get(predicted_index, str(predicted_index))
        confidence = float(probabilities[predicted_index].item())

        # 3. Decision layer with 3-tier risk classification
        if fraud_probability >= self.threshold:
            prediction = "FRAUD"
            risk_level = "FRAUD"
        elif fraud_probability >= self.suspicious_threshold:
            prediction = "NOT_FRAUD"
            risk_level = "SUSPICIOUS"
        else:
            prediction = "NOT_FRAUD"
            risk_level = "LEGITIMATE"

        logger.info(
            "Prediction: %s | Risk: %s | Fraud probability: %.4f | Inference time: %.1f ms",
            prediction,
            risk_level,
            fraud_probability,
            inference_time_ms,
        )

        return ClassificationResult(
            prediction=prediction,
            fraud_probability=round(fraud_probability, 4),
            confidence=round(confidence, 4),
            inference_time_ms=round(inference_time_ms, 2),
            model_id=self.model_id,
            raw_label=raw_label,
            risk_level=risk_level,
            threshold=self.threshold,
            normalized_text=normalized_text,
        )


classifier = TextFraudClassifier()
