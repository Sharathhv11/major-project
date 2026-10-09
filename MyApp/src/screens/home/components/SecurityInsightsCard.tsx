/**
 * Security Insights Card — FraudShield
 *
 * Section E: Displays a compact, transparent security summary:
 * - Total messages analyzed
 * - Potential fraud threats flagged
 * - Active real-time defense status
 *
 * Strictly adheres to project rule: Only displays metrics calculated accurately
 * from existing data (zero fabricated figures).
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Icon from '../../../components/Icon';
import { Shadows, Spacing } from '../../../theme/theme';
import {
  getSecurityStats,
  SecurityStats,
  subscribeToDetectionHistory,
} from '../../../storage/detectionHistoryStorage';

const PRIMARY_COLOR = '#3a86ff';

interface SecurityInsightsCardProps {
  isProtectionActive: boolean;
}

export const SecurityInsightsCard: React.FC<SecurityInsightsCardProps> = ({
  isProtectionActive,
}) => {
  const [stats, setStats] = useState<SecurityStats>({
    totalAnalyzed: 0,
    threatsFlagged: 0,
    cleanMessages: 0,
  });

  useEffect(() => {
    getSecurityStats().then(setStats);
    const unsubscribe = subscribeToDetectionHistory(() => {
      getSecurityStats().then(setStats);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.sectionHeading}>Security Insights</Text>

      <View style={[styles.card, Shadows.card]}>
        <View style={styles.metricsRow}>
          {/* Metric 1: Total Scanned */}
          <View style={styles.metricCol}>
            <Text style={styles.metricValue}>{stats.totalAnalyzed}</Text>
            <Text style={styles.metricLabel}>Total Scanned</Text>
          </View>

          <View style={styles.metricDivider} />

          {/* Metric 2: Threats Flagged */}
          <View style={styles.metricCol}>
            <Text
              style={[
                styles.metricValue,
                stats.threatsFlagged > 0 ? styles.textThreat : styles.textNeutral,
              ]}>
              {stats.threatsFlagged}
            </Text>
            <Text style={styles.metricLabel}>Threats Flagged</Text>
          </View>

          <View style={styles.metricDivider} />

          {/* Metric 3: Defense Engine */}
          <View style={styles.metricCol}>
            <View style={styles.statusIndicatorRow}>
              <View
                style={[
                  styles.statusDot,
                  isProtectionActive ? styles.dotActive : styles.dotInactive,
                ]}
              />
              <Text style={styles.metricValueStatus}>
                {isProtectionActive ? 'Active' : 'Alert'}
              </Text>
            </View>
            <Text style={styles.metricLabel}>Defense Shield</Text>
          </View>
        </View>

        <View style={styles.footerRow}>
          <Icon name="Activity" size={13} color={PRIMARY_COLOR} strokeWidth={2.2} style={{ marginRight: 6 }} />
          <Text style={styles.footerText}>
            DistilBERT NLP engine + local rule detection active
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.xl,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
  },
  metricCol: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E2E8F0',
  },
  metricValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  textThreat: {
    color: '#DC2626',
  },
  textNeutral: {
    color: '#0F172A',
  },
  metricLabel: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  statusIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  dotActive: {
    backgroundColor: '#10B981',
  },
  dotInactive: {
    backgroundColor: '#F59E0B',
  },
  metricValueStatus: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    justifyContent: 'center',
  },
  footerText: {
    fontSize: 11,
    color: '#64748B',
  },
});

export default SecurityInsightsCard;
