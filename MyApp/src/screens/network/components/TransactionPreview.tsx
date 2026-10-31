/**
 * Transaction Preview Component — FraudShield Network Analysis
 *
 * Displays a tabular preview of transaction records loaded from the dataset:
 * - Summary metrics (Tx Count, Sender Nodes, Receiver Nodes, Channels)
 * - Record list with sender, recipient, amount, timestamp, and channel
 * - Flagged pre-screen indicators
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import Icon from '../../../components/Icon';
import { Colors, Shadows, Spacing } from '../../../theme/theme';
import { SelectedTransactionFile } from './TransactionUploadCard';

interface TransactionPreviewProps {
  file: SelectedTransactionFile;
}

export const TransactionPreview: React.FC<TransactionPreviewProps> = ({ file }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  return (
    <View style={[styles.card, Shadows.card]}>
      {/* Header with expand / collapse */}
      <TouchableOpacity
        style={styles.headerRow}
        activeOpacity={0.8}
        onPress={() => setIsExpanded(!isExpanded)}
        accessibilityRole="button"
        accessibilityLabel="Toggle transaction preview">
        <View style={styles.titleLeft}>
          <View style={styles.iconBox}>
            <Icon name="Activity" size={18} color="#3a86ff" strokeWidth={2.4} />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Transaction Data Preview</Text>
            <Text style={styles.sectionSubtitle}>
              Showing sample records from {file.name}
            </Text>
          </View>
        </View>

        <Icon
          name={isExpanded ? 'ChevronRight' : 'ChevronRight'}
          size={18}
          color="#64748B"
          style={isExpanded ? styles.iconRotated : undefined}
        />
      </TouchableOpacity>

      {/* Metric summary bar */}
      <View style={styles.metricBar}>
        <View style={styles.metricItem}>
          <Text style={styles.metricNumber}>{file.transactionCount}</Text>
          <Text style={styles.metricLabel}>Total Tx</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricNumber}>{file.entitiesCount}</Text>
          <Text style={styles.metricLabel}>Entities</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricNumber}>{file.columns.length}</Text>
          <Text style={styles.metricLabel}>Features</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.metricItem}>
          <Text style={styles.metricNumber}>{file.format}</Text>
          <Text style={styles.metricLabel}>Format</Text>
        </View>
      </View>

      {/* Bank Statement Verification Banner */}
      {file.bankDetected && (
        <View style={styles.bankBanner}>
          <Icon name="ShieldCheck" size={14} color="#1D4ED8" />
          <Text style={styles.bankBannerText}>
            Verified Statement: {file.bankDetected} • {file.extractionMethod || 'PDF Text Stream'} • Account Holder: user1
          </Text>
        </View>
      )}

      {isExpanded && (
        <View style={styles.tableContainer}>
          <Text style={styles.tableHeaderNote}>
            Sample Graph Edges (Source → Target):
          </Text>

          {file.sampleData.map((row, index) => (
            <View
              key={row.id || index}
              style={[
                styles.rowCard,
                row.flagged && styles.rowCardFlagged,
              ]}>
              <View style={styles.rowTopLine}>
                <View style={styles.txIdBadge}>
                  <Text style={styles.txIdText}>{row.id}</Text>
                </View>

                <View style={styles.rowRightInfo}>
                  <Text style={styles.amountText}>{row.amount}</Text>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>{row.type}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.edgeConnectionRow}>
                <View style={styles.nodeBox}>
                  <Icon name="User" size={11} color="#475569" />
                  <Text style={styles.nodeText} numberOfLines={1}>
                    {row.source}
                  </Text>
                </View>

                <View style={styles.arrowBox}>
                  <Icon name="ArrowRight" size={13} color="#94A3B8" strokeWidth={2.5} />
                </View>

                <View style={styles.nodeBox}>
                  <Icon name="User" size={11} color="#475569" />
                  <Text style={styles.nodeText} numberOfLines={1}>
                    {row.target}
                  </Text>
                </View>
              </View>

              <View style={styles.rowBottomMeta}>
                <View style={styles.timeTag}>
                  <Icon name="Clock" size={11} color="#94A3B8" />
                  <Text style={styles.timeText}>{row.timestamp}</Text>
                </View>

                {row.direction && (
                  <View
                    style={[
                      styles.directionPill,
                      row.direction === 'DEBIT' ? styles.directionDebit : styles.directionCredit,
                    ]}>
                    <Text
                      style={[
                        styles.directionPillText,
                        row.direction === 'DEBIT' ? { color: '#B91C1C' } : { color: '#047857' },
                      ]}>
                      {row.direction === 'DEBIT' ? 'Outgoing' : 'Incoming'}
                    </Text>
                  </View>
                )}

                {row.flagged ? (
                  <View style={styles.flagBadge}>
                    <Icon name="AlertTriangle" size={11} color={Colors.error} />
                    <Text style={styles.flagText}>High Velocity Hub</Text>
                  </View>
                ) : (
                  <View style={styles.normalBadge}>
                    <Icon name="Check" size={11} color={Colors.successDark} />
                    <Text style={styles.normalText}>Standard Flow</Text>
                  </View>
                )}
              </View>

              {row.rawDescription && (
                <View style={styles.descriptionRow}>
                  <Text style={styles.descriptionText} numberOfLines={1}>
                    {row.rawDescription}
                  </Text>
                  {row.runningBalance !== null && row.runningBalance !== undefined && (
                    <Text style={styles.balText}>
                      Bal: ₹{row.runningBalance.toLocaleString('en-IN')}
                    </Text>
                  )}
                </View>
              )}
            </View>
          ))}

          <Text style={styles.footerNote}>
            + {file.transactionCount - file.sampleData.length} more transactions in this ledger
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  iconRotated: {
    transform: [{ rotate: '90deg' }],
  },
  metricBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  divider: {
    width: 1,
    height: 22,
    backgroundColor: '#CBD5E1',
  },
  tableContainer: {
    marginTop: 14,
  },
  tableHeaderNote: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  rowCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 8,
  },
  rowCardFlagged: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF8F8',
  },
  rowTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  txIdBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  txIdText: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#334155',
  },
  rowRightInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  amountText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  typeBadge: {
    backgroundColor: '#EFF6FF',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2563EB',
  },
  edgeConnectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  nodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  nodeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
    fontFamily: 'monospace',
  },
  arrowBox: {
    paddingHorizontal: 8,
  },
  rowBottomMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 11,
    color: '#64748B',
  },
  flagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  flagText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.error,
  },
  normalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  normalText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.successDark,
  },
  footerNote: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  bankBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    gap: 6,
  },
  bankBannerText: {
    fontSize: 11,
    color: '#1E40AF',
    fontWeight: '600',
    flex: 1,
  },
  directionPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  directionDebit: {
    backgroundColor: '#FEE2E2',
  },
  directionCredit: {
    backgroundColor: '#D1FAE5',
  },
  directionPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  descriptionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  descriptionText: {
    fontSize: 10,
    color: '#64748B',
    flex: 1,
    marginRight: 6,
  },
  balText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '600',
  },
});

export default TransactionPreview;
