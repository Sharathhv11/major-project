/**
 * Fraud Help Assistant Card — FraudShield
 *
 * Prominent home dashboard entry point for the context-aware Conversational AI assistant.
 * Allows users to assess potential scams, follow guided recovery procedures (Helpline 1930 / cybercrime.gov.in),
 * and ask safety questions with one-tap prompt chips.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import Icon from '../../../components/Icon';
import { Colors, Shadows, Spacing } from '../../../theme/theme';

const PRIMARY_COLOR = '#3a86ff';

interface FraudHelpAssistantCardProps {
  onOpenAssistant: () => void;
  onSelectPrompt: (prompt: string) => void;
}

const STARTING_PROMPTS = [
  'I clicked a suspicious link.',
  'I shared an OTP or password.',
  'I sent money to a scammer.',
  'I installed a suspicious app.',
  'How can I report a scam?',
  'How can I check if a message is genuine?',
];

export const FraudHelpAssistantCard: React.FC<FraudHelpAssistantCardProps> = ({
  onOpenAssistant,
  onSelectPrompt,
}) => {
  return (
    <View style={[styles.card, Shadows.card]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.iconContainer}>
          <Icon name="Bot" size={20} color={PRIMARY_COLOR} strokeWidth={2.4} />
        </View>

        <View style={styles.titleContainer}>
          <View style={styles.titleBadgeRow}>
            <Text style={styles.title}>Fraud Help Assistant</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>24/7 Safety</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            Guided scam triage, instant recovery steps, and incident guidance.
          </Text>
        </View>
      </View>

      {/* Suggested Starting Prompts */}
      <Text style={styles.promptsHeading}>Common Questions & Emergency Help:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.promptsScroll}>
        {STARTING_PROMPTS.map((prompt, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.promptChip}
            activeOpacity={0.8}
            onPress={() => onSelectPrompt(prompt)}
            accessibilityRole="button"
            accessibilityLabel={prompt}>
            <Text style={styles.promptChipText}>{prompt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Action Button */}
      <TouchableOpacity
        style={styles.openButton}
        onPress={onOpenAssistant}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityLabel="Open Fraud Help Assistant">
        <Text style={styles.openButtonText}>Start Conversation with Assistant</Text>
        <Icon name="ArrowRight" size={16} color="#FFFFFF" strokeWidth={2.4} style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginVertical: Spacing.sm,
    borderColor: '#E2E8F0',
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  titleContainer: {
    flex: 1,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  badge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: PRIMARY_COLOR,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 18,
    marginTop: 3,
  },
  promptsHeading: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#94A3B8',
    letterSpacing: 0.4,
    marginTop: 14,
    marginBottom: 8,
  },
  promptsScroll: {
    paddingRight: 8,
    paddingBottom: 4,
  },
  promptChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  promptChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 12,
    height: 44,
    marginTop: 12,
  },
  openButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default FraudHelpAssistantCard;
