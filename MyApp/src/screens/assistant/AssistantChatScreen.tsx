/**
 * AssistantChatScreen — FraudShield
 *
 * Context-aware conversational AI assistant for:
 * 1. "Explain This Detection" — translates detector findings, classification,
 *    and URL analysis into plain, non-technical explanations.
 * 2. "Fraud Help Assistant" — guides users through scam triage, panic reduction,
 *    and step-by-step recovery actions (Helpline 1930 / cybercrime.gov.in).
 *
 * Design:
 * - FraudShield primary color: #3a86ff
 * - Pure Lucide icons
 * - Safe context preview banner
 * - Interactive action checklist with tap-to-complete
 * - Quick suggested chips
 * - Zero secrets warning and privacy guardrails
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Linking,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from '../../components/Icon';
import { Colors, Typography, Spacing, Shadows } from '../../theme/theme';
import assistantApi, {
  AssistantDetectionContext,
  AssistantChatResponse,
} from '../../api/assistantApi';

const PRIMARY_COLOR = '#3a86ff';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: number;
  suggestedFollowUps?: string[];
  actionChecklist?: string[];
  urgency?: 'low' | 'medium' | 'high' | 'immediate';
  isError?: boolean;
}

export type AssistantChatRouteParams = {
  mode?: 'detection_explanation' | 'general_help';
  detectionContext?: AssistantDetectionContext;
  initialPrompt?: string;
};

const DEFAULT_GENERAL_SUGGESTIONS = [
  'I clicked a suspicious link.',
  'I shared an OTP or password.',
  'I sent money to a scammer.',
  'I installed a suspicious app.',
  'How can I report a scam?',
  'How can I check if a message is genuine?',
];

const DEFAULT_DETECTION_SUGGESTIONS = [
  'Why is this link suspicious?',
  'Could this be a genuine bank message?',
  'What should I do next?',
  'How do I report this sender?',
];

export const AssistantChatScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<{ params: AssistantChatRouteParams }, 'params'>>();

  const mode = route.params?.mode || (route.params?.detectionContext ? 'detection_explanation' : 'general_help');
  const detectionContext = route.params?.detectionContext;
  const initialPrompt = route.params?.initialPrompt;

  const [conversationId, setConversationId] = useState<string>(
    () => `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [activeSuggestions, setActiveSuggestions] = useState<string[]>(
    mode === 'detection_explanation' ? DEFAULT_DETECTION_SUGGESTIONS : DEFAULT_GENERAL_SUGGESTIONS,
  );
  const [isContextCollapsed, setIsContextCollapsed] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // Initialize initial greeting & prompt
  useEffect(() => {
    let initialGreetingText = '';

    if (mode === 'detection_explanation' && detectionContext) {
      const isThreat = detectionContext.classification === 'FRAUD' || (detectionContext.riskScore || 0) >= 0.70;
      const scorePct = Math.round((detectionContext.riskScore || 0) * 100);

      initialGreetingText = `Hello! I'm your FraudShield Assistant. I have analyzed this detection (${scorePct}% risk). Ask me why this message was flagged, what suspicious signs were found, or how to verify the sender safely.`;
    } else {
      initialGreetingText = `Hello! I'm your FraudShield Security Assistant. If you received a suspicious message, clicked a link, or suspect you might be targeted by a scam, I'm here to help you assess what happened and take safe recovery steps.`;
    }

    const initialMsg: ChatMessage = {
      id: `bot_init_${Date.now()}`,
      sender: 'assistant',
      text: initialGreetingText,
      timestamp: Date.now(),
      suggestedFollowUps:
        mode === 'detection_explanation'
          ? DEFAULT_DETECTION_SUGGESTIONS
          : DEFAULT_GENERAL_SUGGESTIONS,
    };

    setMessages([initialMsg]);

    // If an initial prompt was requested automatically (e.g., from tapping "Understand this warning")
    if (initialPrompt && initialPrompt.trim()) {
      handleSendMessage(initialPrompt.trim());
    }
  }, []);

  const handleSendMessage = async (textToSend?: string) => {
    const rawText = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!rawText || isLoading) return;

    if (textToSend === undefined) {
      setInputText('');
    }

    const userMsgId = `user_${Date.now()}`;
    const newMsg: ChatMessage = {
      id: userMsgId,
      sender: 'user',
      text: rawText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setIsLoading(true);

    // Scroll to bottom
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 100);

    try {
      // Build recent conversation history (last 6 messages max)
      const history = messages.slice(-6).map((m) => ({
        role: (m.sender === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.text,
      }));

      const res: AssistantChatResponse = await assistantApi.sendMessage({
        message: rawText,
        mode,
        conversationId,
        detectionContext,
        history,
      });

      if (res && res.conversationId) {
        setConversationId(res.conversationId);
      }

      const botMsg: ChatMessage = {
        id: `bot_${Date.now()}`,
        sender: 'assistant',
        text: res.response || "I'm here to help. Could you provide a bit more detail?",
        timestamp: Date.now(),
        suggestedFollowUps: res.suggestedFollowUps || [],
        actionChecklist: res.actionChecklist || [],
        urgency: res.urgency,
      };

      setMessages((prev) => [...prev, botMsg]);

      if (res.suggestedFollowUps && res.suggestedFollowUps.length > 0) {
        setActiveSuggestions(res.suggestedFollowUps);
      }
    } catch (err: any) {
      console.warn('[AssistantChatScreen] API error:', err);
      const errorMsg: ChatMessage = {
        id: `bot_err_${Date.now()}`,
        sender: 'assistant',
        text: 'Unable to reach the assistant service at this moment. If you have transferred money or shared bank details, please call the National Cybercrime Helpline 1930 immediately.',
        timestamp: Date.now(),
        isError: true,
        actionChecklist: ['Call National Cybercrime Helpline 1930', 'Contact your bank fraud desk'],
        urgency: 'high',
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  };

  const toggleChecklistStep = (stepText: string) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [stepText]: !prev[stepText],
    }));
  };

  const handleCallHelpline = () => {
    Linking.openURL('tel:1930').catch(() => {
      // ignore
    });
  };

  const handleOpenCyberPortal = () => {
    Linking.openURL('https://cybercrime.gov.in/').catch(() => {
      // ignore
    });
  };

  // Render individual message item
  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isUser = item.sender === 'user';
    const isUrgent = item.urgency === 'immediate' || item.urgency === 'high';

    return (
      <View
        style={[
          styles.messageRow,
          isUser ? styles.messageRowUser : styles.messageRowAssistant,
        ]}>
        {!isUser && (
          <View style={styles.assistantAvatar}>
            <Icon name="Bot" size={16} color="#FFFFFF" strokeWidth={2.4} />
          </View>
        )}

        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
            item.isError && styles.errorBubble,
          ]}>
          {/* Header if urgent */}
          {!isUser && isUrgent && (
            <View style={styles.urgentBadgeRow}>
              <Icon name="AlertTriangle" size={13} color="#DC2626" strokeWidth={2.4} style={{ marginRight: 4 }} />
              <Text style={styles.urgentBadgeText}>URGENT SAFETY ACTION REQUIRED</Text>
            </View>
          )}

          <Text
            style={[
              styles.messageText,
              isUser ? styles.userMessageText : styles.assistantMessageText,
            ]}>
            {item.text}
          </Text>

          {/* Action Checklist */}
          {item.actionChecklist && item.actionChecklist.length > 0 && (
            <View style={styles.checklistContainer}>
              <Text style={styles.checklistTitle}>Recommended Action Steps:</Text>
              {item.actionChecklist.map((step, idx) => {
                const isChecked = !!completedSteps[step];
                return (
                  <TouchableOpacity
                    key={`${step}_${idx}`}
                    style={[styles.checklistItem, isChecked && styles.checklistItemDone]}
                    activeOpacity={0.8}
                    onPress={() => toggleChecklistStep(step)}>
                    <View
                      style={[
                        styles.checkboxBox,
                        isChecked && styles.checkboxBoxChecked,
                      ]}>
                      {isChecked && <Icon name="Check" size={12} color="#FFFFFF" strokeWidth={3} />}
                    </View>
                    <Text
                      style={[
                        styles.checklistText,
                        isChecked && styles.checklistTextDone,
                      ]}>
                      {step}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Time & status */}
          <Text
            style={[
              styles.timestampText,
              isUser ? styles.userTimestampText : styles.assistantTimestampText,
            ]}>
            {new Date(item.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* ─── Screen Header ─────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back">
          <Icon name="ChevronLeft" size={24} color="#0F172A" strokeWidth={2.4} />
        </TouchableOpacity>

        <View style={styles.headerTitleGroup}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle}>FraudShield Assistant</Text>
            <View style={styles.liveDot} />
          </View>
          <Text style={styles.headerSubtitle}>
            {mode === 'detection_explanation' ? 'Explaining Detection' : 'Fraud Help & Recovery'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.helplineQuickBtn}
          onPress={handleCallHelpline}
          accessibilityRole="button"
          accessibilityLabel="Dial 1930 Cybercrime Helpline">
          <Icon name="Phone" size={14} color="#DC2626" strokeWidth={2.4} style={{ marginRight: 4 }} />
          <Text style={styles.helplineQuickBtnText}>1930</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Detection Context Banner (if in detection_explanation mode) ─ */}
      {mode === 'detection_explanation' && detectionContext && (
        <View style={styles.detectionBanner}>
          <TouchableOpacity
            style={styles.detectionBannerHeader}
            activeOpacity={0.85}
            onPress={() => setIsContextCollapsed(!isContextCollapsed)}>
            <View style={styles.detectionBannerTitleRow}>
              <Icon
                name={
                  (detectionContext.riskScore || 0) >= 0.70 ? 'AlertTriangle' : 'CheckCircle2'
                }
                size={16}
                color={(detectionContext.riskScore || 0) >= 0.70 ? '#DC2626' : '#059669'}
                strokeWidth={2.4}
                style={{ marginRight: 6 }}
              />
              <Text style={styles.detectionBannerTitle}>
                Referenced Detection ({detectionContext.source || 'Manual Scan'})
              </Text>
            </View>

            <View style={styles.detectionBannerRight}>
              <View
                style={[
                  styles.detectionScoreBadge,
                  (detectionContext.riskScore || 0) >= 0.70
                    ? styles.badgeDanger
                    : styles.badgeSafe,
                ]}>
                <Text
                  style={[
                    styles.detectionScoreBadgeText,
                    (detectionContext.riskScore || 0) >= 0.70
                      ? styles.badgeDangerText
                      : styles.badgeSafeText,
                  ]}>
                  {Math.round((detectionContext.riskScore || 0) * 100)}% Risk
                </Text>
              </View>
              <Icon
                name={isContextCollapsed ? 'ChevronRight' : 'X'}
                size={14}
                color="#64748B"
                strokeWidth={2}
                style={{ marginLeft: 6 }}
              />
            </View>
          </TouchableOpacity>

          {!isContextCollapsed && (
            <View style={styles.detectionBannerBody}>
              {!!detectionContext.safePreview && (
                <Text style={styles.detectionPreviewText} numberOfLines={2}>
                  "{detectionContext.safePreview}"
                </Text>
              )}
              {detectionContext.reasons && detectionContext.reasons.length > 0 && (
                <View style={styles.reasonsList}>
                  {detectionContext.reasons.slice(0, 2).map((r, i) => (
                    <Text key={i} style={styles.reasonBullet} numberOfLines={1}>
                      • {r}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* ─── Chat Message Feed ───────────────────────────────────────── */}
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderMessageItem}
          contentContainerStyle={styles.messageListContent}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            isLoading ? (
              <View style={styles.loadingContainer}>
                <View style={styles.assistantAvatar}>
                  <Icon name="Bot" size={16} color="#FFFFFF" strokeWidth={2.4} />
                </View>
                <View style={styles.typingBubble}>
                  <ActivityIndicator size="small" color={PRIMARY_COLOR} />
                  <Text style={styles.typingText}>FraudShield is analyzing...</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* ─── Suggested Prompt Chips ─────────────────────────────────── */}
        {activeSuggestions.length > 0 && (
          <View style={styles.chipsSection}>
            <FlatList
              horizontal
              data={activeSuggestions}
              keyExtractor={(item, index) => `${item}_${index}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsContainer}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.chipButton}
                  onPress={() => handleSendMessage(item)}
                  activeOpacity={0.8}
                  disabled={isLoading}>
                  <Text style={styles.chipText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* ─── Safety Notice ─────────────────────────────────────────── */}
        <View style={styles.privacyNoticeRow}>
          <Icon name="LockKeyhole" size={11} color="#64748B" strokeWidth={2} style={{ marginRight: 4 }} />
          <Text style={styles.privacyNoticeText}>
            Never share OTPs, PINs, or passwords in chat. Official helplines never ask for them.
          </Text>
        </View>

        {/* ─── Message Composer ───────────────────────────────────────── */}
        <View style={styles.composerContainer}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              placeholder="Ask a question or describe what happened..."
              placeholderTextColor="#94A3B8"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1500}
              editable={!isLoading}
            />
            {inputText.length > 0 && (
              <Text style={styles.charCount}>{inputText.length}/1500</Text>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
              (!inputText.trim() || isLoading) && styles.sendButtonDisabled,
            ]}
            onPress={() => handleSendMessage()}
            disabled={!inputText.trim() || isLoading}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Send message">
            <Icon
              name="Send"
              size={18}
              color="#FFFFFF"
              strokeWidth={2.4}
            />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerTitleGroup: {
    flex: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
    marginLeft: 6,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 1,
  },
  helplineQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  helplineQuickBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },

  // Detection Context Banner
  detectionBanner: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  detectionBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detectionBannerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  detectionBannerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
  },
  detectionBannerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detectionScoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeDanger: {
    backgroundColor: '#FEE2E2',
  },
  badgeSafe: {
    backgroundColor: '#DCFCE7',
  },
  badgeDangerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  badgeSafeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  detectionBannerBody: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  detectionPreviewText: {
    fontSize: 12,
    color: '#475569',
    fontStyle: 'italic',
    marginBottom: 4,
  },
  reasonsList: {
    marginTop: 2,
  },
  reasonBullet: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },

  // Message List
  messageListContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 4,
  },
  messageBubble: {
    maxWidth: '82%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: PRIMARY_COLOR,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.sm,
  },
  errorBubble: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#FFFFFF',
  },
  assistantMessageText: {
    color: '#0F172A',
  },
  timestampText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  userTimestampText: {
    color: '#E0E7FF',
  },
  assistantTimestampText: {
    color: '#94A3B8',
  },

  // Urgent Badge
  urgentBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  urgentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: 0.3,
  },

  // Checklist
  checklistContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  checklistTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 6,
  },
  checklistItemDone: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    opacity: 0.7,
  },
  checkboxBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#94A3B8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    backgroundColor: '#FFFFFF',
  },
  checkboxBoxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checklistText: {
    fontSize: 12,
    color: '#1E293B',
    flex: 1,
    lineHeight: 17,
  },
  checklistTextDone: {
    textDecorationLine: 'line-through',
    color: '#64748B',
  },

  // Typing indicator
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...Shadows.sm,
  },
  typingText: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 8,
  },

  // Suggestions Chips
  chipsSection: {
    paddingVertical: 6,
    backgroundColor: '#F8FAFC',
  },
  chipsContainer: {
    paddingHorizontal: 16,
  },
  chipButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    marginRight: 8,
    ...Shadows.sm,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1E293B',
  },

  // Privacy notice
  privacyNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#F8FAFC',
  },
  privacyNoticeText: {
    fontSize: 10,
    color: '#64748B',
  },

  // Composer
  composerContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 40,
    maxHeight: 110,
    marginRight: 8,
  },
  textInput: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    padding: 0,
  },
  charCount: {
    fontSize: 10,
    color: '#94A3B8',
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PRIMARY_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
  },
});

export default AssistantChatScreen;
