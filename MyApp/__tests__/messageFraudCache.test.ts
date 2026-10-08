/**
 * Unit Tests for Local Message Fraud Detection Cache and Processor Flow
 */

import { generateMessageHash, sha256 } from '../src/fraudDetection/cache/hashUtils';
import {
  MessageFraudCache,
  CACHE_TTL_MS,
  FraudCacheEntry,
} from '../src/fraudDetection/cache/messageFraudCache';
import {
  MessageFraudProcessor,
  ProcessMessageOptions,
} from '../src/fraudDetection/messageFraudProcessor';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
}));

// Mock react-native NativeModules and Alert
jest.mock('react-native', () => ({
  NativeModules: {
    AccessibilityBridgeModule: {
      showFraudOverlay: jest.fn(),
    },
  },
  Alert: {
    alert: jest.fn(),
  },
  Platform: {
    OS: 'android',
  },
}));

describe('1. Stable Message Hash Generator', () => {
  it('generates a consistent 64-character SHA-256 hex hash', () => {
    const text = 'Congratulations! You have won ₹50,000 lottery! Click here: http://bit.ly/prize';
    const hash1 = generateMessageHash(text);
    const hash2 = generateMessageHash(text);

    expect(hash1).toBeDefined();
    expect(hash1.length).toBe(64);
    expect(hash1).toBe(hash2);
  });

  it('handles surrounding whitespace and carriage returns deterministically', () => {
    const raw1 = '  Verify your bank account now: http://phish.com  \r\n';
    const raw2 = 'Verify your bank account now: http://phish.com\n';

    const hash1 = generateMessageHash(raw1);
    const hash2 = generateMessageHash(raw2);

    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different messages', () => {
    const msgA = 'Hey, what time are we meeting?';
    const msgB = 'URGENT: Your account has been suspended.';

    expect(generateMessageHash(msgA)).not.toBe(generateMessageHash(msgB));
  });

  it('matches known test vector for sha256', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('2. Local Message Fraud Detection Cache', () => {
  let cache: MessageFraudCache;

  beforeEach(() => {
    // Disable persistence in tests to test in-memory logic directly
    cache = new MessageFraudCache(CACHE_TTL_MS, false);
  });

  it('stores and retrieves cache entries with required fields', () => {
    const hash = 'sample-hash-12345';
    const now = 100000000;

    const entry = cache.set(
      {
        messageHash: hash,
        riskScore: 0.94,
        classification: 'FRAUD',
        timestamp: now,
      },
      now,
    );

    expect(entry.messageHash).toBe(hash);
    expect(entry.riskScore).toBe(0.94);
    expect(entry.classification).toBe('FRAUD');
    expect(entry.timestamp).toBe(now);

    const retrieved = cache.get(hash, now);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.messageHash).toBe(hash);
    expect(retrieved?.riskScore).toBe(0.94);
    expect(retrieved?.classification).toBe('FRAUD');
    expect(retrieved?.timestamp).toBe(now);
  });

  it('verifies cache TTL is exactly 15 minutes (900,000 ms)', () => {
    expect(CACHE_TTL_MS).toBe(15 * 60 * 1000);
  });

  it('evicts entry when TTL (15 minutes) has expired', () => {
    const hash = 'expiry-test-hash';
    const t0 = 1700000000000; // 10:00 AM

    // Store at t0
    cache.set(
      {
        messageHash: hash,
        riskScore: 0.88,
        classification: 'FRAUD',
        timestamp: t0,
      },
      t0,
    );

    // Check at t0 + 5 minutes (10:05 AM): Still valid
    const t5 = t0 + 5 * 60 * 1000;
    expect(cache.has(hash, t5)).toBe(true);
    expect(cache.get(hash, t5)).not.toBeNull();

    // Check at t0 + 14 minutes 59 seconds: Still valid
    const t14m59s = t0 + 14 * 60 * 1000 + 59 * 1000;
    expect(cache.has(hash, t14m59s)).toBe(true);

    // Check at t0 + 15 minutes (10:15 AM) or 16 minutes (10:16 AM): Expired!
    const t16 = t0 + 16 * 60 * 1000;
    expect(cache.get(hash, t16)).toBeNull();
    expect(cache.has(hash, t16)).toBe(false);

    // Expired entry was removed from cache
    expect(cache.size(t16)).toBe(0);
  });

  it('removeExpired sweeps all stale entries', () => {
    const t0 = 10000000;

    cache.set({ messageHash: 'h1', riskScore: 0.9, classification: 'FRAUD', timestamp: t0 }, t0);
    cache.set({ messageHash: 'h2', riskScore: 0.1, classification: 'NOT_FRAUD', timestamp: t0 + 10 * 60 * 1000 }, t0);

    // At t0 + 16 minutes: h1 is expired, h2 is still valid (6 mins old)
    const t16 = t0 + 16 * 60 * 1000;
    const removed = cache.removeExpired(t16);

    expect(removed).toBe(1);
    expect(cache.has('h1', t16)).toBe(false);
    expect(cache.has('h2', t16)).toBe(true);
  });

  it('does not store the raw message text in the cache entry', () => {
    const entry = cache.set({
      messageHash: 'abc',
      riskScore: 0.5,
      classification: 'NOT_FRAUD',
    });

    expect((entry as any).text).toBeUndefined();
    expect((entry as any).message).toBeUndefined();
  });

  it('can be toggled ON and OFF for development/testing', async () => {
    const hash = 'test-toggle-hash';
    expect(cache.isEnabled()).toBe(true);

    // Disable cache
    await cache.setEnabled(false);
    expect(cache.isEnabled()).toBe(false);

    // When disabled, setting doesn't store
    cache.set({ messageHash: hash, riskScore: 0.9, classification: 'FRAUD' });
    expect(cache.get(hash)).toBeNull();
    expect(cache.has(hash)).toBe(false);

    // Re-enable cache
    await cache.setEnabled(true);
    expect(cache.isEnabled()).toBe(true);

    // Now setting stores normally
    cache.set({ messageHash: hash, riskScore: 0.9, classification: 'FRAUD' });
    expect(cache.get(hash)).not.toBeNull();
    expect(cache.has(hash)).toBe(true);
  });
});

describe('3. Required Processing Flow (10:00 AM -> 10:05 AM -> 10:16 AM Example)', () => {
  let mockApi: any;
  let cache: MessageFraudCache;
  let processor: MessageFraudProcessor;
  let alertCallback: jest.Mock;

  const testMessage = 'URGENT: Your bank account will be suspended! Verify here: http://bad.com';

  beforeEach(() => {
    jest.clearAllMocks();

    cache = new MessageFraudCache(CACHE_TTL_MS, false);

    mockApi = {
      analyzeMessage: jest.fn().mockResolvedValue({
        success: true,
        data: {
          text: testMessage,
          threshold: 0.7,
          mlAvailable: true,
          mlResult: {
            fraudScore: 0.94,
            prediction: 'FRAUD',
            confidence: 0.95,
            inferenceTimeMs: 35,
            isFraud: true,
            riskLevel: 'FRAUD',
          },
        },
      }),
    };

    processor = new MessageFraudProcessor(cache, mockApi);
    alertCallback = jest.fn();
  });

  it('Step 1 (10:00 AM): Not in cache -> Send to backend -> Store in cache -> Alert user', async () => {
    const options: ProcessMessageOptions = {
      source: 'SMS',
      onAlert: alertCallback,
    };

    const result = await processor.processMessage(testMessage, options);

    // Backend was called
    expect(mockApi.analyzeMessage).toHaveBeenCalledTimes(1);
    expect(mockApi.analyzeMessage).toHaveBeenCalledWith(testMessage);

    // Stored in cache
    expect(result.cached).toBe(false);
    expect(result.status).toBe('PROCESSED_FRAUD');
    expect(result.riskScore).toBe(0.94);
    expect(result.classification).toBe('FRAUD');
    expect(result.alertShown).toBe(true);

    // Alert triggered
    expect(alertCallback).toHaveBeenCalledTimes(1);
    expect(alertCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        riskScore: 0.94,
        classification: 'FRAUD',
      }),
    );

    // Cache now holds the message hash
    const hash = generateMessageHash(testMessage);
    expect(cache.has(hash)).toBe(true);
  });

  it('Step 2 (10:05 AM): Same message detected -> Cache valid -> DO NOTHING (No backend request, No user alert)', async () => {
    const options: ProcessMessageOptions = {
      source: 'SMS',
      onAlert: alertCallback,
    };

    // First call at 10:00 AM
    await processor.processMessage(testMessage, options);
    expect(mockApi.analyzeMessage).toHaveBeenCalledTimes(1);
    expect(alertCallback).toHaveBeenCalledTimes(1);

    // Second call at 10:05 AM with same message
    const result2 = await processor.processMessage(testMessage, options);

    // Cache hit!
    expect(result2.cached).toBe(true);
    expect(result2.status).toBe('CACHED');
    expect(result2.alertShown).toBe(false);

    // Backend API was NOT called again
    expect(mockApi.analyzeMessage).toHaveBeenCalledTimes(1);

    // User alert was NOT triggered again
    expect(alertCallback).toHaveBeenCalledTimes(1);
  });

  it('Step 3 (10:16 AM): Same message detected -> Cache entry expired -> Remove entry -> Send to backend -> Store new result -> Alert user', async () => {
    const options: ProcessMessageOptions = {
      source: 'SMS',
      onAlert: alertCallback,
    };

    // 10:00 AM: Process message
    await processor.processMessage(testMessage, options);
    expect(mockApi.analyzeMessage).toHaveBeenCalledTimes(1);

    // Simulate 16 minutes passing (expire entry)
    const hash = generateMessageHash(testMessage);
    const existing = cache.get(hash);
    expect(existing).not.toBeNull();

    // Manually backdate entry timestamp by 16 minutes
    if (existing) {
      existing.timestamp = Date.now() - 16 * 60 * 1000;
    }

    // 10:16 AM: Same message arrives after 16 minutes
    const result3 = await processor.processMessage(testMessage, options);

    // Not cached because it expired
    expect(result3.cached).toBe(false);
    expect(result3.status).toBe('PROCESSED_FRAUD');

    // Backend called again (total 2 calls)
    expect(mockApi.analyzeMessage).toHaveBeenCalledTimes(2);

    // Alert triggered again (total 2 alerts)
    expect(alertCallback).toHaveBeenCalledTimes(2);

    // Cache has been refreshed with a fresh timestamp
    const refreshed = cache.get(hash);
    expect(refreshed).not.toBeNull();
    expect(Date.now() - refreshed!.timestamp).toBeLessThan(1000);
  });

  it('Handles legitimate / non-fraudulent messages correctly (cached, but no alert)', async () => {
    mockApi.analyzeMessage.mockResolvedValueOnce({
      success: true,
      data: {
        text: 'Hey buddy, are we still playing badminton at 6pm?',
        threshold: 0.7,
        mlAvailable: true,
        mlResult: {
          fraudScore: 0.05,
          prediction: 'NOT_FRAUD',
          confidence: 0.99,
          inferenceTimeMs: 25,
          isFraud: false,
          riskLevel: 'LEGITIMATE',
        },
      },
    });

    const legMessage = 'Hey buddy, are we still playing badminton at 6pm?';
    const result = await processor.processMessage(legMessage, { onAlert: alertCallback, skipLocalFilter: true });

    expect(result.status).toBe('PROCESSED_LEGITIMATE');
    expect(result.alertShown).toBe(false);
    expect(alertCallback).not.toHaveBeenCalled();

    // Legitimate message is also cached so backend is not bombarded repeatedly
    const hash = generateMessageHash(legMessage);
    expect(cache.has(hash)).toBe(true);

    // Immediate second call
    const result2 = await processor.processMessage(legMessage, { onAlert: alertCallback, skipLocalFilter: true });
    expect(result2.cached).toBe(true);
    expect(mockApi.analyzeMessage).toHaveBeenCalledTimes(1);
  });

  it('Stage 1 pre-filters normal messages without calling backend', async () => {
    const normalMessage = 'Hey, are you coming to college tomorrow?';
    const result = await processor.processMessage(normalMessage, { onAlert: alertCallback });

    expect(result.status).toBe('FILTERED_LOW_RISK');
    expect(result.alertShown).toBe(false);
    expect(result.localFilterResult?.shouldSendToBackend).toBe(false);
    expect(result.localFilterResult?.score).toBe(0);

    // Backend API was NEVER called
    expect(mockApi.analyzeMessage).not.toHaveBeenCalled();
    expect(alertCallback).not.toHaveBeenCalled();
  });

  it('Is modular and supports WhatsApp and SMS channels', async () => {
    const smsResult = await processor.processMessage('Win cash now! http://scam.cc', {
      source: 'SMS',
      sender: '+919876543210',
    });
    expect(smsResult.status).toBe('PROCESSED_FRAUD');

    const waResult = await processor.processMessage('Work from home earn 50k daily! http://wa.cc', {
      source: 'WHATSAPP',
      sender: 'Unknown Business',
    });
    expect(waResult.status).toBe('PROCESSED_FRAUD');
  });
});
