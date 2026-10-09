/**
 * Recent Detections Section — FraudShield
 *
 * Section D: Displays a compact preview of real recent detections (up to 3 items)
 * with source badge, timestamp, preview text, and risk assessment indicators.
 * Provides a "View All" link opening the detection history screen, and an appropriate
 * empty state when no detections exist.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Icon from '../../../components/Icon';
import { Colors, Shadows, Spacing } from '../../../theme/theme';
import {
  DetectionRecord,
  getDetectionRecords,
  subscribeToDetectionHistory,
} from '../../../storage/detectionHistoryStorage';

const PRIMARY_COLOR = '#3a86ff';

interface RecentDetectionsSectionProps {
  onViewAll: () => void;
}

export const RecentDetectionsSection: React.FC<RecentDetectionsSectionProps> = ({
  onViewAll,
}) => {
  const [records, setRecords] = useState<DetectionRecord[]>([]);

  useEffect(() => {
    getDetectionRecords().then((data) => setRecords(data));

    const unsubscribe = subscribeToDetectionHistory((updated) => {
      setRecords(updated);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const recentList = records.slice(0, 3);

  const formatTimestamp = (ts: number): string => {
    if (!ts) return 'Recent';
    const diffMs = Date.now() - ts;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  };

  const getSourceLabel = (src: string): string => {
    const s = (src || '').toUpperCase();
    if (s.includes('WHATSAPP')) return 'WhatsApp';
    if (s.includes('SMS')) return 'SMS';
    if (s.includes('OCR')) return 'Screenshot OCR';
    if (s.includes('MANUAL_SCAN')) return 'Screen Assistant';
    return 'Manual Check';
  };

  return (
    <View style={styles.container}>
      {/* ─── Section Header Row ────────────────────────────────────── */}
      <View style={styles.headerRow}>
        <Text style={styles.sectionHeading}>Recent Detections</Text>
        <TouchableOpacity
          onPress={onViewAll}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="View all detections">
          <Text style={styles.viewAllText}>View All →</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Detections Preview or Empty State ─────────────────────── */}
      {recentList.length === 0 ? (
        <View style={[styles.emptyCard, Shadows.card]}>
          <View style={styles.emptyIconCircle}>
            <Icon name="ShieldCheck" size={24} color="#059669" strokeWidth={2.4} />
          </View>
          <View style={styles.emptyTextCol}>
            <Text style={styles.emptyTitle}>No suspicious messages detected yet</Text>
            <Text style={styles.emptySubtitle}>
              Incoming WhatsApp and SMS messages will be analyzed automatically in the background.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.listCol}>
          {recentList.map((item) => {
            const isThreat = item.isFraud || item.riskScore >= 0.70;
            const scorePct = Math.round(item.riskScore * 100);

            return (
              <View key={item.id} style={[styles.recordCard, Shadows.card]}>
                <View style={styles.cardTopRow}>
                  <View style={styles.sourceBadge}>
                    <Text style={styles.sourceText}>{getSourceLabel(item.source)}</Text>
                  </View>
                  <Text style={styles.timeText}>{formatTimestamp(item.timestamp)}</Text>
                </View>

                <Text style={styles.previewText} numberOfLines={2}>
                  "{item.preview}"
                </Text>

                <View style={styles.cardBottomRow}>
                  <View style={styles.statusGroup}>
                    <Icon
                      name={isThreat ? 'AlertTriangle' : 'CheckCircle2'}
                      size={14}
                      color={isThreat ? '#DC2626' : '#059669'}
                      strokeWidth={2.4}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      style={[
                        styles.statusLabel,
                        isThreat ? styles.textThreat : styles.textClean,
                      ]}>
                      {isThreat ? 'Potential Fraud' : 'Likely Safe'}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.riskPill,
                      isThreat ? styles.riskPillThreat : styles.riskPillClean,
                    ]}>
                    <Text
                      style={[
                        styles.riskPillText,
                        isThreat ? styles.riskPillTextThreat : styles.riskPillTextClean,
                      ]}>
                      {scorePct}% Risk
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: PRIMARY_COLOR,
  },

  // Empty State Card
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  emptyTextCol: {
    flex: 1,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 16,
  },

  // Record Cards
  listCol: {
    gap: 8,
  },
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sourceBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '700',
    color: PRIMARY_COLOR,
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  previewText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#1E293B',
    marginBottom: 8,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    paddingTop: 6,
  },
  statusGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  textThreat: {
    color: '#DC2626',
  },
  textClean: {
    color: '#059669',
  },
  riskPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  riskPillThreat: {
    backgroundColor: '#FEE2E2',
  },
  riskPillClean: {
    backgroundColor: '#D1FAE5',
  },
  riskPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  riskPillTextThreat: {
    color: '#DC2626',
  },
  riskPillTextClean: {
    color: '#059669',
  },
});

export default RecentDetectionsSection;
