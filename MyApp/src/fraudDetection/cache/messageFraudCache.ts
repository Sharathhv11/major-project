/**
 * Local Message Fraud Detection Cache
 *
 * Implements a device-local cache with a 15-minute TTL to prevent duplicate
 * backend API calls and repetitive alerts for previously analyzed messages.
 *
 * Privacy guarantee: Only stores the message hash, risk score, classification,
 * and timestamp. The raw message text is never persisted for caching purposes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cache entry structure
 */
export interface FraudCacheEntry {
  messageHash: string;
  riskScore: number;
  classification: 'FRAUD' | 'NOT_FRAUD' | string;
  timestamp: number;
}

/**
 * 15 minutes cache time-to-live in milliseconds
 */
export const CACHE_TTL_MS = 15 * 60 * 1000; // 900,000 ms

/**
 * Storage key for persisting the cache locally on the device
 */
const STORAGE_KEY = '@fraud_detection_message_cache';
const ENABLED_STORAGE_KEY = '@fraud_detection_cache_enabled';

/**
 * Maximum entries to retain in the cache to bound memory consumption
 */
const MAX_CACHE_ENTRIES = 200;

export class MessageFraudCache {
  private inMemoryCache: Map<string, FraudCacheEntry> = new Map();
  private ttlMs: number;
  private isInitialized: boolean = false;
  private persistenceEnabled: boolean = true;
  private isCacheEnabled: boolean = true;

  constructor(ttlMs: number = CACHE_TTL_MS, persistenceEnabled: boolean = true) {
    this.ttlMs = ttlMs;
    this.persistenceEnabled = persistenceEnabled;
  }

  /**
   * Initializes the cache by hydrating from AsyncStorage if available.
   * Expired entries are automatically stripped during hydration.
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized || !this.persistenceEnabled) {
      return;
    }

    try {
      const enabledVal = await AsyncStorage.getItem(ENABLED_STORAGE_KEY);
      if (enabledVal !== null) {
        this.isCacheEnabled = JSON.parse(enabledVal) === true;
      }

      const serialized = await AsyncStorage.getItem(STORAGE_KEY);
      if (serialized) {
        const parsed: FraudCacheEntry[] = JSON.parse(serialized);
        const now = Date.now();

        if (Array.isArray(parsed)) {
          for (const entry of parsed) {
            if (
              entry &&
              typeof entry.messageHash === 'string' &&
              typeof entry.timestamp === 'number' &&
              now - entry.timestamp < this.ttlMs
            ) {
              this.inMemoryCache.set(entry.messageHash, entry);
            }
          }
        }
      }
      this.isInitialized = true;
    } catch (e) {
      // In-memory cache continues to function seamlessly if AsyncStorage fails
      console.warn('Failed to load message fraud cache from AsyncStorage:', e);
      this.isInitialized = true;
    }
  }

  /**
   * Checks whether an entry is expired.
   */
  /**
   * Checks whether the fraud detection cache is enabled.
   */
  public isEnabled(): boolean {
    return this.isCacheEnabled;
  }

  /**
   * Enables or disables the fraud detection cache (e.g. for development/testing).
   */
  public async setEnabled(enabled: boolean): Promise<void> {
    this.isCacheEnabled = enabled;
    if (this.persistenceEnabled) {
      try {
        await AsyncStorage.setItem(ENABLED_STORAGE_KEY, JSON.stringify(enabled));
      } catch (e) {
        console.warn('Failed to save cache enabled state to AsyncStorage:', e);
      }
    }
  }

  /**
   * Checks whether an entry is expired.
   */
  public isExpired(entry: FraudCacheEntry, currentTime: number = Date.now()): boolean {
    return currentTime - entry.timestamp >= this.ttlMs;
  }

