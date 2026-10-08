from app.config import FRAUD_THRESHOLD, MAX_TEXT_LENGTH

FRAUD_EXAMPLES = [
    "Congratulations! You have won ₹50,000. Click this link immediately to claim your reward.",
    "Your bank account will be blocked today. Verify your KYC immediately using this link.",
    "You have received a cashback of Rs. 10,000. Claim it now.",
]

LEGITIMATE_EXAMPLES = [
    "Hi, I'll be home around 7 PM.",
    "Your appointment is confirmed for tomorrow at 10 AM.",
    "Can you send me the project report when you get time?",
    "Your License KA13 2026007377 handed over to Post Office with tracking no. TA468867850IN. You can track delivery status at https://parivahan.gov.in after 48 hours. MoRTH"
]


def test_health_reports_loaded_model(client):
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["model_loaded"] is True
    assert "VynoDePal" in body["model_id"]
    assert "fraud_threshold" in body
    assert "suspicious_threshold" in body


def test_missing_text_returns_error(client):
    response = client.post("/predict", json={})
    assert response.status_code == 422
    assert response.json()["detail"] == "Text message is required."


def test_empty_text_returns_error(client):
    response = client.post("/predict", json={"text": ""})
    assert response.status_code == 422
    assert response.json()["detail"] == "Text message cannot be empty."


def test_whitespace_only_text_returns_error(client):
    response = client.post("/predict", json={"text": "   \n\t  "})
    assert response.status_code == 422
    assert response.json()["detail"] == "Text message cannot be empty."


def test_non_string_text_returns_error(client):
    response = client.post("/predict", json={"text": 12345})
    assert response.status_code == 422
    assert response.json()["detail"] == "Text message must be a string."


def test_very_long_text_returns_error(client):
    response = client.post("/predict", json={"text": "a" * (MAX_TEXT_LENGTH + 1)})
    assert response.status_code == 422
    assert "maximum length" in response.json()["detail"]


def test_fraud_examples_are_flagged(client):
    for message in FRAUD_EXAMPLES:
        response = client.post("/predict", json={"text": message})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["prediction"] in {"FRAUD", "NOT_FRAUD"}
        assert 0.0 <= body["fraud_probability"] <= 1.0
        assert "inference_time_ms" in body
        assert body["prediction"] == "FRAUD"
        assert body["fraud_probability"] >= body["threshold"]
        assert body["risk_level"] == "FRAUD"


def test_legitimate_examples_are_not_flagged(client):
    for message in LEGITIMATE_EXAMPLES:
        response = client.post("/predict", json={"text": message})
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["prediction"] == "NOT_FRAUD"
        assert body["fraud_probability"] < body["threshold"]
        assert body["risk_level"] in {"LEGITIMATE", "SUSPICIOUS"}


def test_predict_response_shape(client):
    response = client.post(
        "/predict",
        json={
            "text": "Congratulations! You have won Rs. 50,000. Click this link to claim your prize."
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) >= {
        "prediction",
        "fraud_probability",
        "confidence",
        "inference_time_ms",
        "model_id",
        "risk_level",
        "threshold",
    }
