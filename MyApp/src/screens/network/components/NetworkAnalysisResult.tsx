/**
 * Network Analysis Result Component — FraudShield
 *
 * Displays the comprehensive Graph Convolutional Network (GCN) analysis results:
 * - Prominent Fraud Risk Score (0-100 gauge)
 * - Calibrated Risk Level Badge (Low, Medium, High)
 * - Total transactions & entities processed
 * - High-Risk Suspicious Entities list (Mule hubs, Ring originators)
 * - Suspicious Transactions list with amounts and risk indicators
 * - Clearly labeled UI placeholder notice (as required by prompt restrictions)
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import Icon from '../../../components/Icon';
import { Colors, Shadows, Spacing } from '../../../theme/theme';

export interface SuspiciousEntity {
  id: string;
  role: string;
  riskScore: number;
  transactionsInvolved: number;
  totalVolume: string;
  reason: string;
}

export interface SuspiciousTx {
  txId: string;
  source: string;
  target: string;
  amount: string;
  timestamp: string;
  anomalyType: string;
}

export interface NetworkAnalysisResultData {
  riskScore: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  totalTransactions: number;
  totalEntities: number;
  flaggedEntitiesCount: number;
  flaggedTransactionsCount: number;
  suspiciousEntities: SuspiciousEntity[];
  suspiciousTransactions: SuspiciousTx[];
  modelType: string;
}

interface NetworkAnalysisResultProps {
  result: NetworkAnalysisResultData;
  onReset: () => void;
  isLiveResult?: boolean;
  inferenceTimeMs?: number;
}

export const NetworkAnalysisResult: React.FC<NetworkAnalysisResultProps> = ({
  result,
  onReset,
  isLiveResult = false,
  inferenceTimeMs,
}) => {
  const [activeTab, setActiveTab] = useState<'entities' | 'transactions'>('entities');

  const getRiskColor = (level: 'Low' | 'Medium' | 'High') => {
    switch (level) {
      case 'High':
        return Colors.error;
      case 'Medium':
        return Colors.warning;
      case 'Low':
      default:
        return Colors.success;
    }
  };

  const getRiskBg = (level: 'Low' | 'Medium' | 'High') => {
    switch (level) {
      case 'High':
        return '#FEF2F2';
      case 'Medium':
        return '#FFFBEB';
      case 'Low':
      default:
        return '#ECFDF5';
    }
  };

  const riskColor = getRiskColor(result.riskLevel);
  const riskBg = getRiskBg(result.riskLevel);

  return (
    <View style={styles.container}>
      {/* ─── Model State Banner: Live Backend vs Preview ──────────────────── */}
      {isLiveResult ? (
        <View style={styles.liveNoticeBanner}>
          <Icon name="CheckCircle2" size={16} color={Colors.successDark} strokeWidth={2.4} />
          <View style={styles.noticeTextContainer}>
            <Text style={styles.liveNoticeTitle}>
              Live GCN Model Inference Active {inferenceTimeMs ? `(${inferenceTimeMs}ms)` : ''}
            </Text>
            <Text style={styles.liveNoticeBody}>
              Spectral graph convolution was executed in real-time by the Python FastAPI backend engine.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.noticeBanner}>
          <Icon name="Info" size={16} color="#1D4ED8" strokeWidth={2.4} />
          <View style={styles.noticeTextContainer}>
            <Text style={styles.noticeTitle}>GCN Analysis UI Preview</Text>
            <Text style={styles.noticeBody}>
              Displaying simulated frontend interface state. Live GCN model inference will populate these fields when the backend API is connected.
            </Text>
          </View>
        </View>
      )}

      {/* ─── Primary Score & Risk Level Card ──────────────────────────────── */}
      <View style={[styles.scoreCard, Shadows.card]}>
        <View style={styles.scoreRow}>
          {/* Circular Score Badge */}
          <View style={[styles.scoreCircle, { borderColor: riskColor }]}>
            <Text style={[styles.scoreValue, { color: riskColor }]}>
              {result.riskScore}
            </Text>
            <Text style={styles.scoreScale}>/100</Text>
          </View>

          {/* Risk Level and Summary */}
          <View style={styles.scoreTextCol}>
            <View style={styles.riskBadgeRow}>
              <View style={[styles.riskLevelBadge, { backgroundColor: riskBg }]}>
                <View style={[styles.riskLevelDot, { backgroundColor: riskColor }]} />
                <Text style={[styles.riskLevelText, { color: riskColor }]}>
                  {result.riskLevel} Risk Level
                </Text>
              </View>
            </View>

            <Text style={styles.scoreHeading}>
              {result.riskLevel === 'High'
                ? 'Fraud Ring Cluster Detected'
                : result.riskLevel === 'Medium'
                ? 'Elevated Transaction Velocity'
                : 'Standard Transaction Behavior'}
            </Text>
            <Text style={styles.scoreDescription}>
              Multi-hop graph convolution identified {result.flaggedEntitiesCount} suspicious nodes participating in synchronized fund transfers.
            </Text>
          </View>
        </View>

        {/* ─── Metric Pills Row ────────────────────────────────────────── */}
        <View style={styles.metricsPillRow}>
          <View style={styles.metricPill}>
            <Text style={styles.metricPillVal}>{result.totalTransactions}</Text>
            <Text style={styles.metricPillLbl}>Transactions</Text>
          </View>
          <View style={styles.pillDivider} />
          <View style={styles.metricPill}>
            <Text style={styles.metricPillVal}>{result.totalEntities}</Text>
            <Text style={styles.metricPillLbl}>Entities</Text>
          </View>
          <View style={styles.pillDivider} />
          <View style={styles.metricPill}>
            <Text style={[styles.metricPillVal, { color: Colors.error }]}>
              {result.flaggedEntitiesCount}
            </Text>
            <Text style={styles.metricPillLbl}>Mule Nodes</Text>
          </View>
          <View style={styles.pillDivider} />
          <View style={styles.metricPill}>
            <Text style={[styles.metricPillVal, { color: Colors.error }]}>
              {result.flaggedTransactionsCount}
            </Text>
            <Text style={styles.metricPillLbl}>Flagged Tx</Text>
          </View>
        </View>
      </View>

      {/* ─── Tabs: Suspicious Entities vs Suspicious Transactions ─────────── */}
      <View style={styles.tabsHeader}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'entities' && styles.tabButtonActive]}
          onPress={() => setActiveTab('entities')}
          activeOpacity={0.8}
          accessibilityRole="tab">
          <Text
            style={[styles.tabButtonText, activeTab === 'entities' && styles.tabButtonTextActive]}>
            Flagged Entities ({result.suspiciousEntities.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'transactions' && styles.tabButtonActive]}
          onPress={() => setActiveTab('transactions')}
          activeOpacity={0.8}
          accessibilityRole="tab">
          <Text
            style={[styles.tabButtonText, activeTab === 'transactions' && styles.tabButtonTextActive]}>
            Flagged Transactions ({result.suspiciousTransactions.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ─── Tab Content: Entities ───────────────────────────────────────── */}
      {activeTab === 'entities' ? (
        <View style={styles.tabContentCard}>
          {result.suspiciousEntities.map((entity, idx) => (
            <View key={entity.id || idx} style={styles.entityItemCard}>
              <View style={styles.entityTopRow}>
                <View style={styles.entityIdGroup}>
                  <View style={styles.entityIconBox}>
                    <Icon name="AlertTriangle" size={14} color="#EF4444" strokeWidth={2.4} />
                  </View>
                  <View>
                    <Text style={styles.entityIdText}>{entity.id}</Text>
                    <Text style={styles.entityRoleText}>{entity.role}</Text>
                  </View>
                </View>

                <View style={styles.entityScorePill}>
                  <Text style={styles.entityScoreText}>Risk {entity.riskScore}%</Text>
                </View>
              </View>

              <Text style={styles.entityReasonText}>{entity.reason}</Text>

              <View style={styles.entityFooterRow}>
                <Text style={styles.entityFooterMeta}>
                  Involved in {entity.transactionsInvolved} tx • Volume: {entity.totalVolume}
                </Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        /* ─── Tab Content: Transactions ─────────────────────────────────── */
        <View style={styles.tabContentCard}>
          {result.suspiciousTransactions.map((tx, idx) => (
            <View key={tx.txId || idx} style={styles.txItemCard}>
              <View style={styles.txTopRow}>
                <Text style={styles.txIdTag}>{tx.txId}</Text>
                <Text style={styles.txAmount}>{tx.amount}</Text>
              </View>

              <View style={styles.txRouteRow}>
                <Text style={styles.txAccount}>{tx.source}</Text>
                <Icon name="ArrowRight" size={12} color="#94A3B8" />
                <Text style={styles.txAccount}>{tx.target}</Text>
              </View>

              <View style={styles.txBottomRow}>
                <View style={styles.anomalyBadge}>
                  <Text style={styles.anomalyText}>{tx.anomalyType}</Text>
                </View>
                <Text style={styles.txTime}>{tx.timestamp}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ─── Reset / Analyze Another Button ──────────────────────────────── */}
      <TouchableOpacity
        style={styles.resetButton}
        onPress={onReset}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Analyze another dataset">
        <Icon name="RefreshCw" size={16} color="#3a86ff" strokeWidth={2.2} />
        <Text style={styles.resetButtonText}>Analyze Another Dataset</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: Spacing.md,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 12,
    marginBottom: Spacing.md,
    gap: 10,
  },
  liveNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 12,
    marginBottom: Spacing.md,
    gap: 10,
  },
  noticeTextContainer: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1D4ED8',
    marginBottom: 2,
  },
  liveNoticeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
    marginBottom: 2,
  },
  noticeBody: {
    fontSize: 11,
    color: '#3B82F6',
    lineHeight: 16,
  },
  liveNoticeBody: {
    fontSize: 11,
    color: '#065F46',
    lineHeight: 16,
  },
  scoreCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.md,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 16,
  },
  scoreCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  scoreValue: {
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 28,
  },
  scoreScale: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  scoreTextCol: {
    flex: 1,
  },
  riskBadgeRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  riskLevelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    gap: 6,
  },
  riskLevelDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  riskLevelText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  scoreHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 3,
  },
  scoreDescription: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
  metricsPillRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 6,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  metricPill: {
    alignItems: 'center',
    flex: 1,
  },
  metricPillVal: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  metricPillLbl: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  pillDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E2E8F0',
  },
  tabsHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 9,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    ...Shadows.sm,
  },
  tabButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  tabContentCard: {
    marginBottom: Spacing.md,
  },
  entityItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 12,
    marginBottom: 8,
  },
  entityTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  entityIdGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  entityIconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  entityIdText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: 'monospace',
  },
  entityRoleText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '600',
  },
  entityScorePill: {
    backgroundColor: '#FEE2E2',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  entityScoreText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B91C1C',
  },
  entityReasonText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 16,
    marginBottom: 6,
  },
  entityFooterRow: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 6,
  },
  entityFooterMeta: {
    fontSize: 11,
    color: '#64748B',
  },
  txItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 8,
  },
  txTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  txIdTag: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#475569',
    backgroundColor: '#F1F5F9',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  txRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  txAccount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    fontFamily: 'monospace',
  },
  txBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  anomalyBadge: {
    backgroundColor: '#FEF2F2',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  anomalyText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#DC2626',
  },
  txTime: {
    fontSize: 11,
    color: '#94A3B8',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#3a86ff',
    borderRadius: 12,
    paddingVertical: 12,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3a86ff',
  },
});

export default NetworkAnalysisResult;
