import pytest
from app.network_gcn import analyze_transaction_network
from app.schemas import NetworkAnalyzeRequest
from app.main import analyze_network

MULE_DATASET = [
    {"id": "TX-101", "source": "UNKNOWN_SRC_991", "target": "USER_ACCOUNT_A", "amount": "₹95,000", "timestamp": "10:02:15", "type": "IMPS"},
    {"id": "TX-102", "source": "UNKNOWN_SRC_992", "target": "USER_ACCOUNT_A", "amount": "₹85,000", "timestamp": "10:05:40", "type": "IMPS"},
    {"id": "TX-103", "source": "USER_ACCOUNT_A", "target": "CRYPTO_EXCHANGE_OUT", "amount": "₹92,000", "timestamp": "10:11:00", "type": "UPI"},
    {"id": "TX-104", "source": "USER_ACCOUNT_A", "target": "MULE_BENEFICIARY_X", "amount": "₹86,000", "timestamp": "10:12:30", "type": "UPI"},
    {"id": "TX-105", "source": "USER_ACCOUNT_A", "target": "ATM_CASH_WITHDRAWAL", "amount": "₹1,500", "timestamp": "10:14:00", "type": "ATM"},
]

LEGITIMATE_DATASET = [
    {"id": "TX-201", "source": "EMPLOYER_CORP_SALARY", "target": "USER_ACCOUNT_A", "amount": "₹85,000", "timestamp": "09:00:00", "type": "NEFT"},
    {"id": "TX-202", "source": "USER_ACCOUNT_A", "target": "AMAZON_INDIA", "amount": "₹2,150", "timestamp": "11:20:00", "type": "CARD"},
    {"id": "TX-203", "source": "USER_ACCOUNT_A", "target": "SWIGGY_FOOD", "amount": "₹480", "timestamp": "13:45:00", "type": "UPI"},
    {"id": "TX-204", "source": "USER_ACCOUNT_A", "target": "BESCOM_ELECTRICITY", "amount": "₹1,850", "timestamp": "15:10:00", "type": "NETBANKING"},
    {"id": "TX-205", "source": "USER_ACCOUNT_A", "target": "AIRTEL_BROADBAND", "amount": "₹999", "timestamp": "16:30:00", "type": "UPI"},
    {"id": "TX-206", "source": "USER_ACCOUNT_A", "target": "APARTMENT_RENT", "amount": "15000", "timestamp": "18:00:00", "type": "NEFT"},
    {"id": "TX-207", "source": "USER_ACCOUNT_A", "target": "ZOMATO_DINING", "amount": "320", "timestamp": "20:15:00", "type": "UPI"},
]


def test_fraudulent_mule_network_detected():
    result = analyze_transaction_network(MULE_DATASET, "fraudulent_bank_statement_mule_drain.csv")
    assert result["risk_level"] == "High"
    assert result["risk_score"] >= 80
    assert result["flagged_entities_count"] >= 3
    assert result["flagged_transactions_count"] >= 3

    flagged_ids = [e["id"] for e in result["suspicious_entities"]]
    assert "USER_ACCOUNT_A" in flagged_ids
    assert "CRYPTO_EXCHANGE_OUT" in flagged_ids
    assert "MULE_BENEFICIARY_X" in flagged_ids


def test_legitimate_salary_network_classified_as_low_risk():
    result = analyze_transaction_network(LEGITIMATE_DATASET, "legitimate_bank_statement_salary_expenses.csv")
    assert result["risk_level"] == "Low"
    assert result["risk_score"] <= 25
    assert result["flagged_entities_count"] == 0
    assert result["flagged_transactions_count"] == 0
    assert len(result["suspicious_entities"]) == 0
    assert len(result["suspicious_transactions"]) == 0


def test_api_network_analyze_handler():
    payload = NetworkAnalyzeRequest(transactions=LEGITIMATE_DATASET, dataset_name="legitimate.csv")
    response = analyze_network(payload)
    assert response.risk_level == "Low"
    assert response.flagged_entities_count == 0
    assert response.risk_score <= 25


def test_bank_statement_extracted_schema_personal_statement():
    """Test GCN evaluation on extracted bank statement schema (source_id, target_id, channel) for user1."""
    statement_txs = [
        {"source_id": "user2", "target_id": "user1", "amount": 85000.0, "timestamp": "2026-10-01T09:00:00", "channel": "NEFT"},
        {"source_id": "user1", "target_id": "user3", "amount": 2150.0, "timestamp": "2026-10-05T11:20:00", "channel": "CARD"},
        {"source_id": "user1", "target_id": "user4", "amount": 480.0, "timestamp": "2026-10-07T13:45:00", "channel": "UPI"},
        {"source_id": "user1", "target_id": "user5", "amount": 1850.0, "timestamp": "2026-10-10T15:10:00", "channel": "BANK_TRANSFER"},
        {"source_id": "user1", "target_id": "user6", "amount": 999.0, "timestamp": "2026-10-12T16:30:00", "channel": "UPI"},
        {"source_id": "user1", "target_id": "user7", "amount": 15000.0, "timestamp": "2026-10-15T18:00:00", "channel": "NEFT"},
        {"source_id": "user1", "target_id": "user8", "amount": 320.0, "timestamp": "2026-10-20T20:15:00", "channel": "UPI"},
    ]
    result = analyze_transaction_network(statement_txs, "canara_bank_statement_oct2026.pdf")
    assert result["risk_level"] == "Low"
    assert result["risk_score"] <= 25
    assert result["flagged_entities_count"] == 0
    assert len(result["suspicious_entities"]) == 0


def test_bank_statement_extracted_schema_mule_drain_statement():
    """Test GCN evaluation on extracted bank statement schema for a high-risk mule drain statement."""
    statement_mule_txs = [
        {"source_id": "user2", "target_id": "user1", "amount": 95000.0, "timestamp": "2026-10-20T10:02:15", "channel": "IMPS"},
        {"source_id": "user3", "target_id": "user1", "amount": 85000.0, "timestamp": "2026-10-20T10:05:40", "channel": "IMPS"},
        {"source_id": "user1", "target_id": "user4", "amount": 92000.0, "timestamp": "2026-10-20T10:11:00", "channel": "UPI"},
        {"source_id": "user1", "target_id": "user5", "amount": 86000.0, "timestamp": "2026-10-20T10:12:30", "channel": "UPI"},
        {"source_id": "user1", "target_id": "user6", "amount": 1500.0, "timestamp": "2026-10-20T10:14:00", "channel": "ATM"},
    ]
    result = analyze_transaction_network(statement_mule_txs, "canara_mule_drain_statement.pdf")
    assert result["risk_level"] == "High"
    assert result["risk_score"] >= 80
    assert result["flagged_entities_count"] >= 3
    flagged_ids = [e["id"] for e in result["suspicious_entities"]]
    assert "user1" in flagged_ids

