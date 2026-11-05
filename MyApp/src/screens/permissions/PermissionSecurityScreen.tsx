/**
 * PermissionSecurityScreen — FraudShield
 *
 * Provides real-time protection against malicious and deceptive websites
 * requesting Camera, Microphone, and Location permissions.
 *
 * Features:
 * - Live intercepted requests analytics & browser defense status
 * - Historical permission log with domain trust scoring
 * - AI Assistant integration for contextual risk explanation
 * - Step-by-step permission revocation guide for Chrome & Android
 * - Interactive alert test simulator for demonstrations
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from '../../components/Icon';
import { Colors, Typography, Spacing, Shadows } from '../../theme/theme';
import permissionSecurityService, {
  WebsitePermissionRecord,
} from '../../services/permissionSecurityService';
import {
  simulateWebsitePermissionAlert,
  isAccessibilityServiceEnabled,
  isOverlayPermissionGranted,
} from '../../utils/accessibilityService';

const PRIMARY_COLOR = '#3a86ff';

export const PermissionSecurityScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [history, setHistory] = useState<WebsitePermissionRecord[]>([]);
  const [filterType, setFilterType] = useState<'ALL' | 'CAMERA' | 'MIC' | 'LOCATION'>('ALL');
  const [activeTab, setActiveTab] = useState<'HISTORY' | 'REVOKE_GUIDE'>('HISTORY');
  const [refreshing, setRefreshing] = useState(false);
  const [isProtectionActive, setIsProtectionActive] = useState(false);

  const loadData = useCallback(async () => {
    const list = await permissionSecurityService.getPermissionHistory();
    setHistory(list);

    if (Platform.OS === 'android') {
      const [acc, overlay] = await Promise.all([
        isAccessibilityServiceEnabled(),
        isOverlayPermissionGranted(),
      ]);
      setIsProtectionActive(acc && overlay);
    } else {
      setIsProtectionActive(true);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Listen for live permission events emitted from native AccessibilityService
    const unsubscribe = permissionSecurityService.listenToNativeEvents(
      (newRecord) => {
        setHistory((prev) => [newRecord, ...prev.filter((p) => p.id !== newRecord.id)]);
      },
      (actionData) => {
        if (actionData?.domain && actionData?.action) {
          setHistory((prev) =>
            prev.map((item) =>
              item.domain === actionData.domain ? { ...item, actionStatus: actionData.action } : item,
            ),
          );
        }
      },
    );

    return () => unsubscribe();
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleClearHistory = () => {
    Alert.alert(
      'Clear Permission History',
      'Are you sure you want to delete all recorded website permission events?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await permissionSecurityService.clearHistory();
            setHistory([]);
          },
        },
      ],
    );
  };

  const handleExplainWithAssistant = (record: WebsitePermissionRecord) => {
    navigation.navigate('AssistantChat', {
      mode: 'detection_explanation',
      detectionContext: {
        permissionType: record.permissionType,
        domain: record.domain,
        trustLevel: record.trustLevel,
        browser: record.browser,
        safePreview: record.explanation,
      },
      initialPrompt: `Why did ${record.domain} request ${record.permissionType} permission? Is it safe or could it be risky?`,
    });
  };

  const handleSimulateAlert = async (type: 'camera_safe' | 'camera_risky' | 'location') => {
    if (type === 'camera_safe') {
      await simulateWebsitePermissionAlert({
        domain: 'meet.google.com',
        url: 'https://meet.google.com/call',
        permissionType: 'camera',
        trustLevel: 'VERIFIED',
        browser: 'Google Chrome',
        explanation:
          'Camera access requested for video meeting. Standard function for verified conferencing application.',
      });
    } else if (type === 'camera_risky') {
      await simulateWebsitePermissionAlert({
        domain: 'lucky-spin-rewards.top',
        url: 'http://lucky-spin-rewards.top/claim',
        permissionType: 'camera',
        trustLevel: 'SUSPICIOUS',
        browser: 'Google Chrome',
        explanation:
          'Unencrypted HTTP site requested device camera access without justification. High risk of background surveillance.',
      });
    } else {
      await simulateWebsitePermissionAlert({
        domain: 'food-delivery-express.in',
        url: 'https://food-delivery-express.in',
        permissionType: 'location',
        trustLevel: 'UNKNOWN',
        browser: 'Google Chrome',
        explanation:
          'Precise location requested. Normal for delivery routing, but verify if you trust this merchant.',
      });
    }
  };

  const filteredHistory = history.filter((item) => {
    if (filterType === 'ALL') return true;
    const p = (item.permissionType || '').toLowerCase();
    if (filterType === 'CAMERA') return p.includes('camera');
    if (filterType === 'MIC') return p.includes('mic') || p.includes('audio');
    if (filterType === 'LOCATION') return p.includes('location');
    return true;
  });

  const cameraCount = history.filter((h) => (h.permissionType || '').toLowerCase().includes('camera')).length;
  const micCount = history.filter((h) => (h.permissionType || '').toLowerCase().includes('mic')).length;
  const locCount = history.filter((h) => (h.permissionType || '').toLowerCase().includes('location')).length;
  const suspiciousCount = history.filter((h) => h.trustLevel === 'SUSPICIOUS').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── Header ──────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityLabel="Go back">
          <Icon name="ChevronLeft" size={24} color="#0F172A" strokeWidth={2.4} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text style={styles.headerTitle}>Website Permissions</Text>
          <View style={styles.statusPill}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: isProtectionActive ? '#10B981' : '#F59E0B' },
              ]}
            />
            <Text style={styles.statusText}>
              {isProtectionActive ? 'Shield Active (Chrome, Edge)' : 'Setup Required'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleClearHistory}
          style={styles.clearButton}
          accessibilityLabel="Clear history">
          <Icon name="Trash2" size={19} color="#64748B" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[PRIMARY_COLOR]} />
        }>
        {/* ─── Summary Metric Cards ────────────────────────────────────────── */}
        <View style={styles.metricsRow}>
          <View style={[styles.metricCard, Shadows.card]}>
            <Text style={styles.metricVal}>{history.length}</Text>
            <Text style={styles.metricLabel}>Intercepted</Text>
          </View>
          <View style={[styles.metricCard, Shadows.card]}>
            <Text style={[styles.metricVal, { color: '#EF4444' }]}>{suspiciousCount}</Text>
            <Text style={styles.metricLabel}>Suspicious</Text>
          </View>
          <View style={[styles.metricCard, Shadows.card]}>
            <Text style={[styles.metricVal, { color: PRIMARY_COLOR }]}>{cameraCount + micCount}</Text>
            <Text style={styles.metricLabel}>Cam / Mic</Text>
          </View>
          <View style={[styles.metricCard, Shadows.card]}>
            <Text style={[styles.metricVal, { color: '#10B981' }]}>{locCount}</Text>
            <Text style={styles.metricLabel}>Location</Text>
          </View>
        </View>

        {/* ─── Simulator & Test Banner ─────────────────────────────────────── */}
        <View style={[styles.simulatorCard, Shadows.card]}>
          <View style={styles.simulatorHeader}>
            <View style={styles.simIconBox}>
              <Icon name="Sparkles" size={18} color={PRIMARY_COLOR} strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.simTitle}>Live Overlay Simulator</Text>
              <Text style={styles.simSubtitle}>
                Test how FraudShield protects against website permission requests
              </Text>
            </View>
          </View>
          <View style={styles.simButtonsRow}>
            <TouchableOpacity
              style={styles.simBtn}
              onPress={() => handleSimulateAlert('camera_risky')}
              activeOpacity={0.8}>
              <Text style={styles.simBtnText}>⚠️ Risky Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.simBtn}
              onPress={() => handleSimulateAlert('camera_safe')}
              activeOpacity={0.8}>
              <Text style={styles.simBtnText}>✓ Verified Meet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.simBtn}
              onPress={() => handleSimulateAlert('location')}
              activeOpacity={0.8}>
              <Text style={styles.simBtnText}>📍 Location</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Navigation Sub-Tabs: History vs Revocation Guide ─────────────── */}
        <View style={styles.tabsRow}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'HISTORY' && styles.tabItemActive]}
            onPress={() => setActiveTab('HISTORY')}>
            <Text
              style={[
                styles.tabItemText,
                activeTab === 'HISTORY' && styles.tabItemTextActive,
              ]}>
              Permission Logs ({history.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'REVOKE_GUIDE' && styles.tabItemActive]}
            onPress={() => setActiveTab('REVOKE_GUIDE')}>
            <Text
              style={[
                styles.tabItemText,
                activeTab === 'REVOKE_GUIDE' && styles.tabItemTextActive,
              ]}>
              How to Revoke
            </Text>
          </TouchableOpacity>
        </View>

        {/* ─── TAB 1: HISTORY ──────────────────────────────────────────────── */}
        {activeTab === 'HISTORY' && (
          <View>
            {/* Filter Chips */}
            <View style={styles.filterChipsRow}>
              {(['ALL', 'CAMERA', 'MIC', 'LOCATION'] as const).map((ft) => (
                <TouchableOpacity
                  key={ft}
                  style={[styles.filterChip, filterType === ft && styles.filterChipActive]}
                  onPress={() => setFilterType(ft)}>
                  <Text
                    style={[
                      styles.filterChipText,
                      filterType === ft && styles.filterChipTextActive,
                    ]}>
                    {ft === 'ALL'
                      ? 'All'
                      : ft === 'CAMERA'
                      ? 'Camera'
                      : ft === 'MIC'
                      ? 'Microphone'
                      : 'Location'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* List */}
            {filteredHistory.length === 0 ? (
              <View style={[styles.emptyCard, Shadows.card]}>
                <Icon name="ShieldCheck" size={36} color="#10B981" strokeWidth={2} />
                <Text style={styles.emptyTitle}>No Requests Detected</Text>
                <Text style={styles.emptySubtitle}>
                  FraudShield actively monitors browser permission requests in the background. Tap the
                  simulator buttons above to preview.
                </Text>
              </View>
            ) : (
              filteredHistory.map((item) => {
                const isSuspicious = item.trustLevel === 'SUSPICIOUS';
                const isVerified = item.trustLevel === 'VERIFIED';
                const permLower = (item.permissionType || '').toLowerCase();

                let permBadgeText = '🔒 Permission';
                if (permLower.includes('camera')) permBadgeText = '📷 Camera';
                else if (permLower.includes('mic')) permBadgeText = '🎙️ Microphone';
                else if (permLower.includes('location')) permBadgeText = '📍 Location';

                return (
                  <View key={item.id} style={[styles.recordCard, Shadows.card]}>
                    <View style={styles.recordHeader}>
                      <View style={styles.recordMetaLeft}>
                        <Text style={styles.browserTag}>{item.browser}</Text>
                        <Text style={styles.timeTag}>
                          {new Date(item.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.actionPill,
                          item.actionStatus === 'DENIED'
                            ? styles.pillDenied
                            : item.actionStatus === 'ALLOWED'
                            ? styles.pillAllowed
                            : styles.pillPending,
                        ]}>
                        <Text
                          style={[
                            styles.actionPillText,
                            item.actionStatus === 'DENIED'
                              ? { color: '#EF4444' }
                              : item.actionStatus === 'ALLOWED'
                              ? { color: '#10B981' }
                              : { color: '#F59E0B' },
                          ]}>
                          {item.actionStatus}
                        </Text>
                      </View>
                    </View>

                    {/* Domain & Trust */}
                    <View style={styles.domainRow}>
                      <Text style={styles.domainText} numberOfLines={1}>
                        {item.domain}
                      </Text>
                      <View
                        style={[
                          styles.trustBadge,
                          isVerified
                            ? styles.trustVerified
                            : isSuspicious
                            ? styles.trustSuspicious
                            : styles.trustUnknown,
                        ]}>
                        <Text
                          style={[
                            styles.trustText,
                            isVerified
                              ? { color: '#10B981' }
                              : isSuspicious
                              ? { color: '#EF4444' }
                              : { color: '#F59E0B' },
                          ]}>
                          {isVerified
                            ? '✓ VERIFIED'
                            : isSuspicious
                            ? '⚠️ SUSPICIOUS'
                            : 'ℹ️ UNVERIFIED'}
                        </Text>
                      </View>
                    </View>

                    {/* Permission Type Indicator */}
                    <View style={styles.permTypeRow}>
                      <Text style={styles.permTypeBadge}>{permBadgeText}</Text>
                    </View>

                    {/* Explanation */}
                    <Text style={styles.recordExp}>{item.explanation}</Text>

                    {/* Bottom AI action */}
                    <View style={styles.recordFooter}>
                      <TouchableOpacity
                        style={styles.aiActionBtn}
                        onPress={() => handleExplainWithAssistant(item)}
                        activeOpacity={0.8}>
                        <Icon name="Bot" size={15} color={PRIMARY_COLOR} strokeWidth={2.4} />
                        <Text style={styles.aiActionText}>Explain with AI Assistant</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ─── TAB 2: REVOCATION & RECOVERY GUIDE ───────────────────────────── */}
        {activeTab === 'REVOKE_GUIDE' && (
          <View style={styles.guideContainer}>
            {/* Guide Card 1: Google Chrome */}
            <View style={[styles.guideCard, Shadows.card]}>
              <View style={styles.guideHeader}>
                <View style={[styles.guideIconBox, { backgroundColor: '#EFF6FF' }]}>
                  <Icon name="Lock" size={18} color={PRIMARY_COLOR} strokeWidth={2.4} />
                </View>
                <Text style={styles.guideCardTitle}>Revoke in Google Chrome</Text>
              </View>

              <View style={styles.stepItem}>
                <View style={styles.stepNumberBox}>
                  <Text style={styles.stepNumber}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepHeading}>Address Bar Quick Access</Text>
                  <Text style={styles.stepDesc}>
                    While on any website, tap the 🔒 lock or tune icon in Chrome's address bar next to the URL.
                  </Text>
                </View>
              </View>

              <View style={styles.stepItem}>
                <View style={styles.stepNumberBox}>
                  <Text style={styles.stepNumber}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepHeading}>Permissions Sheet</Text>
                  <Text style={styles.stepDesc}>
                    Tap "Permissions" and toggle off Camera, Microphone, or Location access.
                  </Text>
                </View>
              </View>

              <View style={styles.stepItem}>
                <View style={styles.stepNumberBox}>
                  <Text style={styles.stepNumber}>3</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepHeading}>Chrome Site Settings (Full Audit)</Text>
                  <Text style={styles.stepDesc}>
                    Open Chrome (⋮) → Settings → Site settings → tap Camera, Microphone, or Location to view all sites and tap "Reset / Remove".
                  </Text>
                </View>
              </View>
            </View>

            {/* Guide Card 2: Android System Settings */}
            <View style={[styles.guideCard, Shadows.card]}>
              <View style={styles.guideHeader}>
                <View style={[styles.guideIconBox, { backgroundColor: '#ECFDF5' }]}>
                  <Icon name="Shield" size={18} color="#10B981" strokeWidth={2.4} />
                </View>
                <Text style={styles.guideCardTitle}>Revoke via Android Settings</Text>
              </View>

              <View style={styles.stepItem}>
                <View style={styles.stepNumberBox}>
                  <Text style={styles.stepNumber}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepHeading}>Open App Management</Text>
                  <Text style={styles.stepDesc}>
                    Go to Android Settings → Apps & notifications (or Apps) → Select Chrome (or your browser).
                  </Text>
                </View>
              </View>

              <View style={styles.stepItem}>
                <View style={styles.stepNumberBox}>
                  <Text style={styles.stepNumber}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepHeading}>Modify Permissions</Text>
                  <Text style={styles.stepDesc}>
                    Tap "Permissions" → select Camera, Microphone, or Location → change setting to "Don't allow" or "Ask every time".
                  </Text>
                </View>
              </View>
            </View>

            {/* Best Practices Alert */}
            <View style={[styles.bestPracticesCard, Shadows.card]}>
              <View style={styles.bestPracticesRow}>
                <Icon name="Info" size={18} color="#D97706" strokeWidth={2.4} />
                <Text style={styles.bestPracticesTitle}>FraudShield Security Recommendations</Text>
              </View>
              <Text style={styles.bestPracticesText}>
                • Never grant camera or mic permissions to unknown e-commerce or contest sites.{'\n'}
                • Choose "Only this time" instead of "Always allow" for video calls.{'\n'}
                • Always deny location requests unless actively tracking a courier or navigation.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05070D',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenHorizontal,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#0B1220',
  },
  backButton: {
    padding: 6,
    marginRight: 6,
  },
  headerTitleCol: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  clearButton: {
    padding: 8,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#0B1220',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1E293B',
    paddingVertical: 12,
    alignItems: 'center',
    marginHorizontal: 3,
  },
  metricVal: {
    fontSize: 19,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  metricLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  simulatorCard: {
    backgroundColor: '#0B1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E40AF',
    padding: 14,
    marginBottom: Spacing.md,
  },
  simulatorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  simIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#172554',
    alignItems: 'center',
    justifyContent: 'center',
  },
  simTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  simSubtitle: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  simButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  simBtn: {
    flex: 1,
    backgroundColor: '#1E293B',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 2,
    borderWidth: 1,
    borderColor: '#334155',
  },
  simBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#0B1220',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 3,
    marginBottom: Spacing.md,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: '#1E293B',
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabItemTextActive: {
    color: '#FFFFFF',
  },
  filterChipsRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#0B1220',
    borderWidth: 1,
    borderColor: '#1E293B',
    marginRight: 6,
  },
  filterChipActive: {
    backgroundColor: PRIMARY_COLOR,
    borderColor: PRIMARY_COLOR,
  },
  filterChipText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  recordCard: {
    backgroundColor: '#0B1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 14,
    marginBottom: Spacing.sm,
  },
  recordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recordMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  browserTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    marginRight: 8,
  },
  timeTag: {
    fontSize: 10,
    color: '#64748B',
  },
  actionPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pillDenied: {
    backgroundColor: '#450A0A',
  },
  pillAllowed: {
    backgroundColor: '#064E3B',
  },
  pillPending: {
    backgroundColor: '#451A03',
  },
  actionPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  domainText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#38BDF8',
    flex: 1,
    marginRight: 8,
  },
  trustBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trustVerified: {
    backgroundColor: '#064E3B',
  },
  trustSuspicious: {
    backgroundColor: '#450A0A',
  },
  trustUnknown: {
    backgroundColor: '#451A03',
  },
  trustText: {
    fontSize: 9,
    fontWeight: '800',
  },
  permTypeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  permTypeBadge: {
    fontSize: 11,
    color: '#F8FAFC',
    backgroundColor: '#1E293B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    fontWeight: '600',
  },
  recordExp: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
    marginBottom: 10,
  },
  recordFooter: {
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    paddingTop: 8,
  },
  aiActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  aiActionText: {
    fontSize: 12,
    color: PRIMARY_COLOR,
    fontWeight: '700',
    marginLeft: 6,
  },
  emptyCard: {
    backgroundColor: '#0B1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 30,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  guideContainer: {
    marginBottom: Spacing.md,
  },
  guideCard: {
    backgroundColor: '#0B1220',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 16,
    marginBottom: Spacing.md,
  },
  guideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  guideIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  guideCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  stepNumberBox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: '800',
    color: PRIMARY_COLOR,
  },
  stepContent: {
    flex: 1,
  },
  stepHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  stepDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 17,
  },
  bestPracticesCard: {
    backgroundColor: '#1E1B18',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#78350F',
    padding: 14,
  },
  bestPracticesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  bestPracticesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
    marginLeft: 8,
  },
  bestPracticesText: {
    fontSize: 12,
    color: '#D4D4D8',
    lineHeight: 18,
  },
});

export default PermissionSecurityScreen;
