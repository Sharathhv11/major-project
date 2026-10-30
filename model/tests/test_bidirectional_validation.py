"""Automated Bidirectional Validation & Regression Test Suite for FraudShield.

Validates:
1. Context-aware security awareness detection in preprocessor.py.
2. Canara Bank regression: Legitimate security advisory classified as NOT_FRAUD.
3. Direction A: Genuine fraud detection (credential harvesting, fake KYC, threats).
4. Direction B: Legitimate protection (bank security tips, transaction alerts).
5. Mixed-content attacks: Scammers embedding "Never share your OTP" to evade detection.
6. Contrastive pairs: Minimal wording variations yielding different classifications.
"""

from __future__ import annotations

import json
from pathlib import Path
import pytest

from app.model import TextFraudClassifier
from app.preprocessor import preprocessor
from evaluate_bidirectional import PythonLocalFraudFilter


@pytest.fixture(scope="module")
def classifier():
    clf = TextFraudClassifier()
    clf.load()
    return clf


@pytest.fixture(scope="module")
def local_filter():
    return PythonLocalFraudFilter()


# ─── 1. Canara Bank Security Advisory Regression ─────────────────────────────

def test_canara_bank_security_awareness_regression(classifier, local_filter):
    msg = (
        "UPI Pin is used for authorization of payment. Money will always be deducted "
        "if you use UPI Pin. Never share UPI Pin, CVV, OTP with anyone. "
        "UPI Pin will always be used only on the app's UPI Pin page."
    )

    # 1. Preprocessor context analysis
    prep = preprocessor.preprocess(msg)
    assert prep.is_security_awareness is True
    assert prep.has_malicious_indicators is False
    assert len(prep.awareness_matches) > 0

    # 2. Local filter routing: skipped from backend to avoid redundant load
    filt_res = local_filter.analyze(msg)
    assert filt_res["is_security_awareness"] is True
    assert filt_res["should_send_to_backend"] is False
    assert filt_res["score"] == 0

    # 3. Model classification: calibrated to NOT_FRAUD / LEGITIMATE
    result = classifier.predict(msg)
    assert result.prediction == "NOT_FRAUD"
    assert result.risk_level == "LEGITIMATE"
    assert result.fraud_probability < 0.10


# ─── 2. General Security Awareness Generalization (RBI & SBI) ────────────────

def test_rbi_and_sbi_security_awareness_generalization(classifier, local_filter):
    advisories = [
        "RBI Kehta Hai: Do not disclose your PIN, OTP, CVV, or passwords to anyone, including bank officials. Report unauthorized transactions immediately to 1930.",
        "SBI Security Alert: Beware of fake lottery calls or requests asking for OTP, CVV, or NetBanking password. SBI never asks for your credentials.",
        "Never share your OTP with anyone. Your bank will never ask for it under any circumstances. Stay alert and secure.",
    ]

    for adv in advisories:
        # Preprocessor check
        prep = preprocessor.preprocess(adv)
        assert prep.is_security_awareness is True
        assert prep.has_malicious_indicators is False

        # Local filter check
        f_res = local_filter.analyze(adv)
        assert f_res["is_security_awareness"] is True
        assert f_res["should_send_to_backend"] is False

        # Model check
        res = classifier.predict(adv)
        assert res.prediction == "NOT_FRAUD"
        assert res.risk_level == "LEGITIMATE"


# ─── 3. Direction A: Credential Harvesting & High-Risk Scams ─────────────────

def test_genuine_fraud_detection(classifier, local_filter):
    fraud_messages = [
        "Share your OTP with me immediately to prevent your bank account from being blocked. Bank verification team.",
        "To receive your pending refund of Rs. 4,500, enter your UPI Pin immediately on this page or share UPI Pin with the bank executive.",
        "Dear customer, your SBI account KYC verification is expired and will be blocked today. Update immediately at http://bit.ly/sbi-kyc-verify",
        "Dear consumer, your electricity power will be disconnected tonight at 9:30 PM due to unpaid bill. Immediately contact officer at 8910293847.",
    ]

    for f_msg in fraud_messages:
        # Local filter must forward
        f_res = local_filter.analyze(f_msg)
        assert f_res["should_send_to_backend"] is True
        assert f_res["is_security_awareness"] is False

        # Model must predict FRAUD
        res = classifier.predict(f_msg)
        assert res.prediction == "FRAUD"
        assert res.risk_level == "FRAUD"
        assert res.fraud_probability >= 0.70


# ─── 4. Mixed-Content Evasion Attack Defense ─────────────────────────────────

def test_mixed_content_evasion_attack_cannot_bypass_detection(classifier, local_filter):
    """Verifies Requirement: Scammer appending 'Never share your OTP' cannot bypass detection."""
    mixed_scam = (
        "Your bank account has been suspended due to incomplete KYC! "
        "Verify immediately at http://kyc-update-portal.cc. "
        "Never share your OTP with anyone."
    )

    # 1. Preprocessor context analysis
    prep = preprocessor.preprocess(mixed_scam)
    # Must detect both defensive phrase AND malicious indicators
    assert len(prep.awareness_matches) > 0
    assert prep.has_malicious_indicators is True
    assert prep.is_security_awareness is False  # Awareness is strictly VOIDED

    # 2. Local filter routing: must NOT exempt, must forward to backend
    f_res = local_filter.analyze(mixed_scam)
    assert f_res["is_security_awareness"] is False
    assert f_res["should_send_to_backend"] is True
    assert any("Mixed-content warning" in r for r in f_res["reasons"])

    # 3. Model must predict FRAUD despite defensive words
    res = classifier.predict(mixed_scam)
    assert res.prediction == "FRAUD"
    assert res.risk_level == "FRAUD"


# ─── 5. Contrastive Pairs Validation ─────────────────────────────────────────

def test_contrastive_pairs_accuracy(classifier, local_filter):
    pairs = [
        {
            "legit": "Never share your OTP with anyone. Your bank will never ask for it under any circumstances.",
            "fraud": "Share your OTP with me immediately to prevent your bank account from being blocked.",
        },
        {
            "legit": "Bank will never call you asking for your UPI PIN. UPI PIN is only required for sending money, not receiving.",
            "fraud": "You have received Rs. 10,000 via UPI. Enter your UPI PIN now to accept this payment into your bank account.",
        },
        {
            "legit": "Dear consumer, your electricity bill of Rs. 850 for meter #82719 is due on 28-Oct. Please pay at your electricity board portal.",
            "fraud": "Dear consumer, your electricity power will be disconnected tonight at 9:30 PM due to unpaid bill. Immediately contact officer at 8910293847.",
        },
    ]

    for p in pairs:
        # Legitimate message
        legit_res = classifier.predict(p["legit"])
        assert legit_res.prediction == "NOT_FRAUD", f"Failed on legit: {p['legit']}"

        # Fraud message
        fraud_res = classifier.predict(p["fraud"])
        assert fraud_res.prediction == "FRAUD", f"Failed on fraud: {p['fraud']}"


# ─── 6. Full Evaluation Dataset Validation ───────────────────────────────────

def test_full_evaluation_dataset_integrity():
    ds_path = Path(__file__).resolve().parents[0] / "evaluation_dataset.json"
    with open(ds_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    assert len(data) == 30
    for item in data:
        assert "id" in item
        assert "message" in item
        assert item["expected_label"] in ("FRAUD", "NOT_FRAUD")
        assert "category" in item
        assert "reason" in item
