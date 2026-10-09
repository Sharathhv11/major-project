/**
 * Dashboard Header Component — FraudShield
 *
 * Section A: Clean, compact header with plain branding logo, concise tagline,
 * and user profile shortcut.
 */

import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import UserAvatar from '../../../components/UserAvatar';
import { Typography, Spacing } from '../../../theme/theme';

interface DashboardHeaderProps {
  userName?: string;
  onPressProfile?: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  userName = 'User',
  onPressProfile,
}) => {
  const firstName = userName.split(' ')[0] || 'User';

  return (
    <View style={styles.container}>
      {/* Top Branding Row */}
      <View style={styles.topRow}>
        <Image
          source={require('../../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="FraudShield Brand"
        />

        <TouchableOpacity
          onPress={onPressProfile}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Open user profile"
          style={styles.avatarButton}>
          <UserAvatar name={userName} size={38} showRing />
        </TouchableOpacity>
      </View>

      {/* Concise Welcome Tagline */}
      <View style={styles.greetingBox}>
        <Text style={styles.tagline}>Your security, at a glance.</Text>
        <Text style={styles.userGreeting}>Welcome back, {firstName}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    width: 140,
    height: 32,
  },
  avatarButton: {
    padding: 2,
  },
  greetingBox: {
    marginTop: 2,
  },
  tagline: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.4,
    lineHeight: 28,
  },
  userGreeting: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
    fontWeight: Typography.weights.normal,
  },
});

export default DashboardHeader;
