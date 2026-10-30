"""
Data schemas for FraudShield GCN.

Defines the canonical transaction schema, required/optional fields,
and validation types for normalized transaction records.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set


@dataclass
class TransactionSchema:
    """
    Canonical transaction schema with configurable source-column mappings.

    The schema separates required fields (must be present in any valid dataset)
    from optional fields (may be absent depending on data source).
    """

    # Required fields - must be present in any valid dataset
    REQUIRED_FIELDS: Set[str] = field(default_factory=lambda: {
        "transaction_id",
        "timestamp",
        "sender_id",
        "receiver_id",
        "amount",
    })

    # Optional fields - may be absent depending on data source
    OPTIONAL_FIELDS: Set[str] = field(default_factory=lambda: {
        "currency",
        "transaction_type",
        "transaction_status",
        "sender_entity_type",
        "receiver_entity_type",
        "fraud_label",
        "source_record_id",
    })

    # All canonical field names
    ALL_FIELDS: Set[str] = field(default_factory=lambda: {
        "transaction_id",
        "timestamp",
        "sender_id",
        "receiver_id",
        "amount",
        "currency",
        "transaction_type",
        "transaction_status",
        "sender_entity_type",
        "receiver_entity_type",
        "fraud_label",
        "source_record_id",
    })

    # Expected data types for validation
    FIELD_TYPES: Dict[str, str] = field(default_factory=lambda: {
        "transaction_id": "string",
        "timestamp": "datetime",
        "sender_id": "string",
        "receiver_id": "string",
        "amount": "numeric",
        "currency": "string",
        "transaction_type": "string",
        "transaction_status": "string",
        "sender_entity_type": "string",
        "receiver_entity_type": "string",
        "fraud_label": "binary_int",
        "source_record_id": "string",
    })

    # Valid transaction types
    VALID_TRANSACTION_TYPES: Set[str] = field(default_factory=lambda: {
        "TRANSFER",
        "PAYMENT",
        "CASH_IN",
        "CASH_OUT",
        "DEBIT",
        "CREDIT",
        "UPI",
        "NEFT",
        "RTGS",
        "IMPS",
        "OTHER",
    })

    # Valid transaction statuses
    VALID_TRANSACTION_STATUSES: Set[str] = field(default_factory=lambda: {
        "SUCCESS",
        "FAILED",
        "PENDING",
        "REVERSED",
        "CANCELLED",
    })

    # Valid entity types
    VALID_ENTITY_TYPES: Set[str] = field(default_factory=lambda: {
        "account",
        "upi_id",
        "phone",
        "card",
        "wallet",
        "unknown",
    })


@dataclass
class ValidationReport:
    """Report from data validation containing counts and issues."""

    total_rows: int = 0
    accepted_rows: int = 0
    rejected_rows: int = 0
    deduplicated_rows: int = 0
    missing_essential_rows: int = 0

    # Detailed issues
    missing_columns: List[str] = field(default_factory=list)
    invalid_amounts: int = 0
    invalid_timestamps: int = 0
    self_referential_edges: int = 0
    duplicate_transactions: int = 0
    invalid_labels: int = 0
    missing_sender_ids: int = 0
    missing_receiver_ids: int = 0

    # Warnings
    warnings: List[str] = field(default_factory=list)

    @property
    def is_valid(self) -> bool:
        """Whether the dataset passed all critical validation checks."""
        return len(self.missing_columns) == 0 and self.accepted_rows > 0

    def summary(self) -> str:
        """Generate a human-readable summary of validation results."""
        lines = [
            "=" * 60,
            "DATA VALIDATION REPORT",
            "=" * 60,
            f"Total rows:              {self.total_rows}",
            f"Accepted rows:           {self.accepted_rows}",
            f"Rejected rows:           {self.rejected_rows}",
            f"Deduplicated rows:       {self.deduplicated_rows}",
            f"Missing essential info:  {self.missing_essential_rows}",
            "-" * 60,
            f"Invalid amounts:         {self.invalid_amounts}",
            f"Invalid timestamps:      {self.invalid_timestamps}",
            f"Self-referential edges:  {self.self_referential_edges}",
            f"Duplicate transactions:  {self.duplicate_transactions}",
            f"Invalid labels:          {self.invalid_labels}",
            f"Missing sender IDs:      {self.missing_sender_ids}",
            f"Missing receiver IDs:    {self.missing_receiver_ids}",
        ]

        if self.missing_columns:
            lines.append(f"Missing required columns: {self.missing_columns}")

        if self.warnings:
            lines.append("-" * 60)
            lines.append("WARNINGS:")
            for w in self.warnings:
                lines.append(f"  - {w}")

        lines.append("=" * 60)
        lines.append(f"RESULT: {'PASSED' if self.is_valid else 'FAILED'}")
        lines.append("=" * 60)

        return "\n".join(lines)


@dataclass
class GraphSchema:
    """Schema describing the constructed graph structure."""

    num_nodes: int = 0
    num_edges: int = 0
    num_features: int = 0
    feature_names: List[str] = field(default_factory=list)
    node_types: Dict[str, int] = field(default_factory=dict)
    has_labels: bool = False
    num_labeled_nodes: int = 0
    num_fraud_nodes: int = 0
    num_legitimate_nodes: int = 0
    num_connected_components: int = 0
    num_isolated_nodes: int = 0
    schema_version: str = "0.1.0"

    def summary(self) -> str:
        """Human-readable graph summary."""
        lines = [
            "=" * 60,
            "GRAPH SCHEMA",
            "=" * 60,
            f"Nodes:                  {self.num_nodes}",
            f"Edges:                  {self.num_edges}",
            f"Features per node:      {self.num_features}",
            f"Has labels:             {self.has_labels}",
            f"Labeled nodes:          {self.num_labeled_nodes}",
            f"  - Fraud:              {self.num_fraud_nodes}",
            f"  - Legitimate:         {self.num_legitimate_nodes}",
            f"Connected components:   {self.num_connected_components}",
            f"Isolated nodes:         {self.num_isolated_nodes}",
            f"Schema version:         {self.schema_version}",
        ]
        if self.node_types:
            lines.append("Node types:")
            for ntype, count in self.node_types.items():
                lines.append(f"  - {ntype}: {count}")
        lines.append("=" * 60)
        return "\n".join(lines)
