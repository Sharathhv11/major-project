/**
 * Quick Actions Grid — FraudShield
 *
 * Section C: Dedicated Quick Actions grid organizing the 4 core workflows:
 * 1. Check a Message (paste text)
 * 2. Scan a Screenshot (OCR extraction)
 * 3. Detection History (view past scans)
 * 4. Protection Settings (manage rules)
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon, { IconName } from '../../../components/Icon';
import { Colors, Shadows, Spacing } from '../../../theme/theme';

const PRIMARY_COLOR = '#3a86ff';

interface ActionItem {
  id: string;
  icon: IconName;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  onPress: () => void;
}

interface QuickActionsGridProps {
  onCheckMessage: () => void;
  onScanScreenshot: () => void;
  onViewHistory: () => void;
  onOpenSettings: () => void;
}

export const QuickActionsGrid: React.FC<QuickActionsGridProps> = ({
  onCheckMessage,
  onScanScreenshot,
  onViewHistory,
  onOpenSettings,
}) => {
  const actions: ActionItem[] = [
    {
      id: 'check_msg',
      icon: 'FileText',
      iconBg: '#EFF6FF',
      iconColor: PRIMARY_COLOR,
      title: 'Check a Message',
      subtitle: 'Paste suspicious text',
      onPress: onCheckMessage,
    },
    {
      id: 'scan_shot',
      icon: 'Image',
      iconBg: '#EFF6FF',
      iconColor: PRIMARY_COLOR,
      title: 'Scan Screenshot',
      subtitle: 'Extract text with OCR',
      onPress: onScanScreenshot,
    },
    {
      id: 'det_hist',
      icon: 'Clock',
      iconBg: '#F0FDF4',
      iconColor: '#10B981',
      title: 'Detection History',
      subtitle: 'Review past scans',
      onPress: onViewHistory,
    },
    {
      id: 'prot_set',
      icon: 'Settings',
      iconBg: '#F5F3FF',
      iconColor: '#7C3AED',
      title: 'Protection Settings',
      subtitle: 'Manage security rules',
      onPress: onOpenSettings,
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeading}>Quick Actions</Text>

      <View style={styles.grid}>
        {actions.map((act) => (
          <TouchableOpacity
            key={act.id}
            style={[styles.card, Shadows.card]}
            onPress={act.onPress}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel={act.title}>
            <View style={[styles.iconBox, { backgroundColor: act.iconBg }]}>
              <Icon
                name={act.icon}
                size={22}
                color={act.iconColor}
                strokeWidth={2.3}
              />
            </View>

            <View style={styles.textBox}>
              <Text style={styles.cardTitle}>{act.title}</Text>
              <Text style={styles.cardSubtitle} numberOfLines={1}>
                {act.subtitle}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  card: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    minHeight: 105,
    justifyContent: 'space-between',
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  textBox: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
    letterSpacing: -0.1,
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#64748B',
  },
});

export default QuickActionsGrid;
