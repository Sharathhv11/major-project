"""
Configuration management for FraudShield GCN.

Loads YAML configuration, validates values, and supports
command-line overrides for common settings.
"""

import os
import copy
import logging
from pathlib import Path
from typing import Any, Dict, Optional

import yaml

logger = logging.getLogger(__name__)

# Default config path relative to project root
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "configs" / "default.yaml"


def load_config(
    config_path: Optional[str] = None,
    overrides: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Load configuration from a YAML file with optional overrides.

    Parameters
    ----------
    config_path : str, optional
        Path to the YAML config file. If None, loads the default config.
    overrides : dict, optional
        Dot-separated key overrides, e.g. {"model.hidden_dim": 256}.

    Returns
    -------
    dict
        The validated configuration dictionary.

    Raises
    ------
    FileNotFoundError
        If the config file does not exist.
    ValueError
        If required configuration values are missing or invalid.
    """
    if config_path is None:
        config_path = str(DEFAULT_CONFIG_PATH)

    config_file = Path(config_path)
    if not config_file.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_file}")

    with open(config_file, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    if config is None:
        raise ValueError(f"Configuration file is empty: {config_file}")

    # Apply overrides
    if overrides:
        for key, value in overrides.items():
            _set_nested(config, key, value)

    # Validate configuration
    _validate_config(config)

    return config


def _set_nested(d: Dict[str, Any], key: str, value: Any) -> None:
    """Set a value in a nested dict using dot-separated keys."""
    keys = key.split(".")
    for k in keys[:-1]:
        d = d.setdefault(k, {})
    d[keys[-1]] = value


def _get_nested(d: Dict[str, Any], key: str, default: Any = None) -> Any:
    """Get a value from a nested dict using dot-separated keys."""
    keys = key.split(".")
    for k in keys:
        if isinstance(d, dict):
            d = d.get(k, default)
        else:
            return default
    return d


def _validate_config(config: Dict[str, Any]) -> None:
    """
    Validate configuration values and raise errors for invalid settings.

    Raises
    ------
    ValueError
        If required fields are missing or values are out of range.
    """
    # Validate project section
    if "project" not in config:
        raise ValueError("Configuration must contain 'project' section")

    seed = _get_nested(config, "project.random_seed")
    if seed is not None and not isinstance(seed, int):
        raise ValueError(f"project.random_seed must be an integer, got {type(seed)}")

    # Validate model section
    model = config.get("model", {})
    if model.get("hidden_dim", 64) < 1:
        raise ValueError("model.hidden_dim must be >= 1")
    if model.get("num_layers", 2) < 1:
        raise ValueError("model.num_layers must be >= 1")
    dropout = model.get("dropout", 0.3)
    if not (0.0 <= dropout < 1.0):
        raise ValueError(f"model.dropout must be in [0, 1), got {dropout}")
    if model.get("num_classes", 2) != 2:
        raise ValueError("model.num_classes must be 2 for binary classification")

    # Validate training section
    training = config.get("training", {})
    if training.get("epochs", 200) < 1:
        raise ValueError("training.epochs must be >= 1")
    lr = training.get("learning_rate", 0.01)
    if lr <= 0:
        raise ValueError(f"training.learning_rate must be > 0, got {lr}")

    # Validate splitting ratios
    splitting = config.get("splitting", {})
    strategy = splitting.get("strategy", "temporal")
    if strategy == "temporal":
        ratios = [
            splitting.get("train_ratio", 0.7),
            splitting.get("val_ratio", 0.15),
            splitting.get("test_ratio", 0.15),
        ]
    else:
        ratios = [
            splitting.get("random_train_ratio", 0.6),
            splitting.get("random_val_ratio", 0.2),
            splitting.get("random_test_ratio", 0.2),
        ]
    if any(r < 0 for r in ratios):
        raise ValueError("Split ratios must be non-negative")
    if abs(sum(ratios) - 1.0) > 0.01:
        raise ValueError(f"Split ratios must sum to 1.0, got {sum(ratios)}")

    # Validate synthetic section
    synthetic = config.get("synthetic", {})
    if synthetic.get("num_entities", 2000) < 10:
        raise ValueError("synthetic.num_entities must be >= 10")
    if synthetic.get("num_transactions", 15000) < 10:
        raise ValueError("synthetic.num_transactions must be >= 10")

    logger.debug("Configuration validated successfully")


def resolve_paths(config: Dict[str, Any], base_dir: Optional[str] = None) -> Dict[str, Any]:
    """
    Resolve relative paths in the configuration to absolute paths.

    Parameters
    ----------
    config : dict
        The configuration dictionary.
    base_dir : str, optional
        Base directory for resolving relative paths. Defaults to project root.

    Returns
    -------
    dict
        Config with resolved paths.
    """
    config = copy.deepcopy(config)
    if base_dir is None:
        base_dir = str(Path(__file__).resolve().parent.parent.parent)

    paths = config.get("paths", {})
    for key, value in paths.items():
        if value and not os.path.isabs(value):
            paths[key] = str(Path(base_dir) / value)

    config["paths"] = paths
    return config


def get_device(config: Dict[str, Any]) -> str:
    """
    Determine the compute device from configuration.

    Returns
    -------
    str
        "cuda" or "cpu"
    """
    import torch

    device_setting = _get_nested(config, "training.device", "auto")
    if device_setting == "auto":
        return "cuda" if torch.cuda.is_available() else "cpu"
    return device_setting
