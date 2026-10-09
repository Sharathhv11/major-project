/**
 * Message Fraud Processor
 *
 * Modular orchestration service that implements the message fraud detection flow:
 *
 * Message detected
 *       ↓
 * Generate unique hash/ID for the message
 *       ↓
 * Check local cache
 *       ↓
 * Is message already cached and not expired?
 *       │
 *       ├── YES → Do nothing (No backend request, No user alert)
 *       │
 *       └── NO
 *            ↓
 *       Send message to backend
 *            ↓
 *       Receive fraud classification + risk score
 *            ↓
 *       Store result in local cache
 *            ↓
 *       If fraudulent/high risk → Alert the user
 */

import { Alert, NativeModules } from 'react-native';
import fraudApi, { FraudAnalysisResponse } from '../api/fraudApi';
import { generateMessageHash } from './cache/hashUtils';
import {
  FraudCacheEntry,
  MessageFraudCache,
  messageFraudCache,
} from './cache/messageFraudCache';
import {
  LocalFraudFilter,
  localFraudFilter,
  LocalFraudFilterResult,
} from './localFraudFilter';
import { addDetectionRecord } from '../storage/detectionHistoryStorage';

const { AccessibilityBridgeModule } = NativeModules;

export type MessageSource = 'WHATSAPP' | 'SMS' | 'NOTIFICATION' | 'ACCESSIBILITY' | 'SYSTEM' | string;

export interface ProcessMessageOptions {
  /**
   * Source channel of the incoming message (e.g. WHATSAPP, SMS)
   */
  source?: MessageSource;
  /**
   * Sender identifier (phone number, contact name)
   */
  sender?: string;
  /**
   * Custom alert handler (if provided, overrides default native overlay/Alert)
   */
  onAlert?: (alertData: FraudAlertPayload) => void;
  /**
   * Explicit threshold override; if omitted, backend threshold is used (default 0.70)
   */
  threshold?: number;
  /**
   * Custom threshold override for the Stage 1 local keyword/pattern pre-filter (default: 5)
   */
  localThreshold?: number;
  /**
   * If true, skips Stage 1 local keyword filter and sends directly to backend (for testing or overrides)
   */
  skipLocalFilter?: boolean;
}

export interface FraudAlertPayload {
  title: string;
  explanation: string;
  rawText: string;
  riskScore: number;
  classification: string;
  threshold: number;
  source?: MessageSource;
  sender?: string;
}

export type ProcessingStatus =
  | 'CACHED'
  | 'FILTERED_LOW_RISK'
  | 'PROCESSED_FRAUD'
  | 'PROCESSED_LEGITIMATE'
  | 'SKIPPED_EMPTY'
  | 'ERROR';

export interface ProcessMessageResult {
  status: ProcessingStatus;
  messageHash: string;
  cached: boolean;
  alertShown: boolean;
  localFilterResult?: LocalFraudFilterResult;
  cacheEntry?: FraudCacheEntry;
  riskScore?: number;
  classification?: string;
  error?: string;
}

export class MessageFraudProcessor {
  private cache: MessageFraudCache;
  private api: typeof fraudApi;
  private localFilter: LocalFraudFilter;

  constructor(
    cache: MessageFraudCache = messageFraudCache,
    api: typeof fraudApi = fraudApi,
    localFilter: LocalFraudFilter = localFraudFilter,
  ) {
    this.cache = cache;
    this.api = api;
    this.localFilter = localFilter;
  }

