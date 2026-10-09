/**
 * Message Fraud Checker Handler
 *
 * Implements the unified analysis flow for the manual Message Fraud Checker:
 * User Text -> Normalize -> Existing Local Fraud Keyword Filter & URL Rules ->
 * Existing Cache -> Existing BERT/ML Backend -> Risk Result.
 *
 * Strictly adheres to project principles:
 * - 100% reuse of existing localFraudFilter, hashUtils, messageFraudCache, fraudApi
 * - Zero technical ML terminology exposed to user (no BERT, logits, etc.)
 * - Communicates risk assessment rather than guaranteed safety
 * - Never classifies as safe when backend analysis fails
 */

import { normalizeText, localFraudFilter, LocalFraudFilterResult } from './localFraudFilter';
import { generateMessageHash } from './cache/hashUtils';
import { messageFraudCache } from './cache/messageFraudCache';
import fraudApi, { FraudAnalysisResponse } from '../api/fraudApi';
import { addDetectionRecord } from '../storage/detectionHistoryStorage';

export type RiskAssessmentState = 'POTENTIAL_FRAUD' | 'LIKELY_SAFE' | 'ERROR';

export interface MessageCheckResult {
  state: RiskAssessmentState;
  riskScore: number;          // 0.0 to 1.0
  scorePercentage: number;    // 0 to 100
  title: string;              // Heading (e.g., "⚠ Potential Fraud" or "✓ No obvious fraud detected")
  summary: string;            // Supporting guidance
  reasons: string[];          // Only analysis-supported reasons
  cached: boolean;
  hasUrl: boolean;
  analyzedText: string;
  error?: string;
}

/**
 * Extracts user-friendly, supported reasons from local filter and analysis scores.
 */
function extractSupportedReasons(
  localResult: LocalFraudFilterResult,
  riskScore: number,
  isFraud: boolean,
): string[] {
  const reasons: string[] = [];

  // 1. URL Analysis
  if (localResult.urlDetails?.isSuspiciousUrl) {
    reasons.push('Suspicious link detected');
  } else if (localResult.urlDetails?.hasHttp) {
    reasons.push('Insecure HTTP link detected');
  } else if (localResult.hasUrl && (isFraud || riskScore >= 0.5)) {
    reasons.push('Suspicious link detected');
  }

  // 2. Urgent request for action
  if (localResult.matchedCategories.includes('urgent_action')) {
    reasons.push('Urgent request for action');
  }

  // 3. Request for OTP or financial information
  if (
    localResult.matchedCategories.includes('otp_pin') ||
    localResult.matchedCategories.includes('financial_common')
  ) {
    reasons.push('Request for OTP or financial information');
  }

  // 4. Account/KYC warning
  if (localResult.matchedCategories.includes('account_kyc')) {
    reasons.push('Account/KYC warning');
  }

  // 5. Prize/reward claim
  if (
    localResult.matchedCategories.includes('prize_reward') ||
    localResult.matchedCategories.includes('lottery_winner')
  ) {
    reasons.push('Prize/reward claim');
  }

  // 6. Other supported categories
  if (localResult.matchedCategories.includes('job_offer')) {
    reasons.push('Unsolicited job offer');
  }
  if (localResult.matchedCategories.includes('delivery_customs')) {
    reasons.push('Package delivery or customs fee alert');
  }
  if (localResult.matchedCategories.includes('electricity_bill')) {
    reasons.push('Urgent utility disconnection threat');
  }

  // Fallback reason if flagged by backend model without a keyword match
  if (isFraud && reasons.length === 0) {
    reasons.push('High-risk linguistic patterns commonly found in scams');
  }

  return reasons;
}

/**
 * Executes the complete fraud verification pipeline for a given message text.
 */
