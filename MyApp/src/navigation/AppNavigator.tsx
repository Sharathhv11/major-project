/**
 * App Navigator — FraudShield
 *
 * Modern Bottom Tab Navigator configured with core security destinations:
 * - Home (Dashboard)
 * - Check (Message & Screenshot Fraud Checker)
 * - History (Detection Records & Analytics)
 * - Settings (Security Rules, Cache, App Configuration)
 *
 * Follows FraudShield design system:
 * - Primary accent #3a86ff
 * - Lucide icons with consistent sizes
 * - Smooth stack transitions and accessible safe areas
 */

import React from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/home/HomeScreen';
import MessageCheckerScreen from '../screens/home/MessageCheckerScreen';
import DetectionHistoryScreen from '../screens/history/DetectionHistoryScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import ChangePasswordScreen from '../screens/settings/ChangePasswordScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';
import EditProfileScreen from '../screens/profile/EditProfileScreen';
import AssistantChatScreen from '../screens/assistant/AssistantChatScreen';
import { Colors, Typography, Spacing, Shadows } from '../theme/theme';
import Icon, { IconName } from '../components/Icon';

const PRIMARY_COLOR = '#3a86ff';

export interface AssistantChatParams {
  mode?: 'detection_explanation' | 'general_help';
  detectionContext?: {
    detectionId?: string;
    source?: string;
    classification?: string;
    riskScore?: number;
    reasons?: string[];
    safePreview?: string;
  };
  initialPrompt?: string;
}

export type HomeStackParamList = {
  HomeMain: undefined;
  MessageChecker?: { initialMode?: 'paste' | 'upload' };
  DetectionHistory: undefined;
  Profile: undefined;
  AssistantChat?: AssistantChatParams;
};

export type CheckStackParamList = {
  CheckMain?: { initialMode?: 'paste' | 'upload' };
  AssistantChat?: AssistantChatParams;
};

export type HistoryStackParamList = {
  HistoryMain: undefined;
  AssistantChat?: AssistantChatParams;
};

export type SettingsStackParamList = {
  SettingsMain: undefined;
  ChangePassword: undefined;
  Profile: undefined;
  EditProfile: undefined;
};

// ─── Tab Icon Component ─────────────────────────────────────────────────────

interface TabIconProps {
  name: IconName;
  focused: boolean;
}

const TabBarIcon: React.FC<TabIconProps> = ({ name, focused }) => (
  <View style={[styles.iconWrapper, focused && styles.iconWrapperFocused]}>
    <Icon
      name={name}
      size={21}
      color={focused ? PRIMARY_COLOR : '#94A3B8'}
      strokeWidth={focused ? 2.5 : 2}
    />
  </View>
);

// ─── Shared Stack Options ───────────────────────────────────────────────────

const stackScreenOptions = {
  headerStyle: {
    backgroundColor: '#FFFFFF',
  },
  headerTintColor: '#0F172A',
  headerTitleStyle: {
    ...Typography.styles.bodySemibold,
    color: '#0F172A',
  },
  headerShadowVisible: false,
  contentStyle: { backgroundColor: Colors.background },
  animation: 'slide_from_right' as const,
};

// ─── 1. Home Stack ──────────────────────────────────────────────────────────

const HomeStack = createNativeStackNavigator<HomeStackParamList>();

const HomeStackScreen: React.FC = () => (
  <HomeStack.Navigator screenOptions={stackScreenOptions}>
    <HomeStack.Screen
      name="HomeMain"
      component={HomeScreen}
      options={{ headerShown: false }}
    />
    <HomeStack.Screen
      name="MessageChecker"
      component={MessageCheckerScreen}
      options={{ title: 'Check Message', headerBackTitle: 'Home' }}
    />
    <HomeStack.Screen
      name="DetectionHistory"
      component={DetectionHistoryScreen}
      options={{ title: 'Detection History', headerBackTitle: 'Home' }}
    />
    <HomeStack.Screen
      name="Profile"
      component={ProfileScreen}
      options={{ title: 'My Profile', headerBackTitle: 'Home' }}
    />
    <HomeStack.Screen
      name="AssistantChat"
      component={AssistantChatScreen}
      options={{ headerShown: false }}
    />
  </HomeStack.Navigator>
);

