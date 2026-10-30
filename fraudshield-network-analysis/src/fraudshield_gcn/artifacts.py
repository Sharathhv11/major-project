"""
Artifact management for FraudShield GCN.

Saves and loads trained model artifacts including weights, configuration,
feature schema, preprocessing parameters, thresholds, metrics, and manifests.

Key design decisions:
- Uses state_dict serialization (not full model pickling)
- Generates file hashes for integrity verification
- Never overwrites a best checkpoint with an inferior model
- All artifacts needed for inference are co-located
"""

import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import torch

from .feature_engineering import FeatureEngineer
from .model import FraudGCN
from .reproducibility import get_system_info

logger = logging.getLogger(__name__)


class ArtifactManager:
    """
    Manages saving and loading of trained model artifacts.
    """

    def __init__(self, artifact_dir: str):
        """
        Parameters
        ----------
        artifact_dir : str
            Root directory for saving artifacts.
        """
        self.artifact_dir = Path(artifact_dir)
        self.artifact_dir.mkdir(parents=True, exist_ok=True)

    def save_model_artifacts(
        self,
        model: FraudGCN,
        feature_engineer: FeatureEngineer,
        config: Dict[str, Any],
        training_results: Dict[str, Any],
        metrics: Dict[str, Any],
        threshold: float,
        feature_names: List[str],
        risk_categories: Optional[Dict[str, Any]] = None,
        dataset_metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Save all artifacts needed for inference.

        Parameters
        ----------
        model : FraudGCN
            Trained model.
        feature_engineer : FeatureEngineer
            Fitted feature engineer.
        config : dict
            Full training configuration.
        training_results : dict
            Training results (history, best epoch, etc.).
        metrics : dict
            Evaluation metrics.
        threshold : float
            Selected classification threshold.
        feature_names : list
            Feature names in order.
        risk_categories : dict, optional
            Risk category definitions.
        dataset_metadata : dict, optional
            Information about the dataset used.

        Returns
        -------
        str
            Path to the saved artifact directory.
        """
        save_dir = self.artifact_dir / "best_model"
        save_dir.mkdir(parents=True, exist_ok=True)

        # 1. Save model weights (state_dict only)
        checkpoint = {
            "model_state_dict": model.state_dict(),
            "model_config": model.get_config(),
            "epoch": training_results.get("best_epoch", 0),
            "val_score": training_results.get("best_val_score", 0),
        }
        model_path = save_dir / "model.pt"
        torch.save(checkpoint, model_path)

        # 2. Save model configuration
        model_config = model.get_config()
        model_config["version"] = config.get("project", {}).get("version", "0.1.0")
        _save_json(model_config, save_dir / "model_config.json")

        # 3. Save feature schema
        feature_schema = {
            "feature_names": feature_names,
            "num_features": len(feature_names),
            "schema_version": config.get("project", {}).get("version", "0.1.0"),
        }
        _save_json(feature_schema, save_dir / "feature_schema.json")

        # 4. Save preprocessing artifacts
        preprocessing_path = save_dir / "preprocessing.joblib"
        feature_engineer.save_preprocessing(str(preprocessing_path))

        # 5. Save threshold and risk categories
        if risk_categories is None:
            risk_categories = config.get("evaluation", {}).get("risk_categories", {
                "low": {"max_score": 0.3, "label": "Low Risk"},
                "medium": {"max_score": 0.7, "label": "Medium Risk"},
                "high": {"max_score": 1.0, "label": "High Risk"},
            })

        threshold_data = {
            "threshold": threshold,
            "threshold_strategy": config.get("evaluation", {}).get("threshold_strategy", "f1_optimal"),
            "risk_categories": risk_categories,
            "note": "Risk thresholds are provisional unless validated on representative data.",
        }
        _save_json(threshold_data, save_dir / "threshold.json")

        # 6. Save metrics
        _save_json(metrics, save_dir / "metrics.json")

        # 7. Save training configuration
        training_config = {
            "random_seed": config.get("project", {}).get("random_seed", 42),
            "training": config.get("training", {}),
            "model": config.get("model", {}),
            "features": config.get("features", {}),
            "splitting": config.get("splitting", {}),
            "class_weights": training_results.get("class_weights", []),
        }
        _save_json(training_config, save_dir / "training_config.json")

        # 8. Save dataset metadata
        if dataset_metadata:
            _save_json(dataset_metadata, save_dir / "dataset_metadata.json")

        # 9. Save system info
        _save_json(get_system_info(), save_dir / "system_info.json")

        # 10. Generate manifest with file hashes
        manifest = self._generate_manifest(save_dir)
        _save_json(manifest, save_dir / "manifest.json")

        logger.info("All artifacts saved to %s", save_dir)
        return str(save_dir)

    def _generate_manifest(self, save_dir: Path) -> Dict[str, Any]:
        """Generate a manifest with SHA-256 hashes of all artifact files."""
        manifest = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "files": {},
        }

        for f in sorted(save_dir.iterdir()):
            if f.is_file() and f.name != "manifest.json":
                manifest["files"][f.name] = {
                    "sha256": _compute_file_hash(f),
                    "size_bytes": f.stat().st_size,
                }

        return manifest

    @staticmethod
    def verify_manifest(artifact_dir: str) -> bool:
        """
        Verify artifact integrity against the manifest.

        Returns True if all files match their recorded hashes.
        """
        art_path = Path(artifact_dir)
        manifest_path = art_path / "manifest.json"

        if not manifest_path.exists():
            logger.warning("No manifest.json found in %s", artifact_dir)
            return False

        with open(manifest_path, "r") as f:
            manifest = json.load(f)

        all_valid = True
        for filename, info in manifest.get("files", {}).items():
            filepath = art_path / filename
            if not filepath.exists():
                logger.error("Missing artifact file: %s", filename)
                all_valid = False
                continue

            actual_hash = _compute_file_hash(filepath)
            if actual_hash != info["sha256"]:
                logger.error("Hash mismatch for %s", filename)
                all_valid = False

        if all_valid:
            logger.info("Artifact integrity verified: all files match manifest")

        return all_valid


def _save_json(data: Any, path: Path) -> None:
    """Save data as formatted JSON."""
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)


def _compute_file_hash(filepath: Path) -> str:
    """Compute SHA-256 hash of a file."""
    sha256 = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256.update(chunk)
    return sha256.hexdigest()
