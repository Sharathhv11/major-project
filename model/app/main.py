import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import (
    ENABLE_PREPROCESSING,
    FRAUD_THRESHOLD,
    MAX_TEXT_LENGTH,
    MODEL_ID,
    SUSPICIOUS_THRESHOLD,
)
from app.model import classifier
from app.schemas import PredictRequest, PredictResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("fraud.api")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Starting application. Loading text fraud model once into memory.")
    try:
        classifier.load()
    except Exception as exc:
        logger.error("Failed to load model %s: %s", MODEL_ID, exc, exc_info=True)
        raise
    yield
    logger.info("Shutting down text fraud service.")


app = FastAPI(
    title="Fraud Shield Text Classification API",
    description=(
        "Production ML service that classifies incoming SMS/messages into "
        "LEGITIMATE, SUSPICIOUS, or FRAUD using VynoDePal/sentra-sms-fraud-detector. "
        "Includes context-aware entity normalization to prevent false positives on "
        "merchants, URLs, phone numbers, and attachments."
    ),
    version="0.2.0",
    lifespan=lifespan,
)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request, exc: RequestValidationError):
    for error in exc.errors():
        loc = error.get("loc", [])
        err_type = error.get("type", "")
        if "text" in loc:
            if err_type == "missing":
                return JSONResponse(status_code=422, content={"detail": "Text message is required."})
            if err_type == "string_type":
                return JSONResponse(status_code=422, content={"detail": "Text message must be a string."})
    return JSONResponse(status_code=422, content={"detail": "Invalid request payload."})


def validate_text(text: object) -> str:
    if not isinstance(text, str):
        raise HTTPException(status_code=422, detail="Text message must be a string.")
    if not text or not text.strip():
        raise HTTPException(status_code=422, detail="Text message cannot be empty.")
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(
            status_code=422,
            detail=f"Text message exceeds the maximum length of {MAX_TEXT_LENGTH} characters.",
        )
    return text.strip()


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": classifier.is_ready(),
        "model_id": classifier.model_id,
        "device": str(classifier.device),
        "fraud_threshold": classifier.threshold,
        "suspicious_threshold": classifier.suspicious_threshold,
        "preprocessing_enabled": classifier.enable_preprocessing,
    }





@app.post("/predict", response_model=PredictResponse, tags=["classification"])
def predict(payload: PredictRequest) -> PredictResponse:
    text = validate_text(payload.text)
    try:
        result = classifier.predict(text)
    except Exception as exc:
        logger.error("Inference failure on input text: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Inference processing error.") from exc

    return PredictResponse(
        prediction=result.prediction,
        fraud_probability=result.fraud_probability,
        confidence=result.confidence,
        inference_time_ms=result.inference_time_ms,
        model_id=result.model_id,
        risk_level=result.risk_level,
        threshold=result.threshold,
        normalized_text=result.normalized_text,
    )