  /**
   * Main entry point to process an incoming message through the fraud detection flow.
   *
   * @param message Raw text of the incoming message
   * @param options Optional metadata such as message source (SMS, WhatsApp) and sender
   * @returns ProcessMessageResult detailing the action taken
   */
  public async processMessage(
    message: string,
    options: ProcessMessageOptions = {},
  ): Promise<ProcessMessageResult> {
    // 1. Validation check
    const trimmedText = (message || '').trim();
    if (!trimmedText || trimmedText.length < 5) {
      return {
        status: 'SKIPPED_EMPTY',
        messageHash: '',
        cached: false,
        alertShown: false,
      };
    }

    // 2. Generate unique stable hash/ID for the message
    const messageHash = generateMessageHash(trimmedText);

    // 3. Check local cache (get() automatically removes expired entries)
    const cachedEntry = this.cache.get(messageHash);

    // 4. Is message already cached and not expired?
    if (cachedEntry) {
      // YES → Do nothing: No backend request, No user alert
      return {
        status: 'CACHED',
        messageHash,
        cached: true,
        alertShown: false,
        cacheEntry: cachedEntry,
        riskScore: cachedEntry.riskScore,
        classification: cachedEntry.classification,
      };
    }

    // 5. Stage 1: Lightweight Local Fraud Filter (Pre-filter before BERT)
    let localFilterResult: LocalFraudFilterResult | undefined;
    if (!options.skipLocalFilter) {
      localFilterResult = this.localFilter.analyze(trimmedText, options.localThreshold);

      if (!localFilterResult.shouldSendToBackend) {
        // Local score < threshold: Message is not sufficiently suspicious.
        // Ignore and DO NOT call backend (reduces backend load and eliminates false positives).
        return {
          status: 'FILTERED_LOW_RISK',
          messageHash,
          cached: false,
          alertShown: false,
          localFilterResult,
          riskScore: 0,
          classification: 'NOT_FRAUD',
        };
      }
    }

    // 6. Stage 2: Send message to backend (BERT model)
    try {
      const response: FraudAnalysisResponse = await this.api.analyzeMessage(
        trimmedText,
      );

      if (!response.success || !response.data) {
        throw new Error(response.message || 'Fraud analysis failed on backend');
      }

      // Receive fraud classification + risk score
      const { mlResult, threshold: backendThreshold } = response.data;
      const effectiveThreshold = options.threshold ?? backendThreshold ?? 0.7;

      const riskScore = mlResult ? mlResult.fraudScore : 0;
      const classification = mlResult
        ? mlResult.prediction || (mlResult.isFraud ? 'FRAUD' : 'NOT_FRAUD')
        : 'NOT_FRAUD';

      const isFraudulent = Boolean(
        mlResult &&
          (mlResult.isFraud ||
            riskScore >= effectiveThreshold ||
            classification === 'FRAUD' ||
            mlResult.riskLevel === 'FRAUD' ||
            mlResult.riskLevel === 'SUSPICIOUS'),
      );

      // Store result in local cache
      const newCacheEntry = this.cache.set({
        messageHash,
        riskScore,
        classification,
        timestamp: Date.now(),
      });

      // If fraudulent/high risk → Alert the user
      let alertShown = false;
      if (isFraudulent) {
        await this.triggerAlert(trimmedText, riskScore, classification, effectiveThreshold, options);
        alertShown = true;
      }

      // Record detection in persistent history
      addDetectionRecord({
        preview: trimmedText.length > 80 ? trimmedText.substring(0, 80) + '...' : trimmedText,
        source: (options.source as any) || 'SMS',
        sender: options.sender,
        riskScore,
        classification,
        isFraud: isFraudulent,
        reasons: localFilterResult?.reasons,
        timestamp: Date.now(),
      }).catch((err) => {
        console.warn('Failed to record detection in history:', err);
      });

      return {
        status: isFraudulent ? 'PROCESSED_FRAUD' : 'PROCESSED_LEGITIMATE',
        messageHash,
        cached: false,
        alertShown,
        localFilterResult,
        cacheEntry: newCacheEntry,
        riskScore,
        classification,
      };
    } catch (error: any) {
      console.warn('Backend fraud analysis request failed:', error?.message || error);
      return {
        status: 'ERROR',
        messageHash,
        cached: false,
        alertShown: false,
        localFilterResult,
        error: error?.message || 'Network or analysis error',
      };
    }
  }

  /**
   * Getter for direct local filter operations (e.g. tests, debugging, inspecting keywords)
   */
  public getLocalFilter(): LocalFraudFilter {
    return this.localFilter;
  }

  /**
   * Alerts the user when a high-risk or fraudulent message is detected.
   */
  private async triggerAlert(
    rawText: string,
    riskScore: number,
    classification: string,
    threshold: number,
    options: ProcessMessageOptions,
  ): Promise<void> {
    const channelLabel = options.source ? ` (${options.source})` : '';
    const title = `AI Fraud Alert: Suspicious Message Detected${channelLabel}`;
    const scorePct = (riskScore * 100).toFixed(0);
    const thresholdPct = (threshold * 100).toFixed(0);

    const explanation =
      `Our AI fraud detection model flagged this message with a fraud probability of ` +
      `${scorePct}% (threshold: ${thresholdPct}%). ` +
      `Classification: ${classification}. Avoid clicking links or sharing personal information.`;

    const alertPayload: FraudAlertPayload = {
      title,
      explanation,
      rawText,
      riskScore,
      classification,
      threshold,
      source: options.source,
      sender: options.sender,
    };

    // If caller provided a custom alert callback, invoke it
    if (options.onAlert) {
      options.onAlert(alertPayload);
      return;
    }

    let overlayShown = false;
    // Primary: Native accessibility overlay if available and permission is granted
    if (AccessibilityBridgeModule && AccessibilityBridgeModule.showFraudOverlay) {
      try {
        let hasOverlayPermission = true;
        if (AccessibilityBridgeModule.isOverlayPermissionGranted) {
          hasOverlayPermission = await AccessibilityBridgeModule.isOverlayPermissionGranted();
        }

        if (hasOverlayPermission) {
          AccessibilityBridgeModule.showFraudOverlay(title, explanation, rawText);
          overlayShown = true;
        }
      } catch (err) {
        console.warn('Could not display native overlay, falling back to Alert:', err);
      }
    }

    // Fallback: If overlay was not shown (no permission or error), display standard React Native Alert modal
    if (!overlayShown) {
      Alert.alert(
        title,
        `${explanation}\n\n"${rawText.length > 120 ? rawText.substring(0, 120) + '...' : rawText}"`,
        [{ text: 'Dismiss', style: 'cancel' }],
      );
    }
  }

  /**
   * Getter for direct cache operations (e.g., tests, debugging, manual invalidation)
   */
  public getCache(): MessageFraudCache {
    return this.cache;
  }
}

/**
 * Singleton instance of MessageFraudProcessor
 */
export const messageFraudProcessor = new MessageFraudProcessor(
  messageFraudCache,
  fraudApi,
);
export default messageFraudProcessor;
