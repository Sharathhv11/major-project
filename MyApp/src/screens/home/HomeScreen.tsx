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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { Colors, Spacing } from '../../theme/theme';
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

        {/* ─── Section C: Quick Actions ─────────────────────────────── */}
        <QuickActionsGrid
          onCheckMessage={handleCheckMessage}
          onScanScreenshot={handleScanScreenshot}
          onViewHistory={handleViewHistory}
          onOpenSettings={handleOpenSettings}
        />

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
});

export default HomeScreen;
