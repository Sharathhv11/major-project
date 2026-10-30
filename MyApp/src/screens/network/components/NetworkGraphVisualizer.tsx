/**
 * Network Graph Visualizer — FraudShield
 *
 * Interactive pure React Native visualization of the transaction network graph:
 * - Nodes representing transaction entities (Accounts, Cards, Mule Hubs, Merchants)
 * - Directed connection lines and flows representing transactions
 * - Color-coded risk indicators (Red: Mule Ring / High Risk, Amber: Suspicious Hub, Blue/Slate: Normal)
 * - Tap node to inspect entity details, degree centrality, connected transactions, and GCN risk attributes
 * - Responsive layout with zoom/pan ready coordinate mapping
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Icon from '../../../components/Icon';
import { Colors, Shadows, Spacing } from '../../../theme/theme';

export interface GraphNode {
  id: string;
  label: string;
  type: 'mule_hub' | 'fraud_ring' | 'normal' | 'cash_out';
  riskScore: number;
  degree: number;
  inflow: string;
  outflow: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  flagReason?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  amount: string;
  isHighRisk?: boolean;
}

const DEFAULT_NODES: GraphNode[] = [
  {
    id: 'ACC-8821',
    label: 'ACC-8821',
    type: 'fraud_ring',
    riskScore: 94,
    degree: 7,
    inflow: '₹2,40,000',
    outflow: '₹2,38,500',
    x: 20,
    y: 28,
    flagReason: 'Originator Node — High velocity dispersion across 4 mule accounts within 3 minutes',
  },
  {
    id: 'ACC-1049',
    label: 'ACC-1049',
    type: 'mule_hub',
    riskScore: 88,
    degree: 5,
    inflow: '₹84,500',
    outflow: '₹80,000',
    x: 65,
    y: 20,
    flagReason: 'Mule Intermediary — Instant passthrough of 94% funds to downstream hub',
  },
  {
    id: 'ACC-3312',
    label: 'ACC-3312',
    type: 'mule_hub',
    riskScore: 86,
    degree: 4,
    inflow: '₹95,000',
    outflow: '₹92,000',
    x: 35,
    y: 65,
    flagReason: 'Mule Layering — Rapid multi-hop forwarding to avoid single-transaction threshold',
  },
  {
    id: 'ACC-5520',
    label: 'ACC-5520',
    type: 'cash_out',
    riskScore: 92,
    degree: 6,
    inflow: '₹1,72,000',
    outflow: '₹1,70,000',
    x: 80,
    y: 68,
    flagReason: 'Terminal Siphon Node — Immediate cash-out aggregation from 2 upstream mules',
  },
  {
    id: 'ACC-4401',
    label: 'ACC-4401',
    type: 'normal',
    riskScore: 12,
    degree: 2,
    inflow: '₹5,000',
    outflow: '₹1,200',
    x: 15,
    y: 75,
    flagReason: undefined,
  },
  {
    id: 'ACC-2210',
    label: 'ACC-2210',
    type: 'normal',
    riskScore: 8,
    degree: 1,
    inflow: '₹1,200',
    outflow: '₹0',
    x: 50,
    y: 88,
    flagReason: undefined,
  },
];

const DEFAULT_EDGES: GraphEdge[] = [
  { id: 'E1', source: 'ACC-8821', target: 'ACC-1049', amount: '₹84.5K', isHighRisk: true },
  { id: 'E2', source: 'ACC-8821', target: 'ACC-3312', amount: '₹95K', isHighRisk: true },
  { id: 'E3', source: 'ACC-1049', target: 'ACC-5520', amount: '₹80K', isHighRisk: true },
  { id: 'E4', source: 'ACC-3312', target: 'ACC-5520', amount: '₹92K', isHighRisk: true },
  { id: 'E5', source: 'ACC-4401', target: 'ACC-2210', amount: '₹1.2K', isHighRisk: false },
];

interface NetworkGraphVisualizerProps {
  nodes?: GraphNode[];
  edges?: GraphEdge[];
}

export const NetworkGraphVisualizer: React.FC<NetworkGraphVisualizerProps> = ({
  nodes = DEFAULT_NODES,
  edges = DEFAULT_EDGES,
}) => {
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(nodes[0]);

  const getNodeColor = (type: GraphNode['type']) => {
    switch (type) {
      case 'fraud_ring':
        return '#EF4444'; // Red
      case 'mule_hub':
        return '#F59E0B'; // Amber
      case 'cash_out':
        return '#DC2626'; // Deep Red
      case 'normal':
      default:
        return '#3B82F6'; // Blue
    }
  };

  const getNodeBg = (type: GraphNode['type']) => {
    switch (type) {
      case 'fraud_ring':
        return '#FEE2E2';
      case 'mule_hub':
        return '#FEF3C7';
      case 'cash_out':
        return '#FEE2E2';
      case 'normal':
      default:
        return '#EFF6FF';
    }
  };

  const getNodeTypeLabel = (type: GraphNode['type']) => {
    switch (type) {
      case 'fraud_ring':
        return 'Fraud Ring Originator';
      case 'mule_hub':
        return 'Mule Account Hub';
      case 'cash_out':
        return 'Terminal Cash-out';
      case 'normal':
      default:
        return 'Standard Account';
    }
  };

  return (
    <View style={[styles.card, Shadows.card]}>
      {/* Visualizer Header */}
      <View style={styles.headerRow}>
        <View style={styles.titleLeft}>
          <View style={styles.iconBox}>
            <Icon name="Activity" size={18} color="#3a86ff" strokeWidth={2.4} />
          </View>
          <View>
            <Text style={styles.sectionTitle}>Transaction Network Topology</Text>
            <Text style={styles.sectionSubtitle}>
              GCN entity connections & flow clusters (tap any node)
            </Text>
          </View>
        </View>

        <View style={styles.nodeCountBadge}>
          <Text style={styles.nodeCountText}>{nodes.length} Nodes • {edges.length} Edges</Text>
        </View>
      </View>

      {/* Graph Canvas Area */}
      <View style={styles.canvasContainer}>
        {/* Subtle Background Grid lines */}
        <View style={styles.gridOverlay}>
          <View style={[styles.gridLineH, { top: '25%' }]} />
          <View style={[styles.gridLineH, { top: '50%' }]} />
          <View style={[styles.gridLineH, { top: '75%' }]} />
          <View style={[styles.gridLineV, { left: '33%' }]} />
          <View style={[styles.gridLineV, { left: '66%' }]} />
        </View>

        {/* Directed Edge Connection Lines (represented as styled connector tracks) */}
        {edges.map((edge) => {
          const src = nodes.find((n) => n.id === edge.source);
          const tgt = nodes.find((n) => n.id === edge.target);
          if (!src || !tgt) return null;

          const midX = (src.x + tgt.x) / 2;
          const midY = (src.y + tgt.y) / 2;

          return (
            <View
              key={edge.id}
              style={[
                styles.edgeTag,
                { left: `${midX}%`, top: `${midY}%` },
                edge.isHighRisk ? styles.edgeTagHighRisk : styles.edgeTagNormal,
              ]}>
              <Text
                style={[
                  styles.edgeAmountText,
                  edge.isHighRisk ? styles.edgeAmountHighRisk : styles.edgeAmountNormal,
                ]}>
                {edge.amount} →
              </Text>
            </View>
          );
        })}

        {/* Nodes Layer */}
        {nodes.map((node) => {
          const isSelected = selectedNode?.id === node.id;
          const color = getNodeColor(node.type);
          const bg = getNodeBg(node.type);

          return (
            <TouchableOpacity
              key={node.id}
              style={[
                styles.nodeCircle,
                {
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  borderColor: isSelected ? '#0F172A' : color,
                  backgroundColor: bg,
                },
                isSelected && styles.nodeCircleSelected,
              ]}
              activeOpacity={0.8}
              onPress={() => setSelectedNode(node)}
              accessibilityRole="button"
              accessibilityLabel={`Node ${node.id}, risk score ${node.riskScore}`}>
              <View
                style={[
                  styles.nodeInnerDot,
                  { backgroundColor: color },
                ]}
              />
              <Text style={styles.nodeLabelText} numberOfLines={1}>
                {node.label}
              </Text>
              {node.riskScore >= 75 && (
                <View style={styles.riskBadgeDot}>
                  <Text style={styles.riskBadgeDotText}>{node.riskScore}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Legend Row */}
      <View style={styles.legendContainer}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>Fraud Ring Node</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendText}>Mule Hub</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#3B82F6' }]} />
          <Text style={styles.legendText}>Standard Account</Text>
        </View>
      </View>

      {/* Selected Entity Inspector Card */}
      {selectedNode && (
        <View style={styles.inspectorCard}>
          <View style={styles.inspectorHeader}>
            <View style={styles.inspectorLeft}>
              <View
                style={[
                  styles.inspectorTypeIndicator,
                  { backgroundColor: getNodeColor(selectedNode.type) },
                ]}
              />
              <View>
                <Text style={styles.inspectorIdText}>{selectedNode.id}</Text>
                <Text style={styles.inspectorTypeSub}>
                  {getNodeTypeLabel(selectedNode.type)}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.inspectorRiskPill,
                selectedNode.riskScore >= 75
                  ? styles.inspectorRiskHigh
                  : selectedNode.riskScore >= 40
                  ? styles.inspectorRiskMed
                  : styles.inspectorRiskLow,
              ]}>
              <Text
                style={[
                  styles.inspectorRiskPillText,
                  selectedNode.riskScore >= 75
                    ? styles.textHigh
                    : selectedNode.riskScore >= 40
                    ? styles.textMed
                    : styles.textLow,
                ]}>
                Risk: {selectedNode.riskScore}%
              </Text>
            </View>
          </View>

          {selectedNode.flagReason && (
            <View style={styles.flagReasonBox}>
              <Icon name="AlertTriangle" size={13} color="#DC2626" />
              <Text style={styles.flagReasonText}>{selectedNode.flagReason}</Text>
            </View>
          )}

          {/* Quick Metrics of the Node */}
          <View style={styles.nodeMetricsRow}>
            <View style={styles.nodeMetricCell}>
              <Text style={styles.nodeMetricLabel}>Degree Centrality</Text>
              <Text style={styles.nodeMetricVal}>{selectedNode.degree} links</Text>
            </View>
            <View style={styles.nodeMetricCell}>
              <Text style={styles.nodeMetricLabel}>Total Inflow</Text>
              <Text style={styles.nodeMetricVal}>{selectedNode.inflow}</Text>
            </View>
            <View style={styles.nodeMetricCell}>
              <Text style={styles.nodeMetricLabel}>Total Outflow</Text>
              <Text style={styles.nodeMetricVal}>{selectedNode.outflow}</Text>
            </View>
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
    justifyContent: 'space-between',
    marginBottom: 12,
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
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  nodeCountBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  nodeCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  canvasContainer: {
    height: 220,
    backgroundColor: '#0F172A', // Sleek dark blueprint background for visual impact
    borderRadius: 14,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  gridOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  edgeTag: {
    position: 'absolute',
    transform: [{ translateX: -20 }, { translateY: -10 }],
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 4,
    zIndex: 1,
  },
  edgeTagHighRisk: {
    backgroundColor: 'rgba(239, 68, 68, 0.35)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.6)',
  },
  edgeTagNormal: {
    backgroundColor: 'rgba(148, 163, 184, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.4)',
  },
  edgeAmountText: {
    fontSize: 9,
    fontWeight: '700',
  },
  edgeAmountHighRisk: {
    color: '#FCA5A5',
  },
  edgeAmountNormal: {
    color: '#CBD5E1',
  },
  nodeCircle: {
    position: 'absolute',
    transform: [{ translateX: -32 }, { translateY: -20 }],
    width: 66,
    height: 40,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    zIndex: 2,
  },
  nodeCircleSelected: {
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    transform: [{ translateX: -32 }, { translateY: -20 }, { scale: 1.08 }],
  },
  nodeInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 2,
  },
  nodeLabelText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: 'monospace',
  },
  riskBadgeDot: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#EF4444',
    borderRadius: 6,
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  riskBadgeDotText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: '#64748B',
  },
  inspectorCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  inspectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  inspectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inspectorTypeIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  inspectorIdText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    fontFamily: 'monospace',
  },
  inspectorTypeSub: {
    fontSize: 11,
    color: '#64748B',
  },
  inspectorRiskPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  inspectorRiskHigh: {
    backgroundColor: '#FEE2E2',
  },
  inspectorRiskMed: {
    backgroundColor: '#FEF3C7',
  },
  inspectorRiskLow: {
    backgroundColor: '#ECFDF5',
  },
  inspectorRiskPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  textHigh: {
    color: '#B91C1C',
  },
  textMed: {
    color: '#B45309',
  },
  textLow: {
    color: '#047857',
  },
  flagReasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  flagReasonText: {
    flex: 1,
    fontSize: 11,
    color: '#991B1B',
    lineHeight: 15,
  },
  nodeMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  nodeMetricCell: {
    alignItems: 'center',
    flex: 1,
  },
  nodeMetricLabel: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 2,
  },
  nodeMetricVal: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
});

export default NetworkGraphVisualizer;
