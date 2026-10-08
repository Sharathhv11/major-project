/**
 * Unit Tests for Stage 1: Lightweight Fraud Keyword Pre-Filter
 */

import {
  analyzeLocally,
  LocalFraudFilter,
  matchesKeyword,
  normalizeText,
} from '../src/fraudDetection/localFraudFilter';
import fraudKeywordsJson from '../src/fraudDetection/fraud_keywords.json';

describe('1. fraud_keywords.json Configuration Integrity', () => {
  it('loads valid JSON with expected top-level properties', () => {
    expect(fraudKeywordsJson).toBeDefined();
    expect(fraudKeywordsJson.defaultThreshold).toBe(5);
    expect(typeof fraudKeywordsJson.categories).toBe('object');
    expect(Array.isArray(fraudKeywordsJson.patterns)).toBe(true);
    expect(fraudKeywordsJson.urlSignal).toBeDefined();
  });

  it('contains essential fraud categories with weights and keywords', () => {
    const requiredCategories = [
      'prize_reward',
      'urgent_action',
      'financial_common',
      'credentials',
      'account_threat',
      'kyc_verification',
      'suspicious_links',
    ];

    for (const catKey of requiredCategories) {
      const category = (fraudKeywordsJson.categories as any)[catKey];
      expect(category).toBeDefined();
      expect(typeof category.weight).toBe('number');
      expect(category.weight).toBeGreaterThan(0);
      expect(Array.isArray(category.keywords)).toBe(true);
      expect(category.keywords.length).toBeGreaterThan(0);
    }
  });

  it('assigns low weight (1) to common benign financial terms to prevent false positives', () => {
    const financial = (fraudKeywordsJson.categories as any).financial_common;
    expect(financial.weight).toBe(1);
    expect(financial.keywords).toContain('bank');
    expect(financial.keywords).toContain('payment');
  });

  it('contains multi-keyword combination patterns with descriptions and weights', () => {
    const patternNames = fraudKeywordsJson.patterns.map((p: any) => p.name);
    expect(patternNames).toContain('bank_verification_urgency');
    expect(patternNames).toContain('kyc_urgency');
    expect(patternNames).toContain('account_block_threat_with_link');
  });
});

describe('2. Text Normalization and Word Boundary Matching', () => {
  it('normalizes text uniformly (lowercase, whitespace collapse)', () => {
    expect(normalizeText('  HELLO   WORLD  \n\r')).toBe('hello world');
    expect(normalizeText('')).toBe('');
  });

  it('matches single keywords with word boundaries to avoid false positives', () => {
    // "pin" must NOT match "spinning", "shopping", or "happiness"
    expect(matchesKeyword('spinning wheels fast', 'pin')).toBe(false);
    expect(matchesKeyword('online shopping receipt', 'pin')).toBe(false);
    expect(matchesKeyword('pure happiness here', 'pin')).toBe(false);

    // "pin" MUST match actual PIN mentions
    expect(matchesKeyword('Enter your PIN now', 'pin')).toBe(true);
    expect(matchesKeyword('Secret pin is 1234', 'pin')).toBe(true);
    expect(matchesKeyword('PIN', 'pin')).toBe(true);

    // "won" must NOT match "wonderful"
    expect(matchesKeyword('It is a wonderful day', 'won')).toBe(false);
    expect(matchesKeyword('You won ₹50,000 today', 'won')).toBe(true);

    // "bank" must NOT match "databank"
    expect(matchesKeyword('Searching the databank', 'bank')).toBe(false);
    expect(matchesKeyword('Your bank account alert', 'bank')).toBe(true);
  });

  it('matches multi-word phrases cleanly', () => {
    expect(matchesKeyword('Claim your cash prize now', 'cash prize')).toBe(true);
    expect(matchesKeyword('Verify your bank account urgently', 'verify your bank account')).toBe(true);
    expect(matchesKeyword('Normal text with no scam', 'cash prize')).toBe(false);
  });
});

