/**
 * Modern Home / Dashboard Screen
 *
 * Polished dashboard featuring personalized greeting, account overview card,
 * Insecure HTTP URL Protection status card, and quick actions.
 */

import React, {useState, useEffect, useCallback} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  AppState,
  AppStateStatus,
  Platform,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, CommonActions} from '@react-navigation/native';
import {useAuth} from '../../context/AuthContext';
import UserAvatar from '../../components/UserAvatar';
import Button from '../../components/Button';
import Icon, {IconName} from '../../components/Icon';
import {Colors, Typography, Spacing, Shadows} from '../../theme/theme';
import MessageFraudChecker from './components/MessageFraudChecker';
import {
  checkAllServiceStatus,
  openAccessibilitySettings,
  openOverlaySettings,
  openNotificationListenerSettings,
  ServiceStatus,
  showFloatingBot,
  hideFloatingBot,
  isFloatingBotVisible,
} from '../../utils/accessibilityService';

interface QuickAction {
  id: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
  label: string;
  description: string;
  onPress: () => void;
}

const HomeScreen: React.FC = () => {
  const {user, logout} = useAuth();
  const navigation = useNavigation();

  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>({
    accessibilityEnabled: false,
    overlayGranted: false,
    notificationListenerEnabled: false,
  });

  const [floatingBotActive, setFloatingBotActive] = useState<boolean>(false);

  const refreshStatus = useCallback(async () => {
    if (Platform.OS === 'android') {
      const status = await checkAllServiceStatus();
      setServiceStatus(status);
      const isVisible = await isFloatingBotVisible();
      setFloatingBotActive(isVisible);
    }
  }, []);

  const handleToggleFloatingBot = async () => {
    if (!serviceStatus.overlayGranted) {
      Alert.alert(
        'Permission Required',
        'Display Over Other Apps permission is required to display the floating FraudShield bot.',
        [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Grant Permission', onPress: openOverlaySettings},
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

  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const firstName = user?.name?.split(' ')[0] || 'User';

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await logout();
          },
        },
      ],
      {cancelable: true},
    );
  };

  const quickActions: QuickAction[] = [
    {
      id: 'checker',
      icon: 'Search',
      iconBg: '#EFF6FF',
      iconColor: '#3a86ff',
      label: 'Fraud Checker',
      description: 'Check message or image',
      onPress: () => {
        navigation.dispatch(CommonActions.navigate({name: 'MessageChecker'}));
      },
    },
    {
      id: 'profile',
      icon: 'User',
      iconBg: Colors.primaryFaded,
      iconColor: Colors.primary,
      label: 'My Profile',
      description: 'Account details & info',
      onPress: () => {
        navigation.dispatch(CommonActions.navigate({name: 'Profile'}));
      },
    },
    {
      id: 'settings',
      icon: 'Settings',
      iconBg: '#F3E8FF',
      iconColor: '#7C3AED',
      label: 'Settings',
      description: 'Security & password',
      onPress: () => {
        navigation.dispatch(CommonActions.navigate({name: 'Settings'}));
      },
    },
    {
      id: 'logout',
      icon: 'LogOut',
      iconBg: Colors.errorLight,
      iconColor: Colors.error,
      label: 'Sign Out',
      description: 'End active session',
      onPress: handleLogout,
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* ─── Header ────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.userName}>{firstName}</Text>
          </View>
          <TouchableOpacity
            onPress={() =>
              navigation.dispatch(CommonActions.navigate({name: 'Profile'}))
            }
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Open profile">
            <UserAvatar name={user?.name || 'User'} size={46} showRing />
          </TouchableOpacity>
        </View>

        {/* ─── Insecure HTTP URL Protection Service Card ─────────── */}
        {Platform.OS === 'android' && (
          <View style={[styles.card, styles.protectionCard, Shadows.card]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderTitleRow}>
                <View style={styles.shieldIconBox}>
                  <Icon
                    name={
                      serviceStatus.accessibilityEnabled &&
                      serviceStatus.overlayGranted &&
                      serviceStatus.notificationListenerEnabled
                        ? 'ShieldCheck'
                        : 'Shield'
                    }
                    size={20}
                    color={
                      serviceStatus.accessibilityEnabled &&
                      serviceStatus.overlayGranted &&
                      serviceStatus.notificationListenerEnabled
                        ? Colors.successDark
                        : Colors.primary
                    }
                    strokeWidth={2.5}
                  />
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.cardTitle}>Real-Time Security Protection</Text>
                  <Text style={styles.cardSubtitle}>
                    Insecure HTTP detection & incoming message fraud shield
                  </Text>
                </View>
              </View>
            </View>

            {/* Accessibility Service Status */}
            <View style={styles.serviceRow}>
              <View style={styles.serviceInfoGroup}>
                <Text style={styles.serviceLabel}>Accessibility Service (URL Detector)</Text>
                <View style={styles.statusPillRow}>
                  <View
                    style={[
                      styles.statusPill,
                      serviceStatus.accessibilityEnabled
                        ? styles.statusPillActive
                        : styles.statusPillInactive,
                    ]}>
                    <Icon
                      name={
                        serviceStatus.accessibilityEnabled
                          ? 'CheckCircle2'
                          : 'Clock'
                      }
                      size={12}
                      color={
                        serviceStatus.accessibilityEnabled
                          ? Colors.successDark
                          : Colors.warningDark
                      }
                      style={{marginRight: 4}}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        serviceStatus.accessibilityEnabled
                          ? styles.statusTextActive
                          : styles.statusTextInactive,
                      ]}>
                      {serviceStatus.accessibilityEnabled
                        ? 'Enabled'
                        : 'Disabled'}
                    </Text>
                  </View>
                </View>
              </View>

              {!serviceStatus.accessibilityEnabled && (
                <Button
                  title="Enable"
                  onPress={openAccessibilitySettings}
                  size="sm"
                  variant="primary"
                  fullWidth={false}
                  style={styles.actionBtn}
                />
              )}
            </View>

            {/* Display Over Other Apps Permission */}
            <View style={styles.serviceRow}>
              <View style={styles.serviceInfoGroup}>
                <Text style={styles.serviceLabel}>Display Over Other Apps</Text>
                <View style={styles.statusPillRow}>
                  <View
                    style={[
                      styles.statusPill,
                      serviceStatus.overlayGranted
                        ? styles.statusPillActive
                        : styles.statusPillInactive,
                    ]}>
                    <Icon
                      name={
                        serviceStatus.overlayGranted
                          ? 'CheckCircle2'
                          : 'Clock'
                      }
                      size={12}
                      color={
                        serviceStatus.overlayGranted
                          ? Colors.successDark
                          : Colors.warningDark
                      }
                      style={{marginRight: 4}}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        serviceStatus.overlayGranted
                          ? styles.statusTextActive
                          : styles.statusTextInactive,
                      ]}>
                      {serviceStatus.overlayGranted
                        ? 'Granted'
                        : 'Permission Required'}
                    </Text>
                  </View>
                </View>
              </View>

              {!serviceStatus.overlayGranted && (
                <Button
                  title="Grant"
                  onPress={openOverlaySettings}
                  size="sm"
                  variant="secondary"
                  fullWidth={false}
                  style={styles.actionBtn}
                />
              )}
            </View>

            {/* Message Notification Listener Permission */}
            <View style={[styles.serviceRow, styles.serviceRowLast]}>
              <View style={styles.serviceInfoGroup}>
                <Text style={styles.serviceLabel}>Incoming Message Fraud Shield</Text>
                <View style={styles.statusPillRow}>
                  <View
                    style={[
                      styles.statusPill,
                      serviceStatus.notificationListenerEnabled
                        ? styles.statusPillActive
                        : styles.statusPillInactive,
                    ]}>
                    <Icon
                      name={
                        serviceStatus.notificationListenerEnabled
                          ? 'CheckCircle2'
                          : 'Clock'
                      }
                      size={12}
                      color={
                        serviceStatus.notificationListenerEnabled
                          ? Colors.successDark
                          : Colors.warningDark
                      }
                      style={{marginRight: 4}}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        serviceStatus.notificationListenerEnabled
                          ? styles.statusTextActive
                          : styles.statusTextInactive,
                      ]}>
                      {serviceStatus.notificationListenerEnabled
                        ? 'Active'
                        : 'Permission Required'}
                    </Text>
                  </View>
                </View>
              </View>

              {!serviceStatus.notificationListenerEnabled && (
                <Button
                  title="Enable"
                  onPress={openNotificationListenerSettings}
                  size="sm"
                  variant="primary"
                  fullWidth={false}
                  style={styles.actionBtn}
                />
              )}
            </View>
          </View>
        )}

        {/* ─── FraudShield Floating On-Screen Bot Card ────────────── */}
        {Platform.OS === 'android' && (
          <View style={[styles.card, Shadows.card]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderTitleRow}>
                <View style={[styles.shieldIconBox, {backgroundColor: '#EFF6FF'}]}>
                  <Text style={{fontSize: 18}}>🛡️</Text>
                </View>
                <View style={{flex: 1}}>
                  <Text style={styles.cardTitle}>FraudShield Floating Bot</Text>
                  <Text style={styles.cardSubtitle}>
                    Manual on-screen scanner. Tap the floating bot anytime over any app to inspect suspicious text.
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.serviceRow}>
              <View style={styles.serviceInfoGroup}>
                <Text style={styles.serviceLabel}>Floating Assistant Status</Text>
                <View style={styles.statusPillRow}>
                  <View
                    style={[
                      styles.statusPill,
                      floatingBotActive
                        ? styles.statusPillActive
                        : styles.statusPillInactive,
                    ]}>
                    <Icon
                      name={floatingBotActive ? 'CheckCircle2' : 'Clock'}
                      size={12}
                      color={floatingBotActive ? Colors.successDark : Colors.warningDark}
                      style={{marginRight: 4}}
                    />
                    <Text
                      style={[
                        styles.statusPillText,
                        floatingBotActive
                          ? styles.statusTextActive
                          : styles.statusTextInactive,
                      ]}>
                      {floatingBotActive ? 'Active & Sleeping' : 'Hidden'}
                    </Text>
                  </View>
                </View>
              </View>

              <Button
                title={floatingBotActive ? 'Hide Bot' : 'Launch Bot'}
                onPress={handleToggleFloatingBot}
                size="sm"
                variant={floatingBotActive ? 'secondary' : 'primary'}
                fullWidth={false}
                style={styles.actionBtn}
              />
            </View>
          </View>
        )}

        {/* ─── Message Fraud Checker Section ──────────────────────── */}
        <MessageFraudChecker />

        {/* ─── Account Overview Card ─────────────────────────────── */}
        <View style={[styles.card, Shadows.card]}>
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderTitleRow}>
              <Icon
                name="ShieldCheck"
                size={18}
                color={Colors.primary}
                style={{marginRight: 6}}
              />
              <Text style={styles.cardTitle}>Account Overview</Text>
            </View>
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {user?.role?.toUpperCase() || 'USER'}
              </Text>
            </View>
          </View>

          <View style={styles.userInfoRow}>
            <View style={styles.infoLabelGroup}>
              <Icon
                name="Mail"
                size={16}
                color={Colors.textTertiary}
                style={{marginRight: 8}}
              />
              <Text style={styles.userInfoLabel}>Email</Text>
            </View>
            <Text style={styles.userInfoValue} numberOfLines={1}>
              {user?.email || '—'}
            </Text>
          </View>

          <View style={styles.userInfoRow}>
            <View style={styles.infoLabelGroup}>
              <Icon
                name="Phone"
                size={16}
                color={Colors.textTertiary}
                style={{marginRight: 8}}
              />
              <Text style={styles.userInfoLabel}>Phone</Text>
            </View>
            <Text style={styles.userInfoValue}>{user?.phone || '—'}</Text>
          </View>

          <View style={[styles.userInfoRow, styles.userInfoRowLast]}>
            <View style={styles.infoLabelGroup}>
              <Icon
                name="Shield"
                size={16}
                color={Colors.textTertiary}
                style={{marginRight: 8}}
              />
              <Text style={styles.userInfoLabel}>Security Status</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                user?.isVerified
                  ? styles.statusBadgeVerified
                  : styles.statusBadgePending,
              ]}>
              <Icon
                name={user?.isVerified ? 'CheckCircle2' : 'Clock'}
                size={12}
                color={
                  user?.isVerified ? Colors.successDark : Colors.warningDark
                }
                style={{marginRight: 4}}
              />
              <Text
                style={[
                  styles.statusText,
                  user?.isVerified
                    ? styles.statusTextVerified
                    : styles.statusTextPending,
                ]}>
                {user?.isVerified ? 'Verified' : 'Pending'}
              </Text>
            </View>
          </View>
        </View>

        {/* ─── Quick Actions ─────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {quickActions.map(action => (
            <TouchableOpacity
              key={action.id}
              style={[styles.actionCard, Shadows.card]}
              onPress={action.onPress}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={action.label}>
              <View
                style={[
                  styles.actionIconBox,
                  {backgroundColor: action.iconBg},
                ]}>
                <Icon
                  name={action.icon}
                  size={22}
                  color={action.iconColor}
                  strokeWidth={2.2}
                />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Text style={styles.actionDescription} numberOfLines={2}>
                {action.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ─── Detection Modules Section ─────────────────────────── */}
        <Text style={styles.sectionTitle}>Detection Modules</Text>
        <View style={[styles.card, styles.modulesCard, Shadows.card]}>
          <View style={styles.moduleHeader}>
            <View style={styles.moduleIconBox}>
              <Icon
                name="Activity"
                size={24}
                color={Colors.primary}
                strokeWidth={2.5}
              />
            </View>
            <View style={styles.moduleHeaderText}>
              <View style={styles.moduleBadgeRow}>
                <Text style={styles.moduleTitle}>AI Fraud Engine</Text>
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>Active</Text>
                </View>
              </View>
              <Text style={styles.moduleSubtitle}>
                Real-time rule & anomaly evaluation
              </Text>
            </View>
          </View>
          <Text style={styles.moduleDescription}>
            AI-powered fraud detection is active. Messages are analyzed in
            real-time using our ML model for risk scoring alongside local
            rule-based detection.
          </Text>
        </View>
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
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    ...Typography.styles.captionMedium,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userName: {
    ...Typography.styles.heading1,
    color: Colors.textPrimary,
    marginTop: 2,
  },

  // Protection Card
  protectionCard: {
    backgroundColor: Colors.white,
    borderColor: Colors.primaryBorder,
    borderWidth: 1.5,
  },
  shieldIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.primaryFaded,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm + 2,
  },
  cardSubtitle: {
    ...Typography.styles.small,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  serviceRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  serviceInfoGroup: {
    flex: 1,
  },
  serviceLabel: {
    ...Typography.styles.bodyMedium,
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  statusPillRow: {
    flexDirection: 'row',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Spacing.borderRadius.full,
  },
  statusPillActive: {
    backgroundColor: Colors.successLight,
    borderWidth: 1,
    borderColor: Colors.successBorder,
  },
  statusPillInactive: {
    backgroundColor: Colors.warningLight,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
  },
  statusPillText: {
    ...Typography.styles.small,
    fontWeight: Typography.weights.semibold,
  },
  statusTextActive: {
    color: Colors.successDark,
  },
  statusTextInactive: {
    color: Colors.warningDark,
  },
  actionBtn: {
    minWidth: 80,
    marginLeft: Spacing.md,
  },

  // General Cards
  card: {
    backgroundColor: Colors.white,
    borderRadius: Spacing.borderRadius.lg,
    padding: Spacing.cardPadding,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  cardHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardTitle: {
    ...Typography.styles.bodySemibold,
    color: Colors.textPrimary,
  },
  roleBadge: {
    backgroundColor: Colors.primaryFaded,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: Spacing.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  roleBadgeText: {
    ...Typography.styles.small,
    fontWeight: Typography.weights.semibold,
    color: Colors.primary,
    letterSpacing: 0.5,
  },
  userInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
  },
  userInfoRowLast: {
    paddingBottom: 0,
  },
  infoLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userInfoLabel: {
    ...Typography.styles.caption,
    color: Colors.textSecondary,
  },
  userInfoValue: {
    ...Typography.styles.bodyMedium,
    color: Colors.textPrimary,
    maxWidth: '55%',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Spacing.borderRadius.full,
  },
  statusBadgeVerified: {
    backgroundColor: Colors.successLight,
    borderWidth: 1,
    borderColor: Colors.successBorder,
  },
  statusBadgePending: {
    backgroundColor: Colors.warningLight,
    borderWidth: 1,
    borderColor: Colors.warningBorder,
  },
  statusText: {
    ...Typography.styles.small,
    fontWeight: Typography.weights.semibold,
  },
  statusTextVerified: {
    color: Colors.successDark,
  },
  statusTextPending: {
    color: Colors.warningDark,
  },

  // Quick Actions
  sectionTitle: {
    ...Typography.styles.bodySemibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Spacing.borderRadius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  actionLabel: {
    ...Typography.styles.captionMedium,
    color: Colors.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
  },
  actionDescription: {
    ...Typography.styles.small,
    color: Colors.textTertiary,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 13,
  },

  // Modules preview
  modulesCard: {
    backgroundColor: Colors.white,
    borderColor: Colors.border,
  },
  moduleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  moduleIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.primaryFaded,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primaryBorder,
  },
  moduleHeaderText: {
    flex: 1,
  },
  moduleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  moduleTitle: {
    ...Typography.styles.bodySemibold,
    color: Colors.textPrimary,
  },
  comingSoonBadge: {
    backgroundColor: Colors.surfaceSecondary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Spacing.borderRadius.full,
  },
  comingSoonBadgeText: {
    ...Typography.styles.small,
    color: Colors.textTertiary,
    fontWeight: Typography.weights.medium,
  },
  activeBadge: {
    backgroundColor: Colors.successLight,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Spacing.borderRadius.full,
    borderWidth: 1,
    borderColor: Colors.successBorder,
  },
  activeBadgeText: {
    ...Typography.styles.small,
    color: Colors.successDark,
    fontWeight: Typography.weights.semibold,
  },
  moduleSubtitle: {
    ...Typography.styles.caption,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  moduleDescription: {
    ...Typography.styles.caption,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
});

export default HomeScreen;
