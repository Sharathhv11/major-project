/**
 * Detection History Screen — FraudShield
 *
 * Displays genuine past message fraud detections from WhatsApp, SMS, Manual Scan, and OCR.
 * Supports filtering by severity (All / Threats / Clean), clearing history, and inspects
 * real local records with zero fabricated data.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { Colors, Typography, Spacing, Shadows } from '../../theme/theme';
import {
  DetectionRecord,
  getDetectionRecords,
  clearDetectionHistory,
  subscribeToDetectionHistory,
} from '../../storage/detectionHistoryStorage';

const PRIMARY_COLOR = '#3a86ff';

export const DetectionHistoryScreen: React.FC = () => {
  const [records, setRecords] = useState<DetectionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [filter, setFilter] = useState<'ALL' | 'FRAUD' | 'CLEAN'>('ALL');

  const loadRecords = useCallback(async () => {
    setLoading(true);
    const data = await getDetectionRecords();
    setRecords(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRecords();
    const unsubscribe = subscribeToDetectionHistory((updated) => {
      setRecords(updated);
    });
    return () => {
      unsubscribe();
    };
  }, [loadRecords]);

  const handleClearHistory = () => {
    if (records.length === 0) return;

    Alert.alert(
      'Clear History',
      'Are you sure you want to delete all saved detection records? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            await clearDetectionHistory();
            setRecords([]);
          },
        },
      ],
    );
  };

  const filteredRecords = records.filter((r) => {
    if (filter === 'FRAUD') return r.isFraud;
    if (filter === 'CLEAN') return !r.isFraud;
    return true;
  });

  const formatTimestamp = (ts: number): string => {
    if (!ts) return 'Recent';
    const diffMs = Date.now() - ts;
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;

    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getSourceLabel = (src: string): string => {
    const s = (src || '').toUpperCase();
    if (s.includes('WHATSAPP')) return 'WhatsApp';
    if (s.includes('SMS')) return 'SMS';
    if (s.includes('OCR')) return 'Screenshot OCR';
    if (s.includes('MANUAL_SCAN')) return 'Screen Assistant';
    return 'Manual Checker';
  };

  const renderItem = ({ item }: { item: DetectionRecord }) => {
    const isThreat = item.isFraud || item.riskScore >= 0.70;
    const scorePct = Math.round(item.riskScore * 100);

    return (
      <View style={[styles.recordCard, Shadows.card]}>
        {/* Top Meta Row */}
        <View style={styles.cardHeaderRow}>
          <View style={styles.sourceBadge}>
            <Icon
              name={
                item.source.includes('WHATSAPP')
                  ? 'Mail'
                  : item.source.includes('OCR')
                  ? 'Image'
                  : 'Shield'
              }
              size={12}
              color={PRIMARY_COLOR}
              strokeWidth={2.4}
              style={{ marginRight: 4 }}
            />
            <Text style={styles.sourceText}>{getSourceLabel(item.source)}</Text>
          </View>

          <Text style={styles.timeText}>{formatTimestamp(item.timestamp)}</Text>
        </View>

        {/* Shortened Message Preview */}
        <Text style={styles.previewText} numberOfLines={2}>
          "{item.preview}"
        </Text>

        {/* Bottom Assessment Row */}
        <View style={styles.cardFooterRow}>
          <View style={styles.statusIndicatorGroup}>
            <Icon
              name={isThreat ? 'AlertTriangle' : 'CheckCircle2'}
              size={16}
              color={isThreat ? '#DC2626' : '#059669'}
              strokeWidth={2.4}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.statusLabel,
                isThreat ? styles.textThreat : styles.textClean,
              ]}>
              {isThreat ? 'Potential Fraud' : 'Likely Safe'}
            </Text>
          </View>

          <View style={[styles.scorePill, isThreat ? styles.scorePillThreat : styles.scorePillClean]}>
            <Text style={[styles.scorePillText, isThreat ? styles.scorePillTextThreat : styles.scorePillTextClean]}>
              {scorePct}% Risk
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ─── Screen Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Detection History</Text>
          <Text style={styles.headerSubtitle}>
            {records.length} total event{records.length === 1 ? '' : 's'} recorded
          </Text>
        </View>

        {records.length > 0 && (
          <TouchableOpacity
            onPress={handleClearHistory}
            style={styles.clearBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Clear history">
            <Icon name="Trash2" size={16} color={Colors.textTertiary} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>

      {/* ─── Filter Tabs ───────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, filter === 'ALL' && styles.filterChipActive]}
          onPress={() => setFilter('ALL')}>
          <Text style={[styles.filterChipText, filter === 'ALL' && styles.filterChipTextActive]}>
            All ({records.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'FRAUD' && styles.filterChipActive]}
          onPress={() => setFilter('FRAUD')}>
          <Text style={[styles.filterChipText, filter === 'FRAUD' && styles.filterChipTextActive]}>
            Threats ({records.filter((r) => r.isFraud).length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, filter === 'CLEAN' && styles.filterChipActive]}
          onPress={() => setFilter('CLEAN')}>
          <Text style={[styles.filterChipText, filter === 'CLEAN' && styles.filterChipTextActive]}>
            Clean ({records.filter((r) => !r.isFraud).length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Record List or Empty State ────────────────────────────── */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
        </View>
      ) : filteredRecords.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Icon name="ShieldCheck" size={32} color={PRIMARY_COLOR} strokeWidth={2.2} />
          </View>
          <Text style={styles.emptyTitle}>
            {filter === 'ALL'
              ? 'No detections recorded yet'
              : filter === 'FRAUD'
              ? 'No fraud threats flagged'
              : 'No clean message records'}
          </Text>
          <Text style={styles.emptySubtitle}>
            Incoming messages from WhatsApp and SMS are checked automatically in the background. You can also manually check suspicious text or screenshots.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  clearBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },

  // Filter Tabs
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.screenHorizontal,
    marginVertical: 10,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: PRIMARY_COLOR,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Record List
  listContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingBottom: Spacing.xxxl,
    paddingTop: 4,
  },
  recordCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '600',
    color: PRIMARY_COLOR,
  },
  timeText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  previewText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1E293B',
    marginBottom: 10,
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  statusIndicatorGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  textThreat: {
    color: '#DC2626',
  },
  textClean: {
    color: '#059669',
  },
  scorePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  scorePillThreat: {
    backgroundColor: '#FEE2E2',
  },
  scorePillClean: {
    backgroundColor: '#D1FAE5',
  },
  scorePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  scorePillTextThreat: {
    color: '#DC2626',
  },
  scorePillTextClean: {
    color: '#059669',
  },

  // Empty State
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default DetectionHistoryScreen;
