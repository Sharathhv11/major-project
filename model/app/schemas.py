from typing import Literal, Optional

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    text: str = Field(..., description="Raw message text to classify.")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "text": (
                        "Congratulations! You have won Rs. 50,000. "
                        "Click this link to claim your prize."
                    )
                }
            ]
        }
    }


class PredictResponse(BaseModel):
    prediction: Literal["FRAUD", "NOT_FRAUD"]
    fraud_probability: float = Field(..., ge=0.0, le=1.0)
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
        description="Raw softmax probability of the predicted class.",
    )
    inference_time_ms: float = Field(..., description="Model inference time in milliseconds.")
    model_id: str = Field(..., description="Hugging Face model currently in use.")
    risk_level: Literal["LEGITIMATE", "SUSPICIOUS", "FRAUD"] = Field(
        default="LEGITIMATE",
        description="3-tier classification: LEGITIMATE, SUSPICIOUS (needs review), or FRAUD.",
    )
    threshold: float = Field(
        default=0.75,
        description="Active fraud classification threshold.",
    )
    normalized_text: Optional[str] = Field(
        default=None,
        description="Text after context-aware entity normalization.",
    )


class NetworkAnalyzeRequest(BaseModel):
    transactions: list[dict[str, object]] = Field(
        ...,
        description="List of transaction records containing source, target, amount, timestamp, etc.",
    )
    dataset_name: Optional[str] = Field(
        default="transactions.csv",
        description="Identifier or file name of the dataset.",
    )


class NetworkAnalyzeResponse(BaseModel):
    risk_score: int
    risk_level: Literal["Low", "Medium", "High"]
    total_transactions: int
    total_entities: int
    flagged_entities_count: int
    flagged_transactions_count: int
    nodes: list[dict[str, object]]
    edges: list[dict[str, object]]
    suspicious_entities: list[dict[str, object]]
    suspicious_transactions: list[dict[str, object]]
    model_type: str
    inference_time_ms: float
    dataset_name: Optional[str] = None

