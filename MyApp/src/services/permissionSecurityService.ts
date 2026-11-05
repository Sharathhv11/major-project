/**
 * Permission Security Service — FraudShield
 *
 * Manages detected website permission events, local persistence via AsyncStorage,
 * native event listening from UrlAccessibilityService, and sample demonstration data.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter, NativeEventEmitter, NativeModules, Platform } from 'react-native';

const STORAGE_KEY = '@fraudshield_permission_history';

export interface WebsitePermissionRecord {
  id: string;
  domain: string;
  url: string;
  permissionType: 'camera' | 'microphone' | 'location' | 'camera & microphone' | string;
  trustLevel: 'VERIFIED' | 'SUSPICIOUS' | 'UNKNOWN' | string;
  browser: string;
  timestamp: number;
  explanation: string;
  actionStatus: 'ALLOWED' | 'DENIED' | 'REVIEWED' | 'PENDING';
}

const INITIAL_DEMO_RECORDS: WebsitePermissionRecord[] = [
  {
    id: 'perm_demo_1',
    domain: 'meet.google.com',
    url: 'https://meet.google.com',
    permissionType: 'camera & microphone',
    trustLevel: 'VERIFIED',
    browser: 'Google Chrome',
    timestamp: Date.now() - 1000 * 60 * 18, // 18 mins ago
    explanation: 'Camera and microphone requested for video conferencing. Legitimate use case for verified communication service.',
    actionStatus: 'ALLOWED',
  },
  {
    id: 'perm_demo_2',
    domain: 'instant-crypto-rewards.top',
    url: 'http://instant-crypto-rewards.top/claim',
    permissionType: 'camera',
    trustLevel: 'SUSPICIOUS',
    browser: 'Google Chrome',
    timestamp: Date.now() - 1000 * 60 * 75, // 1 hour 15 mins ago
    explanation: 'Unencrypted HTTP site requested device camera access without video service context. High risk of unconsented photo capture.',
    actionStatus: 'DENIED',
  },
  {
    id: 'perm_demo_3',
    domain: 'quick-parcel-tracker.net',
    url: 'https://quick-parcel-tracker.net',
    permissionType: 'location',
    trustLevel: 'UNKNOWN',
    browser: 'Samsung Internet',
    timestamp: Date.now() - 1000 * 60 * 60 * 4, // 4 hours ago
    explanation: 'Precise GPS location requested. Third-party unverified tracker could harvest movement coordinates.',
    actionStatus: 'DENIED',
  },
];

export const permissionSecurityService = {
  /**
   * Retrieves all historical permission requests from local storage.
   */
  async getPermissionHistory(): Promise<WebsitePermissionRecord[]> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY);
      if (!json) {
        // Seed initial demo entries for seamless demonstration
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DEMO_RECORDS));
        return INITIAL_DEMO_RECORDS;
      }
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('[PermissionSecurityService] Failed to load history:', e);
      return INITIAL_DEMO_RECORDS;
    }
  },

  /**
   * Saves or prepends a newly detected permission request to history.
   */
  async recordPermissionRequest(
    data: Omit<WebsitePermissionRecord, 'id'>,
  ): Promise<WebsitePermissionRecord> {
    try {
      const history = await this.getPermissionHistory();
      const newRecord: WebsitePermissionRecord = {
        ...data,
        id: `perm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      };

      // Keep newest first, max 100 entries
      const updated = [newRecord, ...history.filter(h => h.domain !== data.domain || h.permissionType !== data.permissionType)].slice(0, 100);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return newRecord;
    } catch (e) {
      console.warn('[PermissionSecurityService] Failed to save record:', e);
      return {
        ...data,
        id: `perm_${Date.now()}`,
      };
    }
  },

  /**
   * Updates user decision status (ALLOWED, DENIED, REVIEWED) for a domain/record.
   */
  async updateActionStatus(
    domain: string,
    actionStatus: 'ALLOWED' | 'DENIED' | 'REVIEWED',
  ): Promise<void> {
    try {
      const history = await this.getPermissionHistory();
      const updated = history.map(item => {
        if (item.domain === domain || item.id === domain) {
          return { ...item, actionStatus };
        }
        return item;
      });
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.warn('[PermissionSecurityService] Failed to update action status:', e);
    }
  },

  /**
   * Clears historical permission logs.
   */
  async clearHistory(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    } catch (e) {
      console.warn('[PermissionSecurityService] Failed to clear history:', e);
    }
  },

  /**
   * Subscribes to native Android permission detection and user action events.
   */
  listenToNativeEvents(
    onRequest: (record: WebsitePermissionRecord) => void,
    onUserAction?: (actionData: any) => void,
  ): () => void {
    const subRequest = DeviceEventEmitter.addListener(
      'onWebsitePermissionRequest',
      async (event: any) => {
        if (!event || !event.domain) return;
        const record = await this.recordPermissionRequest({
          domain: event.domain,
          url: event.url || `https://${event.domain}`,
          permissionType: event.permissionType || 'camera',
          trustLevel: event.trustLevel || 'UNKNOWN',
          browser: event.browser || 'Google Chrome',
          timestamp: event.timestamp || Date.now(),
          explanation: event.explanation || 'Website requested hardware access.',
          actionStatus: 'PENDING',
        });
        onRequest(record);
      },
    );

    const subAction = DeviceEventEmitter.addListener(
      'onWebsitePermissionUserAction',
      async (actionData: any) => {
        if (actionData?.domain && actionData?.action) {
          await this.updateActionStatus(actionData.domain, actionData.action);
        }
        if (onUserAction) {
          onUserAction(actionData);
        }
      },
    );

    return () => {
      subRequest.remove();
      subAction.remove();
    };
  },
};

export default permissionSecurityService;