  /**
   * Retrieves a cache entry by message hash.
   * If the entry exists but has expired, it is automatically removed and null is returned.
   * If the cache is disabled, always returns null.
   *
   * @param messageHash Unique stable hash of the message
   * @returns Non-expired FraudCacheEntry, or null if not found, expired, or cache disabled
   */
  public get(messageHash: string, currentTime: number = Date.now()): FraudCacheEntry | null {
    if (!this.isCacheEnabled || !messageHash) {
      return null;
    }

    const entry = this.inMemoryCache.get(messageHash);
    if (!entry) {
      return null;
    }

    // Check expiration (15-minute TTL)
    if (this.isExpired(entry, currentTime)) {
      // Evict expired entry immediately
      this.inMemoryCache.delete(messageHash);
      this.persistToStorage();
      return null;
    }

    return entry;
  }

  /**
   * Checks if a message is present in the cache and not expired.
   *
   * @param messageHash Unique stable hash of the message
   * @returns true if cached and valid; false otherwise
   */
  public has(messageHash: string, currentTime: number = Date.now()): boolean {
    return this.get(messageHash, currentTime) !== null;
  }

  /**
   * Stores a fraud detection result in the local cache.
   * If the cache is disabled, returns entry without persisting to memory/storage.
   *
   * @param entry Data to store (messageHash, riskScore, classification, optional timestamp)
   */
  public set(
    data: {
      messageHash: string;
      riskScore: number;
      classification: string;
      timestamp?: number;
    },
    currentTime: number = Date.now()
  ): FraudCacheEntry {
    const entry: FraudCacheEntry = {
      messageHash: data.messageHash,
      riskScore: data.riskScore,
      classification: data.classification,
      timestamp: data.timestamp ?? currentTime,
    };

    if (!this.isCacheEnabled) {
      return entry;
    }

    // Clean up any stale entries before adding
    this.removeExpired(currentTime);

    // Evict oldest entry if size limit exceeded
    if (this.inMemoryCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.inMemoryCache.keys().next().value;
      if (oldestKey) {
        this.inMemoryCache.delete(oldestKey);
      }
    }

    this.inMemoryCache.set(entry.messageHash, entry);
    this.persistToStorage();

    return entry;
  }

  /**
   * Removes an entry from the cache by its message hash.
   */
  public delete(messageHash: string): boolean {
    const deleted = this.inMemoryCache.delete(messageHash);
    if (deleted) {
      this.persistToStorage();
    }
    return deleted;
  }

  /**
   * Evicts all expired entries from the cache.
   *
   * @returns The number of expired entries removed
   */
  public removeExpired(currentTime: number = Date.now()): number {
    let removedCount = 0;
    for (const [hash, entry] of this.inMemoryCache.entries()) {
      if (this.isExpired(entry, currentTime)) {
        this.inMemoryCache.delete(hash);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      this.persistToStorage();
    }

    return removedCount;
  }

  /**
   * Clears the entire cache from both memory and local storage.
   */
  public clear(): void {
    this.inMemoryCache.clear();
    this.persistToStorage();
  }

  /**
   * Returns current count of valid (non-expired) entries in the cache.
   */
  public size(currentTime: number = Date.now()): number {
    this.removeExpired(currentTime);
    return this.inMemoryCache.size;
  }

  /**
   * Returns all active non-expired entries in the cache.
   */
  public getAll(currentTime: number = Date.now()): FraudCacheEntry[] {
    this.removeExpired(currentTime);
    return Array.from(this.inMemoryCache.values());
  }

  /**
   * Persists the current in-memory cache to local storage asynchronously.
   * Never stores raw message contents.
   */
  private async persistToStorage(): Promise<void> {
    if (!this.persistenceEnabled) {
      return;
    }

    try {
      const entries = Array.from(this.inMemoryCache.values());
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      // Non-blocking warning
      console.warn('Failed to save message fraud cache to AsyncStorage:', e);
    }
  }
}

/**
 * Default singleton instance with standard 15-minute TTL
 */
export const messageFraudCache = new MessageFraudCache(CACHE_TTL_MS, true);
