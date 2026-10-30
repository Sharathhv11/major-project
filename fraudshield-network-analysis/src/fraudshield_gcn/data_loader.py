"""
Data loader for FraudShield GCN.

Loads transaction data from CSV files or synthetic generators,
applies column mapping, and returns raw DataFrames ready for validation.
"""

import logging
from pathlib import Path
from typing import Any, Dict, Optional

import pandas as pd

logger = logging.getLogger(__name__)


def load_transactions(
    source: str,
    config: Dict[str, Any],
    nrows: Optional[int] = None,
) -> pd.DataFrame:
    """
    Load transaction data from a file path.

    Parameters
    ----------
    source : str
        Path to a CSV file containing transaction data.
    config : dict
        Configuration dictionary with column mappings.
    nrows : int, optional
        Maximum number of rows to read (useful for testing).

    Returns
    -------
    pd.DataFrame
        Raw transaction data.

    Raises
    ------
    FileNotFoundError
        If the source file does not exist.
    ValueError
        If the file cannot be parsed.
    """
    source_path = Path(source)

    if not source_path.exists():
        raise FileNotFoundError(f"Transaction data file not found: {source_path}")

    suffix = source_path.suffix.lower()

    if suffix == ".csv":
        df = pd.read_csv(source_path, nrows=nrows)
    elif suffix == ".parquet":
        df = pd.read_parquet(source_path)
        if nrows is not None:
            df = df.head(nrows)
    elif suffix in (".xls", ".xlsx"):
        df = pd.read_excel(source_path, nrows=nrows)
    else:
        raise ValueError(f"Unsupported file format: {suffix}. Use CSV, Parquet, or Excel.")

    logger.info("Loaded %d rows from %s", len(df), source_path.name)

    return df


def save_transactions(
    df: pd.DataFrame,
    output_path: str,
) -> None:
    """
    Save transaction DataFrame to a CSV file.

    Parameters
    ----------
    df : pd.DataFrame
        Transaction data to save.
    output_path : str
        Path to save the CSV file.
    """
    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    logger.info("Saved %d rows to %s", len(df), out.name)
