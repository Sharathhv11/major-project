/**
 * Accessibility, Overlay & Notification Bridge Utility
 *
 * Exposes methods to query Android AccessibilityService status, Overlay permissions,
 * and NotificationListenerService permissions and open the corresponding Android system settings.
 */

import {NativeModules, Platform} from 'react-native';

const {AccessibilityBridgeModule} = NativeModules;

export interface ServiceStatus {
  accessibilityEnabled: boolean;
  overlayGranted: boolean;
  notificationListenerEnabled: boolean;
}

export const isAccessibilityServiceEnabled = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AccessibilityBridgeModule) {
    return false;
  }
  try {
    return await AccessibilityBridgeModule.isAccessibilityServiceEnabled();
  } catch {
    return false;
  }
};

export const openAccessibilitySettings = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AccessibilityBridgeModule) {
    return false;
  }
  try {
    return await AccessibilityBridgeModule.openAccessibilitySettings();
  } catch {
    return false;
  }
};

export const isOverlayPermissionGranted = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AccessibilityBridgeModule) {
    return false;
  }
  try {
    return await AccessibilityBridgeModule.isOverlayPermissionGranted();
  } catch {
    return false;
  }
};

export const openOverlaySettings = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AccessibilityBridgeModule) {
    return false;
  }
  try {
    return await AccessibilityBridgeModule.openOverlaySettings();
  } catch {
    return false;
  }
};

export const isNotificationListenerEnabled = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AccessibilityBridgeModule || !AccessibilityBridgeModule.isNotificationListenerEnabled) {
    return false;
  }
  try {
    return await AccessibilityBridgeModule.isNotificationListenerEnabled();
  } catch {
    return false;
  }
};

export const openNotificationListenerSettings = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AccessibilityBridgeModule || !AccessibilityBridgeModule.openNotificationListenerSettings) {
    return false;
  }
  try {
    return await AccessibilityBridgeModule.openNotificationListenerSettings();
  } catch {
    return false;
  }
};

export const checkAllServiceStatus = async (): Promise<ServiceStatus> => {
  const [accessibilityEnabled, overlayGranted, notificationListenerEnabled] = await Promise.all([
    isAccessibilityServiceEnabled(),
    isOverlayPermissionGranted(),
    isNotificationListenerEnabled(),
  ]);
  return {accessibilityEnabled, overlayGranted, notificationListenerEnabled};
};

export const showFloatingBot = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AccessibilityBridgeModule || !AccessibilityBridgeModule.showFloatingBot) {
    return false;
  }
  try {
    return await AccessibilityBridgeModule.showFloatingBot();
  } catch {
    return false;
  }
};

export const hideFloatingBot = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AccessibilityBridgeModule || !AccessibilityBridgeModule.hideFloatingBot) {
    return false;
  }
  try {
    return await AccessibilityBridgeModule.hideFloatingBot();
  } catch {
    return false;
  }
};

export const isFloatingBotVisible = async (): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AccessibilityBridgeModule || !AccessibilityBridgeModule.isFloatingBotVisible) {
    return false;
  }
  try {
    return await AccessibilityBridgeModule.isFloatingBotVisible();
  } catch {
    return false;
  }
};

export const reportManualScanResult = async (result: any): Promise<boolean> => {
  if (Platform.OS !== 'android' || !AccessibilityBridgeModule || !AccessibilityBridgeModule.reportManualScanResult) {
    return false;
  }
  try {
    return await AccessibilityBridgeModule.reportManualScanResult(result);
  } catch {
    return false;
  }
};
