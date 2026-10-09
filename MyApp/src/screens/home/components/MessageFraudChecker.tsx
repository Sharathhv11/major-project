/**
 * Message Fraud Checker Component — FraudShield
 *
 * Dedicated section for checking suspicious messages via:
 * 1. Typing / Pasting text directly
 * 2. Uploading a screenshot with on-device OCR extraction & editable review
 *
 * Follows FraudShield design principles:
 * - Minimal, clean, and professional hierarchy
 * - Dominant #3a86ff primary actions
 * - Lucide icons throughout
 * - Multi-stage pipeline: Input -> OCR -> Review -> Analysis -> Result
 * - Accessible, high-contrast, large touch targets
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import Icon from '../../../components/Icon';
import { Colors, Typography, Spacing, Shadows } from '../../../theme/theme';
import { pickScreenshot, extractTextFromScreenshot } from '../../../services/ocrService';
import { checkMessageForFraud, MessageCheckResult } from '../../../fraudDetection/messageCheckerHandler';

const PRIMARY_COLOR = '#3a86ff';

type CheckerStep =
  | 'INPUT'        // Normal typing / empty state
  | 'OCR_READING'  // OCR is actively processing the screenshot
  | 'OCR_REVIEW'   // OCR completed, user reviews / edits extracted text
  | 'ANALYZING'    // Fraud detection pipeline running
  | 'RESULT';      // Result card displayed

interface MessageFraudCheckerProps {
  onScanComplete?: (result: MessageCheckResult) => void;
}

export const MessageFraudChecker: React.FC<MessageFraudCheckerProps> = ({
  onScanComplete,
}) => {
  // Input & state
  const [inputText, setInputText] = useState('');
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const [step, setStep] = useState<CheckerStep>('INPUT');
  const [isInputFocused, setIsInputFocused] = useState(false);

  // Analysis result & error
  const [checkResult, setCheckResult] = useState<MessageCheckResult | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const textInputRef = useRef<TextInput>(null);

  // ─── Screenshot Picking & OCR Extraction ────────────────────────────────────

  const handlePickScreenshot = async () => {
    try {
      setOcrError(null);
      const picked = await pickScreenshot();
      if (!picked || !picked.uri) {
        // User cancelled picker
        return;
      }

      setSelectedImageUri(picked.uri);
      setStep('OCR_READING');

      const ocrResult = await extractTextFromScreenshot(picked.uri);

      if (ocrResult.success && ocrResult.text) {
        setInputText(ocrResult.text);
        setStep('OCR_REVIEW');
      } else {
        const errorMsg =
          ocrResult.error || 'No readable text was detected in this screenshot.';
        setOcrError(errorMsg);
        setStep('INPUT');
        Alert.alert(
          'OCR Notice',
          `${errorMsg}\n\nYou can still paste or type the message manually.`,
          [{ text: 'OK' }],
        );
      }
    } catch (err: any) {
      console.warn('[FraudShield Checker] Screenshot picker error:', err);
      setOcrError(err?.message || 'Failed to open image picker.');
      setStep('INPUT');
      Alert.alert(
        'Upload Failed',
        err?.message || 'Could not select screenshot from gallery.',
        [{ text: 'OK' }],
      );
    }
  };

  const handleRemoveImage = () => {
    setSelectedImageUri(null);
    setOcrError(null);
    if (step === 'OCR_REVIEW') {
      setStep('INPUT');
    }
  };

  // ─── Fraud Analysis Execution ───────────────────────────────────────────────

  const handleRunFraudCheck = async () => {
    const textToAnalyze = inputText.trim();
    if (!textToAnalyze || textToAnalyze.length < 5) {
      Alert.alert(
        'Message Too Short',
        'Please enter or paste at least 5 characters to analyze for potential fraud.',
        [{ text: 'OK' }],
      );
      return;
    }

    setStep('ANALYZING');

    try {
      const result = await checkMessageForFraud(textToAnalyze);
      setCheckResult(result);
      setStep('RESULT');

      if (onScanComplete) {
        onScanComplete(result);
      }
    } catch (err: any) {
      console.error('[FraudShield Checker] Check error:', err);
      setCheckResult({
        state: 'ERROR',
        riskScore: 0,
        scorePercentage: 0,
        title: 'Unable to check this message',
        summary:
          'A system error occurred during analysis. Please verify your connection and try again.',
        reasons: [],
        cached: false,
        hasUrl: false,
        analyzedText: textToAnalyze,
        error: err?.message || 'Unexpected failure',
      });
      setStep('RESULT');
    }
  };

  const handleReset = () => {
    setInputText('');
    setSelectedImageUri(null);
    setCheckResult(null);
    setOcrError(null);
    setStep('INPUT');
  };

  const handleLoadSample = (type: 'scam' | 'safe') => {
    if (type === 'scam') {
      setInputText(
        'URGENT: Your bank account has been locked due to suspicious activity. Verify your KYC immediately at http://secure-banking-alert.xyz/verify to avoid permanent suspension. Do not share your OTP with anyone.',
      );
    } else {
      setInputText(
        'Hi, your package order #48291 has been dispatched and will arrive tomorrow via standard delivery. Thank you for shopping with us!',
      );
    }
    setStep('INPUT');
  };

  const canCheck = inputText.trim().length >= 5 && step !== 'ANALYZING' && step !== 'OCR_READING';

  // ─── RENDER SUBVIEWS ────────────────────────────────────────────────────────

  return (
    <View style={styles.sectionContainer}>
      {/* ─── Header Section (Always Visible) ────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={styles.headerIconWrapper}>
          <Icon name="Shield" size={20} color={PRIMARY_COLOR} strokeWidth={2.4} />
        </View>
        <View style={styles.headerTextGroup}>
          <Text style={styles.heading}>Check a suspicious message</Text>
          <Text style={styles.subheading}>
            Paste a message or upload a screenshot to check for potential fraud.
          </Text>
        </View>
      </View>

      {/* ─── State 1 & 3: INPUT / OCR REVIEW ────────────────────────── */}
      {(step === 'INPUT' || step === 'OCR_REVIEW') && (
        <View style={styles.contentBody}>
          {/* OCR Review Header Banner */}
          {step === 'OCR_REVIEW' && (
            <View style={styles.reviewBanner}>
              <View style={styles.reviewBannerHeader}>
                <View style={styles.reviewBadge}>
                  <Icon name="FileText" size={14} color="#1E40AF" strokeWidth={2.2} />
                  <Text style={styles.reviewBadgeText}>Extracted message</Text>
                </View>
                <TouchableOpacity
                  onPress={handlePickScreenshot}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.replaceImageBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Replace screenshot">
                  <Icon name="RefreshCw" size={13} color={PRIMARY_COLOR} strokeWidth={2} />
                  <Text style={styles.replaceImageText}>Replace image</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.reviewTip}>
                Review or correct any misread numbers, links, or bank names before checking.
              </Text>
            </View>
          )}

          {/* Screenshot Preview Card (if an image is selected) */}
          {selectedImageUri && (
            <View style={styles.imagePreviewRow}>
              <Image
                source={{ uri: selectedImageUri }}
                style={styles.imageThumbnail}
                resizeMode="cover"
                accessibilityLabel="Selected screenshot thumbnail"
              />
              <View style={styles.imageDetailsCol}>
                <Text style={styles.imageTitle} numberOfLines={1}>
                  Screenshot attached
                </Text>
                <Text style={styles.imageSubtitle}>
                  Text extracted via on-device OCR
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleRemoveImage}
                style={styles.imageRemoveBtn}
                accessibilityRole="button"
                accessibilityLabel="Remove attached screenshot"
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Icon name="Trash2" size={16} color={Colors.textTertiary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          )}

          {/* Multiline Message Input */}
          <View
            style={[
              styles.inputBox,
              isInputFocused && styles.inputBoxFocused,
              Boolean(ocrError) && styles.inputBoxError,
            ]}>
            <TextInput
              ref={textInputRef}
              style={styles.textInput}
              multiline
              textAlignVertical="top"
              placeholder="Paste suspicious message here..."
              placeholderTextColor="#94A3B8"
              value={inputText}
              onChangeText={setInputText}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => setIsInputFocused(false)}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Suspicious message text input"
            />
            {/* Subtle Character Count */}
            <View style={styles.inputFooter}>
              <Text style={styles.charCount}>
                {inputText.length} characters
              </Text>
              {inputText.length > 0 && (
                <TouchableOpacity
                  onPress={() => setInputText('')}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  accessibilityLabel="Clear message text">
                  <Text style={styles.clearTextLink}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Divider & Screenshot Upload Button (only in default input step) */}
          {step === 'INPUT' && !selectedImageUri && (
            <>
              <View style={styles.orDividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.uploadCard}
                onPress={handlePickScreenshot}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Upload screenshot for OCR">
                <View style={styles.uploadIconCircle}>
                  <Icon name="Image" size={22} color={PRIMARY_COLOR} strokeWidth={2.2} />
                </View>
                <View style={styles.uploadTextContainer}>
                  <Text style={styles.uploadTitle}>Upload Screenshot</Text>
                  <Text style={styles.uploadSubtitle}>
                    We'll extract the text automatically using OCR.
                  </Text>
                </View>
                <Icon
                  name="ChevronRight"
                  size={18}
                  color={Colors.textTertiary}
                  strokeWidth={2}
                />
              </TouchableOpacity>
            </>
          )}

          {/* Primary Action Button: "Check for Fraud" / "Check this message" */}
          <TouchableOpacity
            style={[
              styles.primaryCheckBtn,
              !canCheck && styles.primaryCheckBtnDisabled,
            ]}
            onPress={handleRunFraudCheck}
            disabled={!canCheck}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Check for Fraud">
            <Icon
              name="Search"
              size={18}
              color="#FFFFFF"
              strokeWidth={2.5}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.primaryCheckBtnText}>
              {step === 'OCR_REVIEW' ? 'Check this message' : 'Check for Fraud'}
            </Text>
          </TouchableOpacity>

          {/* Sample quick-fill helper links for evaluation/testing */}
          <View style={styles.sampleRow}>
            <Text style={styles.samplePrefix}>Quick test:</Text>
            <TouchableOpacity
              onPress={() => handleLoadSample('scam')}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Text style={styles.sampleLink}>Suspicious Alert</Text>
            </TouchableOpacity>
            <Text style={styles.sampleDot}>•</Text>
            <TouchableOpacity
              onPress={() => handleLoadSample('safe')}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
              <Text style={styles.sampleLink}>Safe Delivery</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── State 2: OCR LOADING STATE ─────────────────────────────── */}
      {step === 'OCR_READING' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          <Text style={styles.loadingTitle}>Reading screenshot...</Text>
          <Text style={styles.loadingSubtitle}>
            Extracting text from image on-device. Your screenshot never leaves your phone.
          </Text>
        </View>
      )}

      {/* ─── State 4: FRAUD ANALYSIS LOADING STATE ──────────────────── */}
      {step === 'ANALYZING' && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={PRIMARY_COLOR} />
          <Text style={styles.loadingTitle}>Checking message...</Text>
          <Text style={styles.loadingSubtitle}>
            Evaluating linguistic patterns, URLs, and known fraud indicators...
          </Text>
        </View>
      )}

      {/* ─── State 5: FRAUD RESULT STATE ────────────────────────────── */}
      {step === 'RESULT' && checkResult && (
        <View style={styles.resultContainer}>
          {/* Result Status Banner */}
          {checkResult.state === 'POTENTIAL_FRAUD' && (
            <View style={[styles.resultBanner, styles.bannerFraud]}>
              <View style={styles.resultHeaderRow}>
                <View style={[styles.statusIconBox, styles.statusIconFraud]}>
                  <Icon
                    name="AlertTriangle"
                    size={22}
                    color="#DC2626"
                    strokeWidth={2.4}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultTitle, styles.textFraud]}>
                    {checkResult.title}
                  </Text>
                  <Text style={styles.resultSummary}>
                    {checkResult.summary}
                  </Text>
                </View>
              </View>

              {/* Fraud Risk Score Metric */}
              <View style={styles.riskScoreMetricRow}>
                <View>
                  <Text style={styles.riskScoreLabel}>Fraud Risk</Text>
                  <Text style={[styles.riskScoreValue, styles.textFraud]}>
                    {checkResult.scorePercentage}%
                  </Text>
                </View>
                <View style={styles.riskPillHigh}>
                  <Text style={styles.riskPillTextHigh}>High Risk</Text>
                </View>
              </View>

              {/* Supported Reasons List */}
              {checkResult.reasons && checkResult.reasons.length > 0 && (
                <View style={styles.reasonsBox}>
                  <Text style={styles.reasonsHeader}>Key Warning Indicators:</Text>
                  {checkResult.reasons.map((reason, idx) => (
                    <View key={`reason-${idx}`} style={styles.reasonItemRow}>
                      <View style={styles.reasonBullet} />
                      <Text style={styles.reasonText}>{reason}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {checkResult.state === 'LIKELY_SAFE' && (
            <View style={[styles.resultBanner, styles.bannerSafe]}>
              <View style={styles.resultHeaderRow}>
                <View style={[styles.statusIconBox, styles.statusIconSafe]}>
                  <Icon
                    name="CheckCircle2"
                    size={22}
                    color="#059669"
                    strokeWidth={2.4}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultTitle, styles.textSafe]}>
                    {checkResult.title}
                  </Text>
                  <Text style={styles.resultSummary}>
                    {checkResult.summary}
                  </Text>
                </View>
              </View>

              {/* Fraud Risk Score Metric */}
              <View style={styles.riskScoreMetricRow}>
                <View>
                  <Text style={styles.riskScoreLabel}>Fraud Risk</Text>
                  <Text style={[styles.riskScoreValue, styles.textSafe]}>
                    {checkResult.scorePercentage}%
                  </Text>
                </View>
                <View style={styles.riskPillLow}>
                  <Text style={styles.riskPillTextLow}>Low Risk</Text>
                </View>
              </View>

              <View style={styles.safeNoticeBox}>
                <Icon name="Info" size={14} color="#047857" strokeWidth={2} />
                <Text style={styles.safeNoticeText}>
                  This is a probabilistic risk assessment. Always independently verify unexpected payment or login requests.
                </Text>
              </View>
            </View>
          )}

          {checkResult.state === 'ERROR' && (
            <View style={[styles.resultBanner, styles.bannerError]}>
              <View style={styles.resultHeaderRow}>
                <View style={[styles.statusIconBox, styles.statusIconError]}>
                  <Icon
                    name="AlertCircle"
                    size={22}
                    color="#B45309"
                    strokeWidth={2.4}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.resultTitle, styles.textWarning]}>
                    {checkResult.title}
                  </Text>
                  <Text style={styles.resultSummary}>
                    {checkResult.summary}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Analyzed Message Preview */}
          <View style={styles.analyzedMessageBox}>
            <Text style={styles.analyzedMessageLabel}>Analyzed Message:</Text>
            <Text style={styles.analyzedMessageContent} numberOfLines={4}>
              "{checkResult.analyzedText}"
            </Text>
          </View>

          {/* Action Row */}
          <View style={styles.resultActionsRow}>
            {checkResult.state === 'ERROR' ? (
              <TouchableOpacity
                style={styles.primaryCheckBtn}
                onPress={handleRunFraudCheck}
                activeOpacity={0.88}
                accessibilityRole="button"
                accessibilityLabel="Retry check">
                <Icon name="RefreshCw" size={16} color="#FFFFFF" strokeWidth={2.2} style={{ marginRight: 6 }} />
                <Text style={styles.primaryCheckBtnText}>Retry Check</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.checkAnotherBtn}
                onPress={handleReset}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Check another message">
                <Text style={styles.checkAnotherBtnText}>Check Another Message</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  sectionContainer: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    marginVertical: Spacing.sm,
    borderColor: '#E2E8F0',
    borderWidth: 1,
    ...Shadows.card,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  headerTextGroup: {
    flex: 1,
  },
  heading: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  subheading: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    marginTop: 3,
  },

  contentBody: {
    marginTop: 4,
  },

  // Multiline Input
  inputBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
    minHeight: 120,
  },
  inputBoxFocused: {
    borderColor: PRIMARY_COLOR,
  },
  inputBoxError: {
    borderColor: '#EF4444',
  },
  textInput: {
    fontSize: 15,
    lineHeight: 22,
    color: '#0F172A',
    minHeight: 80,
    padding: 0,
  },
  inputFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F1F5F9',
    paddingTop: 6,
  },
  charCount: {
    fontSize: 12,
    color: '#94A3B8',
  },
  clearTextLink: {
    fontSize: 12,
    fontWeight: '600',
    color: PRIMARY_COLOR,
  },

  // Divider
  orDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
  },

  // Upload Screenshot Card
  uploadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  uploadIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  uploadTextContainer: {
    flex: 1,
  },
  uploadTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 2,
  },
  uploadSubtitle: {
    fontSize: 13,
    color: '#64748B',
  },

  // Primary Check Action Button
  primaryCheckBtn: {
    backgroundColor: PRIMARY_COLOR,
    borderRadius: 12,
    height: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 6,
  },
  primaryCheckBtnDisabled: {
    opacity: 0.45,
  },
  primaryCheckBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // Image Preview Row
  imagePreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
  },
  imageThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#E2E8F0',
  },
  imageDetailsCol: {
    flex: 1,
  },
  imageTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  imageSubtitle: {
    fontSize: 12,
    color: '#64748B',
  },
  imageRemoveBtn: {
    padding: 6,
  },

  // OCR Review Banner
  reviewBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  reviewBannerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  reviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
    marginLeft: 6,
  },
  replaceImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  replaceImageText: {
    fontSize: 12,
    fontWeight: '600',
    color: PRIMARY_COLOR,
    marginLeft: 4,
  },
  reviewTip: {
    fontSize: 12,
    color: '#3B82F6',
    lineHeight: 16,
  },

  // Sample quick tests
  sampleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  samplePrefix: {
    fontSize: 12,
    color: '#94A3B8',
    marginRight: 6,
  },
  sampleLink: {
    fontSize: 12,
    fontWeight: '600',
    color: PRIMARY_COLOR,
  },
  sampleDot: {
    marginHorizontal: 6,
    color: '#CBD5E1',
    fontSize: 12,
  },

  // Loading States
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  loadingTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 14,
    marginBottom: 4,
  },
  loadingSubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Result States
  resultContainer: {
    marginTop: 4,
  },
  resultBanner: {
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  bannerFraud: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  bannerSafe: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  bannerError: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  resultHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  statusIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginTop: 1,
  },
  statusIconFraud: {
    backgroundColor: '#FEE2E2',
  },
  statusIconSafe: {
    backgroundColor: '#D1FAE5',
  },
  statusIconError: {
    backgroundColor: '#FEF3C7',
  },
  resultTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  textFraud: {
    color: '#B91C1C',
  },
  textSafe: {
    color: '#047857',
  },
  textWarning: {
    color: '#B45309',
  },
  resultSummary: {
    fontSize: 14,
    lineHeight: 20,
    color: '#334155',
  },

  // Risk Score Metric
  riskScoreMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
  },
  riskScoreLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  riskScoreValue: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  riskPillHigh: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  riskPillTextHigh: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  riskPillLow: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  riskPillTextLow: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },

  // Reasons Box
  reasonsBox: {
    marginTop: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 10,
    padding: 12,
  },
  reasonsHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  reasonItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  reasonBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DC2626',
    marginRight: 8,
  },
  reasonText: {
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '500',
  },

  // Safe Notice Box
  safeNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0, 0, 0, 0.06)',
  },
  safeNoticeText: {
    fontSize: 12,
    color: '#047857',
    marginLeft: 6,
    flex: 1,
    lineHeight: 16,
  },

  // Analyzed message preview
  analyzedMessageBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  analyzedMessageLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#94A3B8',
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  analyzedMessageContent: {
    fontSize: 13,
    color: '#475569',
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Result action buttons
  resultActionsRow: {
    marginTop: 4,
  },
  checkAnotherBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: PRIMARY_COLOR,
    borderRadius: 12,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkAnotherBtnText: {
    color: PRIMARY_COLOR,
    fontSize: 15,
    fontWeight: '700',
  },
});

export default MessageFraudChecker;
