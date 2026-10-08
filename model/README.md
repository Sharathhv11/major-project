# Fraud Shield Text Classification API

High-performance ML microservice for Fraud Shield. It classifies incoming SMS and alert messages into **`LEGITIMATE`**, **`SUSPICIOUS`**, and **`FRAUD`** categories using a fine-tuned Hugging Face transformer model with context-aware entity normalization to prevent false positives.

## Python Requirements

Python 3.10 or newer.

## Active Model

**[`VynoDePal/sentra-sms-fraud-detector`](https://huggingface.co/VynoDePal/sentra-sms-fraud-detector)**

| Property | Value |
|---|---|
| **Base Architecture** | Multilingual DistilBERT (`DistilBertForSequenceClassification`) |
| **Parameters** | 66 million parameters (SafeTensors format) |
| **Task** | SMS Fraud Detection (Smishing vs Benign) |
| **Labels** | Class 0: `LEGITIMATE`, Class 1: `FRAUD` |
| **Preprocessing** | Context-aware entity normalization + SMS abbreviation expansion |
| **Device** | Auto-detected CUDA GPU if available, CPU fallback |
| **License** | MIT |

### Why this model over the legacy model

- **Purpose-Built for Fraud**: The previous model (`mariagrandury/distilbert-base-uncased-finetuned-sms-spam-detection`) was trained for generic marketing spam vs ham. `sentra-sms-fraud-detector` was explicitly trained to catch smishing, mobile money scams, impersonation, and fraudulent requests.
- **Multilingual Tokenizer**: Uses `distilbert-base-multilingual-cased` with a large 119,547 vocabulary, improving recognition across multilingual text and Indian phrasing.
- **Context-Aware Preprocessing**: Eliminates false positives on benign e-commerce tracking (Flipkart, Amazon), customer care helplines, OTPs, UPI payments, and PDF invoice receipts.

## Preprocessing & False-Positive Mitigation

To prevent false alarms, the preprocessor (`app/preprocessor.py`) identifies entity structures without erasing context:
- **E-Commerce Merchants**: Replaces recognized retailer names with `[MERCHANT]` while keeping message intent intact.
- **URLs & Links**: Replaces hyperlinks with `[URL]`.
- **Documents & PDFs**: Converts filenames such as `invoice_sep.pdf` into `[PDF]`.
- **Phone Numbers**: Converts contact/toll-free numbers into `[PHONE]`.
- **Currency & Amounts**: Normalizes monetary amounts into `[AMOUNT]`.
- **OTPs**: Normalizes isolated authentication tokens into `[OTP]`.

## 3-Tier Classification Decision Layer

Rather than an arbitrary `0.50` binary threshold, the service uses calibrated thresholds:
- **`FRAUD`**: `fraud_probability >= FRAUD_THRESHOLD` (Default: `0.75`)
- **`SUSPICIOUS`**: `SUSPICIOUS_THRESHOLD <= fraud_probability < FRAUD_THRESHOLD` (Default: `0.45`)
- **`LEGITIMATE`**: `fraud_probability < SUSPICIOUS_THRESHOLD`

## Installation & Setup

1. From `model/` directory:
   ```bash
   python -m venv venv
   ```

2. Activate virtual environment:
   - Windows:
     ```powershell
     venv\Scripts\activate
     ```
   - Linux / macOS:
     ```bash
     source venv/bin/activate
     ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment:
   ```bash
   copy .env.example .env
   ```

## Running the Service

Start FastAPI server with Uvicorn:
```bash
uvicorn app.main:app --reload --port 8000
```

- Swagger UI: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Health check: `GET http://127.0.0.1:8000/health`

## API Endpoints

### `POST /predict`

#### Request Body:
```json
{
  "text": "Your Flipkart order has been shipped. Track your package at https://flipkart.com/track/12345"
}
```

#### Response Body:
```json
{
  "prediction": "NOT_FRAUD",
  "fraud_probability": 0.0821,
  "confidence": 0.9179,
  "inference_time_ms": 14.2,
  "model_id": "VynoDePal/sentra-sms-fraud-detector",
  "risk_level": "LEGITIMATE",
  "threshold": 0.75,
  "normalized_text": "Your [MERCHANT] order has been shipped. Track your package at [URL]"
}
```

## Running Regression Tests & Evaluation

Run pytest suite:
```bash
pytest tests/ -v
```

Run comprehensive benchmark evaluation:
```bash
python evaluate_pipeline.py
```
Outputs Confusion Matrix, Precision, Recall, F1-Score, False Positive Rate (FPR), False Negative Rate (FNR), subgroup analysis (Flipkart, phone numbers, PDFs), and threshold sweep.
