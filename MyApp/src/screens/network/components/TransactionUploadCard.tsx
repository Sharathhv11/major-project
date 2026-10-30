/**
 * Transaction Upload Card — FraudShield Network Analysis
 *
 * Provides a clean, modern file-selection & data-entry interface:
 * 1. Preset Datasets Tab: One-tap sample graphs (Mule Ring, E-Commerce batch)
 * 2. Paste / Custom Data Tab: Multi-line text input for pasting raw CSV or JSON ledgers
 *    - Includes one-tap template insertion (CSV / JSON)
 *    - Instant client-side syntax parsing & schema validation
 *    - Custom dataset naming
 * 3. Selected file preview card with metadata, schema tags, and remove option
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import Icon from '../../../components/Icon';
import { Colors, Shadows, Spacing } from '../../../theme/theme';

export interface SelectedTransactionFile {
  name: string;
  size: string;
  transactionCount: number;
  entitiesCount: number;
  format: 'CSV' | 'JSON';
  columns: string[];
  sampleData: Array<{
    id: string;
    source: string;
    target: string;
    amount: string;
    timestamp: string;
    type: string;
    flagged?: boolean;
  }>;
}

export const SAMPLE_DATASETS: SelectedTransactionFile[] = [
  {
    name: 'fraudulent_bank_statement_mule_drain.csv',
    size: '3.8 KB',
    transactionCount: 5,
    entitiesCount: 5,
    format: 'CSV',
    columns: ['source_id', 'target_id', 'amount', 'timestamp', 'channel'],
    sampleData: [
      { id: 'TX-101', source: 'UNKNOWN_SRC_991', target: 'USER_ACCOUNT_A', amount: '₹95,000', timestamp: '10:02:15', type: 'IMPS', flagged: true },
      { id: 'TX-102', source: 'UNKNOWN_SRC_992', target: 'USER_ACCOUNT_A', amount: '₹85,000', timestamp: '10:05:40', type: 'IMPS', flagged: true },
      { id: 'TX-103', source: 'USER_ACCOUNT_A', target: 'CRYPTO_EXCHANGE_OUT', amount: '₹92,000', timestamp: '10:11:00', type: 'UPI', flagged: true },
      { id: 'TX-104', source: 'USER_ACCOUNT_A', target: 'MULE_BENEFICIARY_X', amount: '₹86,000', timestamp: '10:12:30', type: 'UPI', flagged: true },
      { id: 'TX-105', source: 'USER_ACCOUNT_A', target: 'ATM_CASH_WITHDRAWAL', amount: '₹1,500', timestamp: '10:14:00', type: 'ATM', flagged: false },
    ],
  },
  {
    name: 'legitimate_bank_statement_salary_expenses.csv',
    size: '4.9 KB',
    transactionCount: 7,
    entitiesCount: 8,
    format: 'CSV',
    columns: ['source_id', 'target_id', 'amount', 'timestamp', 'channel'],
    sampleData: [
      { id: 'TX-201', source: 'EMPLOYER_CORP_SALARY', target: 'USER_ACCOUNT_A', amount: '₹85,000', timestamp: '09:00:00', type: 'NEFT', flagged: false },
      { id: 'TX-202', source: 'USER_ACCOUNT_A', target: 'AMAZON_INDIA', amount: '₹2,150', timestamp: '11:20:00', type: 'CARD', flagged: false },
      { id: 'TX-203', source: 'USER_ACCOUNT_A', target: 'SWIGGY_FOOD', amount: '₹480', timestamp: '13:45:00', type: 'UPI', flagged: false },
      { id: 'TX-204', source: 'USER_ACCOUNT_A', target: 'BESCOM_ELECTRICITY', amount: '₹1,850', timestamp: '15:10:00', type: 'NETBANKING', flagged: false },
      { id: 'TX-205', source: 'USER_ACCOUNT_A', target: 'AIRTEL_BROADBAND', amount: '₹999', timestamp: '16:30:00', type: 'UPI', flagged: false },
      { id: 'TX-206', source: 'USER_ACCOUNT_A', target: 'APARTMENT_RENT', amount: '₹15,000', timestamp: '18:00:00', type: 'NEFT', flagged: false },
      { id: 'TX-207', source: 'USER_ACCOUNT_A', target: 'ZOMATO_DINING', amount: '₹320', timestamp: '20:15:00', type: 'UPI', flagged: false },
    ],
  },
];

const FRAUD_CSV_TEMPLATE = `source_id,target_id,amount,timestamp,channel
UNKNOWN_SRC_991,USER_ACCOUNT_A,95000,10:02:15,IMPS
UNKNOWN_SRC_992,USER_ACCOUNT_A,85000,10:05:40,IMPS
USER_ACCOUNT_A,CRYPTO_EXCHANGE_OUT,92000,10:11:00,UPI
USER_ACCOUNT_A,MULE_BENEFICIARY_X,86000,10:12:30,UPI
USER_ACCOUNT_A,ATM_CASH_WITHDRAWAL,1500,10:14:00,ATM`;

const SAFE_CSV_TEMPLATE = `source_id,target_id,amount,timestamp,channel
EMPLOYER_CORP_SALARY,USER_ACCOUNT_A,85000,09:00:00,NEFT
USER_ACCOUNT_A,AMAZON_INDIA,2150,11:20:00,CARD
USER_ACCOUNT_A,SWIGGY_FOOD,480,13:45:00,UPI
USER_ACCOUNT_A,BESCOM_ELECTRICITY,1850,15:10:00,NETBANKING
USER_ACCOUNT_A,AIRTEL_BROADBAND,999,16:30:00,UPI
USER_ACCOUNT_A,APARTMENT_RENT,15000,18:00:00,NEFT
USER_ACCOUNT_A,ZOMATO_DINING,320,20:15:00,UPI`;

const JSON_TEMPLATE = `[
  {"source": "UNKNOWN_SRC_991", "target": "USER_ACCOUNT_A", "amount": 95000, "timestamp": "10:02:15", "type": "IMPS"},
  {"source": "UNKNOWN_SRC_992", "target": "USER_ACCOUNT_A", "amount": 85000, "timestamp": "10:05:40", "type": "IMPS"},
  {"source": "USER_ACCOUNT_A", "target": "CRYPTO_EXCHANGE_OUT", "amount": 92000, "timestamp": "10:11:00", "type": "UPI"},
  {"source": "USER_ACCOUNT_A", "target": "MULE_BENEFICIARY_X", "amount": 86000, "timestamp": "10:12:30", "type": "UPI"}
]`;

interface TransactionUploadCardProps {
  selectedFile: SelectedTransactionFile | null;
  onSelectFile: (file: SelectedTransactionFile) => void;
  onRemoveFile: () => void;
  onBrowseFile?: () => void;
}

export const TransactionUploadCard: React.FC<TransactionUploadCardProps> = ({
  selectedFile,
  onSelectFile,
  onRemoveFile,
  onBrowseFile,
}) => {
  const [activeTab, setActiveTab] = useState<'preset' | 'paste'>('paste');
  const [pastedData, setPastedData] = useState<string>('');
  const [customFileName, setCustomFileName] = useState<string>('my_transactions.csv');
  const [parseError, setParseError] = useState<string | null>(null);

  // Parse raw text into structured SelectedTransactionFile
  const handleParseAndLoad = () => {
    setParseError(null);
    const trimmed = pastedData.trim();
    if (!trimmed) {
      setParseError('Please paste CSV rows or JSON transactions above.');
      return;
    }

    // 1. Try parsing JSON
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        if (arr.length === 0) {
          setParseError('JSON array contains no transaction records.');
          return;
        }

        const entities = new Set<string>();
        const sampleData = arr.map((item: any, idx: number) => {
          const src = String(item.source || item.source_id || item.sender || `SRC-${idx}`).trim();
          const tgt = String(item.target || item.target_id || item.recipient || `TGT-${idx}`).trim();
          const numAmt = typeof item.amount === 'number' ? item.amount : parseFloat(String(item.amount || '0').replace(/[^0-9.]/g, '')) || 0;
          const amtStr = `₹${numAmt.toLocaleString('en-IN')}`;
          const tstamp = String(item.timestamp || item.time || '10:00:00');
          const type = String(item.type || item.channel || 'TRANSFER');

          entities.add(src);
          entities.add(tgt);

          return {
            id: String(item.id || item.txId || `TX-${1000 + idx}`),
            source: src,
            target: tgt,
            amount: amtStr,
            timestamp: tstamp,
            type: type,
            flagged: false,
          };
        });

        const file: SelectedTransactionFile = {
          name: customFileName.endsWith('.json') ? customFileName : `${customFileName.replace(/\.[^/.]+$/, '')}.json`,
          size: `${Math.max(1, Math.round(trimmed.length / 1024))} KB`,
          transactionCount: sampleData.length,
          entitiesCount: entities.size,
          format: 'JSON',
          columns: ['source', 'target', 'amount', 'timestamp', 'type'],
          sampleData,
        };

        onSelectFile(file);
        return;
      } catch (jsonErr: any) {
        setParseError(`JSON format error: ${jsonErr.message}`);
        return;
      }
    }

    // 2. Parse as CSV
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) {
      setParseError('CSV requires a header row and at least 1 transaction record.');
      return;
    }

    const headerCols = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
    let srcIdx = headerCols.findIndex((h) => h.includes('source') || h.includes('sender') || h.includes('from'));
    let tgtIdx = headerCols.findIndex((h) => h.includes('target') || h.includes('recipient') || h.includes('to'));
    let amtIdx = headerCols.findIndex((h) => h.includes('amount') || h.includes('amt') || h.includes('val'));
    let timeIdx = headerCols.findIndex((h) => h.includes('time') || h.includes('date'));
    let typeIdx = headerCols.findIndex((h) => h.includes('type') || h.includes('channel') || h.includes('mode'));

    if (srcIdx === -1) srcIdx = 0;
    if (tgtIdx === -1) tgtIdx = headerCols.length > 1 ? 1 : 0;
    if (amtIdx === -1) amtIdx = headerCols.length > 2 ? 2 : 0;

    const entities = new Set<string>();
    const sampleData = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
      if (cols.length < 2) continue;

      const src = cols[srcIdx] || `ACC-${i}`;
      const tgt = cols[tgtIdx] || `ACC-${i + 1}`;
      const rawAmt = cols[amtIdx] || '1000';
      const numAmt = parseFloat(rawAmt.replace(/[^0-9.]/g, '')) || 1000;
      const amtStr = `₹${numAmt.toLocaleString('en-IN')}`;
      const tstamp = timeIdx !== -1 && cols[timeIdx] ? cols[timeIdx] : `10:${String(i).padStart(2, '0')}:00`;
      const type = typeIdx !== -1 && cols[typeIdx] ? cols[typeIdx] : 'UPI';

      entities.add(src);
      entities.add(tgt);

      sampleData.push({
        id: `TX-${1000 + i}`,
        source: src,
        target: tgt,
        amount: amtStr,
        timestamp: tstamp,
        type: type,
        flagged: false,
      });
    }

    if (sampleData.length === 0) {
      setParseError('No valid transaction records could be parsed. Check column commas.');
      return;
    }

    const file: SelectedTransactionFile = {
      name: customFileName.endsWith('.csv') ? customFileName : `${customFileName.replace(/\.[^/.]+$/, '')}.csv`,
      size: `${Math.max(1, Math.round(trimmed.length / 1024))} KB`,
      transactionCount: sampleData.length,
      entitiesCount: entities.size,
      format: 'CSV',
      columns: headerCols.length > 0 ? headerCols : ['source', 'target', 'amount', 'timestamp', 'channel'],
      sampleData,
    };

    onSelectFile(file);
  };

  return (
    <View style={[styles.card, Shadows.card]}>
      <View style={styles.headerRow}>
        <View style={styles.titleIconBox}>
          <Icon name="Upload" size={18} color="#3a86ff" strokeWidth={2.4} />
        </View>
        <View style={styles.titleTextContainer}>
          <Text style={styles.sectionTitle}>Transaction Dataset</Text>
          <Text style={styles.sectionSubtitle}>
            Paste your own data or choose a sample to inspect graph relationships
          </Text>
        </View>
      </View>

      {!selectedFile ? (
        <View>
          {/* Mode Switcher Tabs */}
          <View style={styles.modeTabsRow}>
            <TouchableOpacity
              style={[styles.modeTab, activeTab === 'paste' && styles.modeTabActive]}
              onPress={() => setActiveTab('paste')}
              activeOpacity={0.8}
              accessibilityRole="tab">
              <Icon
                name="Edit3"
                size={14}
                color={activeTab === 'paste' ? '#3a86ff' : '#64748B'}
                strokeWidth={2.2}
              />
              <Text
                style={[styles.modeTabText, activeTab === 'paste' && styles.modeTabTextActive]}>
                Paste CSV / JSON
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modeTab, activeTab === 'preset' && styles.modeTabActive]}
              onPress={() => setActiveTab('preset')}
              activeOpacity={0.8}
              accessibilityRole="tab">
              <Icon
                name="Sparkles"
                size={14}
                color={activeTab === 'preset' ? '#3a86ff' : '#64748B'}
                strokeWidth={2.2}
              />
              <Text
                style={[styles.modeTabText, activeTab === 'preset' && styles.modeTabTextActive]}>
                Sample Datasets
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'paste' ? (
            /* ─── Tab 1: Paste Your Own Data ────────────────────────────── */
            <View style={styles.pasteContainer}>
              <View style={styles.pasteHeaderActions}>
                <Text style={styles.pasteInputLabel}>Paste your transaction ledger:</Text>
                <View style={styles.templateButtonsRow}>
                  <TouchableOpacity
                    style={[styles.templatePill, { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]}
                    onPress={() => setPastedData(FRAUD_CSV_TEMPLATE)}
                    activeOpacity={0.75}>
                    <Text style={[styles.templatePillText, { color: '#B91C1C' }]}>+ Fraud Statement</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.templatePill, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                    onPress={() => setPastedData(SAFE_CSV_TEMPLATE)}
                    activeOpacity={0.75}>
                    <Text style={[styles.templatePillText, { color: '#047857' }]}>+ Safe Statement</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.templatePill}
                    onPress={() => setPastedData(JSON_TEMPLATE)}
                    activeOpacity={0.75}>
                    <Text style={styles.templatePillText}>+ JSON</Text>
                  </TouchableOpacity>

                  {pastedData.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearPill}
                      onPress={() => {
                        setPastedData('');
                        setParseError(null);
                      }}
                      activeOpacity={0.75}>
                      <Text style={styles.clearPillText}>Clear</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Multiline TextInput for Raw Data */}
              <TextInput
                style={styles.textAreaInput}
                multiline
                numberOfLines={8}
                value={pastedData}
                onChangeText={(text) => {
                  setPastedData(text);
                  if (parseError) setParseError(null);
                }}
                placeholder={`source_id,target_id,amount,timestamp,channel\nUNKNOWN_SRC_991,USER_ACCOUNT_A,95000,10:02:15,IMPS\nUSER_ACCOUNT_A,CRYPTO_EXCHANGE,92000,10:11:00,UPI\n(All records strictly: Y -> A or A -> X)`}
                placeholderTextColor="#94A3B8"
                textAlignVertical="top"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {/* Dataset Name Input */}
              <View style={styles.nameRow}>
                <Text style={styles.nameLabel}>Dataset Name:</Text>
                <TextInput
                  style={styles.nameInput}
                  value={customFileName}
                  onChangeText={setCustomFileName}
                  placeholder="e.g. april_ledger.csv"
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="none"
                />
              </View>

              {/* Validation / Parse Error Banner */}
              {parseError && (
                <View style={styles.parseErrorBox}>
                  <Icon name="AlertCircle" size={14} color={Colors.error} />
                  <Text style={styles.parseErrorText}>{parseError}</Text>
                </View>
              )}

              {/* Action Button: Parse & Load */}
              <TouchableOpacity
                style={styles.loadButton}
                onPress={handleParseAndLoad}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Load and parse transactions">
                <Icon name="CheckCircle2" size={16} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.loadButtonText}>Load & Validate Transactions</Text>
              </TouchableOpacity>
            </View>
          ) : (
            /* ─── Tab 2: Sample Datasets & File Dropzone ─────────────────── */
            <View style={styles.uploadZoneContainer}>
              <TouchableOpacity
                style={styles.dropZone}
                activeOpacity={0.8}
                onPress={() => {
                  if (onBrowseFile) {
                    onBrowseFile();
                  } else {
                    onSelectFile(SAMPLE_DATASETS[0]);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Select transaction file">
                <View style={styles.cloudIconBox}>
                  <Icon name="FileText" size={26} color="#3a86ff" strokeWidth={2} />
                </View>
                <Text style={styles.dropZonePrimaryText}>Choose a Sample Transaction Ledger</Text>
                <Text style={styles.dropZoneSecondaryText}>
                  Pre-configured with multi-hop fraud ring topologies
                </Text>
              </TouchableOpacity>

              <View style={styles.samplesContainer}>
                <Text style={styles.samplesLabel}>Select a pre-built fraud network:</Text>
                <View style={styles.sampleButtonsRow}>
                  {SAMPLE_DATASETS.map((dataset, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.sampleChip}
                      activeOpacity={0.8}
                      onPress={() => onSelectFile(dataset)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select sample ${dataset.name}`}>
                      <Icon name="Sparkles" size={13} color="#3a86ff" strokeWidth={2.2} />
                      <Text style={styles.sampleChipText} numberOfLines={1}>
                        {idx === 0 ? 'Mule Siphon (Fraud)' : 'Salary & Spends (Safe)'}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>
      ) : (
        /* ─── Selected File Card ────────────────────────────────────────── */
        <View style={styles.fileSelectedContainer}>
          <View style={styles.fileInfoCard}>
            <View style={styles.fileIconBox}>
              <Icon name="FileText" size={24} color="#3a86ff" strokeWidth={2.2} />
            </View>

            <View style={styles.fileDetails}>
              <Text style={styles.fileName} numberOfLines={1}>
                {selectedFile.name}
              </Text>
              <Text style={styles.fileMeta}>
                {selectedFile.size} • {selectedFile.transactionCount} transactions • {selectedFile.entitiesCount} unique entities
              </Text>

              <View style={styles.badgeRow}>
                <View style={styles.badgeSuccess}>
                  <Icon name="CheckCircle2" size={12} color={Colors.successDark} strokeWidth={2.4} />
                  <Text style={styles.badgeSuccessText}>Ready for GCN Graph Processing</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.removeButton}
              onPress={onRemoveFile}
              activeOpacity={0.75}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Remove selected transaction file">
              <Icon name="Trash2" size={18} color={Colors.error} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {/* Column Tags */}
          <View style={styles.columnsInfo}>
            <Text style={styles.columnsLabel}>Detected Graph Fields:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.columnsScroll}>
              {selectedFile.columns.map((col, index) => (
                <View key={index} style={styles.columnPill}>
                  <Text style={styles.columnPillText}>{col}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
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
    marginBottom: 12,
  },
  titleIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  titleTextContainer: {
    flex: 1,
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
  modeTabsRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: '#FFFFFF',
    ...Shadows.sm,
  },
  modeTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modeTabTextActive: {
    color: '#0F172A',
    fontWeight: '700',
  },
  pasteContainer: {
    marginTop: 2,
  },
  pasteHeaderActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pasteInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  templateButtonsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  templatePill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  templatePillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  clearPill: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 3,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  clearPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  textAreaInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 10,
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#0F172A',
    minHeight: 125,
    maxHeight: 180,
    marginBottom: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  nameLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  nameInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#0F172A',
  },
  parseErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  parseErrorText: {
    fontSize: 11,
    color: '#B91C1C',
    flex: 1,
  },
  loadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3a86ff',
    borderRadius: 10,
    paddingVertical: 10,
    ...Shadows.sm,
  },
  loadButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  uploadZoneContainer: {
    marginTop: 2,
  },
  dropZone: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  dropZonePrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  dropZoneSecondaryText: {
    fontSize: 11,
    color: '#64748B',
  },
  samplesContainer: {
    marginTop: 12,
  },
  samplesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  sampleButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sampleChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  sampleChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1D4ED8',
  },
  fileSelectedContainer: {
    marginTop: 2,
  },
  fileInfoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  fileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileDetails: {
    flex: 1,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  fileMeta: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.successLight,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  badgeSuccessText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.successDark,
  },
  removeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    marginLeft: 8,
  },
  columnsInfo: {
    marginTop: 12,
  },
  columnsLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 6,
  },
  columnsScroll: {
    gap: 6,
  },
  columnPill: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  columnPillText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '500',
  },
});

export default TransactionUploadCard;
