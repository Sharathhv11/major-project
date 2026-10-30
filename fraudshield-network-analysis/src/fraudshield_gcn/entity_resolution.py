"""
Entity resolution for FraudShield GCN.

Normalizes entity identifiers, creates composite internal identities,
provides stable node mappings, and supports pseudonymization.

Key design decisions:
- Entities are identified by (entity_type, normalized_id) composite keys.
- Different entity types are never merged, even if they share the same string ID.
- Only safe, documented normalization rules are applied.
- Pseudonymization uses HMAC for deterministic but irreversible mapping.
"""

import hashlib
import hmac
import logging
from collections import OrderedDict
from typing import Any, Dict, List, Optional, Set, Tuple

import pandas as pd

logger = logging.getLogger(__name__)


class EntityResolver:
    """
    Resolves and normalizes entity identifiers from transaction data.

    Provides:
    - Composite identity creation: (entity_type, normalized_id)
    - Stable entity-to-node-index mapping
    - Reverse mapping for inference and explanation
    - Pseudonymization support
    """

    def __init__(self, config: Dict[str, Any]):
        """
        Parameters
        ----------
        config : dict
            Configuration dictionary with entity_resolution settings.
        """
        er_config = config.get("entity_resolution", {})
        self.normalize_case = er_config.get("normalize_case", True)
        self.strip_whitespace = er_config.get("strip_whitespace", True)
        self.valid_entity_types: Set[str] = set(
            er_config.get("entity_types", ["account", "upi_id", "phone", "card", "wallet", "unknown"])
        )
        self.pseudonymize = er_config.get("pseudonymize", False)
        self._hmac_key = er_config.get("hmac_key", "change-this-key").encode("utf-8")

        # Mapping: composite_key -> node_index
        self._entity_to_idx: OrderedDict[Tuple[str, str], int] = OrderedDict()
        # Reverse mapping: node_index -> composite_key
        self._idx_to_entity: Dict[int, Tuple[str, str]] = {}
        # Entity metadata: node_index -> dict with type and other info
        self._entity_metadata: Dict[int, Dict[str, Any]] = {}

    @property
    def num_entities(self) -> int:
        """Number of resolved entities."""
        return len(self._entity_to_idx)

    def normalize_id(self, raw_id: str, entity_type: str = "unknown") -> str:
        """
        Normalize a single identifier according to safe rules.

        Parameters
        ----------
        raw_id : str
            Raw identifier string.
        entity_type : str
            Type of entity (used to decide case normalization).

        Returns
        -------
        str
            Normalized identifier.
        """
        if pd.isna(raw_id) or str(raw_id).strip() == "":
            return ""

        normalized = str(raw_id)

        if self.strip_whitespace:
            normalized = normalized.strip()

        # Case normalization is valid for most identifiers but not all.
        # UPI IDs and emails are case-insensitive, phone numbers don't need it,
        # account numbers may be alphanumeric.
        if self.normalize_case and entity_type in ("upi_id", "account", "unknown"):
            normalized = normalized.lower()

        return normalized

    def get_composite_key(self, raw_id: str, entity_type: str = "unknown") -> Tuple[str, str]:
        """
        Create a composite key for an entity.

        Parameters
        ----------
        raw_id : str
            Raw identifier.
        entity_type : str
            Entity type.

        Returns
        -------
        Tuple[str, str]
            (entity_type, normalized_id) composite key.
        """
        if entity_type not in self.valid_entity_types:
            entity_type = "unknown"

        normalized = self.normalize_id(raw_id, entity_type)
        return (entity_type, normalized)

    def resolve_entity(self, raw_id: str, entity_type: str = "unknown") -> int:
        """
        Resolve an entity to a stable node index.

        If the entity has been seen before, returns the existing index.
        Otherwise, assigns a new index.

        Parameters
        ----------
        raw_id : str
            Raw identifier.
        entity_type : str
            Entity type.

        Returns
        -------
        int
            Node index for this entity.
        """
        key = self.get_composite_key(raw_id, entity_type)

        if key[1] == "":
            # Empty ID — cannot resolve
            return -1

        if key not in self._entity_to_idx:
            idx = len(self._entity_to_idx)
            self._entity_to_idx[key] = idx
            self._idx_to_entity[idx] = key
            self._entity_metadata[idx] = {"type": key[0]}

        return self._entity_to_idx[key]

    def resolve_transactions(
        self,
        df: pd.DataFrame,
    ) -> Tuple[pd.DataFrame, Dict[str, Any]]:
        """
        Resolve all entities in a transaction DataFrame.

        Adds sender_node_idx and receiver_node_idx columns.

        Parameters
        ----------
        df : pd.DataFrame
            Validated transaction data with sender_id, receiver_id columns.

        Returns
        -------
        Tuple[pd.DataFrame, Dict]
            DataFrame with node indices added, and resolution statistics.
        """
        df = df.copy()

        # Get entity types (default to 'unknown' if not present)
        sender_types = (
            df["sender_entity_type"].fillna("unknown")
            if "sender_entity_type" in df.columns
            else pd.Series("unknown", index=df.index)
        )
        receiver_types = (
            df["receiver_entity_type"].fillna("unknown")
            if "receiver_entity_type" in df.columns
            else pd.Series("unknown", index=df.index)
        )

        # Resolve each entity
        sender_indices = []
        receiver_indices = []

        for i, (sid, stype) in enumerate(zip(df["sender_id"], sender_types)):
            sender_indices.append(self.resolve_entity(str(sid), str(stype)))

        for i, (rid, rtype) in enumerate(zip(df["receiver_id"], receiver_types)):
            receiver_indices.append(self.resolve_entity(str(rid), str(rtype)))

        df["sender_node_idx"] = sender_indices
        df["receiver_node_idx"] = receiver_indices

        # Filter out unresolvable entries
        invalid_mask = (df["sender_node_idx"] == -1) | (df["receiver_node_idx"] == -1)
        if invalid_mask.any():
            logger.warning(
                "Dropped %d transactions with unresolvable entity IDs",
                invalid_mask.sum(),
            )
            df = df[~invalid_mask].reset_index(drop=True)

        stats = {
            "total_entities": self.num_entities,
            "entity_type_counts": self.get_entity_type_counts(),
            "unresolvable_transactions": int(invalid_mask.sum()),
        }

        logger.info("Resolved %d unique entities from %d transactions", self.num_entities, len(df))

        return df, stats

    def get_entity_type_counts(self) -> Dict[str, int]:
        """Count entities by type."""
        counts: Dict[str, int] = {}
        for (etype, _), _ in self._entity_to_idx.items():
            counts[etype] = counts.get(etype, 0) + 1
        return counts

    def get_node_mapping(self) -> Dict[int, Tuple[str, str]]:
        """
        Get the reverse mapping from node index to entity identity.

        Returns
        -------
        Dict[int, Tuple[str, str]]
            node_index -> (entity_type, normalized_id)
        """
        return dict(self._idx_to_entity)

    def get_entity_index(self, raw_id: str, entity_type: str = "unknown") -> Optional[int]:
        """
        Look up the node index for an entity without creating new entries.

        Returns
        -------
        int or None
            Node index if found, None otherwise.
        """
        key = self.get_composite_key(raw_id, entity_type)
        return self._entity_to_idx.get(key)

    def pseudonymize_id(self, raw_id: str, entity_type: str) -> str:
        """
        Create a deterministic pseudonymous identifier using HMAC.

        Parameters
        ----------
        raw_id : str
            Raw identifier.
        entity_type : str
            Entity type (included in HMAC to prevent cross-type collisions).

        Returns
        -------
        str
            Pseudonymous identifier.
        """
        message = f"{entity_type}:{raw_id}".encode("utf-8")
        h = hmac.new(self._hmac_key, message, hashlib.sha256)
        return f"pseudo_{entity_type}_{h.hexdigest()[:16]}"

    def get_pseudonymized_mapping(self) -> Dict[int, str]:
        """
        Get pseudonymized identifiers for all entities.

        Returns
        -------
        Dict[int, str]
            node_index -> pseudonymized_id
        """
        mapping = {}
        for idx, (etype, eid) in self._idx_to_entity.items():
            mapping[idx] = self.pseudonymize_id(eid, etype)
        return mapping

    def save_mappings(self) -> Dict[str, Any]:
        """
        Serialize entity mappings for persistence.

        Returns
        -------
        dict
            Serializable mapping data (pseudonymized if configured).
        """
        if self.pseudonymize:
            return {
                "num_entities": self.num_entities,
                "entity_type_counts": self.get_entity_type_counts(),
                "pseudonymized": True,
                "mappings": {
                    str(idx): {
                        "type": etype,
                        "pseudo_id": self.pseudonymize_id(eid, etype),
                    }
                    for idx, (etype, eid) in self._idx_to_entity.items()
                },
            }
        else:
            return {
                "num_entities": self.num_entities,
                "entity_type_counts": self.get_entity_type_counts(),
                "pseudonymized": False,
                "mappings": {
                    str(idx): {"type": etype, "id": eid}
                    for idx, (etype, eid) in self._idx_to_entity.items()
                },
            }
