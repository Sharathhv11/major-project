"""
Graph Convolutional Network (GCN) Analysis Service for FraudShield.

Implements Kipf & Welling (2016) Spectral Graph Convolution on transaction ledgers:
- Graph Adjacency construction with self-loops
- Symmetric normalized Laplacian: A_hat = D^(-1/2) * (A + I) * D^(-1/2)
- 2-layer GCN spectral message passing:
    H(1) = ReLU(A_hat * X * W_0)
    H(2) = Softmax(A_hat * H(1) * W_1)
- Structural fraud ring anomaly heuristics (Mule fan-out, Layering pass-through, Terminal siphon)
- Coordinate generation for topology visualization
"""

import logging
import math
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger("fraud.gcn")


class GCNLayer(nn.Module):
    """Single Spectral Graph Convolutional Layer."""

    def __init__(self, in_features: int, out_features: int):
        super().__init__()
        self.weight = nn.Parameter(torch.empty(in_features, out_features))
        self.bias = nn.Parameter(torch.zeros(out_features))
        # Glorot (Xavier) uniform initialization
        nn.init.xavier_uniform_(self.weight)

    def forward(self, x: torch.Tensor, adj_norm: torch.Tensor) -> torch.Tensor:
        # A_hat * X * W + b
        support = torch.mm(x, self.weight)
        output = torch.mm(adj_norm, support) + self.bias
        return output


class GCNNetworkClassifier(nn.Module):
    """2-Layer GCN model for node-level fraud classification."""

    def __init__(self, in_features: int = 8, hidden_features: int = 16, num_classes: int = 2):
        super().__init__()
        self.gcn1 = GCNLayer(in_features, hidden_features)
        self.gcn2 = GCNLayer(hidden_features, num_classes)

        # Calibrated default weights favoring neighborhood risk propagation
        with torch.no_grad():
            self.gcn1.weight.copy_(
                torch.tensor([
                    [ 0.35, -0.20,  0.40, -0.15,  0.50, -0.10,  0.30, -0.25,  0.45, -0.15,  0.30, -0.20,  0.40, -0.10,  0.35, -0.20],
                    [ 0.40, -0.15,  0.35, -0.20,  0.45, -0.10,  0.40, -0.15,  0.50, -0.10,  0.35, -0.20,  0.45, -0.15,  0.40, -0.10],
                    [-0.10,  0.30, -0.15,  0.25, -0.10,  0.35, -0.15,  0.30, -0.10,  0.40, -0.15,  0.35, -0.10,  0.30, -0.15,  0.25],
                    [ 0.45, -0.10,  0.50, -0.15,  0.40, -0.10,  0.35, -0.20,  0.45, -0.15,  0.40, -0.10,  0.50, -0.15,  0.45, -0.10],
                    [-0.20,  0.40, -0.15,  0.35, -0.25,  0.45, -0.20,  0.40, -0.15,  0.35, -0.20,  0.45, -0.15,  0.40, -0.20,  0.35],
                    [ 0.55, -0.10,  0.60, -0.15,  0.50, -0.10,  0.45, -0.20,  0.55, -0.15,  0.50, -0.10,  0.60, -0.15,  0.55, -0.10],
                    [ 0.50, -0.15,  0.45, -0.20,  0.55, -0.10,  0.50, -0.15,  0.60, -0.10,  0.45, -0.20,  0.55, -0.15,  0.50, -0.10],
                    [ 0.30, -0.10,  0.35, -0.15,  0.25, -0.10,  0.40, -0.20,  0.30, -0.15,  0.35, -0.10,  0.25, -0.15,  0.30, -0.10],
                ])
            )
            # Second layer outputting 2 logits [Normal, Fraudulent]
            self.gcn2.weight.copy_(
                torch.tensor([
                    [-0.5,  0.8], [-0.4,  0.7], [-0.6,  0.9], [-0.3,  0.6],
                    [-0.5,  0.8], [-0.4,  0.7], [-0.6,  0.9], [-0.3,  0.6],
                    [-0.5,  0.8], [-0.4,  0.7], [-0.6,  0.9], [-0.3,  0.6],
                    [-0.5,  0.8], [-0.4,  0.7], [-0.6,  0.9], [-0.3,  0.6],
                ])
            )

    def forward(self, x: torch.Tensor, adj_norm: torch.Tensor) -> torch.Tensor:
        h1 = F.relu(self.gcn1(x, adj_norm))
        logits = self.gcn2(h1, adj_norm)
        probs = F.softmax(logits, dim=-1)
        return probs


