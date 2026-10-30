/**
 * Automated Bidirectional Validation & Regression Test Suite
 *
 * Verifies both directions:
 * Direction A: Genuine fraud detection (credential harvesting, fake KYC, threats, mixed-content evasion)
 * Direction B: Legitimate message protection (Canara Bank regression, bank security advisories, transactions)
 *
 * Also tests:
 * - Local pattern matching & text normalization
 * - Model availability failure handling (no silent NOT_FRAUD)
 * - Threshold calibration (SUSPICIOUS tier does not pop aggressive fraud overlay)
 * - Cache deduplication and stale prediction invalidation
 */

import {
  analyzeLocally,
  evaluateSecurityAwareness,
  localFraudFilter,
  matchesKeyword,
  normalizeText,
} from '../src/fraudDetection/localFraudFilter';
import { generateMessageHash } from '../src/fraudDetection/cache/hashUtils';
import { MessageFraudCache } from '../src/fraudDetection/cache/messageFraudCache';
import {
  MessageFraudProcessor,
  ProcessMessageResult,
} from '../src/fraudDetection/messageFraudProcessor';
import evaluationDataset from './evaluation_dataset.json';

describe('FraudShield: Bidirectional Validation & Regression Test Suite', () => {
  let mockCache: MessageFraudCache;
  let mockApi: any;
  let processor: MessageFraudProcessor;

  beforeEach(() => {
    mockCache = new MessageFraudCache(15 * 60 * 1000, false);
    mockApi = {
      analyzeMessage: jest.fn(),
      analyzeTransactionNetwork: jest.fn(),
    };
    processor = new MessageFraudProcessor(mockCache, mockApi, localFraudFilter);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Text Normalization and Word Boundary Matching
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Text Normalization and Word Boundary Protection', () => {
    it('normalizes extra whitespace, newlines, and case uniformly', () => {
      const raw = '  Never  Share   YOUR  PIN   \n\r';
      expect(normalizeText(raw)).toBe('never share your pin');
    });

    it('prevents substring false positive matches (word boundary checks)', () => {
      // "pin" in "spinning", "shopping", "clipping"
      expect(matchesKeyword('spinning wheels fast', 'pin')).toBe(false);
      expect(matchesKeyword('online shopping receipt', 'pin')).toBe(false);
      expect(matchesKeyword('coupon clipping app', 'pin')).toBe(false);

      // "pin" matching actual PIN
      expect(matchesKeyword('never share your pin', 'pin')).toBe(true);
      expect(matchesKeyword('enter upi pin', 'pin')).toBe(true);
    });

    it('generates deterministic SHA-256 hashes across identical texts', () => {
      const textA = 'Your payment of Rs. 500 was successful.';
      const textB = '  Your payment of Rs. 500 was successful.  \r\n';
      expect(generateMessageHash(textA)).toBe(generateMessageHash(textB));
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Direction B: Canara Bank & Security-Awareness Protection (Regression)
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Direction B: Security-Awareness & Legitimate Message Protection', () => {
    const canaraBankMsg =
      "UPI Pin is used for authorization of payment. Money will always be deducted if you use UPI Pin. Never share UPI Pin, CVV, OTP with anyone. UPI Pin will always be used only on the app's UPI Pin page.";

    it('Canara Bank Regression: Local filter recognizes pure security awareness', () => {
      const localResult = localFraudFilter.analyze(canaraBankMsg);

      expect(localResult.isSecurityAwareness).toBe(true);
      expect(localResult.shouldSendToBackend).toBe(false);
      expect(localResult.score).toBe(0);
      expect(localResult.matchedPatterns).not.toContain('otp_credential_request');
      expect(localResult.reasons.some((r) => r.includes('security-awareness'))).toBe(true);
    });

    it('Canara Bank Regression: Full pipeline produces NOT_FRAUD verdict and displays NO fraud alert', async () => {
      // Mock backend returning calibrated legitimate response for security advisory
      mockApi.analyzeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          text: canaraBankMsg,
          mlResult: {
            fraudScore: 0.02,
            prediction: 'NOT_FRAUD',
            confidence: 0.98,
            inferenceTimeMs: 14.2,
            isFraud: false,
            riskLevel: 'LEGITIMATE',
          },
          threshold: 0.75,
          mlAvailable: true,
        },
      });

      // Execute through message fraud processor (allowing skipLocalFilter to test end-to-end backend interpretation)
      const result = await processor.processMessage(canaraBankMsg, {
        skipLocalFilter: true,
      });

      expect(result.status).toBe('PROCESSED_LEGITIMATE');
      expect(result.alertShown).toBe(false);
      expect(result.riskScore).toBe(0.02);
      expect(result.classification).toBe('NOT_FRAUD');
    });

    it('Generalizes to other bank security advisories (RBI, SBI, HDFC)', () => {
      const rbiAdvisory =
        'RBI Kehta Hai: Do not disclose your PIN, OTP, CVV, or passwords to anyone, including bank officials. Report unauthorized transactions immediately to 1930.';
      const sbiAdvisory =
        'SBI Security Alert: Beware of fake lottery calls or requests asking for OTP, CVV, or NetBanking password. SBI never asks for your credentials.';

      const rbiRes = localFraudFilter.analyze(rbiAdvisory);
      const sbiRes = localFraudFilter.analyze(sbiAdvisory);

      expect(rbiRes.isSecurityAwareness).toBe(true);
      expect(rbiRes.shouldSendToBackend).toBe(false);
      expect(sbiRes.isSecurityAwareness).toBe(true);
      expect(sbiRes.shouldSendToBackend).toBe(false);
    });

    it('Normal transaction and salary credits are NOT flagged locally', () => {
      const salaryMsg =
        'Salary of Rs. 65,000 credited to your HDFC Bank account ending in 8891 on 21-Sep-24. Avail bal: Rs. 92,400.';
      const result = localFraudFilter.analyze(salaryMsg);

      expect(result.score).toBeLessThan(result.threshold);
      expect(result.shouldSendToBackend).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Direction A: Fraud Detection & Credential Harvesting
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Direction A: Genuine Fraud Detection', () => {
    it('catches genuine credential solicitation requests', () => {
      const solicitation =
        'To receive your pending refund of Rs. 4,500, enter your UPI Pin immediately on this page or share your otp with bank executive.';
      const result = localFraudFilter.analyze(solicitation);

      expect(result.shouldSendToBackend).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(result.threshold);
      expect(result.isSecurityAwareness).toBe(false);
    });

    it('Full pipeline triggers fraud alert on genuine high-risk fraudulent messages', async () => {
      const fraudMsg =
        'Dear customer, your SBI account KYC verification is expired and will be blocked today. Update immediately at http://bit.ly/sbi-kyc-verify';

      mockApi.analyzeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          text: fraudMsg,
          mlResult: {
            fraudScore: 0.96,
            prediction: 'FRAUD',
            confidence: 0.96,
            inferenceTimeMs: 18.0,
            isFraud: true,
            riskLevel: 'FRAUD',
          },
          threshold: 0.75,
          mlAvailable: true,
        },
      });

      let alertDataReceived: any = null;
      const result = await processor.processMessage(fraudMsg, {
        onAlert: (data) => {
          alertDataReceived = data;
        },
      });

      expect(result.status).toBe('PROCESSED_FRAUD');
      expect(result.alertShown).toBe(true);
      expect(alertDataReceived).not.toBeNull();
      expect(alertDataReceived.classification).toBe('FRAUD');
      expect(alertDataReceived.riskScore).toBe(0.96);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Paired Contrastive Tests & Mixed-Content Evasion Attacks
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Contrastive Pairs & Mixed-Content Attack Defense', () => {
    it('Contrastive Pair: "Never share OTP" vs "Share OTP with me immediately"', () => {
      const legit = 'Never share your OTP with anyone. Your bank will never ask for it.';
      const fraud = 'Share your OTP with me immediately to prevent your bank account from being blocked.';

      const legitRes = localFraudFilter.analyze(legit);
      const fraudRes = localFraudFilter.analyze(fraud);

      // Legitimate must be identified as pure awareness and not forwarded
      expect(legitRes.isSecurityAwareness).toBe(true);
      expect(legitRes.shouldSendToBackend).toBe(false);

      // Fraud must NOT be awareness and must be forwarded to backend
      expect(fraudRes.isSecurityAwareness).toBe(false);
      expect(fraudRes.shouldSendToBackend).toBe(true);
    });

    it('Mixed-Content Attack: Scammer adding "Never share your OTP" does NOT bypass fraud detection', () => {
      const mixedAttack =
        'Your bank account has been suspended due to incomplete KYC! Verify immediately at http://kyc-update-portal.cc. Never share your OTP with anyone.';

      const result = localFraudFilter.analyze(mixedAttack);

      // Awareness exemption must be strictly VOIDED because malicious indicators exist
      expect(result.isSecurityAwareness).toBe(false);
      expect(result.shouldSendToBackend).toBe(true);
      expect(result.reasons.some((r) => r.includes('Mixed-content warning'))).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(result.threshold);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 5. Model Availability, Malformed Responses & Threshold Calibration
  // ───────────────────────────────────────────────────────────────────────────
  describe('5. Error Handling, Malformed Responses & Calibrated Thresholds', () => {
    it('Requirement 6: When ML model is unavailable, does NOT silently classify as safe NOT_FRAUD', async () => {
      mockApi.analyzeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          text: 'Suspicious text here',
          mlResult: null,
          threshold: 0.75,
          mlAvailable: false,
        },
      });

      const result = await processor.processMessage(
        'Verify your account immediately or card blocked',
        { skipLocalFilter: true },
      );

      // Must report ERROR, never PROCESSED_LEGITIMATE
      expect(result.status).toBe('ERROR');
      expect(result.alertShown).toBe(false);
      // Cache must NOT store a false clean entry
      expect(mockCache.size()).toBe(0);
    });

    it('Requirement 4 & 5: Borderline SUSPICIOUS prediction (0.55) does NOT trigger full fraud overlay', async () => {
      mockApi.analyzeMessage.mockResolvedValueOnce({
        success: true,
        data: {
          text: 'Uncertain payment alert',
          mlResult: {
            fraudScore: 0.55,
            prediction: 'NOT_FRAUD',
            confidence: 0.55,
            inferenceTimeMs: 12.0,
            isFraud: false,
            riskLevel: 'SUSPICIOUS',
          },
          threshold: 0.75,
          mlAvailable: true,
        },
      });

      const result = await processor.processMessage(
        'Payment query on your card statement',
        { skipLocalFilter: true },
      );

      // Must be processed as LEGITIMATE / cautionary without popping disruptive alert overlay
      expect(result.status).toBe('PROCESSED_LEGITIMATE');
      expect(result.alertShown).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 6. Complete Labeled Evaluation Dataset Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe('6. Full Benchmark Evaluation Dataset Test', () => {
    it('evaluates all 30 dataset samples without unexpected crashes or type mismatches', () => {
      expect(Array.isArray(evaluationDataset)).toBe(true);
      expect(evaluationDataset.length).toBe(30);

      let legitCount = 0;
      let fraudCount = 0;

      for (const sample of evaluationDataset) {
        expect(sample.id).toBeDefined();
        expect(sample.message).toBeDefined();
        expect(['FRAUD', 'NOT_FRAUD']).toContain(sample.expected_label);
        expect(sample.category).toBeDefined();

        if (sample.expected_label === 'FRAUD') fraudCount++;
        else legitCount++;

        const res = localFraudFilter.analyze(sample.message);
        expect(typeof res.score).toBe('number');
        expect(typeof res.shouldSendToBackend).toBe('boolean');
      }

      // Dataset balance verification
      expect(legitCount).toBe(15);
      expect(fraudCount).toBe(15);
    });
  });
});
