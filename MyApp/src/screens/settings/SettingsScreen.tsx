/**
 * Modern Settings Screen
 *
 * Polished settings list with Lucide icons, categorized sections,
 * version indicator, and sign-out confirmation.
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, CommonActions} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {SettingsStackParamList} from '../../navigation/AppNavigator';
import {useAuth} from '../../context/AuthContext';
import Config from '../../config';
import Icon, {IconName} from '../../components/Icon';
import {Colors, Typography, Spacing, Shadows} from '../../theme/theme';
import {messageFraudCache} from '../../fraudDetection';

interface SettingsItem {
  id: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
  label: string;
  description?: string;
  onPress: () => void;
  danger?: boolean;
  isSwitch?: boolean;
  switchValue?: boolean;
  onSwitchChange?: (value: boolean) => void;
}

interface SettingsSection {
  title: string;
  items: SettingsItem[];
}

const SettingsScreen: React.FC = () => {
  const {user, logout} = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();

  const [cacheEnabled, setCacheEnabled] = useState<boolean>(true);
  const [cachedCount, setCachedCount] = useState<number>(0);

  useEffect(() => {
    setCacheEnabled(messageFraudCache.isEnabled());
    setCachedCount(messageFraudCache.size());
  }, []);

  const handleToggleCache = async (val: boolean) => {
    setCacheEnabled(val);
    await messageFraudCache.setEnabled(val);
  };

  const handleClearCache = () => {
    messageFraudCache.clear();
    setCachedCount(0);
    Alert.alert(
      'Cache Flushed',
      'All cached message hashes and fraud results have been cleared.',
    );
  };

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your account?',
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

  const sections: SettingsSection[] = [
    {
      title: 'Account Settings',
      items: [
        {
          id: 'profile',
          icon: 'User',
          iconBg: Colors.primaryFaded,
          iconColor: Colors.primary,
          label: 'Edit Profile',
          description: 'Name and phone number',
          onPress: () => {
            navigation
              .getParent()
              ?.dispatch(CommonActions.navigate({name: 'Profile'}));
          },
        },
        {
          id: 'password',
          icon: 'KeyRound',
          iconBg: '#F3E8FF',
          iconColor: '#7C3AED',
          label: 'Change Password',
          description: 'Update your security credentials',
          onPress: () => navigation.navigate('ChangePassword'),
        },
      ],
    },
    {
      title: 'Developer Options (Fraud Cache)',
      items: [
        {
          id: 'fraud_cache_toggle',
          icon: 'Clock',
          iconBg: '#E0F2FE',
          iconColor: '#0284C7',
          label: 'Message Cache System',
          description: cacheEnabled
            ? 'Active (15m suppression)'
            : 'Disabled (Forces real-time analysis)',
          onPress: () => handleToggleCache(!cacheEnabled),
          isSwitch: true,
          switchValue: cacheEnabled,
          onSwitchChange: handleToggleCache,
        },
        {
          id: 'clear_cache',
          icon: 'Activity',
          iconBg: '#FEF3C7',
          iconColor: '#D97706',
          label: 'Clear Message Cache',
          description:
            cachedCount > 0
              ? `${cachedCount} active cached item(s)`
              : 'Cache is currently empty',
          onPress: handleClearCache,
        },
      ],
    },
    {
      title: 'About Application',
      items: [
        {
          id: 'version',
          icon: 'Info',
          iconBg: Colors.surfaceSecondary,
          iconColor: Colors.textSecondary,
          label: 'App Version',
          description: `v${Config.APP_VERSION || '1.0.0'} (Release)`,
          onPress: () => {},
        },
      ],
    },
    {
      title: 'Session Management',
      items: [
        {
          id: 'logout',
          icon: 'LogOut',
          iconBg: Colors.errorLight,
          iconColor: Colors.error,
          label: 'Sign Out',
          description: user?.email,
          onPress: handleLogout,
          danger: true,
        },
      ],
    },
  ];


  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}>
        {/* ─── Header ────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.screenTitle}>Settings</Text>
        </View>

        {/* ─── Categorized Sections ──────────────────────────────── */}
        {sections.map(section => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={[styles.card, Shadows.card]}>
              {section.items.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.settingsItem,
                    index < section.items.length - 1 &&
                      styles.settingsItemBorder,
                  ]}
                  onPress={item.onPress}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}>
                  <View
                    style={[
                      styles.itemIconBox,
                      {backgroundColor: item.iconBg},
                    ]}>
                    <Icon
                      name={item.icon}
                      size={20}
                      color={item.iconColor}
                      strokeWidth={2.2}
                    />
                  </View>

                  <View style={styles.itemContent}>
                    <Text
                      style={[
                        styles.itemLabel,
                        item.danger && styles.itemLabelDanger,
                      ]}>
                      {item.label}
                    </Text>
                    {item.description ? (
                      <Text
                        style={[
                          styles.itemDescription,
                          item.danger && styles.itemDescriptionDanger,
                        ]}
                        numberOfLines={1}>
                        {item.description}
                      </Text>
                    ) : null}
                  </View>

                  {item.isSwitch ? (
                    <Switch
                      value={item.switchValue}
                      onValueChange={item.onSwitchChange}
                      trackColor={{false: Colors.border, true: Colors.primary}}
                      thumbColor="#FFFFFF"
                    />
                  ) : item.id !== 'version' ? (
                    <Icon
                      name="ChevronRight"
                      size={18}
                      color={item.danger ? Colors.error : Colors.textTertiary}
                    />
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
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
    marginBottom: Spacing.lg,
  },
  screenTitle: {
    ...Typography.styles.heading1,
    color: Colors.textPrimary,
  },
  section: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.styles.captionMedium,
    color: Colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: Spacing.borderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md + 2,
    paddingHorizontal: Spacing.cardPadding,
  },
  settingsItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  itemIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  itemContent: {
    flex: 1,
  },
  itemLabel: {
    ...Typography.styles.bodyMedium,
    color: Colors.textPrimary,
    fontWeight: Typography.weights.medium,
  },
  itemLabelDanger: {
    color: Colors.error,
  },
  itemDescription: {
    ...Typography.styles.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  itemDescriptionDanger: {
    color: Colors.errorDark,
    opacity: 0.8,
  },
});

export default SettingsScreen;
