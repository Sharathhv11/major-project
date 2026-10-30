/**
 * Stage 1: Lightweight Local Fraud Keyword & Pattern Pre-Filter
 *
 * Evaluates messages locally using categorized weights, combination patterns,
 * and URL signals defined in `fraud_keywords.json`.
 *
 * Flow:
 * Message detected
 *        ↓
 * Lightweight local keyword/pattern filter (Stage 1)
 *        ↓
 * Does content look potentially suspicious? (score >= threshold)
 *        ├── NO  → Ignore (Do NOT call backend, reduce load, reduce false positives)
 *        └── YES → Send to backend (Stage 2: BERT model inference)
 */

import { urlRule } from './rules/urlRule';
import { httpRule } from './rules/httpRule';

// Load default keywords configuration
const defaultFraudKeywordsData: FraudKeywordsConfig = require('./fraud_keywords.json');

export interface KeywordCategoryConfig {
  weight: number;
  description: string;
  keywords: string[];
}

export interface PatternConfig {
  name: string;
  description: string;
  keywords: string[];
  negationKeywords?: string[];
  weight: number;
}

export interface UrlSignalConfig {
  enabled: boolean;
  weight: number;
  weightInsecureHttp?: number;
  weightSuspiciousPattern?: number;
  description?: string;
}

export interface AwarenessSignalsConfig {
  enabled?: boolean;
  defensivePhrases?: string[];
}

export interface FraudKeywordsConfig {
  version?: string;
  defaultThreshold: number;
  description?: string;
  urlSignal?: UrlSignalConfig;
  awarenessSignals?: AwarenessSignalsConfig;
  categories: Record<string, KeywordCategoryConfig>;
  patterns?: PatternConfig[];
}

export interface LocalFraudFilterResult {
  score: number;
  threshold: number;
  shouldSendToBackend: boolean;
  isSecurityAwareness?: boolean;
  matchedKeywords: string[];
  matchedCategories: string[];
  matchedPatterns: string[];
  hasUrl: boolean;
  urlDetails?: {
    hasHttp: boolean;
    isSuspiciousUrl: boolean;
    urlCount: number;
  };
  reasons: string[];
}

export interface SecurityAwarenessEvaluation {
  isPureAwareness: boolean;
  hasDefensivePhrase: boolean;
  hasMaliciousIndicators: boolean;
  defensiveMatches: string[];
  maliciousIndicators: string[];
}

/**
 * Normalizes text for uniform scanning:
 * - Lowercase
 * - Removes zero-width and invisible control characters
 * - Collapses extra spaces and newlines
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Evaluates whether a message is an educational / security-awareness advisory.
 *
 * Rules:
 * 1. Checks for defensive phrasing advising against sharing credentials or explaining payment authorization.
 * 2. Scans for malicious indicators (external URLs, account blockage threats, action demands, prize lures).
 * 3. Pure awareness is ONLY confirmed when defensive phrasing is present AND zero malicious indicators are detected.
 * 4. If mixed content is detected (defensive wording + malicious indicator), awareness is voided and treated as high-risk.
 */
export function evaluateSecurityAwareness(
  normalizedText: string,
  rawText: string,
  hasUrl: boolean,
  isSuspiciousUrl: boolean,
  hasInsecureHttp: boolean,
  customDefensivePhrases?: string[],
): SecurityAwarenessEvaluation {
  const defaultDefensive = [
    'never share',
    'do not share',
    'don\'t share',
    'will never ask',
    'never ask',
    'never call you asking',
    'do not disclose',
    'keep your pin secret',
    'keep your otp secret',
    'beware of fake',
    'beware of fraud',
    'rbi kehta hai',
    'money will always be deducted if you use upi pin',
    'authorization of payment',
    'app\'s upi pin page',
    'only for sending money',
    'never share upi pin',
    'never share otp',
  ];

  const defensivePhrases = customDefensivePhrases && customDefensivePhrases.length > 0
    ? customDefensivePhrases
    : defaultDefensive;

  const defensiveMatches: string[] = [];
  for (const phrase of defensivePhrases) {
    if (normalizedText.includes(phrase.toLowerCase())) {
      defensiveMatches.push(phrase);
    }
  }

  const maliciousIndicators: string[] = [];
  if (hasUrl) {
    maliciousIndicators.push('External URL link detected');
  }
  if (isSuspiciousUrl) {
    maliciousIndicators.push('Suspicious URL structure detected');
  }
  if (hasInsecureHttp) {
    maliciousIndicators.push('Insecure HTTP link detected');
  }

  const threatKeywords = [
    'account blocked',
    'account suspended',
    'account will be closed',
    'account deactivated',
    'account frozen',
    'service terminated',
    'sim blocked',
    'electricity disconnected',
    'card blocked',
    'pan card blocked',
    'click here',
    'click the link',
    'click this link',
    'tap here',
    'download apk',
    'install app',
    'claim your prize',
    'claim cashback',
    'won a prize',
    'lottery winner',
    'share your otp with',
    'tell me your otp',
    'enter your upi pin to receive',
    'contact manager',
    'call officer immediately',
  ];

  for (const threat of threatKeywords) {
    if (matchesKeyword(normalizedText, threat) || normalizedText.includes(threat)) {
      maliciousIndicators.push(`Malicious indicator: "${threat}"`);
    }
  }

  const hasDefensivePhrase = defensiveMatches.length > 0;
  const hasMaliciousIndicators = maliciousIndicators.length > 0;
  const isPureAwareness = hasDefensivePhrase && !hasMaliciousIndicators;

  return {
    isPureAwareness,
    hasDefensivePhrase,
    hasMaliciousIndicators,
    defensiveMatches,
    maliciousIndicators,
  };
}

