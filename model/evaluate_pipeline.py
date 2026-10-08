"""Comprehensive evaluation pipeline for Fraud Shield text classifier.

Loads labeled benchmark dataset, runs inference through the pipeline (with
context-aware preprocessing and probability thresholding), and computes:
- Confusion Matrix (TP, FP, TN, FN)
- Precision, Recall, F1-score
- False-Positive Rate (FPR) and False-Negative Rate (FNR)
- Focused subgroup metrics (Flipkart URLs, phone numbers, PDF attachments)
- Threshold sensitivity analysis
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List

# Ensure app package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import FRAUD_THRESHOLD, MODEL_ID
from app.model import TextFraudClassifier
from app.preprocessor import preprocessor


def calculate_metrics(y_true: List[str], y_pred: List[str]) -> Dict[str, float]:
    """Calculate binary classification metrics."""
    tp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == "FRAUD" and yp == "FRAUD")
    fp = sum(1 for yt, yp in zip(y_true, y_pred) if yt == "LEGITIMATE" and yp == "FRAUD")
    tn = sum(1 for yt, yp in zip(y_true, y_pred) if yt == "LEGITIMATE" and yp == "NOT_FRAUD")
    fn = sum(1 for yt, yp in zip(y_true, y_pred) if yt == "FRAUD" and yp == "NOT_FRAUD")

    total = len(y_true)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
    fpr = fp / (fp + tn) if (fp + tn) > 0 else 0.0
    fnr = fn / (fn + tp) if (fn + tp) > 0 else 0.0
    accuracy = (tp + tn) / total if total > 0 else 0.0

    return {
        "total": total,
        "true_positives": tp,
        "false_positives": fp,
        "true_negatives": tn,
        "false_negatives": fn,
        "accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "false_positive_rate": round(fpr, 4),
        "false_negative_rate": round(fnr, 4),
    }


def run_evaluation(
    dataset_path: str = "tests/dataset.json",
    threshold: float = FRAUD_THRESHOLD,
    model_id: str = MODEL_ID,
) -> Dict[str, Any]:
    dataset_file = Path(__file__).resolve().parent / dataset_path
    if not dataset_file.exists():
        raise FileNotFoundError(f"Evaluation dataset not found at {dataset_file}")

    with open(dataset_file, "r", encoding="utf-8") as f:
        samples = json.load(f)

    print(f"\n=======================================================")
    print(f"   FRAUD SHIELD MODEL EVALUATION REPORT")
    print(f"=======================================================")
    print(f"Model ID:            {model_id}")
    print(f"Evaluation Dataset:  {dataset_file.name} ({len(samples)} samples)")
    print(f"Active Threshold:    {threshold:.2f}")

    classifier = TextFraudClassifier(model_id=model_id, threshold=threshold)
    classifier.load()

    y_true: List[str] = []
    y_pred: List[str] = []
    probs: List[float] = []
    detailed_records: List[Dict[str, Any]] = []

    # Entity-specific tracker
    subgroup_cases = {
        "flipkart_and_merchant_urls": [],
        "phone_numbers": [],
        "pdf_and_attachments": [],
    }

    for item in samples:
        text = item["text"]
        true_label = item["label"]
        res = classifier.predict(text)

        y_true.append(true_label)
        y_pred.append(res.prediction)
        probs.append(res.fraud_probability)

        record = {
            "id": item.get("id"),
            "category": item.get("category"),
            "true_label": true_label,
            "prediction": res.prediction,
            "risk_level": res.risk_level,
            "fraud_probability": res.fraud_probability,
            "normalized_text": res.normalized_text,
            "is_correct": (true_label == "FRAUD" and res.prediction == "FRAUD")
            or (true_label == "LEGITIMATE" and res.prediction == "NOT_FRAUD"),
        }
        detailed_records.append(record)

        # Categorize subgroups
        if item.get("has_url") or "flipkart" in text.lower():
            subgroup_cases["flipkart_and_merchant_urls"].append(record)
        if item.get("has_phone") or "1800" in text or "+91" in text:
            subgroup_cases["phone_numbers"].append(record)
        if item.get("has_pdf") or ".pdf" in text.lower():
            subgroup_cases["pdf_and_attachments"].append(record)

    # 1. Primary Metrics
    metrics = calculate_metrics(y_true, y_pred)

    print("\n--- Overall Performance Metrics ---")
    print(f"Total Samples:       {metrics['total']}")
    print(f"Accuracy:            {metrics['accuracy'] * 100:.2f}%")
    print(f"Precision:           {metrics['precision'] * 100:.2f}%")
    print(f"Recall (Sensitivity):{metrics['recall'] * 100:.2f}%")
    print(f"F1-Score:            {metrics['f1_score'] * 100:.2f}%")
    print(f"False Positive Rate: {metrics['false_positive_rate'] * 100:.2f}% (FP={metrics['false_positives']})")
    print(f"False Negative Rate: {metrics['false_negative_rate'] * 100:.2f}% (FN={metrics['false_negatives']})")
    print(
        f"Confusion Matrix:    [TP={metrics['true_positives']}, FP={metrics['false_positives']}, "
        f"TN={metrics['true_negatives']}, FN={metrics['false_negatives']}]"
    )

    # 2. Subgroup Performance
    subgroup_metrics = {}
    print("\n--- High-Risk False Positive Subgroup Analysis ---")
    for group_name, group_records in subgroup_cases.items():
        if group_records:
            g_true = [r["true_label"] for r in group_records]
            g_pred = [r["prediction"] for r in group_records]
            g_m = calculate_metrics(g_true, g_pred)
            subgroup_metrics[group_name] = g_m
            print(
                f"• {group_name:<28} | Samples: {len(group_records):>2} | "
                f"Acc: {g_m['accuracy']*100:>5.1f}% | FPR: {g_m['false_positive_rate']*100:>5.1f}% | "
                f"Recall: {g_m['recall']*100:>5.1f}%"
            )

    # 3. Threshold Sweep Analysis
    candidate_thresholds = [0.50, 0.60, 0.70, 0.75, 0.80, 0.85, 0.90]
    sweep_results = []
    print("\n--- Threshold Sensitivity Analysis ---")
    print(" Threshold | Precision | Recall  | F1-Score | FPR     | FNR")
    print("-----------+-----------+---------+----------+---------+------")
    for cand_t in candidate_thresholds:
        c_preds = ["FRAUD" if p >= cand_t else "NOT_FRAUD" for p in probs]
        c_m = calculate_metrics(y_true, c_preds)
        sweep_results.append({"threshold": cand_t, "metrics": c_m})
        print(
            f"   {cand_t:.2f}    |  {c_m['precision']*100:>5.1f}%   | {c_m['recall']*100:>5.1f}%  |  "
            f"{c_m['f1_score']*100:>5.1f}%  | {c_m['false_positive_rate']*100:>5.1f}%  | {c_m['false_negative_rate']*100:>5.1f}%"
        )

    report_payload = {
        "model_id": model_id,
        "threshold": threshold,
        "overall_metrics": metrics,
        "subgroup_metrics": subgroup_metrics,
        "threshold_sweep": sweep_results,
        "detailed_records": detailed_records,
    }

    # Save report
    out_json = Path(__file__).resolve().parent / "evaluation_report.json"
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(report_payload, f, indent=2)
    print(f"\nSaved detailed evaluation JSON to: {out_json.name}")

    return report_payload


if __name__ == "__main__":
    run_evaluation()
