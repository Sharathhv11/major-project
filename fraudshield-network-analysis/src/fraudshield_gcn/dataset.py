"""
Dataset construction for FraudShield GCN.

Orchestrates the full pipeline from raw transactions to a ready-to-train
PyTorch Geometric Data object with temporal/random splits.

Key design decisions:
- Temporal split: train on earlier data, validate/test on later data
- Features derived ONLY from data available before the prediction cutoff
- Labeled nodes only in the mask (unlabeled nodes excluded from loss)
- Class distribution reported for each split
"""

import logging
from typing import Any, Dict, Optional, Tuple

import numpy as np
import pandas as pd
import torch
from torch_geometric.data import Data

from .config import resolve_paths
from .data_loader import load_transactions
from .data_validation import validate_dataframe
from .entity_resolution import EntityResolver
from .feature_engineering import FeatureEngineer
from .graph_builder import GraphBuilder
from .schemas import GraphSchema, ValidationReport

logger = logging.getLogger(__name__)


def build_dataset(
    config: Dict[str, Any],
    transactions_df: Optional[pd.DataFrame] = None,
    source_path: Optional[str] = None,
) -> Tuple[Data, GraphSchema, FeatureEngineer, EntityResolver, ValidationReport]:
    """
    Build a complete dataset from transactions.

    Orchestrates: load -> validate -> resolve entities -> compute features ->
    build graph -> split data.

    Parameters
    ----------
    config : dict
        Full configuration dictionary.
    transactions_df : pd.DataFrame, optional
        Pre-loaded transactions. If None, loads from source_path.
    source_path : str, optional
        Path to transaction CSV file.

    Returns
    -------
    Tuple of:
        - Data: PyG Data object with features, labels, and masks
        - GraphSchema: Graph metadata
        - FeatureEngineer: Fitted feature engineer (for inference)
        - EntityResolver: Entity resolver with mappings
        - ValidationReport: Data validation results
    """
    config = resolve_paths(config)

    # Step 1: Load data
    if transactions_df is None:
        if source_path is None:
            raise ValueError("Either transactions_df or source_path must be provided")
        transactions_df = load_transactions(source_path, config)

    # Step 2: Validate
    clean_df, report = validate_dataframe(transactions_df, config)
    logger.info("\n%s", report.summary())

    if not report.is_valid:
        raise ValueError(f"Dataset validation failed:\n{report.summary()}")

    # Step 3: Resolve entities
    resolver = EntityResolver(config)
    resolved_df, resolution_stats = resolver.resolve_transactions(clean_df)

    # Step 4: Build features
    feature_eng = FeatureEngineer(config)
    node_features, feature_names = feature_eng.compute_features(
        resolved_df,
        num_nodes=resolver.num_entities,
    )

    # Step 5: Assign labels
    graph_builder = GraphBuilder(config, resolver)
    node_labels = graph_builder.assign_labels_from_transactions(
        resolved_df, strategy="sender_fraud"
    )

    # Step 6: Build graph
    data, schema = graph_builder.build_graph(
        resolved_df,
        node_features=node_features,
        node_labels=node_labels,
        feature_names=feature_names,
    )

    # Step 7: Create splits
    data = create_splits(data, resolved_df, config)

    # Step 8: Scale features (fit on training data only)
    if data.train_mask.any():
        data.x = feature_eng.fit_and_transform_splits(data.x, data.train_mask)

    # Report class distribution
    _log_split_distribution(data)

    return data, schema, feature_eng, resolver, report


def create_splits(
    data: Data,
    df: pd.DataFrame,
    config: Dict[str, Any],
) -> Data:
    """
    Create train/val/test splits on the graph.

    Parameters
    ----------
    data : Data
        PyG Data object with labels.
    df : pd.DataFrame
        Transaction data with timestamps and node indices.
    config : dict
        Configuration with splitting settings.

    Returns
    -------
    Data
        Data object with train_mask, val_mask, test_mask added.
    """
    split_config = config.get("splitting", {})
    strategy = split_config.get("strategy", "temporal")

    if data.y is None:
        raise ValueError("Cannot create splits without labels")

    # Only labeled nodes participate in splits
    labeled_mask = data.y >= 0
    labeled_indices = torch.where(labeled_mask)[0]

    if strategy == "temporal" and "timestamp" in df.columns and pd.api.types.is_datetime64_any_dtype(df["timestamp"]):
        data = _temporal_split(data, df, labeled_indices, split_config)
    else:
        if strategy == "temporal":
            logger.warning(
                "Temporal split requested but timestamps not available. "
                "Falling back to random split."
            )
        data = _random_split(data, labeled_indices, split_config)

    return data