/**
 * Checks whether a keyword or phrase exists in normalized text with boundary protection.
 * Prevents false substring matches (e.g. "pin" in "shopping", "won" in "wonderful").
 */
export function matchesKeyword(normalizedText: string, keyword: string): boolean {
  if (!normalizedText || !keyword) return false;
  const trimmed = keyword.trim().toLowerCase();
  if (!trimmed) return false;

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  try {
    // Matches when preceded and followed by non-alphanumeric characters or start/end of string
    const regex = new RegExp(`(?:^|[^a-zA-Z0-9])${escaped}(?=[^a-zA-Z0-9]|$)`, 'i');
    return regex.test(normalizedText);
  } catch {
    return normalizedText.includes(trimmed);
  }
}

/**
 * LocalFraudFilter class
 */
export class LocalFraudFilter {
  private config: FraudKeywordsConfig;

  constructor(config: FraudKeywordsConfig = defaultFraudKeywordsData) {
    this.config = config;
  }

  /**
   * Updates or replaces the active keyword configuration
   */
  public setConfig(config: FraudKeywordsConfig): void {
    this.config = config;
  }

  /**
   * Retrieves the current configuration
   */
  public getConfig(): FraudKeywordsConfig {
    return this.config;
  }

  /**
   * Analyzes an incoming message locally and determines whether it should be forwarded to BERT.
   *
   * @param message Raw message string
   * @param customThreshold Optional custom threshold override (defaults to config.defaultThreshold)
   * @returns LocalFraudFilterResult
   */
  public analyze(message: string, customThreshold?: number): LocalFraudFilterResult {
    const rawText = message || '';
    const normalized = normalizeText(rawText);

    const threshold = customThreshold ?? this.config.defaultThreshold ?? 5;

    let score = 0;
    const matchedKeywords: string[] = [];
    const matchedCategoriesSet = new Set<string>();
    const matchedPatterns: string[] = [];
    const reasons: string[] = [];

    if (!normalized || normalized.length < 5) {
      return {
        score: 0,
        threshold,
        shouldSendToBackend: false,
        isSecurityAwareness: false,
        matchedKeywords: [],
        matchedCategories: [],
        matchedPatterns: [],
        hasUrl: false,
        reasons: ['Message is too short (< 5 chars) or empty'],
      };
    }

    // ── 1. Evaluate URL Signals First ────────────────────────────────────────
    const urlSignal = this.config.urlSignal;
    let hasUrl = false;
    let hasHttp = false;
    let isSuspiciousUrl = false;
    let urlCount = 0;

    const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(?:com|org|net|io|in|co|xyz|top|cc|bit\.ly|tinyurl\.com)[^\s]*)/gi;
    const detectedUrls = rawText.match(URL_REGEX) || [];
    urlCount = detectedUrls.length;
    hasUrl = urlCount > 0;

    if (hasUrl && urlSignal && urlSignal.enabled !== false) {
      const httpResult = httpRule(rawText);
      hasHttp = httpResult.triggered;

      const urlPatternResult = urlRule(rawText);
      isSuspiciousUrl = urlPatternResult.triggered;
    }