describe('3. Core Requirements: Example Scenarios from User Specification', () => {
  it('Example A — Obvious prize scam: Should cross threshold and be forwarded to BERT', () => {
    const message =
      'Congratulations! You have won a cash prize of ₹50,000. Claim your reward immediately by clicking this link.';

    const result = analyzeLocally(message);

    expect(result.score).toBeGreaterThanOrEqual(result.threshold);
    expect(result.shouldSendToBackend).toBe(true);
    expect(result.matchedCategories).toContain('prize_reward');
    expect(result.matchedCategories).toContain('urgent_action');
    expect(result.matchedKeywords).toContain('congratulations');
    expect(result.matchedKeywords).toContain('cash prize');
    expect(result.matchedKeywords).toContain('immediately');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('Example B — Normal bank notification: Should NOT cross threshold, Ignored locally', () => {
    const message = 'Your payment of ₹500 to XYZ Store was successful.';

    const result = analyzeLocally(message);

    expect(result.score).toBeLessThan(result.threshold);
    expect(result.shouldSendToBackend).toBe(false);
    expect(result.score).toBe(1); // Only "payment" (+1)
    expect(result.matchedKeywords).toEqual(['payment']);
  });

  it('Example B2 — Normal bank message with bank + payment: Still below threshold (2 < 5)', () => {
    const message = 'Your bank payment of ₹500 was successful.';

    const result = analyzeLocally(message);

    expect(result.score).toBe(2); // "bank" (+1) + "payment" (+1)
    expect(result.score).toBeLessThan(result.threshold);
    expect(result.shouldSendToBackend).toBe(false);
  });

  it('Example C — Suspicious KYC message: Should cross threshold and be forwarded to BERT', () => {
    const message =
      'Your KYC has expired. Verify your bank account immediately or your account will be blocked. Click here.';

    const result = analyzeLocally(message);

    expect(result.score).toBeGreaterThanOrEqual(result.threshold);
    expect(result.shouldSendToBackend).toBe(true);
    expect(result.matchedCategories).toContain('kyc_verification');
    expect(result.matchedCategories).toContain('account_threat');
    expect(result.matchedPatterns.length).toBeGreaterThan(0);
  });

  it('Example D — Normal casual conversation: Score = 0, Ignored locally', () => {
    const message = 'Hey, are you coming to college tomorrow?';

    const result = analyzeLocally(message);

    expect(result.score).toBe(0);
    expect(result.shouldSendToBackend).toBe(false);
    expect(result.matchedKeywords).toEqual([]);
    expect(result.matchedCategories).toEqual([]);
  });
});

describe('4. Combination Patterns and URL Signal Handling', () => {
  it('triggers combination patterns when all required keywords appear together', () => {
    const message = 'Bank notice: verify your identity immediately!';
    const result = analyzeLocally(message);

    expect(result.matchedPatterns).toContain('bank_verification_urgency');
    expect(result.shouldSendToBackend).toBe(true);
  });

  it('does NOT treat a benign message with an ordinary HTTPS URL as fraud', () => {
    const message = 'Hey here is the document link: https://docs.google.com/document/d/12345';
    const result = analyzeLocally(message);

    // URL adds +2, but threshold is 5
    expect(result.score).toBe(2);
    expect(result.hasUrl).toBe(true);
    expect(result.shouldSendToBackend).toBe(false);
  });

  it('applies higher weight to insecure HTTP URLs', () => {
    const message = 'Check this http://unsecure-site.xyz/login';
    const result = analyzeLocally(message);

    expect(result.hasUrl).toBe(true);
    expect(result.urlDetails?.hasHttp).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(4);
  });
});

describe('5. Explainability and Threshold Customization', () => {
  it('returns inspectable breakdown of reasons, matched keywords, and categories', () => {
    const message = 'URGENT: Click here to claim your reward';
    const result = analyzeLocally(message);

    expect(result.reasons).toBeInstanceOf(Array);
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.matchedCategories).toContain('urgent_action');
    expect(result.matchedCategories).toContain('prize_reward');
    expect(result.matchedCategories).toContain('suspicious_links');
  });

  it('respects custom threshold overrides', () => {
    const message = 'Your bank payment was received'; // score = 2
    // Default threshold is 5 -> false
    expect(analyzeLocally(message, 5).shouldSendToBackend).toBe(false);
    // Lower threshold override = 2 -> true
    expect(analyzeLocally(message, 2).shouldSendToBackend).toBe(true);
    // Higher threshold override = 10 -> false
    expect(analyzeLocally(message, 10).shouldSendToBackend).toBe(false);
  });

  it('handles very short or empty messages safely without errors', () => {
    expect(analyzeLocally('').shouldSendToBackend).toBe(false);
    expect(analyzeLocally('hi').shouldSendToBackend).toBe(false);
    expect(analyzeLocally('   ').shouldSendToBackend).toBe(false);
  });
});