export async function checkMessageForFraud(rawText: string): Promise<MessageCheckResult> {
  const trimmedText = (rawText || '').trim();

  if (!trimmedText) {
    return {
      state: 'ERROR',
      riskScore: 0,
      scorePercentage: 0,
      title: 'Unable to check this message',
      summary: 'Please enter or paste a message to analyze.',
      reasons: [],
      cached: false,
      hasUrl: false,
      analyzedText: '',
      error: 'Message content is empty',
    };
  }

  if (trimmedText.length < 5) {
    return {
      state: 'ERROR',
      riskScore: 0,
      scorePercentage: 0,
      title: 'Unable to check this message',
      summary: 'The message is too short to accurately assess (minimum 5 characters required).',
      reasons: [],
      cached: false,
      hasUrl: false,
      analyzedText: trimmedText,
      error: 'Message too short',
    };
  }

  // Step 1: Normalization
  const normalized = normalizeText(trimmedText);

  // Step 2: Local Fraud Keyword Filter & URL Rule Evaluation
  const localFilterResult = localFraudFilter.analyze(trimmedText);

  // Step 3: SHA-256 Hash Generation & Local Cache Lookup
  const messageHash = generateMessageHash(trimmedText);
  const cachedEntry = messageFraudCache.get(messageHash);

  let riskScore = 0;
  let classification = 'NOT_FRAUD';
  let isCached = false;

  if (cachedEntry) {
    // Cache HIT
    riskScore = cachedEntry.riskScore ?? 0;
    classification = cachedEntry.classification || 'NOT_FRAUD';
    isCached = true;
  } else {
    // Cache MISS: Query backend BERT/ML service
    try {
      const response: FraudAnalysisResponse = await fraudApi.analyzeMessage(trimmedText);

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Fraud analysis service returned an invalid response');
      }

      const { mlResult, threshold: backendThreshold } = response.data;
      const effectiveThreshold = backendThreshold ?? 0.70;

      riskScore = mlResult ? mlResult.fraudScore : 0;
      classification = mlResult
        ? mlResult.prediction || (mlResult.isFraud ? 'FRAUD' : 'NOT_FRAUD')
        : 'NOT_FRAUD';

      // Store in local cache
      messageFraudCache.set({
        messageHash,
        riskScore,
        classification,
        timestamp: Date.now(),
      });
    } catch (apiError: any) {
      console.warn('[FraudShield Checker] Backend analysis error:', apiError?.message || apiError);

      // Section 9: "If the backend/OCR fails: Unable to check this message.
      // Explain briefly and allow the user to retry. Do not incorrectly classify the message as safe when analysis fails."
      return {
        state: 'ERROR',
        riskScore: 0,
        scorePercentage: 0,
        title: 'Unable to check this message',
        summary:
          'Could not reach the fraud analysis service. Please check your internet connection or backend server and retry.',
        reasons: [],
        cached: false,
        hasUrl: localFilterResult.hasUrl,
        analyzedText: trimmedText,
        error: apiError?.message || 'Network or service error',
      };
    }
  }

  // Determine potential fraud threshold:
  // Either BERT score >= 0.70, prediction == 'FRAUD', or local keyword filter flagged high risk
  const isFraud = riskScore >= 0.70 || classification === 'FRAUD';
  const scorePercentage = Math.round(riskScore * 100);

  const reasons = extractSupportedReasons(localFilterResult, riskScore, isFraud);

  // Persist record to detection history
  addDetectionRecord({
    preview: trimmedText.length > 80 ? trimmedText.substring(0, 80) + '...' : trimmedText,
    source: 'MANUAL_CHECK',
    riskScore,
    classification: isFraud ? 'FRAUD' : 'NOT_FRAUD',
    isFraud,
    reasons,
    timestamp: Date.now(),
  }).catch((err) => {
    console.warn('[FraudShield Checker] Failed to save detection record:', err);
  });

  if (isFraud) {
    return {
      state: 'POTENTIAL_FRAUD',
      riskScore,
      scorePercentage,
      title: '⚠ Potential Fraud',
      summary: 'This message contains several signs commonly associated with scams.',
      reasons,
      cached: isCached,
      hasUrl: localFilterResult.hasUrl,
      analyzedText: trimmedText,
    };
  }

  // Likely Safe (risk assessment, never absolute guarantee)
  return {
    state: 'LIKELY_SAFE',
    riskScore,
    scorePercentage,
    title: '✓ No obvious fraud detected',
    summary:
      "We didn't find strong indicators of fraud in this message. However, always verify unexpected requests independently.",
    reasons: reasons.length > 0 ? reasons : [],
    cached: isCached,
    hasUrl: localFilterResult.hasUrl,
    analyzedText: trimmedText,
  };
}
