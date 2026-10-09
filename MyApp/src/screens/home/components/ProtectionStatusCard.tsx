/**
 * Protection Status Card — FraudShield
 *
 * Section B: Prominently communicates the genuine state of FraudShield's protection features
 * (WhatsApp/SMS monitoring, URL detector accessibility, on-screen floating bot).
 *
 * Requirements:
 * - Displays actual application/service state (never hardcodes "Active" when disabled).
 * - Actionable buttons for missing permissions.
 * - Restrained, modern security aesthetics with Lucide icons.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Icon from '../../../components/Icon';
import { Colors, Typography, Spacing, Shadows } from '../../../theme/theme';
import {
  ServiceStatus,
  openAccessibilitySettings,
  openOverlaySettings,
  openNotificationListenerSettings,
} from '../../../utils/accessibilityService';

const PRIMARY_COLOR = '#3a86ff';

interface ProtectionStatusCardProps {
  status: ServiceStatus;
  floatingBotActive: boolean;
  onToggleFloatingBot: () => void;
}

export const ProtectionStatusCard: React.FC<ProtectionStatusCardProps> = ({
  status,
  floatingBotActive,
  onToggleFloatingBot,
}) => {
  if (Platform.OS !== 'android') {
    return null;
  }

  const isFullProtected =
    status.accessibilityEnabled &&
    status.overlayGranted &&
    status.notificationListenerEnabled;

  const missingCount =
    (status.accessibilityEnabled ? 0 : 1) +
    (status.overlayGranted ? 0 : 1) +
    (status.notificationListenerEnabled ? 0 : 1);

  return (
    <View style={[styles.container, Shadows.card]}>
      {/* ─── Overall Status Banner ─────────────────────────────────── */}
      <View
        style={[
          styles.summaryBanner,
          isFullProtected ? styles.bannerProtected : styles.bannerAttention,
        ]}>
        <View style={styles.bannerIconCircle}>
          <Icon
            name={isFullProtected ? 'ShieldCheck' : 'AlertTriangle'}
            size={20}
            color={isFullProtected ? '#059669' : '#D97706'}
            strokeWidth={2.4}
          />
        </View>
        <View style={styles.bannerTextCol}>
          <View style={styles.bannerTitleRow}>
            <Text
              style={[
                styles.bannerTitle,
                isFullProtected ? styles.textProtected : styles.textAttention,
              ]}>
              {isFullProtected ? 'Real-Time Protection Active' : 'Protection Needs Attention'}
            </Text>
            <View
              style={[
                styles.badgePill,
                isFullProtected ? styles.badgeProtected : styles.badgeAttention,
              ]}>
              <Text
                style={[
                  styles.badgePillText,
                  isFullProtected ? styles.textProtected : styles.textAttention,
                ]}>
                {isFullProtected ? 'OPTIMAL' : `${missingCount} REQUIRED`}
              </Text>
            </View>
          </View>
          <Text style={styles.bannerSubtitle}>
            {isFullProtected
              ? 'WhatsApp, SMS, and link monitoring are actively safeguarding your device.'
              : 'Enable missing permissions below to activate automated incoming message inspection.'}
          </Text>
        </View>
      </View>

      {/* ─── Service Item Rows ─────────────────────────────────────── */}
      <View style={styles.servicesList}>
        {/* Row 1: WhatsApp & SMS Monitor */}
        <View style={styles.serviceRow}>
          <View style={styles.serviceIconBox}>
            <Icon name="Mail" size={16} color={PRIMARY_COLOR} strokeWidth={2.2} />
          </View>
          <View style={styles.serviceDetails}>
            <Text style={styles.serviceName}>WhatsApp & SMS Monitor</Text>
            <Text style={styles.serviceDesc}>
              Automatic inspection of incoming fraud messages
            </Text>
          </View>
          {status.notificationListenerEnabled ? (
            <View style={styles.statusActivePill}>
              <Icon name="CheckCircle2" size={12} color="#059669" strokeWidth={2.4} style={{ marginRight: 3 }} />
              <Text style={styles.statusActiveText}>Active</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.enableButton}
              onPress={openNotificationListenerSettings}
              accessibilityRole="button"
              accessibilityLabel="Enable notification monitoring">
              <Text style={styles.enableButtonText}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Row 2: Real-Time URL Shield */}
        <View style={styles.serviceRow}>
          <View style={styles.serviceIconBox}>
            <Icon name="Shield" size={16} color={PRIMARY_COLOR} strokeWidth={2.2} />
          </View>
          <View style={styles.serviceDetails}>
            <Text style={styles.serviceName}>URL Threat Shield</Text>
            <Text style={styles.serviceDesc}>
              Accessibility detector for insecure HTTP & phishing links
            </Text>
          </View>
          {status.accessibilityEnabled ? (
            <View style={styles.statusActivePill}>
              <Icon name="CheckCircle2" size={12} color="#059669" strokeWidth={2.4} style={{ marginRight: 3 }} />
              <Text style={styles.statusActiveText}>Active</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.enableButton}
              onPress={openAccessibilitySettings}
              accessibilityRole="button"
              accessibilityLabel="Enable Accessibility URL Shield">
              <Text style={styles.enableButtonText}>Enable</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Row 3: On-Screen Floating Bot */}
        <View style={[styles.serviceRow, styles.serviceRowLast]}>
          <View style={styles.serviceIconBox}>
            <Icon name="Activity" size={16} color={PRIMARY_COLOR} strokeWidth={2.2} />
          </View>
          <View style={styles.serviceDetails}>
            <Text style={styles.serviceName}>Floating Screen Bot</Text>
            <Text style={styles.serviceDesc}>
              On-screen helper to scan suspicious text over any app
            </Text>
          </View>
          {!status.overlayGranted ? (
            <TouchableOpacity
              style={styles.enableButton}
              onPress={openOverlaySettings}
              accessibilityRole="button"
              accessibilityLabel="Grant Overlay Permission">
              <Text style={styles.enableButtonText}>Grant</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.toggleButton,
                floatingBotActive && styles.toggleButtonActive,
              ]}
              onPress={onToggleFloatingBot}
              accessibilityRole="button"
              accessibilityLabel="Toggle Floating Bot">
              <Text
                style={[
                  styles.toggleButtonText,
                  floatingBotActive && styles.toggleButtonTextActive,
                ]}>
                {floatingBotActive ? 'Hide' : 'Launch'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: Spacing.md,
  },

  // Top Summary Banner
  summaryBanner: {
    flexDirection: 'row',
    padding: 14,
    borderBottomWidth: 1,
  },
  bannerProtected: {
    backgroundColor: '#ECFDF5',
    borderBottomColor: '#A7F3D0',
  },
  bannerAttention: {
    backgroundColor: '#FFFBEB',
    borderBottomColor: '#FDE68A',
  },
  bannerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  bannerTextCol: {
    flex: 1,
  },
  bannerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  bannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  bannerSubtitle: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
  },
  textProtected: {
    color: '#059669',
  },
  textAttention: {
    color: '#B45309',
  },
  badgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeProtected: {
    backgroundColor: '#D1FAE5',
  },
  badgeAttention: {
    backgroundColor: '#FEF3C7',
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
  },

  // Service Rows
  servicesList: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
  },
  serviceRowLast: {
    borderBottomWidth: 0,
  },
  serviceIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  serviceDetails: {
    flex: 1,
  },
  serviceName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  serviceDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },

  // Status indicators & buttons
  statusActivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusActiveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  enableButton: {
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  enableButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  toggleButton: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  toggleButtonActive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  toggleButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: PRIMARY_COLOR,
  },
  toggleButtonTextActive: {
    color: '#64748B',
  },
});

export default ProtectionStatusCard;
