"""Regression tests for Fraud Shield text classifier.

Validates that the updated model and context-aware preprocessing pipeline
correctly distinguish legitimate messages (Flipkart links, Amazon alerts,
banking notifications, OTPs, customer care numbers, invoice PDFs) from
fraudulent attacks (KYC phishing, bank suspension, delivery fee scams, etc.).
"""

import pytest

from app.model import classifier
from app.preprocessor import preprocessor

# Required legitimate test cases
LEGITIMATE_REGRESSION_CASES = [
    {
        "name": "Flipkart order tracking link",
        "text": "Your Flipkart order has been shipped. Track your package at https://flipkart.com/track/OD9281746281",
        "expected_entity": "merchants",
    },
    {
        "name": "Amazon delivery notification",
        "text": "Your Amazon package will be delivered today by 5 PM. Delivery OTP is 4821. Give this code to the delivery associate.",
        "expected_entity": "otps",
    },
    {
        "name": "Legitimate bank transaction alert",
        "text": "Dear customer, Rs. 1,500.00 debited from A/C XX4012 on 21-Sep-24 via UPI ref 426189. Avail bal: Rs. 24,310.",
        "expected_entity": "amounts",
    },
    {
        "name": "OTP message",
        "text": "482910 is your secret OTP for login to your account. Valid for 10 mins. Do not share it with anyone.",
        "expected_entity": "otps",
    },
    {
        "name": "Customer support phone number",
        "text": "For queries regarding your order, please contact our customer support team at 1800-202-9898.",
        "expected_entity": "phones",
    },
    {
        "name": "Legitimate invoice PDF notification",
        "text": "Thank you for your purchase. Your tax invoice is attached as invoice_sep2024.pdf.",
        "expected_entity": "pdfs",
    },
    {
        "name": "Legitimate UPI payment notification",
        "text": "Received Rs. 500 from Rahul via UPI (Ref No 908123412). View balance in your bank app.",
        "expected_entity": "amounts",
    },
]

# Required fraud test cases
FRAUD_REGRESSION_CASES = [
    {
        "name": "Fake KYC verification message",
        "text": "Dear customer, your SBI account will be blocked today. Please complete your KYC verification immediately by clicking http://bit.ly/sbi-kyc-update",
    },
    {
        "name": "Fake account-blocking message with a phishing URL",
        "text": "URGENT: Your HDFC bank account is suspended due to suspicious activity. Verify credentials now at http://hdfc-security-auth.online to restore access.",
    },
    {
        "name": "Fake delivery fee scam",
        "text": "Your courier delivery is pending due to unpaid fee of Rs. 25. Pay immediately at http://india-post-pay.cc or package will be returned.",
    },
    {
        "name": "Fake customer support scam",
        "text": "Call customer support immediately at +91-9988776655 to prevent permanent deactivation of your SIM card.",
    },
    {
        "name": "Fraudulent payment request",
        "text": "URGENT: Approve pending payment request of Rs. 25,000 on PhonePe immediately or your account will be frozen.",
    },
    {
        "name": "Fake prize or lottery message",
        "text": "Congratulations! Your mobile number won Rs. 25,00,000 in KBC Lucky Draw. Click http://kbc-winner-2024.com to claim immediately.",
    },
]


@pytest.fixture(scope="module", autouse=True)
def ensure_model_loaded():
    if not classifier.is_ready():
        classifier.load()


class TestContextAwarePreprocessor:
    """Validates entity normalization logic."""

    def test_flipkart_merchant_and_url_normalized(self):
        text = "Your Flipkart order has been shipped. Track your package at https://flipkart.com/track/123"
        res = preprocessor.preprocess(text)
        assert "[MERCHANT]" in res.normalized_text
        assert "[URL]" in res.normalized_text
        assert "Flipkart" not in res.normalized_text
        assert "https://flipkart.com" not in res.normalized_text
        assert "Track your package" in res.normalized_text  # Context preserved

    def test_pdf_attachment_normalized(self):
        text = "Your invoice is attached as invoice.pdf"
        res = preprocessor.preprocess(text)
        assert "[PDF]" in res.normalized_text
        assert "invoice.pdf" not in res.normalized_text
        assert "Your invoice is attached as" in res.normalized_text

    def test_phone_number_normalized(self):
        text = "Contact support at 1800-202-9898 for help."
        res = preprocessor.preprocess(text)
        assert "[PHONE]" in res.normalized_text
        assert "1800-202-9898" not in res.normalized_text

    def test_otp_code_normalized(self):
        text = "Your login OTP is 849201. Do not share."
        res = preprocessor.preprocess(text)
        assert "[OTP]" in res.normalized_text
        assert "849201" not in res.normalized_text


class TestLegitimateRegressionCases:
    """Verifies that legitimate everyday messages are NOT classified as FRAUD."""

    @pytest.mark.parametrize(
        "case",
        LEGITIMATE_REGRESSION_CASES,
        ids=[c["name"] for c in LEGITIMATE_REGRESSION_CASES],
    )
    def test_legitimate_cases_are_not_fraud(self, case):
        result = classifier.predict(case["text"])
        assert (
            result.prediction == "NOT_FRAUD"
        ), f"False Positive on legitimate case '{case['name']}': prob={result.fraud_probability:.4f}, risk={result.risk_level}"
        assert result.fraud_probability < classifier.threshold
        assert result.risk_level in {"LEGITIMATE", "SUSPICIOUS"}


class TestFraudRegressionCases:
    """Verifies that malicious fraud, phishing, and scam messages ARE classified as FRAUD."""

    @pytest.mark.parametrize(
        "case",
        FRAUD_REGRESSION_CASES,
        ids=[c["name"] for c in FRAUD_REGRESSION_CASES],
    )
    def test_fraud_cases_are_detected(self, case):
        result = classifier.predict(case["text"])
        assert (
            result.prediction == "FRAUD"
        ), f"False Negative on fraud case '{case['name']}': prob={result.fraud_probability:.4f}, risk={result.risk_level}"
        assert result.fraud_probability >= classifier.threshold
        assert result.risk_level == "FRAUD"
