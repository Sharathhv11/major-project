/**
 * Network Analysis Screen — FraudShield
 *
 * Dedicated screen for Graph-based Transaction Network Fraud Detection:
 * - Powered by Graph Convolutional Networks (GCN)
 * - Detects mule rings, synthetic identity chains, and structured smurfing flows
 * - File upload & sample dataset picker
 * - Transaction data preview
 * - Step-by-step GCN analysis progress
 * - Interactive visual network topology graph
 * - Detailed fraud risk score and entity breakdown
 * - Fully accessible, responsive, and consistent with FraudShield UI
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Icon from '../../components/Icon';
import Button from '../../components/Button';
import ErrorMessage from '../../components/ErrorMessage';
import { Colors, Shadows, Spacing } from '../../theme/theme';

// Network Components
import TransactionUploadCard, {
  SelectedTransactionFile,
  SAMPLE_DATASETS,
} from './components/TransactionUploadCard';
import TransactionPreview from './components/TransactionPreview';
import AnalysisProgress from './components/AnalysisProgress';
import NetworkGraphVisualizer, { GraphNode, GraphEdge } from './components/NetworkGraphVisualizer';
import NetworkAnalysisResult, {
  NetworkAnalysisResultData,
} from './components/NetworkAnalysisResult';
import fraudApi from '../../api/fraudApi';

type ScreenState = 'EMPTY' | 'FILE_SELECTED' | 'ANALYZING' | 'RESULT';

const DEFAULT_RESULT_MULE: NetworkAnalysisResultData = {
  riskScore: 88,
  riskLevel: 'High',
  totalTransactions: 5,
  totalEntities: 5,
  flaggedEntitiesCount: 3,
  flaggedTransactionsCount: 4,
  modelType: 'FraudShield GCN (2-Layer Spectral Conv)',
  suspiciousEntities: [
    {
      id: 'USER_ACCOUNT_A',
      role: 'High-Risk Siphoned / Pass-Through Mule Account',
      riskScore: 92,
      transactionsInvolved: 5,
      totalVolume: '₹3,58,000',
      reason: 'Ego statement anomaly: 98.8% of incoming deposits (₹1.80L) immediately siphoned to outbound beneficiaries in under 10 minutes.',
    },
    {
      id: 'CRYPTO_EXCHANGE_OUT',
      role: 'Terminal Crypto Cash-Out Node',
      riskScore: 89,
      transactionsInvolved: 1,
      totalVolume: '₹92,000',
      reason: 'High-value outbound drain destination matching crypto liquidation pattern.',
    },
    {
      id: 'MULE_BENEFICIARY_X',
      role: 'Suspicious Intermediary Beneficiary',
      riskScore: 85,
      transactionsInvolved: 1,
      totalVolume: '₹86,000',
      reason: 'Rapid parallel split extraction following unverified inbound deposit.',
    },
  ],
  suspiciousTransactions: [
    {
      txId: 'TX-101',
      source: 'UNKNOWN_SRC_991',
      target: 'USER_ACCOUNT_A',
      amount: '₹95,000',
      timestamp: '10:02:15',
      anomalyType: 'Unverified inbound surge',
    },
    {
      txId: 'TX-102',
      source: 'UNKNOWN_SRC_992',
      target: 'USER_ACCOUNT_A',
      amount: '₹85,000',
      timestamp: '10:05:40',
      anomalyType: 'Parallel inbound deposit',
    },
    {
      txId: 'TX-103',
      source: 'USER_ACCOUNT_A',
      target: 'CRYPTO_EXCHANGE_OUT',
      amount: '₹92,000',
      timestamp: '10:11:00',
      anomalyType: 'Immediate crypto drain',
    },
    {
      txId: 'TX-104',
      source: 'USER_ACCOUNT_A',
      target: 'MULE_BENEFICIARY_X',
      amount: '₹86,000',
      timestamp: '10:12:30',
      anomalyType: 'Siphon pass-through',
    },
  ],
};

const DEFAULT_RESULT_ECOMMERCE: NetworkAnalysisResultData = {
  riskScore: 12,
  riskLevel: 'Low',
  totalTransactions: 7,
  totalEntities: 8,
  flaggedEntitiesCount: 0,
  flaggedTransactionsCount: 0,
  modelType: 'FraudShield GCN (2-Layer Spectral Conv)',
  suspiciousEntities: [],
  suspiciousTransactions: [],
};

export const NetworkAnalysisScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const scrollViewRef = useRef<ScrollView>(null);

  // Screen State Management
  const [selectedFile, setSelectedFile] = useState<SelectedTransactionFile | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>('EMPTY');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Analysis Progress States
  const [analysisStage, setAnalysisStage] = useState<number>(1);
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [analysisResult, setAnalysisResult] = useState<NetworkAnalysisResultData | null>(null);
  const [graphNodes, setGraphNodes] = useState<GraphNode[] | undefined>(undefined);
  const [graphEdges, setGraphEdges] = useState<GraphEdge[] | undefined>(undefined);
  const [isLiveBackendResult, setIsLiveBackendResult] = useState<boolean>(false);
  const [inferenceTime, setInferenceTime] = useState<number | undefined>(undefined);

  const handleSelectFile = (file: SelectedTransactionFile) => {
    setSelectedFile(file);
    setScreenState('FILE_SELECTED');
    setErrorMessage(null);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setScreenState('EMPTY');
    setErrorMessage(null);
    setAnalysisResult(null);
    setGraphNodes(undefined);
    setGraphEdges(undefined);
    setIsLiveBackendResult(false);
    setInferenceTime(undefined);
  };

  const handleBrowseCustomFile = () => {
    // UI placeholder file selector: shows alert with options
    Alert.alert(
      'Select Transaction Ledger',
      'Choose a sample dataset or simulated transaction batch:',
      [
        {
          text: 'Mule Ring Pattern (CSV)',
          onPress: () => handleSelectFile(SAMPLE_DATASETS[0]),
        },
        {
          text: 'E-Commerce Batch (CSV)',
          onPress: () => handleSelectFile(SAMPLE_DATASETS[1]),
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ],
    );
  };

  // Start GCN Analysis Pipeline via backend ML API
  const handleStartAnalysis = async () => {
    if (!selectedFile) {
      setErrorMessage('Please select or upload a transaction dataset first.');
      return;
    }

    setErrorMessage(null);
    setScreenState('ANALYZING');
    setAnalysisStage(1);
    setAnalysisProgress(15);

    // Scroll smoothly to progress card
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: 180, animated: true });
    }, 100);

    const stageTimer2 = setTimeout(() => {
      setAnalysisStage(2);
      setAnalysisProgress(40);
    }, 600);

    const stageTimer3 = setTimeout(() => {
      setAnalysisStage(3);
      setAnalysisProgress(75);
    }, 1200);

    try {
      // Execute live GCN analysis on the backend (Node.js -> FastAPI GCN)
      const transactionsPayload =
        selectedFile.sampleData && selectedFile.sampleData.length > 0
          ? selectedFile.sampleData
          : [
              { source: 'ACC-8821', target: 'ACC-1049', amount: 84500, timestamp: '10:14:22', type: 'IMPS' },
              { source: 'ACC-8821', target: 'ACC-3312', amount: 95000, timestamp: '10:15:05', type: 'IMPS' },
              { source: 'ACC-1049', target: 'ACC-5520', amount: 80000, timestamp: '10:18:40', type: 'UPI' },
              { source: 'ACC-3312', target: 'ACC-5520', amount: 92000, timestamp: '10:19:12', type: 'UPI' },
              { source: 'ACC-4401', target: 'ACC-2210', amount: 1200, timestamp: '10:21:00', type: 'UPI' },
            ];

      const res = await fraudApi.analyzeTransactionNetwork(
        transactionsPayload,
        selectedFile.name,
      );

      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);

      setAnalysisStage(4);
      setAnalysisProgress(100);

      if (res && res.success && res.data) {
        const d = res.data;
        const liveResult: NetworkAnalysisResultData = {
          riskScore: d.risk_score,
          riskLevel: d.risk_level,
          totalTransactions: d.total_transactions,
          totalEntities: d.total_entities,
          flaggedEntitiesCount: d.flagged_entities_count,
          flaggedTransactionsCount: d.flagged_transactions_count,
          suspiciousEntities: d.suspicious_entities,
          suspiciousTransactions: d.suspicious_transactions,
          modelType: d.model_type || 'FraudShield GCN (2-Layer Spectral Conv)',
        };

        setAnalysisResult(liveResult);
        setGraphNodes(d.nodes as GraphNode[]);
        setGraphEdges(d.edges as GraphEdge[]);
        setIsLiveBackendResult(true);
        setInferenceTime(d.inference_time_ms);
        setScreenState('RESULT');

        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: 220, animated: true });
        }, 150);
        return;
      }
    } catch (apiErr: any) {
      console.warn('Backend GCN API unreachable or error:', apiErr?.message);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);

      // Fallback gracefully to dataset results if backend is offline
      setAnalysisStage(4);
      setAnalysisProgress(100);

      const fallbackResult =
        selectedFile.name.includes('mule')
          ? DEFAULT_RESULT_MULE
          : DEFAULT_RESULT_ECOMMERCE;

      setAnalysisResult(fallbackResult);
      setGraphNodes(undefined);
      setGraphEdges(undefined);
      setIsLiveBackendResult(false);
      setInferenceTime(undefined);
      setScreenState('RESULT');

      setTimeout(() => {
        scrollViewRef.current?.scrollTo({ y: 220, animated: true });
      }, 150);
    }
  };

  const handleReset = () => {
    setScreenState('EMPTY');
    setSelectedFile(null);
    setAnalysisResult(null);
    setGraphNodes(undefined);
    setGraphEdges(undefined);
    setIsLiveBackendResult(false);
    setInferenceTime(undefined);
    setErrorMessage(null);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {/* ─── Screen Header & GCN Explainer ──────────────────────────────── */}
        <View style={styles.headerContainer}>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Icon name="Activity" size={13} color="#3a86ff" strokeWidth={2.4} />
              <Text style={styles.badgeText}>Graph Convolutional Network</Text>
            </View>
            <View style={styles.versionBadge}>
              <Text style={styles.versionBadgeText}>GCN v1.0</Text>
            </View>
          </View>

          <Text style={styles.screenTitle}>Network Analysis</Text>
          <Text style={styles.screenDescription}>
            Constructs multi-hop transaction relationship graphs to expose organized money mule rings, cyclic fund transfers, and synthetic accounts.
          </Text>
        </View>

        {/* ─── Error Message Banner (if any) ──────────────────────────────── */}
        {errorMessage && (
          <ErrorMessage
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
            onRetry={handleStartAnalysis}
          />
        )}

        {/* ─── Section 1: File Upload & Sample Selection ──────────────────── */}
        <TransactionUploadCard
          selectedFile={selectedFile}
          onSelectFile={handleSelectFile}
          onRemoveFile={handleRemoveFile}
          onBrowseFile={handleBrowseCustomFile}
        />

        {/* ─── Section 2: Selected Transaction Data Preview ───────────────── */}
        {selectedFile && (
          <TransactionPreview file={selectedFile} />
        )}

        {/* ─── Section 3: Action Button ──────────────────────────────────── */}
        {screenState !== 'ANALYZING' && screenState !== 'RESULT' && (
          <View style={styles.actionButtonContainer}>
            <Button
              title={selectedFile ? 'Analyze Transactions with GCN' : 'Select a File to Analyze'}
              variant="primary"
              size="lg"
              disabled={!selectedFile}
              leftIcon="Activity"
              onPress={handleStartAnalysis}
              style={styles.analyzeButton}
            />
            <Text style={styles.buttonSubtext}>
              Runs spectral graph feature convolution to detect anomalous clustering
            </Text>
          </View>
        )}

        {/* ─── Section 4: Loading State / Analysis Progress ───────────────── */}
        {screenState === 'ANALYZING' && (
          <AnalysisProgress
            currentStage={analysisStage}
            progressPercent={analysisProgress}
          />
        )}

        {/* ─── Section 5: Results Area ────────────────────────────────────── */}
        {screenState === 'RESULT' && analysisResult && (
          <View style={styles.resultsWrapper}>
            {/* Graph Visualization Topology Canvas */}
            <NetworkGraphVisualizer
              nodes={graphNodes}
              edges={graphEdges}
            />

            {/* Results Breakdown, Score, Risk Level & Entity Lists */}
            <NetworkAnalysisResult
              result={analysisResult}
              onReset={handleReset}
              isLiveResult={isLiveBackendResult}
              inferenceTimeMs={inferenceTime}
            />
          </View>
        )}

        {/* ─── Section 6: Empty State Education Card ──────────────────────── */}
        {screenState === 'EMPTY' && (
          <View style={[styles.infoCard, Shadows.card]}>
            <View style={styles.infoHeader}>
              <View style={styles.infoIconBox}>
                <Icon name="ShieldCheck" size={20} color="#3a86ff" strokeWidth={2.4} />
              </View>
              <Text style={styles.infoTitle}>How Network Fraud Detection Works</Text>
            </View>

            <View style={styles.featurePointsList}>
              <View style={styles.featurePointItem}>
                <View style={styles.bulletDot} />
                <View style={styles.featurePointTextContainer}>
                  <Text style={styles.featurePointTitle}>Multi-Hop Entity Linkage</Text>
                  <Text style={styles.featurePointDesc}>
                    Traditional rule filters evaluate single transactions. GCN inspects the entire web of connections across accounts, cards, and devices.
                  </Text>
                </View>
              </View>

              <View style={styles.featurePointItem}>
                <View style={styles.bulletDot} />
                <View style={styles.featurePointTextContainer}>
                  <Text style={styles.featurePointTitle}>Mule Ring & Layering Identification</Text>
                  <Text style={styles.featurePointDesc}>
                    Detects smurfing patterns where high volumes are broken into micro-transfers to bypass anti-money laundering limits.
                  </Text>
                </View>
              </View>

              <View style={styles.featurePointItem}>
                <View style={styles.bulletDot} />
                <View style={styles.featurePointTextContainer}>
                  <Text style={styles.featurePointTitle}>Graph Neighborhood Embedding</Text>
                  <Text style={styles.featurePointDesc}>
                    Learns node representations from adjacent transaction behavior, identifying bad actors even if their individual transactions look normal.
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingHorizontal: Spacing.screenHorizontal,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxxxl,
  },
  headerContainer: {
    marginBottom: Spacing.lg,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  versionBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  versionBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  screenDescription: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
  },
  actionButtonContainer: {
    marginVertical: Spacing.sm,
    alignItems: 'center',
  },
  analyzeButton: {
    backgroundColor: '#3a86ff',
    borderColor: '#3a86ff',
    borderRadius: 14,
    shadowColor: '#3a86ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonSubtext: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
  },
  resultsWrapper: {
    marginTop: 4,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: Spacing.xs,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  infoIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  featurePointsList: {
    gap: 12,
  },
  featurePointItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#3a86ff',
    marginTop: 6,
  },
  featurePointTextContainer: {
    flex: 1,
  },
  featurePointTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  featurePointDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
});

export default NetworkAnalysisScreen;
