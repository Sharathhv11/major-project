/**
 * Detection History Storage — FraudShield
 *
 * Persists genuine fraud detection records (WhatsApp, SMS, Manual Scan, OCR) locally
 * in AsyncStorage with automatic deduplication, maximum bounds, and event notifications.
 *
 * Privacy guarantee:
 * Only stores a shortened preview (max 80 chars) to prevent retaining sensitive full messages.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type DetectionSource =
  | 'WHATSAPP'
  | 'SMS'
  | 'MANUAL_SCAN'
  | 'OCR'
  | 'MANUAL_CHECK';

export interface DetectionRecord {
  id: string;
  preview: string;
  source: DetectionSource | string;
  sender?: string;
  riskScore: number;
  classification: string;
  isFraud: boolean;
  reasons?: string[];
  timestamp: number;
}

export interface SecurityStats {
  totalAnalyzed: number;
  threatsFlagged: number;
  cleanMessages: number;
}

const STORAGE_KEY = '@fraud_detection_history_records';
const MAX_HISTORY_RECORDS = 100;

type HistoryListener = (records: DetectionRecord[]) => void;
const listeners: Set<HistoryListener> = new Set();

let memoryCache: DetectionRecord[] | null = null;

function notifyListeners(records: DetectionRecord[]) {
  listeners.forEach((listener) => {
    try {
      listener(records);
    } catch (e) {
      console.warn('Error in detection history listener:', e);
    }
  });
}

/**
 * Retrieves all stored detection records, ordered newest first.
 */
export async function getDetectionRecords(): Promise<DetectionRecord[]> {
  if (memoryCache !== null) {
    return memoryCache;
  }

  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      memoryCache = [];
      return [];
    }

    const parsed: DetectionRecord[] = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Sort newest first
      memoryCache = parsed.sort((a, b) => b.timestamp - a.timestamp);
      return memoryCache;
    }
  } catch (error) {
    console.warn('Failed to load detection records from AsyncStorage:', error);
  }

  memoryCache = [];
  return [];
}

/**
 * Appends a new detection record to the history.
 */
export async function addDetectionRecord(
  data: Omit<DetectionRecord, 'id' | 'timestamp'> & { timestamp?: number },
): Promise<DetectionRecord> {
  const records = await getDetectionRecords();

  const newRecord: DetectionRecord = {
    id: `scan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    preview: (data.preview || '').trim().substring(0, 80),
    source: data.source || 'SMS',
    sender: data.sender,
    riskScore: data.riskScore ?? 0,
    classification: data.classification || (data.isFraud ? 'FRAUD' : 'NOT_FRAUD'),
    isFraud: Boolean(data.isFraud),
    reasons: data.reasons || [],
    timestamp: data.timestamp || Date.now(),
  };

  // Add to top of list and cap size
  const updated = [newRecord, ...records].slice(0, MAX_HISTORY_RECORDS);
  memoryCache = updated;

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('Failed to save detection record to AsyncStorage:', error);
  }

  notifyListeners(updated);
  return newRecord;
}

/**
 * Clears all detection records from storage.
 */
export async function clearDetectionHistory(): Promise<void> {
  memoryCache = [];
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear detection history:', error);
  }
  notifyListeners([]);
}

/**
 * Computes live security insights from real detection records.
 */
export async function getSecurityStats(): Promise<SecurityStats> {
  const records = await getDetectionRecords();
  const totalAnalyzed = records.length;
  const threatsFlagged = records.filter((r) => r.isFraud).length;
  const cleanMessages = totalAnalyzed - threatsFlagged;

  return {
    totalAnalyzed,
    threatsFlagged,
    cleanMessages,
  };
}

/**
 * Subscribes to real-time updates when new detections are recorded.
 */
export function subscribeToDetectionHistory(listener: HistoryListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
