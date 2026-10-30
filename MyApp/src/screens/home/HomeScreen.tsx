/**
 * Redesigned Home / Dashboard Screen — FraudShield
 *
 * Modern, mobile-security dashboard organized into clear, logical sections:
 * - Section A: Compact Header (Plain branding, tagline, user profile shortcut)
 * - Section B: Protection Status (Real-time WhatsApp, SMS, URL shield, and floating bot defense)
 * - Section C: Quick Actions (Check message, scan screenshot, view history, manage settings)
 * - Section D: Recent Detections (Recent scan previews with source and risk indicators)
 * - Section E: Security Insights (Accurate statistics computed from real detection records)
 *
 * Adheres strictly to FraudShield design system:
 * - Minimal, trustworthy, professional
 * - Primary accent #3a86ff
 * - Restrained shadows, accessible contrast, clean typography
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Alert,
  AppState,
  AppStateStatus,
  Platform,
  RefreshControl,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing, Shadows } from '../../theme/theme';
import Icon from '../../components/Icon';
import {
  checkAllServiceStatus,
  openOverlaySettings,
  ServiceStatus,
  showFloatingBot,
  hideFloatingBot,
  isFloatingBotVisible,
} from '../../utils/accessibilityService';

// Dashboard Modular Components
import DashboardHeader from './components/DashboardHeader';
import ProtectionStatusCard from './components/ProtectionStatusCard';
import FraudHelpAssistantCard from './components/FraudHelpAssistantCard';
import QuickActionsGrid from './components/QuickActionsGrid';
import RecentDetectionsSection from './components/RecentDetectionsSection';
import SecurityInsightsCard from './components/SecurityInsightsCard';

const PRIMARY_COLOR = '#3a86ff';

export const HomeScreen: React.FC = () => {
  const { user } = useAuth();
  const navigation = useNavigation<any>();

  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    accessibilityEnabled: false,
    overlayGranted: false,
    notificationListenerEnabled: false,
  });

  const [floatingBotActive, setFloatingBotActive] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // ─── Real-Time Permission & Service Verification ──────────────────────────

  const refreshStatus = useCallback(async () => {
    if (Platform.OS === 'android') {
      const status = await checkAllServiceStatus();
      setServiceStatus(status);
      const isVisible = await isFloatingBotVisible();
      setFloatingBotActive(isVisible);
    }
  }, []);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshStatus();
    setRefreshing(false);
  }, [refreshStatus]);

  const handleToggleFloatingBot = async () => {
    if (!serviceStatus.overlayGranted) {
      Alert.alert(
        'Permission Required',
        'Display Over Other Apps permission is required to display the floating FraudShield bot.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Grant Permission', onPress: openOverlaySettings },
        ],
      );
      return;
    }

    if (floatingBotActive) {
      await hideFloatingBot();
      setFloatingBotActive(false);
    } else {
      await showFloatingBot();
      setFloatingBotActive(true);
    }
  };

  useEffect(() => {
    refreshStatus();

    // Auto-refresh when returning to app from Android Settings
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          refreshStatus();
        }
      },
    );

    return () => {
      subscription.remove();
    };
  }, [refreshStatus]);

  // ─── Navigation Handlers ──────────────────────────────────────────────────

  const handleOpenProfile = () => {
    navigation.dispatch(CommonActions.navigate({ name: 'Profile' }));
  };

  const handleCheckMessage = () => {
    navigation.navigate('MessageChecker', { initialMode: 'paste' });
  };

  const handleScanScreenshot = () => {
    navigation.navigate('MessageChecker', { initialMode: 'upload' });
  };

  const handleViewHistory = () => {
    navigation.navigate('DetectionHistory');
  };

  const handleOpenSettings = () => {
    navigation.dispatch(CommonActions.navigate({ name: 'Settings' }));
  };

  const handleOpenAssistant = () => {
    navigation.navigate('AssistantChat', { mode: 'general_help' });
  };

  const handleOpenNetworkAnalysis = () => {
    navigation.navigate('NetworkAnalysis');
  };

  const handleSelectAssistantPrompt = (prompt: string) => {
    navigation.navigate('AssistantChat', {
      mode: 'general_help',
      initialPrompt: prompt,
    });
  };

  const isProtectionFullyActive =
    serviceStatus.accessibilityEnabled &&
    serviceStatus.overlayGranted &&
    serviceStatus.notificationListenerEnabled;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            colors={[PRIMARY_COLOR]}
            tintColor={PRIMARY_COLOR}
          />
        }>
        {/* ─── Section A: Header ─────────────────────────────────────── */}
        <DashboardHeader
          userName={user?.name || 'User'}
          onPressProfile={handleOpenProfile}
        />

        {/* ─── Section B: Protection Status ─────────────────────────── */}
        <ProtectionStatusCard
          status={serviceStatus}
          floatingBotActive={floatingBotActive}
          onToggleFloatingBot={handleToggleFloatingBot}
        />

        {/* ─── Fraud Help Assistant Entry Point ──────────────────────── */}
        <FraudHelpAssistantCard
          onOpenAssistant={handleOpenAssistant}
          onSelectPrompt={handleSelectAssistantPrompt}
        />

        {/* ─── Section C: Quick Actions ─────────────────────────────── */}
        <QuickActionsGrid
          onCheckMessage={handleCheckMessage}
          onScanScreenshot={handleScanScreenshot}
          onViewHistory={handleViewHistory}
          onOpenSettings={handleOpenSettings}
        />

        {/* ─── Transaction Network Analysis Feature Card ────────────── */}
        <TouchableOpacity
          style={[styles.networkCard, Shadows.card]}
          onPress={handleOpenNetworkAnalysis}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Open Transaction Network Analysis">
          <View style={styles.networkCardLeft}>
            <View style={styles.networkIconBox}>
              <Icon name="Activity" size={20} color={PRIMARY_COLOR} strokeWidth={2.4} />
            </View>
            <View style={styles.networkTextCol}>
              <View style={styles.networkBadgeRow}>
                <Text style={styles.networkCardTitle}>Network Analysis</Text>
                <View style={styles.gcnBadge}>
                  <Text style={styles.gcnBadgeText}>GCN</Text>
                </View>
              </View>
              <Text style={styles.networkCardSubtitle} numberOfLines={1}>
                Inspect transaction graphs to detect money mule rings & cyclic fraud
              </Text>
            </View>
          </View>
          <View style={styles.networkArrowBtn}>
            <Icon name="ChevronRight" size={18} color={PRIMARY_COLOR} strokeWidth={2.5} />
          </View>
        </TouchableOpacity>

        {/* ─── Section D: Recent Detections ─────────────────────────── */}
        <RecentDetectionsSection onViewAll={handleViewHistory} />

        {/* ─── Section E: Security Insights ─────────────────────────── */}
        <SecurityInsightsCard isProtectionActive={isProtectionFullyActive} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xxxl,
  },
  networkCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  networkCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  networkIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  networkTextCol: {
    flex: 1,
  },
  networkBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  networkCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  gcnBadge: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  gcnBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  networkCardSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
  networkArrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default HomeScreen;
