"""
Data validation for FraudShield GCN.

Validates transaction data against the canonical schema, checking for
missing columns, invalid values, duplicates, and reporting detailed results.
Records are never silently dropped.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from .schemas import TransactionSchema, ValidationReport

logger = logging.getLogger(__name__)


def validate_dataframe(
    df: pd.DataFrame,
    config: Dict[str, Any],
    schema: Optional[TransactionSchema] = None,
) -> Tuple[pd.DataFrame, ValidationReport]:
    """
    Validate a transaction DataFrame against the canonical schema.

    Parameters
    ----------
    df : pd.DataFrame
        Raw transaction data.
    config : dict
        Configuration dictionary with column_mapping and validation options.
    schema : TransactionSchema, optional
        Schema to validate against. Uses default if not provided.

    Returns
    -------
    Tuple[pd.DataFrame, ValidationReport]
        Cleaned DataFrame and validation report.
        Rejected rows are excluded from the returned DataFrame but counted in the report.
    """
    if schema is None:
        schema = TransactionSchema()

    report = ValidationReport()
    report.total_rows = len(df)

    if len(df) == 0:
        report.warnings.append("Empty DataFrame provided")
        return df, report

    # Step 1: Apply column mapping
    column_mapping = config.get("dataset", {}).get("column_mapping", {})
    df = _apply_column_mapping(df, column_mapping)

    # Step 2: Check required columns
    missing = _check_required_columns(df, schema)
    report.missing_columns = missing
    if missing:
        logger.error("Missing required columns: %s", missing)
        return df, report

    # Step 3: Create rejection mask (True = reject)
    reject_mask = pd.Series(False, index=df.index)

    # Step 4: Validate and parse timestamps
    df, ts_invalid_count = _validate_timestamps(df)
    report.invalid_timestamps = ts_invalid_count
    reject_mask |= df["_invalid_timestamp"]
    df = df.drop(columns=["_invalid_timestamp"])

    # Step 5: Validate amounts
    amount_invalid_mask = _validate_amounts(df)
    report.invalid_amounts = amount_invalid_mask.sum()
    reject_mask |= amount_invalid_mask

    # Step 6: Check missing sender/receiver IDs
    missing_sender = df["sender_id"].isna() | (df["sender_id"].astype(str).str.strip() == "")
    missing_receiver = df["receiver_id"].isna() | (df["receiver_id"].astype(str).str.strip() == "")
    report.missing_sender_ids = missing_sender.sum()
    report.missing_receiver_ids = missing_receiver.sum()
    reject_mask |= missing_sender | missing_receiver

    # Step 7: Check self-referential edges
    self_ref = df["sender_id"].astype(str) == df["receiver_id"].astype(str)
    report.self_referential_edges = self_ref.sum()
    reject_mask |= self_ref

    # Step 8: Validate fraud labels if present
    if "fraud_label" in df.columns:
        label_invalid = _validate_labels(df)
        report.invalid_labels = label_invalid.sum()
        # Don't reject rows with invalid labels—set them to NaN
        df.loc[label_invalid, "fraud_label"] = np.nan

    # Step 9: Detect duplicates
    dup_mask = _detect_duplicates(df)
    report.duplicate_transactions = dup_mask.sum()
    reject_mask |= dup_mask

    # Step 10: Apply rejections
    report.missing_essential_rows = int((missing_sender | missing_receiver).sum())
    report.rejected_rows = int(reject_mask.sum())

    clean_df = df[~reject_mask].copy().reset_index(drop=True)
    report.accepted_rows = len(clean_df)
    report.deduplicated_rows = report.duplicate_transactions

    # Warnings for optional columns
    for col in schema.OPTIONAL_FIELDS:
        if col not in clean_df.columns:
            report.warnings.append(f"Optional column '{col}' not present")

    if "currency" in clean_df.columns:
        unique_currencies = clean_df["currency"].dropna().unique()
        if len(unique_currencies) > 1:
            report.warnings.append(
                f"Multiple currencies detected: {list(unique_currencies)[:5]}. "
                "Multi-currency handling is basic in this version."
            )

    logger.info(
        "Validation complete: %d/%d rows accepted, %d rejected",
        report.accepted_rows,
        report.total_rows,
        report.rejected_rows,
    )

    return clean_df, report


def _apply_column_mapping(
    df: pd.DataFrame,
    column_mapping: Dict[str, str],
) -> pd.DataFrame:
    """Apply source-column-to-canonical-name mapping."""
    df = df.copy()
    reverse_mapping = {}
    for canonical, source in column_mapping.items():
        if source in df.columns and source != canonical:
            reverse_mapping[source] = canonical

    if reverse_mapping:
        df = df.rename(columns=reverse_mapping)

    return df


def _check_required_columns(
    df: pd.DataFrame,
    schema: TransactionSchema,
) -> List[str]:
    """Check for missing required columns."""
    return [col for col in schema.REQUIRED_FIELDS if col not in df.columns]


def _validate_timestamps(df: pd.DataFrame) -> Tuple[pd.DataFrame, int]:
    """
    Parse and validate timestamps. Sets a temporary _invalid_timestamp column.

    Returns
    -------
    Tuple[pd.DataFrame, int]
        DataFrame with parsed timestamps and count of invalid timestamps.
    """
    df = df.copy()
    original_ts = df["timestamp"].copy()

    # Try parsing timestamps
    df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce", utc=True)

    invalid_mask = df["timestamp"].isna() & original_ts.notna()
    df["_invalid_timestamp"] = invalid_mask

    # Also flag null timestamps
    df["_invalid_timestamp"] |= df["timestamp"].isna()

    invalid_count = int(df["_invalid_timestamp"].sum())

    return df, invalid_count


def _validate_amounts(df: pd.DataFrame) -> pd.Series:
    """Validate transaction amounts. Returns mask of invalid rows."""
    amounts = pd.to_numeric(df["amount"], errors="coerce")
    invalid = amounts.isna() | (amounts <= 0) | (~np.isfinite(amounts.fillna(0)))
    return invalid


def _validate_labels(df: pd.DataFrame) -> pd.Series:
    """Validate fraud labels. Returns mask of invalid label rows."""
    labels = df["fraud_label"]
    # Valid labels are 0 or 1 (or NaN for unlabeled)
    numeric_labels = pd.to_numeric(labels, errors="coerce")
    invalid = ~(numeric_labels.isna() | numeric_labels.isin([0, 1, 0.0, 1.0]))
    return invalid


def _detect_duplicates(df: pd.DataFrame) -> pd.Series:
    """
    Detect duplicate transactions based on key fields.

    Returns mask where True = duplicate (keep first occurrence).
    """
    dup_cols = ["transaction_id"]
    if "transaction_id" in df.columns:
        # Only flag duplicates if transaction_id is populated
        has_id = df["transaction_id"].notna() & (df["transaction_id"].astype(str).str.strip() != "")
        dup_mask = pd.Series(False, index=df.index)
        if has_id.any():
            dup_mask[has_id] = df.loc[has_id, "transaction_id"].duplicated(keep="first")
        return dup_mask

    return pd.Series(False, index=df.index)