// ─── 2. Check Stack ─────────────────────────────────────────────────────────

const CheckStack = createNativeStackNavigator<CheckStackParamList>();

const CheckStackScreen: React.FC = () => (
  <CheckStack.Navigator screenOptions={stackScreenOptions}>
    <CheckStack.Screen
      name="CheckMain"
      component={MessageCheckerScreen}
      options={{ title: 'Fraud Checker', headerShown: false }}
    />
    <CheckStack.Screen
      name="AssistantChat"
      component={AssistantChatScreen}
      options={{ headerShown: false }}
    />
  </CheckStack.Navigator>
);

// ─── 3. History Stack ───────────────────────────────────────────────────────

const HistoryStack = createNativeStackNavigator<HistoryStackParamList>();

const HistoryStackScreen: React.FC = () => (
  <HistoryStack.Navigator screenOptions={stackScreenOptions}>
    <HistoryStack.Screen
      name="HistoryMain"
      component={DetectionHistoryScreen}
      options={{ title: 'Detection History', headerShown: false }}
    />
    <HistoryStack.Screen
      name="AssistantChat"
      component={AssistantChatScreen}
      options={{ headerShown: false }}
    />
  </HistoryStack.Navigator>
);

// ─── 4. Settings Stack ──────────────────────────────────────────────────────

const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const SettingsStackScreen: React.FC = () => (
  <SettingsStack.Navigator screenOptions={stackScreenOptions}>
    <SettingsStack.Screen
      name="SettingsMain"
      component={SettingsScreen}
      options={{ headerShown: false }}
    />
    <SettingsStack.Screen
      name="ChangePassword"
      component={ChangePasswordScreen}
      options={{ title: 'Change Password', headerBackTitle: 'Settings' }}
    />
    <SettingsStack.Screen
      name="Profile"
      component={ProfileScreen}
      options={{ title: 'Profile', headerBackTitle: 'Settings' }}
    />
    <SettingsStack.Screen
      name="EditProfile"
      component={EditProfileScreen}
      options={{ title: 'Edit Profile', headerBackTitle: 'Profile' }}
    />
  </SettingsStack.Navigator>
);

// ─── Bottom Tab Navigator ───────────────────────────────────────────────────

const Tab = createBottomTabNavigator();

export const AppNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: PRIMARY_COLOR,
        tabBarInactiveTintColor: '#94A3B8',
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarHideOnKeyboard: true,
      }}>
      <Tab.Screen
        name="Home"
        component={HomeStackScreen}
        options={{
          tabBarLabel: 'Home',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Check"
        component={CheckStackScreen}
        options={{
          tabBarLabel: 'Check',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Search" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={HistoryStackScreen}
        options={{
          tabBarLabel: 'History',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Clock" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsStackScreen}
        options={{
          tabBarLabel: 'Settings',
          tabBarIcon: ({ focused }) => (
            <TabBarIcon name="Settings" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E2E8F0',
    borderTopWidth: 1,
    paddingTop: Spacing.xs,
    paddingBottom: Platform.OS === 'ios' ? Spacing.lg : Spacing.sm,
    height: Platform.OS === 'ios' ? 82 : 64,
    ...Shadows.md,
  },
  tabBarLabel: {
    ...Typography.styles.small,
    fontWeight: Typography.weights.medium,
    marginTop: 2,
    fontSize: 11,
  },
  iconWrapper: {
    padding: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapperFocused: {
    backgroundColor: '#EFF6FF',
  },
});

export default AppNavigator;
