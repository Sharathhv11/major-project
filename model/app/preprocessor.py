"""Context-aware text preprocessing for fraud message detection.

Normalizes high-frequency false-positive triggers (URLs, phone numbers,
merchant names, PDF/attachment references, currency amounts, OTP codes)
into structured entity tokens while strictly preserving sentence structure,
semantic intent, and surrounding context.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Dict, List


@dataclass
class PreprocessedResult:
    original_text: str
    normalized_text: str
    detected_entities: Dict[str, List[str]] = field(default_factory=dict)


# Common e-commerce and retail merchant names that frequently trigger false positives
_MERCHANT_NAMES = [
    "flipkart",
    "amazon",
    "myntra",
    "swiggy",
    "zomato",
    "meesho",
    "ajio",
    "tata cliq",
    "tatacliq",
    "nykaa",
    "bigbasket",
    "blinkit",
    "zepto",
    "uber",
    "ola",
]

# Compile regex patterns
_URL_PATTERN = re.compile(
    r"(?:https?://|www\.)[a-zA-Z0-9.\-_~:/?#\[\]@!$&'()*+,;=%]+",
    re.IGNORECASE,
)

_ATTACHMENT_PDF_PATTERN = re.compile(
    r"\b[\w\-\.]+\.pdf\b",
    re.IGNORECASE,
)

_ATTACHMENT_DOC_PATTERN = re.compile(
    r"\b[\w\-\.]+\.(?:docx?|xlsx?|csv|zip)\b",
    re.IGNORECASE,
)

# Indian & International phone numbers and toll-free lines (e.g., 1800-xxx-xxxx, +91-xxxx)
_PHONE_PATTERN = re.compile(
    r"(?:\+?\d{1,3}[-.\s]?)?(?:1800[-.\s]?\d{3}[-.\s]?\d{3,4}|\b[6-9]\d{9}\b|\b\d{3,5}[-.\s]\d{3,5}[-.\s]?\d{3,5}\b)",
    re.IGNORECASE,
)

# Currency and amounts (INR, Rs., ₹, $, etc.)
_CURRENCY_PATTERN = re.compile(
    r"(?:(?:Rs\.?|INR|₹|\$|€|£)\s?\d+(?:,\d+)*(?:\.\d+)?|\b\d+(?:,\d+)*(?:\.\d+)?\s?(?:inr|rs|rupees|fcfa|usd|cfa)\b)",
    re.IGNORECASE,
)

# OTP / verification codes (4 to 8 digits in proximity to OTP/code/verification keywords)
# Uses standard non-capturing/capturing groups without variable-width lookbehinds
_OTP_PATTERN = re.compile(
    r"(\b(?:otp|code|pin|verification)\b\s*(?:is|:|-)?\s*)(\b\d{4,8}\b)"
    r"|"
    r"(\b\d{4,8}\b)(\s*(?:is\s*(?:your\s*)?(?:secret\s*)?(?:otp|code|pin))\b)",
    re.IGNORECASE,
)

# Common SMS abbreviations (as specified in Sentra preprocessing)
_SMS_ABBREVIATIONS = {
    "u": "you",
    "ur": "your",
    "pls": "please",
    "plz": "please",
    "acc": "account",
    "acct": "account",
    "asap": "as soon as possible",
    "msg": "message",
    "txt": "text",
    "amt": "amount",
    "bal": "balance",
    "tx": "transaction",
    "txn": "transaction",
    "ref": "reference",
}

# Regex to reduce 3+ repeated letters down to 2 (e.g., "freeee" -> "free")
_REPEATED_CHARS = re.compile(r"([a-zA-Z])\1{2,}", re.IGNORECASE)


# Construct regex for merchant replacement with word boundaries
_MERCHANT_REGEX = re.compile(
    r"\b(" + "|".join(re.escape(m) for m in _MERCHANT_NAMES) + r")\b",
    re.IGNORECASE,
)


class ContextAwarePreprocessor:
    """Preprocesses text for fraud classification by normalizing specific entities
    without discarding the linguistic or contextual structure of the message.
    """

    def __init__(self, normalize_merchants: bool = True):
        self.normalize_merchants = normalize_merchants

    def preprocess(self, text: str) -> PreprocessedResult:
        if not text:
            return PreprocessedResult(
                original_text="",
                normalized_text="",
                detected_entities={},
            )

        entities: Dict[str, List[str]] = {
            "urls": [],
            "pdfs": [],
            "documents": [],
            "merchants": [],
            "phones": [],
            "amounts": [],
            "otps": [],
        }

        processed = text

        # 1. Detect & normalize document/PDF attachments
        def _pdf_repl(m):
            entities["pdfs"].append(m.group(0))
            return "[PDF]"

        def _doc_repl(m):
            entities["documents"].append(m.group(0))
            return "[DOCUMENT]"

        processed = _ATTACHMENT_PDF_PATTERN.sub(_pdf_repl, processed)
        processed = _ATTACHMENT_DOC_PATTERN.sub(_doc_repl, processed)

        # 2. Detect & normalize URLs
        def _url_repl(m):
            entities["urls"].append(m.group(0))
            return "[URL]"

        processed = _URL_PATTERN.sub(_url_repl, processed)

        # 3. Detect & normalize Merchants
        if self.normalize_merchants:
            def _merchant_repl(m):
                entities["merchants"].append(m.group(0))
                return "[MERCHANT]"

            processed = _MERCHANT_REGEX.sub(_merchant_repl, processed)

        # 4. Detect & normalize OTPs (evaluated before phone numbers)
        def _otp_repl(m):
            if m.group(1) is not None:
                entities["otps"].append(m.group(2))
                return m.group(1) + "[OTP]"
            else:
                entities["otps"].append(m.group(3))
                return "[OTP]" + m.group(4)

        processed = _OTP_PATTERN.sub(_otp_repl, processed)

        # 5. Detect & normalize Phone Numbers
        def _phone_repl(m):
            val = m.group(0)
            entities["phones"].append(val)
            return "[PHONE]"

        processed = _PHONE_PATTERN.sub(_phone_repl, processed)

        # 6. Detect & normalize Currencies/Amounts
        def _amount_repl(m):
            entities["amounts"].append(m.group(0))
            return "[AMOUNT]"

        processed = _CURRENCY_PATTERN.sub(_amount_repl, processed)

        # 7. Normalize SMS abbreviations while preserving words
        words = processed.split()
        normalized_words = []
        for word in words:
            # Strip punctuation for lookup
            clean_w = word.strip(",.!?()[]{}:;\"'").lower()
            if clean_w in _SMS_ABBREVIATIONS:
                expanded = _SMS_ABBREVIATIONS[clean_w]
                # Replace maintaining punctuation if present
                replaced = word.lower().replace(clean_w, expanded)
                normalized_words.append(replaced)
            else:
                normalized_words.append(word)

        processed = " ".join(normalized_words)

        # 8. Reduce repeated characters (e.g., 'freeeeee' -> 'free')
        processed = _REPEATED_CHARS.sub(r"\1\1", processed)

        # 9. Clean excessive spaces
        processed = re.sub(r"\s+", " ", processed).strip()

        return PreprocessedResult(
            original_text=text,
            normalized_text=processed,
            detected_entities={k: v for k, v in entities.items() if v},
        )


preprocessor = ContextAwarePreprocessor()