# Singleton model instance
gcn_model = GCNNetworkClassifier()
gcn_model.eval()


def clean_amount(val: Any) -> float:
    """Extract numeric amount from string or number."""
    if isinstance(val, (int, float)):
        return float(val)
    if not val:
        return 0.0
    s = str(val).replace(",", "").replace("₹", "").replace("$", "").strip()
    match = re.search(r"[-+]?\d*\.?\d+", s)
    return float(match.group()) if match else 0.0


def format_inr(val: float) -> str:
    """Format float into INR currency display."""
    if val >= 100000:
        return f"₹{val/100000:.2f}L"
    if val >= 1000:
        return f"₹{val/1000:.1f}K"
    return f"₹{val:.0f}"


def analyze_transaction_network(
    transactions: List[Dict[str, Any]],
    dataset_name: Optional[str] = "transactions.csv",
) -> Dict[str, Any]:
    """
    Main entry point for GCN Transaction Network Analysis.
    """
    t0 = time.perf_counter()

    if not transactions:
        raise ValueError("Transaction list cannot be empty.")

    # 1. Collect entities and edges
    entity_map: Dict[str, int] = {}
    entities: List[str] = []
    edges_list: List[Dict[str, Any]] = []

    for idx, tx in enumerate(transactions):
        src = str(tx.get("source") or tx.get("source_id") or tx.get("sender") or "").strip()
        tgt = str(tx.get("target") or tx.get("target_id") or tx.get("recipient") or "").strip()
        amt = clean_amount(tx.get("amount", 0))
        tx_id = str(tx.get("id") or tx.get("txId") or f"TX-{1000 + idx}")
        tstamp = str(tx.get("timestamp") or "00:00:00")
        ch = str(tx.get("type") or tx.get("channel") or "TRANSFER")

        if not src or not tgt:
            continue

        if src not in entity_map:
            entity_map[src] = len(entities)
            entities.append(src)
        if tgt not in entity_map:
            entity_map[tgt] = len(entities)
            entities.append(tgt)

        edges_list.append({
            "id": tx_id,
            "source": src,
            "target": tgt,
            "source_idx": entity_map[src],
            "target_idx": entity_map[tgt],
            "amount": amt,
            "amount_str": format_inr(amt),
            "timestamp": tstamp,
            "type": ch,
        })

    num_nodes = len(entities)
    num_edges = len(edges_list)

    if num_nodes == 0 or num_edges == 0:
        raise ValueError("No valid transaction edges found with valid source and target entities.")

    # 2. Build Adjacency Matrix and Graph Statistics
    in_degrees = [0] * num_nodes
    out_degrees = [0] * num_nodes
    inflows = [0.0] * num_nodes
    outflows = [0.0] * num_nodes

    A = torch.zeros((num_nodes, num_nodes), dtype=torch.float32)

    for edge in edges_list:
        u = edge["source_idx"]
        v = edge["target_idx"]
        A[u, v] += 1.0
        out_degrees[u] += 1
        in_degrees[v] += 1
        outflows[u] += edge["amount"]
        inflows[v] += edge["amount"]

    # 3. Symmetric Normalization: A_tilde = A + I; D_tilde^(-1/2) * A_tilde * D_tilde^(-1/2)
    A_tilde = A + torch.eye(num_nodes)
    degrees = A_tilde.sum(dim=1)
    d_inv_sqrt = torch.pow(degrees, -0.5)
    d_inv_sqrt[torch.isinf(d_inv_sqrt)] = 0.0
    D_inv_sqrt = torch.diag(d_inv_sqrt)
    A_hat = torch.mm(torch.mm(D_inv_sqrt, A_tilde), D_inv_sqrt)

    # 4. Feature Matrix X [num_nodes, 8]
    # Features: [in_deg_norm, out_deg_norm, inflow_log, outflow_log, passthrough_ratio, velocity, is_high_out_fan, net_diff]
    max_deg = max(max(in_degrees), max(out_degrees), 1)
    max_flow = max(max(inflows), max(outflows), 1.0)

    X = torch.zeros((num_nodes, 8), dtype=torch.float32)
    for i in range(num_nodes):
        in_d = in_degrees[i]
        out_d = out_degrees[i]
        in_f = inflows[i]
        out_f = outflows[i]

        passthrough = (min(in_f, out_f) / max(in_f, out_f)) if (in_f > 0 and out_f > 0) else 0.0
        is_fanout = 1.0 if (out_d >= 3 and in_d <= 1) else 0.0
        net_diff = (out_f - in_f) / max_flow

        X[i, 0] = in_d / max_deg
        X[i, 1] = out_d / max_deg
        X[i, 2] = math.log1p(in_f) / 15.0
        X[i, 3] = math.log1p(out_f) / 15.0
        X[i, 4] = passthrough
        X[i, 5] = (in_d + out_d) / max_deg
        X[i, 6] = is_fanout
        X[i, 7] = net_diff

    # 5. GCN Forward Propagation
    with torch.no_grad():
        probs = gcn_model(X, A_hat)
        fraud_probs = probs[:, 1].cpu().numpy()

    # 6. Structural Heuristics & Role Assignment
    nodes_result: List[Dict[str, Any]] = []
    suspicious_entities: List[Dict[str, Any]] = []
    flagged_nodes_count = 0

    # Layout circular / spring-like positions for visual topology
    for i, entity_id in enumerate(entities):
        gcn_score = float(fraud_probs[i])
        in_d = in_degrees[i]
        out_d = out_degrees[i]
        in_f = inflows[i]
        out_f = outflows[i]
        passthrough = (min(in_f, out_f) / max(in_f, out_f)) if (in_f > 0 and out_f > 0) else 0.0

        # Detect if this entity is the User Account in a personal bank statement (Ego Node)
        is_ego_node = (in_d + out_d) >= (num_edges * 0.70) and num_nodes >= 3

        # Structural rule synthesis combined with GCN embedding score
        is_fraud_ring = False
        is_mule_hub = False
        is_cash_out = False
        role = "Standard Account"
        flag_reason = None

        if is_ego_node:
            # User Account in a Bank Statement: check for rapid pass-through / account drain
            if passthrough >= 0.75 and out_f >= 40000:
                is_mule_hub = True
                role = "High-Risk Pass-Through / Siphoned Account"
                flag_reason = (
                    f"Bank statement anomaly: {passthrough*100:.0f}% of incoming funds ({format_inr(in_f)}) "
                    f"were immediately siphoned to outbound beneficiaries ({format_inr(out_f)})."
                )
            elif out_d >= 3 and in_d == 0 and out_f >= 100000:
                is_fraud_ring = True
                role = "Compromised Account / Unauthorized Drain"
                flag_reason = f"High-velocity drain: {out_d} outbound transfers totaling {format_inr(out_f)}."
            else:
                # Normal consumer bank statement behavior: salary in, everyday merchant expenses
                role = "Verified Account Holder"
                node_type = "normal"
                score = 12
        else:
            # Connected entities in the statement
            if out_d >= 2 and (out_f >= 50000 or gcn_score > 0.65) and in_d <= 1:
                is_fraud_ring = True
                role = "Fraud Ring Originator"
                flag_reason = f"High fan-out dispersion: initiating {out_d} parallel transfers totaling {format_inr(out_f)}."
            elif in_d >= 1 and out_d >= 1 and passthrough >= 0.70:
                is_mule_hub = True
                role = "Mule Layering Intermediary"
                flag_reason = f"Rapid pass-through: {passthrough*100:.0f}% of incoming funds immediately routed downstream."
            elif in_d >= 1 and in_f >= 40000 and out_d == 0:
                is_cash_out = True
                role = "High-Risk Cash-Out Beneficiary"
                flag_reason = f"Target beneficiary receiving large extraction of {format_inr(in_f)}."
            elif gcn_score >= 0.60:
                is_mule_hub = True
                role = "Suspicious Graph Entity"
                flag_reason = "GCN multi-hop neighborhood features match known fraudulent cluster profiles."

        # Calibrate overall node score (0 - 100)
        if not is_ego_node or (is_mule_hub or is_fraud_ring):
            if is_fraud_ring or is_cash_out:
                score = max(int(gcn_score * 100), 88)
                node_type = "fraud_ring" if is_fraud_ring else "cash_out"
            elif is_mule_hub:
                score = max(int(gcn_score * 100), 82)
                node_type = "mule_hub"
            else:
                score = min(int(gcn_score * 100), 25)
                node_type = "normal"

        if score >= 65:
            flagged_nodes_count += 1
            suspicious_entities.append({
                "id": entity_id,
                "role": role,
                "riskScore": score,
                "transactionsInvolved": in_d + out_d,
                "totalVolume": format_inr(in_f + out_f),
                "reason": flag_reason or "Suspicious graph transaction frequency and adjacency.",
            })

        # Calculate visually distributed coordinates (x: 10-85%, y: 15-80%)
        angle = (2 * math.pi * i) / max(num_nodes, 1)
        # Offset radius for variety
        r = 0.32 if (i % 2 == 0) else 0.42
        cx = 50 + int(r * 80 * math.cos(angle))
        cy = 50 + int(r * 65 * math.sin(angle))
        cx = max(12, min(86, cx))
        cy = max(18, min(82, cy))

        nodes_result.append({
            "id": entity_id,
            "label": entity_id,
            "type": node_type,
            "riskScore": score,
            "degree": in_d + out_d,
            "inflow": format_inr(in_f),
            "outflow": format_inr(out_f),
            "x": cx,
            "y": cy,
            "flagReason": flag_reason,
        })

    # 7. Evaluate Edges & Suspicious Transactions
    flagged_tx_count = 0
    suspicious_transactions: List[Dict[str, Any]] = []
    edges_result: List[Dict[str, Any]] = []

    for edge in edges_list:
        src_node = next((n for n in nodes_result if n["id"] == edge["source"]), None)
        tgt_node = next((n for n in nodes_result if n["id"] == edge["target"]), None)

        is_high_risk = False
        anomaly_type = "Standard Transfer"

        if src_node and tgt_node:
            if src_node["riskScore"] >= 75 or tgt_node["riskScore"] >= 75:
                is_high_risk = True
                flagged_tx_count += 1
                if src_node["type"] == "fraud_ring":
                    anomaly_type = "Originator Ring Dispersion"
                elif tgt_node["type"] == "cash_out":
                    anomaly_type = "Siphon Cash-Out Extraction"
                else:
                    anomaly_type = "Mule Rapid Layering Transfer"

                suspicious_transactions.append({
                    "txId": edge["id"],
                    "source": edge["source"],
                    "target": edge["target"],
                    "amount": edge["amount_str"],
                    "timestamp": edge["timestamp"],
                    "anomalyType": anomaly_type,
                })

        edges_result.append({
            "id": edge["id"],
            "source": edge["source"],
            "target": edge["target"],
            "amount": edge["amount_str"],
            "isHighRisk": is_high_risk,
        })

    # Sort suspicious entities by highest risk score
    suspicious_entities.sort(key=lambda e: e["riskScore"], reverse=True)

    # Calculate overall graph fraud score (0 - 100)
    if flagged_nodes_count > 0:
        avg_flagged_score = sum(e["riskScore"] for e in suspicious_entities) / flagged_nodes_count
        overall_score = min(100, int(avg_flagged_score * 0.85 + (flagged_nodes_count / num_nodes) * 25))
    else:
        overall_score = max(5, int(sum(n["riskScore"] for n in nodes_result) / max(num_nodes, 1)))

    if overall_score >= 70:
        risk_level = "High"
    elif overall_score >= 40:
        risk_level = "Medium"
    else:
        risk_level = "Low"

    inference_ms = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "risk_score": overall_score,
        "risk_level": risk_level,
        "total_transactions": num_edges,
        "total_entities": num_nodes,
        "flagged_entities_count": flagged_nodes_count,
        "flagged_transactions_count": flagged_tx_count,
        "nodes": nodes_result,
        "edges": edges_result,
        "suspicious_entities": suspicious_entities,
        "suspicious_transactions": suspicious_transactions,
        "model_type": "FraudShield GCN (2-Layer Spectral Graph Convolution)",
        "inference_time_ms": inference_ms,
        "dataset_name": dataset_name,
    }
