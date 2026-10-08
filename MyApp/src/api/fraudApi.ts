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
};

export default fraudApi;