def _temporal_split(
    data: Data,
    df: pd.DataFrame,
    labeled_indices: torch.Tensor,
    split_config: Dict[str, Any],
) -> Data:
    """
    Split nodes temporally based on when they first appear in transactions.

    Nodes are ordered by their earliest transaction timestamp. The first
    train_ratio fraction goes to training, then val_ratio to validation,
    and the rest to testing.
    """
    train_ratio = split_config.get("train_ratio", 0.7)
    val_ratio = split_config.get("val_ratio", 0.15)

    # Find first transaction time for each node
    first_seen = {}
    for _, row in df.iterrows():
        ts = row.get("timestamp")
        if pd.isna(ts):
            continue
        for node_col in ["sender_node_idx", "receiver_node_idx"]:
            nidx = int(row[node_col])
            if nidx not in first_seen or ts < first_seen[nidx]:
                first_seen[nidx] = ts

    # Sort labeled nodes by first-seen time
    labeled_set = set(labeled_indices.numpy().tolist())
    labeled_with_time = [
        (idx, first_seen.get(idx, pd.Timestamp.max))
        for idx in labeled_set
    ]
    labeled_with_time.sort(key=lambda x: x[1])

    n = len(labeled_with_time)
    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    train_nodes = set(idx for idx, _ in labeled_with_time[:train_end])
    val_nodes = set(idx for idx, _ in labeled_with_time[train_end:val_end])
    test_nodes = set(idx for idx, _ in labeled_with_time[val_end:])

    # Create masks
    num_nodes = data.num_nodes
    train_mask = torch.zeros(num_nodes, dtype=torch.bool)
    val_mask = torch.zeros(num_nodes, dtype=torch.bool)
    test_mask = torch.zeros(num_nodes, dtype=torch.bool)

    for idx in train_nodes:
        train_mask[idx] = True
    for idx in val_nodes:
        val_mask[idx] = True
    for idx in test_nodes:
        test_mask[idx] = True

    data.train_mask = train_mask
    data.val_mask = val_mask
    data.test_mask = test_mask

    logger.info(
        "Temporal split: %d train, %d val, %d test nodes",
        train_mask.sum().item(),
        val_mask.sum().item(),
        test_mask.sum().item(),
    )

    return data


def _random_split(
    data: Data,
    labeled_indices: torch.Tensor,
    split_config: Dict[str, Any],
) -> Data:
    """Random split of labeled nodes."""
    train_ratio = split_config.get("random_train_ratio", 0.6)
    val_ratio = split_config.get("random_val_ratio", 0.2)

    n = len(labeled_indices)
    perm = torch.randperm(n)

    train_end = int(n * train_ratio)
    val_end = int(n * (train_ratio + val_ratio))

    train_idx = labeled_indices[perm[:train_end]]
    val_idx = labeled_indices[perm[train_end:val_end]]
    test_idx = labeled_indices[perm[val_end:]]

    num_nodes = data.num_nodes
    train_mask = torch.zeros(num_nodes, dtype=torch.bool)
    val_mask = torch.zeros(num_nodes, dtype=torch.bool)
    test_mask = torch.zeros(num_nodes, dtype=torch.bool)

    train_mask[train_idx] = True
    val_mask[val_idx] = True
    test_mask[test_idx] = True

    data.train_mask = train_mask
    data.val_mask = val_mask
    data.test_mask = test_mask

    logger.info(
        "Random split: %d train, %d val, %d test nodes",
        train_mask.sum().item(),
        val_mask.sum().item(),
        test_mask.sum().item(),
    )

    return data


def _log_split_distribution(data: Data) -> None:
    """Log class distribution for each split."""
    for split_name, mask in [
        ("train", data.train_mask),
        ("val", data.val_mask),
        ("test", data.test_mask),
    ]:
        if mask.any():
            labels = data.y[mask]
            n_fraud = int((labels == 1).sum())
            n_legit = int((labels == 0).sum())
            total = int(mask.sum())
            fraud_pct = 100.0 * n_fraud / total if total > 0 else 0
            logger.info(
                "%s split: %d total, %d fraud (%.1f%%), %d legitimate",
                split_name,
                total,
                n_fraud,
                fraud_pct,
                n_legit,
            )
