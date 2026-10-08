import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def _float_env(name: str, default: float) -> float:
    raw = os.getenv(name, str(default)).strip()
    try:
        return float(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be a number, got {raw!r}") from exc


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        return int(raw)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer, got {raw!r}") from exc


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name, str(default)).strip().lower()
    return raw in ("true", "1", "yes", "y", "t")


# Hugging Face candidate model: fine-tuned multilingual DistilBERT for SMS fraud detection
MODEL_ID = os.getenv(
    "HF_MODEL_ID",
    "VynoDePal/sentra-sms-fraud-detector",
)

# Tuned threshold: Sentra model uses weighted loss (5.6x on fraud).
# A threshold of 0.75 achieves optimal precision/recall balance and mitigates false positives.
FRAUD_THRESHOLD = _float_env("FRAUD_THRESHOLD", 0.75)
SUSPICIOUS_THRESHOLD = _float_env("SUSPICIOUS_THRESHOLD", 0.45)

ENABLE_PREPROCESSING = _bool_env("ENABLE_PREPROCESSING", True)
MAX_TEXT_LENGTH = _int_env("MAX_TEXT_LENGTH", 2000)
MAX_TOKENS = _int_env("MAX_TOKENS", 128)
