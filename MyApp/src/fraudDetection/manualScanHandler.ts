/**
 * FraudShield Manual Scan Handler
 *
 * Coordinates manual on-screen fraud scans triggered by the floating FraudShield bot.
 * Crucial guarantee: Routes user-selected text directly through the EXACT SAME
 * fraud detection pipeline (Normalization -> SHA-256 Hash -> 15-min Cache ->
 * Stage 1 Local Keyword/Pattern Filter -> Backend BERT -> Alert/Result Display).
 */

import { DeviceEventEmitter, EmitterSubscription } from 'react-native';
import { messageFraudProcessor } from './messageFraudProcessor';
import { reportManualScanResult } from '../utils/accessibilityService';

export interface ManualScanRequest {
  text: string;
  sourcePackage?: string;
  timestamp: number;
  scanId?: string;
}

export interface ManualScanResponse {
  status: string;
  riskScore: number;
  classification: string;
  isFraud: boolean;
  scorePercentage: number;
  explanation: string;
  error?: string;
}

let scanSubscription: EmitterSubscription | null = null;

/**
 * Handles an incoming manual scan request from the floating assistant.
 */
export async function handleManualScanRequest(
  request: ManualScanRequest,
): Promise<ManualScanResponse> {
  console.log('[FraudShield Helper] Manual scan started');

  if (!request || !request.text) {
    console.warn('[FraudShield Helper] Empty text received for manual scan');
    const emptyResult: ManualScanResponse = {
      status: 'SKIPPED_EMPTY',
      riskScore: 0,
      classification: 'NOT_FRAUD',
      isFraud: false,
      scorePercentage: 0,
      explanation: 'No readable text was selected.',
    };
    await reportManualScanResult(emptyResult);
    return emptyResult;
  }

  try {
    // Execute through the exact same unified messageFraudProcessor
    const result = await messageFraudProcessor.processMessage(request.text, {
      source: 'MANUAL_SCAN',
      sender: request.sourcePackage || 'Manual Screen Scan',
    });

    // Development logging corresponding to Section 23 specifications
    if (result.cached) {
      console.log('[FraudShield Helper] Cache HIT');
    } else {
      console.log('[FraudShield Helper] Cache MISS');
    }

    if (result.localFilterResult) {
      console.log(`[FraudShield Helper] Local score = ${result.localFilterResult.score}`);
      if (result.localFilterResult.shouldSendToBackend) {
        console.log('[FraudShield Helper] Sending to backend');
      }
    }

    const riskScore = result.riskScore ?? 0;
    const classification = result.classification || 'NOT_FRAUD';
    const isFraud =
      result.status === 'PROCESSED_FRAUD' ||
      riskScore >= 0.7 ||
      classification === 'FRAUD';

    console.log(`[FraudShield Helper] Risk score received (${Math.round(riskScore * 100)}%)`);
    console.log('[FraudShield Helper] Showing result');

    const responsePayload: ManualScanResponse = {
      status: result.status,
      riskScore,
      classification,
      isFraud,
      scorePercentage: Math.round(riskScore * 100),
      explanation: isFraud
        ? 'High probability of fraud or phishing detected.'
        : 'No strong signs of fraud detected.',
      error: result.error,
    };

    // Report back to native floating overlay to render the result card
    await reportManualScanResult(responsePayload);

    return responsePayload;
  } catch (error: any) {
    console.error('[FraudShield Helper] Error during manual fraud scan:', error);
    const errorResponse: ManualScanResponse = {
      status: 'ERROR',
      riskScore: 0,
      classification: 'ERROR',
      isFraud: false,
      scorePercentage: 0,
      explanation: 'Unable to complete check right now.',
      error: error?.message || 'Unknown analysis error',
    };
    await reportManualScanResult(errorResponse);
    return errorResponse;
  }
}

/**
 * Initializes the global event listener for manual scans triggered by the floating bot.
 */
export function initManualScanListener(): () => void {
  if (scanSubscription) {
    scanSubscription.remove();
    scanSubscription = null;
  }

  scanSubscription = DeviceEventEmitter.addListener(
    'onManualScanRequested',
    (payload: ManualScanRequest) => {
      handleManualScanRequest(payload).catch((err) => {
        console.warn('[FraudShield Helper] Failed handling manual scan:', err);
      });
    },
  );

  return () => {
    if (scanSubscription) {
      scanSubscription.remove();
      scanSubscription = null;
    }
  };
}
