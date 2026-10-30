/**
 * Analysis Progress Component — FraudShield Network Analysis
 *
 * Visual multi-stage loading indicator displaying the GCN graph pipeline steps:
 * 1. Validating ledger records
 * 2. Building entity adjacency matrix
 * 3. Executing Graph Convolutional Network (GCN) layers
 * 4. Identifying fraud rings & mule clusters
 */

import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import Icon from '../../../components/Icon';
import { Colors, Shadows, Spacing } from '../../../theme/theme';

export interface AnalysisStage {
  id: number;
  label: string;
  description: string;
  status: 'pending' | 'active' | 'completed';
}

interface AnalysisProgressProps {
  currentStage: number;
  progressPercent: number;
}

export const AnalysisProgress: React.FC<AnalysisProgressProps> = ({
  currentStage,
  progressPercent,
}) => {
  const stages: AnalysisStage[] = [
    {
      id: 1,
      label: 'Validating Transaction Ledger',
      description: 'Checking schema, timestamps, amounts, and source/target accounts',
      status: currentStage > 1 ? 'completed' : currentStage === 1 ? 'active' : 'pending',
    },
    {
      id: 2,
      label: 'Constructing Multi-Hop Graph',
      description: 'Generating node embeddings and transaction directed adjacency matrix',
      status: currentStage > 2 ? 'completed' : currentStage === 2 ? 'active' : 'pending',
    },
    {
      id: 3,
      label: 'GCN Spectral Feature Propagation',
      description: 'Propagating neighborhood risk signals across 2 convolutional graph layers',
      status: currentStage > 3 ? 'completed' : currentStage === 3 ? 'active' : 'pending',
    },
    {
      id: 4,
      label: 'Detecting Fraud Rings & High-Risk Mules',
      description: 'Classifying anomalous subgraph clusters and assigning calibrated risk scores',
      status: currentStage > 4 ? 'completed' : currentStage === 4 ? 'active' : 'pending',
    },
  ];

  return (
    <View style={[styles.card, Shadows.card]}>
      <View style={styles.topRow}>
        <View style={styles.spinnerBox}>
          <ActivityIndicator size="small" color="#3a86ff" />
        </View>
        <View style={styles.topTextContainer}>
          <Text style={styles.topTitle}>Analyzing Transaction Network...</Text>
          <Text style={styles.topSubtitle}>
            Graph Convolutional Network is processing entity relationships
          </Text>
        </View>
        <Text style={styles.percentText}>{progressPercent}%</Text>
      </View>

      {/* Progress Track */}
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
      </View>

      {/* Stage Steps List */}
      <View style={styles.stepsContainer}>
        {stages.map((stg, index) => {
          const isCompleted = stg.status === 'completed';
          const isActive = stg.status === 'active';
          const isPending = stg.status === 'pending';

          return (
            <View key={stg.id} style={styles.stageItem}>
              {/* Step indicator column with vertical connecting line */}
              <View style={styles.indicatorCol}>
                <View
                  style={[
                    styles.nodeDot,
                    isCompleted && styles.nodeDotCompleted,
                    isActive && styles.nodeDotActive,
                    isPending && styles.nodeDotPending,
                  ]}>
                  {isCompleted ? (
                    <Icon name="Check" size={12} color="#FFFFFF" strokeWidth={3} />
                  ) : isActive ? (
                    <View style={styles.pulseInnerDot} />
                  ) : (
                    <Text style={styles.pendingStepNum}>{stg.id}</Text>
                  )}
                </View>

                {index < stages.length - 1 && (
                  <View
                    style={[
                      styles.connectingLine,
                      isCompleted ? styles.connectingLineCompleted : styles.connectingLinePending,
                    ]}
                  />
                )}
              </View>

              {/* Text content */}
              <View style={styles.stageTextCol}>
                <Text
                  style={[
                    styles.stageTitle,
                    isActive && styles.stageTitleActive,
                    isCompleted && styles.stageTitleCompleted,
                    isPending && styles.stageTitlePending,
                  ]}>
                  {stg.label}
                </Text>
                <Text style={styles.stageDescription}>{stg.description}</Text>
              </View>
            </View>
          );
        })}
      </View>
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
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  spinnerBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  topTextContainer: {
    flex: 1,
  },
  topTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  topSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  percentText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3a86ff',
    marginLeft: 8,
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 18,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#3a86ff',
    borderRadius: 3,
  },
  stepsContainer: {
    paddingLeft: 4,
  },
  stageItem: {
    flexDirection: 'row',
    minHeight: 52,
  },
  indicatorCol: {
    alignItems: 'center',
    width: 28,
  },
  nodeDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nodeDotCompleted: {
    backgroundColor: Colors.success,
  },
  nodeDotActive: {
    backgroundColor: '#3a86ff',
    borderWidth: 2,
    borderColor: '#BFDBFE',
  },
  nodeDotPending: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  pulseInnerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  pendingStepNum: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
  },
  connectingLine: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  connectingLineCompleted: {
    backgroundColor: Colors.success,
  },
  connectingLinePending: {
    backgroundColor: '#E2E8F0',
  },
  stageTextCol: {
    flex: 1,
    paddingLeft: 8,
    paddingBottom: 14,
  },
  stageTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
  },
  stageTitleActive: {
    color: '#3a86ff',
    fontWeight: '700',
  },
  stageTitleCompleted: {
    color: '#0F172A',
  },
  stageTitlePending: {
    color: '#94A3B8',
  },
  stageDescription: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },
});

export default AnalysisProgress;