    // ── 2. Evaluate Security Awareness Context ──────────────────────────────
    const defensivePhrases = this.config.awarenessSignals?.defensivePhrases;
    const awarenessEval = evaluateSecurityAwareness(
      normalized,
      rawText,
      hasUrl,
      isSuspiciousUrl,
      hasHttp,
      defensivePhrases,
    );

    const isSecurityAwareness = awarenessEval.isPureAwareness;

    if (awarenessEval.hasDefensivePhrase && awarenessEval.hasMaliciousIndicators) {
      reasons.push(
        `Mixed-content warning: message combines security awareness wording with malicious indicators (${awarenessEval.maliciousIndicators.join('; ')}). Exemption voided.`,
      );
    } else if (isSecurityAwareness) {
      reasons.push(
        `Recognized legitimate security-awareness message advising against credential disclosure (${awarenessEval.defensiveMatches.join(', ')}). Sensitive keywords exempt.`,
      );
    }

    // ── 3. Evaluate Categories and Keywords ─────────────────────────────────
    const categories = this.config.categories || {};
    for (const [catKey, catConfig] of Object.entries(categories)) {
      // In pure security awareness messages, do not penalize credentials or common financial terms
      if (isSecurityAwareness && (catKey === 'credentials' || catKey === 'financial_common')) {
        continue;
      }

      const weight = catConfig.weight || 1;
      const keywords = catConfig.keywords || [];

      for (const kw of keywords) {
        if (matchesKeyword(normalized, kw)) {
          matchedKeywords.push(kw);
          matchedCategoriesSet.add(catKey);
          score += weight;
          reasons.push(`Matched keyword "${kw}" in [${catKey}] (+${weight})`);
        }
      }
    }

    // ── 4. Evaluate Multi-Keyword Combination Patterns ──────────────────────
    const patterns = this.config.patterns || [];
    for (const pattern of patterns) {
      const patternKeywords = pattern.keywords || [];
      if (patternKeywords.length === 0) continue;

      // Check negation keywords (e.g., "never share" negates "otp + share" pattern)
      if (pattern.negationKeywords && pattern.negationKeywords.length > 0) {
        const isNegated = pattern.negationKeywords.some(
          (neg) => matchesKeyword(normalized, neg) || normalized.includes(neg),
        );
        if (isNegated) {
          continue; // Pattern negated by defensive language
        }
      }

      const allMatch = patternKeywords.every((kw) => matchesKeyword(normalized, kw));
      if (allMatch) {
        matchedPatterns.push(pattern.name);
        score += pattern.weight;
        reasons.push(
          `Matched pattern "${pattern.name}" (${patternKeywords.join(' + ')}) (+${pattern.weight}) - ${pattern.description}`,
        );
      }
    }

    // ── 5. Add URL Signal Score (if URLs were detected) ─────────────────────
    if (hasUrl && urlSignal && urlSignal.enabled !== false) {
      let urlWeightToAdd = urlSignal.weight || 2;

      if (isSuspiciousUrl && urlSignal.weightSuspiciousPattern) {
        urlWeightToAdd = urlSignal.weightSuspiciousPattern;
        reasons.push(`Suspicious URL pattern detected (+${urlWeightToAdd})`);
      } else if (hasHttp && urlSignal.weightInsecureHttp) {
        urlWeightToAdd = urlSignal.weightInsecureHttp;
        reasons.push(`Insecure HTTP link detected (+${urlWeightToAdd})`);
      } else {
        reasons.push(`External URL detected (+${urlWeightToAdd})`);
      }

      score += urlWeightToAdd;
    }

    const shouldSendToBackend = score >= threshold;

    return {
      score,
      threshold,
      shouldSendToBackend,
      isSecurityAwareness,
      matchedKeywords,
      matchedCategories: Array.from(matchedCategoriesSet),
      matchedPatterns,
      hasUrl,
      urlDetails: hasUrl
        ? {
            hasHttp,
            isSuspiciousUrl,
            urlCount,
          }
        : undefined,
      reasons,
    };
  }
}

/**
 * Singleton instance of LocalFraudFilter
 */
export const localFraudFilter = new LocalFraudFilter();

/**
 * Standalone convenience helper matching conceptual API:
 *
 * ```typescript
 * const result = analyzeLocally(message);
 * console.log(result);
 * ```
 */
export function analyzeLocally(
  message: string,
  customThreshold?: number,
  customConfig?: FraudKeywordsConfig,
): LocalFraudFilterResult {
  if (customConfig) {
    const customFilter = new LocalFraudFilter(customConfig);
    return customFilter.analyze(message, customThreshold);
  }
  return localFraudFilter.analyze(message, customThreshold);
}
