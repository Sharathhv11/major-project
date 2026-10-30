"""
Reproducibility utilities for FraudShield GCN.

Sets random seeds across Python, NumPy, and PyTorch for reproducible results.
"""

import logging
import os
import random
from typing import Any, Dict

import numpy as np
import torch

logger = logging.getLogger(__name__)


def set_seed(seed: int = 42) -> None:
    """
    Set random seeds for reproducibility.

    Parameters
    ----------
    seed : int
        Random seed value.
    """
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)

    if torch.cuda.is_available():
        torch.cuda.manual_seed(seed)
        torch.cuda.manual_seed_all(seed)

    # Deterministic mode (may impact performance)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False

    # Set Python hash seed
    os.environ["PYTHONHASHSEED"] = str(seed)

    logger.info("Random seed set to %d", seed)


def get_system_info() -> Dict[str, Any]:
    """
    Get system information for reproducibility logging.

    Returns
    -------
    dict
        System and package version information.
    """
    import platform
    import sys

    info = {
        "python_version": sys.version,
        "platform": platform.platform(),
        "torch_version": torch.__version__,
        "cuda_available": torch.cuda.is_available(),
    }

    if torch.cuda.is_available():
        info["cuda_version"] = torch.version.cuda
        info["gpu_name"] = torch.cuda.get_device_name(0)

    try:
        import torch_geometric
        info["pyg_version"] = torch_geometric.__version__
    except ImportError:
        info["pyg_version"] = "not installed"

    try:
        import sklearn
        info["sklearn_version"] = sklearn.__version__
    except ImportError:
        info["sklearn_version"] = "not installed"

    try:
        import pandas
        info["pandas_version"] = pandas.__version__
    except ImportError:
        info["pandas_version"] = "not installed"

    try:
        import numpy
        info["numpy_version"] = numpy.__version__
    except ImportError:
        info["numpy_version"] = "not installed"

    return info
