/**
 * Fraud Detection API Service
 *
 * Sends message text to the Node.js backend for ML-based fraud analysis.
 * The backend proxies the request to the FastAPI ML model and returns
 * a combined result with fraud score and threshold comparison.
 */

import apiClient from './client';

// ─── Response Types ─────────────────────────────────────────────────────────

export interface MlResult {
  fraudScore: number;
  prediction: 'FRAUD' | 'NOT_FRAUD';
  confidence: number;
  inferenceTimeMs: number;
  isFraud: boolean;
  riskLevel?: 'LEGITIMATE' | 'SUSPICIOUS' | 'FRAUD';
  normalizedText?: string | null;
}

export interface FraudAnalysisData {
  text: string;
  mlResult: MlResult | null;
  threshold: number;
  mlAvailable: boolean;
}

export interface FraudAnalysisResponse {
  success: boolean;
  data: FraudAnalysisData;
  message?: string;
}

export interface GcnNode {
  id: string;
  label: string;
  type: 'mule_hub' | 'fraud_ring' | 'normal' | 'cash_out';
  riskScore: number;
  degree: number;
  inflow: string;
  outflow: string;
  x: number;
  y: number;
  flagReason?: string;
}

export interface GcnEdge {
  id: string;
  source: string;
  target: string;
  amount: string;
  isHighRisk?: boolean;
}

export interface GcnSuspiciousEntity {
  id: string;
  role: string;
  riskScore: number;
  transactionsInvolved: number;
  totalVolume: string;
  reason: string;
}

export interface GcnSuspiciousTx {
  txId: string;
  source: string;
  target: string;
  amount: string;
  timestamp: string;
  anomalyType: string;
}

export interface GcnNetworkAnalysisData {
  risk_score: number;
  risk_level: 'Low' | 'Medium' | 'High';
  total_transactions: number;
  total_entities: number;
  flagged_entities_count: number;
  flagged_transactions_count: number;
  nodes: GcnNode[];
  edges: GcnEdge[];
  suspicious_entities: GcnSuspiciousEntity[];
  suspicious_transactions: GcnSuspiciousTx[];
  model_type: string;
  inference_time_ms: number;
  dataset_name?: string;
}

export interface GcnNetworkAnalysisResponse {
  success: boolean;
  data: GcnNetworkAnalysisData;
  message?: string;
}

// ─── Bank Statement PDF Extraction Types ─────────────────────────────────────

export interface ExtractedStatementTx {
  id?: string;
  source_id: string; // e.g. "user1" for account holder
  target_id: string; // e.g. "user2" for recipient/sender
  amount: number;
  timestamp: string; // ISO 8601: "YYYY-MM-DDTHH:mm:ss" or "YYYY-MM-DD"
  channel:
    | 'UPI'
    | 'NEFT'
    | 'IMPS'
    | 'RTGS'
    | 'ATM'
    | 'CARD'
    | 'BANK_TRANSFER'
    | 'CASH'
    | 'UNKNOWN';
  direction: 'DEBIT' | 'CREDIT';
  rawDescription?: string;
  runningBalance?: number | null;
  refNo?: string | null;
}

export interface StatementExtractionMetadata {
  filename: string;
  extractionMethod: 'PDF_TEXT_PARSER' | 'TESSERACT_OCR' | 'TEXT_PARSER';
  bankDetected: string;
  totalTransactions: number;
  accountHolderId: 'user1';
  extractedAt: string;
}

export interface StatementExtractionResponse {
  success: boolean;
  metadata: StatementExtractionMetadata;
  transactions: ExtractedStatementTx[];
  csvData: string;
  entityMapping: Record<string, string>;
  message?: string;
}

// ─── API ─────────────────────────────────────────────────────────────────────

const FRAUD_BASE = '/api/fraud';

const fraudApi = {
  /**
   * POST /api/fraud/analyze
   * Sends message text to the backend for ML fraud analysis.
   * Requires authentication (Bearer token attached by apiClient interceptor).
   */
  analyzeMessage: async (text: string): Promise<FraudAnalysisResponse> => {
    const response = await apiClient.post<FraudAnalysisResponse>(
      `${FRAUD_BASE}/analyze`,
      { text },
    );
    return response.data;
  },

  /**
   * POST /api/fraud/analyze-network
   * Sends transaction records to the backend for GCN multi-hop graph analysis.
   */
  analyzeTransactionNetwork: async (
    transactions: any[],
    datasetName?: string,
  ): Promise<GcnNetworkAnalysisResponse> => {
    const response = await apiClient.post<GcnNetworkAnalysisResponse>(
      `${FRAUD_BASE}/analyze-network`,
      { transactions, datasetName },
    );
    return response.data;
  },

  /**
   * POST /api/fraud/extract-statement
   * Uploads and parses bank statement (PDF, base64, or simulated raw text).
   * Supports Canara Bank and standard Indian bank formats with OCR fallback.
   * Ensures 'user1' is assigned to account holder and counterparties are anonymized.
   */
  extractBankStatement: async (payload: {
    pdfBase64?: string;
    sampleType?: 'canara' | 'fraud_mule' | 'general';
    rawText?: string;
    filename?: string;
    formData?: any;
  }): Promise<StatementExtractionResponse> => {
    if (payload.formData) {
      const response = await apiClient.post<StatementExtractionResponse>(
        `${FRAUD_BASE}/extract-statement`,
        payload.formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        },
      );
      return response.data;
    }
    const response = await apiClient.post<StatementExtractionResponse>(
      `${FRAUD_BASE}/extract-statement`,
      payload,
    );
    return response.data;
  },
};

export default fraudApi;

