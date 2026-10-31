/**
 * PDF Bank Statement Importer & Review Modal — FraudShield
 *
 * Implements end-to-end PDF Bank Statement import with:
 * 1. Support for Canara Bank and standard Indian bank statements (Text & Scanned OCR)
 * 2. Upload progress bar and file metadata indicators
 * 3. Extraction & normalization to schema: source_id, target_id, amount, timestamp, channel
 * 4. Account holder mapped to 'user1' (never account number, phone, or name)
 * 5. Counterparties anonymized to consistent 'user2', 'user3', ...
 * 6. Direction resolution (Debit: user1 -> userX; Credit: userX -> user1)
 * 7. Interactive Review & Correction Table (inline editing of amount, channel, direction, deletion, add row)
 * 8. Zero PII storage & in-memory temporary parsing
 */

import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import Icon from '../../../components/Icon';
import { Colors, Shadows, Spacing } from '../../../theme/theme';
import fraudApi, { ExtractedStatementTx } from '../../../api/fraudApi';
import { SelectedTransactionFile } from './TransactionUploadCard';

interface PdfBankStatementModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirmExtraction: (file: SelectedTransactionFile) => void;
}

type StatementTypeOption = 'canara' | 'fraud_mule' | 'general';

const CHANNELS = [
  'UPI',
  'NEFT',
  'IMPS',
  'RTGS',
  'ATM',
  'CARD',
  'BANK_TRANSFER',
  'CASH',
  'UNKNOWN',
];

export const PdfBankStatementModal: React.FC<PdfBankStatementModalProps> = ({
  visible,
  onClose,
  onConfirmExtraction,
}) => {
  // Step 1: 'SELECT' -> 'UPLOADING' -> 'REVIEW'
  const [step, setStep] = useState<'SELECT' | 'UPLOADING' | 'REVIEW'>('SELECT');
  const [selectedFileName, setSelectedFileName] = useState<string>('canara_bank_statement.pdf');
  const [fileSizeStr, setFileSizeStr] = useState<string>('148 KB');
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [progressStageText, setProgressStageText] = useState<string>('Uploading PDF buffer...');
  const [detectedBank, setDetectedBank] = useState<string>('Canara Bank');
  const [extractionMethod, setExtractionMethod] = useState<string>('PDF_TEXT_PARSER');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Extracted transactions editable state
  const [transactions, setTransactions] = useState<ExtractedStatementTx[]>([]);
  const [entityMapping, setEntityMapping] = useState<Record<string, string>>({});

  // Manual raw text input mode toggle
  const [showManualTextInput, setShowManualTextInput] = useState<boolean>(false);
  const [rawPastedText, setRawPastedText] = useState<string>('');

  // Local device file input states
  const [showBase64Upload, setShowBase64Upload] = useState<boolean>(false);
  const [customBase64, setCustomBase64] = useState<string>('');
  const [customLocalFileName, setCustomLocalFileName] = useState<string>('my_bank_statement.pdf');

  // Handle processing Base64 data from a local file
  const handleProcessLocalBase64 = async (
    filename: string,
    sizeBytes: number,
    base64Data: string,
  ) => {
    setSelectedFileName(filename);
    const sizeKb = Math.max(1, Math.round(sizeBytes / 1024));
    setFileSizeStr(`${sizeKb} KB`);
    setExtractionMethod('PDF_PARSER');
    setStep('UPLOADING');
    setUploadProgress(20);
    setProgressStageText('Uploading PDF from device to secure in-memory sandbox...');

    const t1 = setTimeout(() => {
      setUploadProgress(50);
      setProgressStageText('Parsing document streams & identifying transaction tables...');
    }, 450);

    const t2 = setTimeout(() => {
      setUploadProgress(80);
      setProgressStageText('Normalizing ISO 8601 timestamps & resolving counterparty nodes...');
    }, 900);

    try {
      const response = await fraudApi.extractBankStatement({
        pdfBase64: base64Data,
        filename,
      });

      clearTimeout(t1);
      clearTimeout(t2);

      setUploadProgress(100);
      if (response && response.success && response.transactions) {
        setDetectedBank(response.metadata?.bankDetected || 'Bank Statement');
        setExtractionMethod(response.metadata?.extractionMethod || 'PDF_PARSER');
        setTransactions(response.transactions);
        setEntityMapping(response.entityMapping || {});
        setTimeout(() => {
          setStep('REVIEW');
        }, 350);
      } else {
        setStep('SELECT');
        setErrorMessage(response?.message || 'Could not extract transactions from PDF.');
      }
    } catch (err: any) {
      clearTimeout(t1);
      clearTimeout(t2);
      setStep('SELECT');
      setErrorMessage(
        err.response?.data?.message || err.message || 'Error processing local PDF.',
      );
    }
  };

  // Handle picking PDF file directly from device storage (HTML5 file input on Web/Desktop or DocumentPicker on Native)
  const handlePickLocalPdf = async () => {
    setErrorMessage(null);

    // 1. If running on Web / Browser / Desktop Metro
    const globalDoc = (globalThis as any)?.document;
    if (Platform.OS === 'web' || typeof globalDoc !== 'undefined') {
      try {
        const input = globalDoc.createElement('input');
        input.type = 'file';
        input.accept = '.pdf,application/pdf';
        input.style.display = 'none';

        input.onchange = async (event: any) => {
          const file = event.target.files?.[0];
          if (!file) return;

          if (file.size > 10 * 1024 * 1024) {
            setErrorMessage('Selected file exceeds maximum size limit of 10MB.');
            return;
          }

          const reader = new (globalThis as any).FileReader();
          reader.onload = async () => {
            const resultStr = reader.result as string;
            const base64Content = resultStr.includes(',')
              ? resultStr.split(',')[1]
              : resultStr;

            await handleProcessLocalBase64(file.name, file.size, base64Content);
          };
          reader.readAsDataURL(file);
        };

        globalDoc.body.appendChild(input);
        input.click();
        globalDoc.body.removeChild(input);
        return;
      } catch (domErr: any) {
        console.warn('DOM file input error:', domErr);
      }
    }

    // 2. Native DocumentPicker check
    try {
      const DocumentPicker = require('react-native-document-picker');
      if (DocumentPicker && DocumentPicker.pickSingle) {
        const doc = await DocumentPicker.pickSingle({
          type: [DocumentPicker.types.pdf],
        });

        if (doc) {
          const fileName = doc.name || 'uploaded_statement.pdf';
          const sizeKb = Math.round((doc.size || 50000) / 1024);
          const formData = new FormData();
          formData.append('statement', {
            uri: doc.uri,
            name: fileName,
            type: doc.type || 'application/pdf',
          } as any);

          setSelectedFileName(fileName);
          setFileSizeStr(`${sizeKb} KB`);
          setExtractionMethod('PDF_PARSER');
          setStep('UPLOADING');
          setUploadProgress(30);
          setProgressStageText('Streaming file from device storage...');

          const response = await fraudApi.extractBankStatement({
            formData,
            filename: fileName,
          });

          setUploadProgress(100);
          if (response && response.success && response.transactions) {
            setDetectedBank(response.metadata?.bankDetected || 'Bank Statement');
            setExtractionMethod(response.metadata?.extractionMethod || 'PDF_PARSER');
            setTransactions(response.transactions);
            setEntityMapping(response.entityMapping || {});
            setTimeout(() => {
              setStep('REVIEW');
            }, 350);
          } else {
            setStep('SELECT');
            setErrorMessage(response?.message || 'Could not parse statement.');
          }
          return;
        }
      }
    } catch (pickerErr: any) {
      const DocumentPicker = (globalThis as any).DocumentPicker;
      if (DocumentPicker?.isCancel && DocumentPicker.isCancel(pickerErr)) {
        return;
      }
      // If DocumentPicker is not linked natively, open the base64 / manual file prompt
      setShowBase64Upload(true);
    }
  };

  // Handle parsing a chosen sample statement or custom payload
  const handleProcessStatement = async (
    sampleType: StatementTypeOption,
    displayName: string,
    sizeStr: string,
    methodHint: string,
  ) => {
    setErrorMessage(null);
    setSelectedFileName(displayName);
    setFileSizeStr(sizeStr);
    setExtractionMethod(methodHint);
    setStep('UPLOADING');
    setUploadProgress(15);
    setProgressStageText('Uploading PDF buffer to secure in-memory sandbox...');

    // Progress animation milestones
    const t1 = setTimeout(() => {
      setUploadProgress(45);
      setProgressStageText('Parsing document streams & identifying transaction tables...');
    }, 450);

    const t2 = setTimeout(() => {
      setUploadProgress(75);
      setProgressStageText('Normalizing ISO 8601 timestamps & resolving counterparty nodes...');
    }, 900);

    try {
      const response = await fraudApi.extractBankStatement({
        sampleType,
        filename: displayName,
      });

      clearTimeout(t1);
      clearTimeout(t2);

      setUploadProgress(100);
      setProgressStageText('Anonymization complete. Opening review table...');

      if (response && response.success && response.transactions) {
        setDetectedBank(response.metadata?.bankDetected || 'Canara Bank');
        setExtractionMethod(response.metadata?.extractionMethod || methodHint);
        setTransactions(response.transactions);
        setEntityMapping(response.entityMapping || {});
        setTimeout(() => {
          setStep('REVIEW');
        }, 350);
      } else {
        setStep('SELECT');
        setErrorMessage(response?.message || 'Failed to extract transactions from PDF.');
      }
    } catch (err: any) {
      clearTimeout(t1);
      clearTimeout(t2);
      setStep('SELECT');
      setErrorMessage(
        err.response?.data?.message || err.message || 'Error communicating with extraction backend.',
      );
    }
  };

  // Handle processing pasted statement text
  const handleProcessPastedText = async () => {
    if (!rawPastedText.trim()) {
      setErrorMessage('Please paste bank statement text before proceeding.');
      return;
    }

    setErrorMessage(null);
    setSelectedFileName('custom_statement_text.txt');
    setFileSizeStr(`${Math.max(1, Math.round(rawPastedText.length / 1024))} KB`);
    setStep('UPLOADING');
    setUploadProgress(30);
    setProgressStageText('Analyzing statement lines and columns...');

    try {
      const response = await fraudApi.extractBankStatement({
        rawText: rawPastedText,
        filename: 'custom_statement_text.txt',
      });

      setUploadProgress(100);
      if (response && response.success && response.transactions) {
        setDetectedBank(response.metadata?.bankDetected || 'Standard Bank Statement');
        setExtractionMethod('TEXT_PARSER');
        setTransactions(response.transactions);
        setEntityMapping(response.entityMapping || {});
        setTimeout(() => {
          setStep('REVIEW');
        }, 300);
      } else {
        setStep('SELECT');
        setErrorMessage(response?.message || 'No valid transactions detected in text.');
      }
    } catch (err: any) {
      setStep('SELECT');
      setErrorMessage(err.response?.data?.message || err.message || 'Extraction failed.');
    }
  };

  // ─── Inline Review & Correction Handlers ───────────────────────────────────

  // Toggle Direction between DEBIT (user1 -> userX) and CREDIT (userX -> user1)
  const handleToggleDirection = (index: number) => {
    setTransactions((prev) => {
      const updated = [...prev];
      const tx = { ...updated[index] };
      if (tx.direction === 'DEBIT') {
        tx.direction = 'CREDIT';
        // When switched to CREDIT: sender is target_id, user1 is recipient
        const otherId = tx.target_id === 'user1' ? tx.source_id : tx.target_id;
        tx.source_id = otherId;
        tx.target_id = 'user1';
      } else {
        tx.direction = 'DEBIT';
        // When switched to DEBIT: user1 is sender, target_id is recipient
        const otherId = tx.source_id === 'user1' ? tx.target_id : tx.source_id;
        tx.source_id = 'user1';
        tx.target_id = otherId;
      }
      updated[index] = tx;
      return updated;
    });
  };

  // Edit Amount
  const handleAmountChange = (index: number, val: string) => {
    const num = parseFloat(val.replace(/[^0-9.]/g, '')) || 0;
    setTransactions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], amount: num };
      return updated;
    });
  };

  // Edit Channel
  const handleChannelChange = (index: number, channel: any) => {
    setTransactions((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], channel };
      return updated;
    });
  };

  // Delete transaction row
  const handleDeleteRow = (index: number) => {
    Alert.alert(
      'Remove Transaction',
      'Are you sure you want to remove this transaction from the analysis?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            setTransactions((prev) => prev.filter((_, i) => i !== index));
          },
        },
      ],
    );
  };

  // Add new manual transaction
  const handleAddManualRow = () => {
    const nextIdx = transactions.length + 2;
    const newTx: ExtractedStatementTx = {
      source_id: 'user1',
      target_id: `user${nextIdx}`,
      amount: 500,
      timestamp: new Date().toISOString().substring(0, 19),
      channel: 'UPI',
      direction: 'DEBIT',
      rawDescription: 'MANUAL ENTRY / UPI TRANSFER',
      runningBalance: null,
      refNo: `MANUAL-${Date.now().toString().slice(-6)}`,
    };
    setTransactions((prev) => [...prev, newTx]);
  };

  // Final Confirmation: Convert to SelectedTransactionFile and forward to GCN
  const handleConfirmAndAnalyze = () => {
    if (transactions.length === 0) {
      Alert.alert('No Transactions', 'Please include at least one transaction to analyze.');
      return;
    }

    const entities = new Set<string>();
    const sampleData = transactions.map((tx, idx) => {
      entities.add(tx.source_id);
      entities.add(tx.target_id);
      return {
        id: `TX-${101 + idx}`,
        source: tx.source_id,
        target: tx.target_id,
        amount: `₹${tx.amount.toLocaleString('en-IN')}`,
        timestamp: tx.timestamp.includes('T') ? tx.timestamp.split('T')[1] : tx.timestamp,
        type: tx.channel,
        flagged: false,
        rawDescription: tx.rawDescription,
        direction: tx.direction,
        runningBalance: tx.runningBalance,
      };
    });

    const file: SelectedTransactionFile = {
      name: selectedFileName,
      size: fileSizeStr,
      transactionCount: transactions.length,
      entitiesCount: entities.size,
      format: 'CSV',
      columns: ['source_id', 'target_id', 'amount', 'timestamp', 'channel'],
      bankDetected: detectedBank,
      extractionMethod,
      sampleData,
    };

    onConfirmExtraction(file);
    onClose();
  };

  // Compute summary stats for the review table
  const debitCount = transactions.filter((t) => t.direction === 'DEBIT').length;
  const creditCount = transactions.filter((t) => t.direction === 'CREDIT').length;
  const totalDebitAmt = transactions
    .filter((t) => t.direction === 'DEBIT')
    .reduce((sum, t) => sum + t.amount, 0);
  const totalCreditAmt = transactions
    .filter((t) => t.direction === 'CREDIT')
    .reduce((sum, t) => sum + t.amount, 0);

  const uniqueCounterparties = new Set(
    transactions.map((t) => (t.source_id === 'user1' ? t.target_id : t.source_id)),
  ).size;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Modal Top Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close PDF upload">
            <Icon name="X" size={20} color="#0F172A" strokeWidth={2.4} />
          </TouchableOpacity>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitle}>Upload Bank Statement (PDF)</Text>
            <Text style={styles.headerSubtitle}>
              Canara Bank & Indian Banks • OCR & Privacy Shield
            </Text>
          </View>
          <View style={styles.shieldIconBox}>
            <Icon name="ShieldCheck" size={20} color="#10B981" strokeWidth={2.2} />
          </View>
        </View>

        {/* Privacy Assurance Banner */}
        <View style={styles.privacyBanner}>
          <Icon name="LockKeyhole" size={13} color="#059669" />
          <Text style={styles.privacyBannerText}>
            Zero PII Stored: Statements parsed in-memory. Account holder mapped to user1.
          </Text>
        </View>

        {/* Error Notification */}
        {errorMessage && (
          <View style={styles.errorBanner}>
            <Icon name="AlertCircle" size={14} color="#DC2626" />
            <Text style={styles.errorBannerText}>{errorMessage}</Text>
          </View>
        )}

        {/* ─── STEP 1: SELECT STATEMENT ──────────────────────────────────── */}
        {step === 'SELECT' && (
          <ScrollView
            style={styles.scrollContent}
            contentContainerStyle={styles.scrollContentInner}
            showsVerticalScrollIndicator={false}>
            <Text style={styles.stepHeading}>Upload or Select Bank Statement Document</Text>
            <Text style={styles.stepDescription}>
              Select a PDF bank statement directly from your device storage or test with a pre-loaded
              statement format. Supports Canara Bank and standard Indian banks with OCR extraction.
            </Text>

            {/* ─── PRIMARY ACTION: Upload Direct from Device Storage ─── */}
            <TouchableOpacity
              style={styles.deviceHeroUploadCard}
              activeOpacity={0.85}
              onPress={handlePickLocalPdf}>
              <View style={styles.deviceHeroIconBox}>
                <Icon name="Upload" size={24} color="#FFFFFF" strokeWidth={2.4} />
              </View>
              <View style={styles.deviceHeroContent}>
                <View style={styles.deviceHeroTitleRow}>
                  <Text style={styles.deviceHeroTitle}>Upload PDF from This Device</Text>
                  <View style={styles.deviceHeroBadge}>
                    <Text style={styles.deviceHeroBadgeText}>Local File</Text>
                  </View>
                </View>
                <Text style={styles.deviceHeroSubtitle}>
                  Pick any PDF bank statement (.pdf) from your phone storage, file manager, or computer
                </Text>
              </View>
              <Icon name="ChevronRight" size={20} color="#2563EB" />
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.orPresetsDivider}>
              <View style={styles.orDividerLine} />
              <Text style={styles.orPresetsText}>OR TEST WITH PRESET DEMO STATEMENTS</Text>
              <View style={styles.orDividerLine} />
            </View>

            {/* Option 1: Canara Bank E-Statement (Personal) */}
            <TouchableOpacity
              style={[styles.optionCard, styles.optionCardHighlight]}
              activeOpacity={0.82}
              onPress={() =>
                handleProcessStatement(
                  'canara',
                  'canara_bank_statement_oct2026.pdf',
                  '142 KB',
                  'PDF_TEXT_PARSER',
                )
              }>
              <View style={styles.optionIconBox}>
                <Icon name="FileText" size={24} color="#2563EB" strokeWidth={2.2} />
              </View>
              <View style={styles.optionContent}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitle}>Canara Bank E-Statement (PDF)</Text>
                  <View style={styles.verifiedBankBadge}>
                    <Text style={styles.verifiedBankBadgeText}>Verified</Text>
                  </View>
                </View>
                <Text style={styles.optionSubtitle}>
                  Text-based PDF statement with UPI, NEFT salary, and merchant card transactions.
                </Text>
                <View style={styles.optionMetaRow}>
                  <Text style={styles.optionMetaTag}>Canara Format</Text>
                  <Text style={styles.optionMetaTag}>100% Text Stream</Text>
                  <Text style={styles.optionMetaTag}>Safe Profile</Text>
                </View>
              </View>
              <Icon name="ChevronRight" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Option 2: Fraud Mule Account Statement */}
            <TouchableOpacity
              style={styles.optionCard}
              activeOpacity={0.82}
              onPress={() =>
                handleProcessStatement(
                  'fraud_mule',
                  'canara_mule_drain_statement.pdf',
                  '168 KB',
                  'PDF_TEXT_PARSER',
                )
              }>
              <View style={[styles.optionIconBox, { backgroundColor: '#FEE2E2' }]}>
                <Icon name="AlertTriangle" size={24} color="#DC2626" strokeWidth={2.2} />
              </View>
              <View style={styles.optionContent}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitle}>Fraud Mule Drain Statement (PDF)</Text>
                  <View style={[styles.verifiedBankBadge, { backgroundColor: '#FEE2E2' }]}>
                    <Text style={[styles.verifiedBankBadgeText, { color: '#B91C1C' }]}>
                      High Risk
                    </Text>
                  </View>
                </View>
                <Text style={styles.optionSubtitle}>
                  Mule siphon pattern: rapid inward surges immediately drained to crypto & mule hops.
                </Text>
                <View style={styles.optionMetaRow}>
                  <Text style={styles.optionMetaTag}>Mule Network</Text>
                  <Text style={styles.optionMetaTag}>Multi-Hop Fanout</Text>
                </View>
              </View>
              <Icon name="ChevronRight" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Option 3: Scanned Bank Statement (Tesseract OCR) */}
            <TouchableOpacity
              style={styles.optionCard}
              activeOpacity={0.82}
              onPress={() =>
                handleProcessStatement(
                  'general',
                  'scanned_bank_statement_ocr.pdf',
                  '820 KB',
                  'TESSERACT_OCR',
                )
              }>
              <View style={[styles.optionIconBox, { backgroundColor: '#F3E8FF' }]}>
                <Icon name="Scan" size={24} color="#7C3AED" strokeWidth={2.2} />
              </View>
              <View style={styles.optionContent}>
                <View style={styles.optionTitleRow}>
                  <Text style={styles.optionTitle}>Scanned Statement (OCR)</Text>
                  <View style={[styles.verifiedBankBadge, { backgroundColor: '#F3E8FF' }]}>
                    <Text style={[styles.verifiedBankBadgeText, { color: '#6D28D9' }]}>
                      Tesseract
                    </Text>
                  </View>
                </View>
                <Text style={styles.optionSubtitle}>
                  Simulates a scanned physical bank paper statement processed through Tesseract OCR.
                </Text>
                <View style={styles.optionMetaRow}>
                  <Text style={styles.optionMetaTag}>Optical Character Rec.</Text>
                  <Text style={styles.optionMetaTag}>Image Fallback</Text>
                </View>
              </View>
              <Icon name="ChevronRight" size={18} color="#94A3B8" />
            </TouchableOpacity>

            {/* Option 4: Manual Statement Text Entry Toggle */}
            <TouchableOpacity
              style={styles.toggleTextInputBtn}
              onPress={() => setShowManualTextInput(!showManualTextInput)}
              activeOpacity={0.8}>
              <Icon
                name={showManualTextInput ? 'ChevronRight' : 'Edit3'}
                size={16}
                color="#2563EB"
              />
              <Text style={styles.toggleTextInputBtnText}>
                {showManualTextInput
                  ? 'Hide Manual Text Box'
                  : 'Or Paste Raw Bank Statement Text / NetBanking Output'}
              </Text>
            </TouchableOpacity>

            {showManualTextInput && (
              <View style={styles.manualTextSection}>
                <Text style={styles.manualTextPrompt}>
                  Paste Canara / Bank Statement text table:
                </Text>
                <TextInput
                  style={styles.manualTextInput}
                  multiline
                  numberOfLines={6}
                  placeholder={`20-10-2026 UPI/DR/511134339652/BHARATH/K/YESB 180.00 45000.00\n21-10-2026 UPI/CR/511134339700/RAMESH/HDFC 200.00 45200.00`}
                  placeholderTextColor="#94A3B8"
                  value={rawPastedText}
                  onChangeText={setRawPastedText}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={styles.extractPastedBtn}
                  onPress={handleProcessPastedText}
                  activeOpacity={0.85}>
                  <Icon name="CheckCircle2" size={16} color="#FFFFFF" />
                  <Text style={styles.extractPastedBtnText}>Extract From Text</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Option 5: Base64 / Local File Input Toggle */}
            <TouchableOpacity
              style={styles.toggleTextInputBtn}
              onPress={() => setShowBase64Upload(!showBase64Upload)}
              activeOpacity={0.8}>
              <Icon
                name={showBase64Upload ? 'ChevronRight' : 'FileText'}
                size={16}
                color="#2563EB"
              />
              <Text style={styles.toggleTextInputBtnText}>
                {showBase64Upload
                  ? 'Hide Base64 PDF Loader'
                  : 'Or Input Base64 Encoded PDF directly'}
              </Text>
            </TouchableOpacity>

            {showBase64Upload && (
              <View style={styles.manualTextSection}>
                <Text style={styles.manualTextPrompt}>File Name:</Text>
                <TextInput
                  style={[styles.manualTextInput, { minHeight: 40, marginBottom: 8 }]}
                  value={customLocalFileName}
                  onChangeText={setCustomLocalFileName}
                  placeholder="e.g. canara_oct_2026.pdf"
                  placeholderTextColor="#94A3B8"
                />
                <Text style={styles.manualTextPrompt}>Paste Base64 Encoded PDF String:</Text>
                <TextInput
                  style={styles.manualTextInput}
                  multiline
                  numberOfLines={4}
                  placeholder="JVBERi0xLjQKJ..."
                  placeholderTextColor="#94A3B8"
                  value={customBase64}
                  onChangeText={setCustomBase64}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={styles.extractPastedBtn}
                  onPress={() => {
                    if (!customBase64.trim()) {
                      setErrorMessage('Please provide base64 PDF data.');
                      return;
                    }
                    handleProcessLocalBase64(
                      customLocalFileName || 'uploaded_statement.pdf',
                      Math.round(customBase64.length * 0.75),
                      customBase64.trim(),
                    );
                  }}
                  activeOpacity={0.85}>
                  <Icon name="CheckCircle2" size={16} color="#FFFFFF" />
                  <Text style={styles.extractPastedBtnText}>Process Base64 PDF</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        )}

        {/* ─── STEP 2: UPLOADING & EXTRACTING PROGRESS ────────────────────── */}
        {step === 'UPLOADING' && (
          <View style={styles.uploadingCenter}>
            <View style={styles.uploadingCard}>
              <ActivityIndicator size="large" color="#2563EB" style={{ marginBottom: 16 }} />

              <Text style={styles.uploadingFileName}>{selectedFileName}</Text>
              <Text style={styles.uploadingFileSize}>{fileSizeStr}</Text>

              {/* Progress Bar Container */}
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressPercentText}>{uploadProgress}% Complete</Text>

              <Text style={styles.progressStageText}>{progressStageText}</Text>

              <View style={styles.securityBullet}>
                <Icon name="Shield" size={13} color="#059669" />
                <Text style={styles.securityBulletText}>
                  File processed strictly in temporary memory buffer and discarded.
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ─── STEP 3: REVIEW & CORRECTION TABLE ──────────────────────────── */}
        {step === 'REVIEW' && (
          <View style={styles.reviewContainer}>
            {/* File & Bank Summary Header */}
            <View style={styles.reviewHeaderCard}>
              <View style={styles.reviewHeaderTop}>
                <View>
                  <Text style={styles.reviewFileName} numberOfLines={1}>
                    {selectedFileName}
                  </Text>
                  <Text style={styles.reviewMetaDetails}>
                    {detectedBank} • {extractionMethod === 'TESSERACT_OCR' ? 'OCR Engine' : 'Text Stream Parser'}
                  </Text>
                </View>
                <View style={styles.holderTag}>
                  <Text style={styles.holderTagText}>You: user1</Text>
                </View>
              </View>

              {/* Stats Bar */}
              <View style={styles.statsBar}>
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{transactions.length}</Text>
                  <Text style={styles.statLabel}>Total Tx</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statNumber, { color: '#DC2626' }]}>
                    {debitCount} (₹{totalDebitAmt.toLocaleString('en-IN')})
                  </Text>
                  <Text style={styles.statLabel}>Debits (Out)</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statNumber, { color: '#059669' }]}>
                    {creditCount} (₹{totalCreditAmt.toLocaleString('en-IN')})
                  </Text>
                  <Text style={styles.statLabel}>Credits (In)</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={styles.statNumber}>{uniqueCounterparties}</Text>
                  <Text style={styles.statLabel}>Counterparties</Text>
                </View>
              </View>
            </View>

            {/* Instruction banner */}
            <View style={styles.reviewInstructions}>
              <Icon name="Info" size={14} color="#1D4ED8" />
              <Text style={styles.reviewInstructionsText}>
                Review extracted records below. Tap direction badge to switch Debit/Credit, edit amounts,
                or delete rows before running fraud detection.
              </Text>
            </View>

            {/* Transaction Review List */}
            <ScrollView style={styles.transactionReviewList} showsVerticalScrollIndicator={false}>
              {transactions.map((tx, idx) => {
                const isDebit = tx.direction === 'DEBIT';
                const counterpartyId = isDebit ? tx.target_id : tx.source_id;
                const counterpartyDesc = entityMapping[counterpartyId] || counterpartyId;

                return (
                  <View key={idx} style={styles.txReviewRowCard}>
                    {/* Top Row: Date, Direction Toggle Badge, Delete */}
                    <View style={styles.txRowTop}>
                      <View style={styles.dateBadge}>
                        <Icon name="Calendar" size={11} color="#64748B" />
                        <Text style={styles.dateBadgeText}>{tx.timestamp}</Text>
                      </View>

                      {/* Direction Toggle Button */}
                      <TouchableOpacity
                        style={[
                          styles.directionToggleBtn,
                          isDebit ? styles.directionDebit : styles.directionCredit,
                        ]}
                        activeOpacity={0.75}
                        onPress={() => handleToggleDirection(idx)}>
                        <Text
                          style={[
                            styles.directionToggleText,
                            isDebit ? { color: '#B91C1C' } : { color: '#047857' },
                          ]}>
                          {isDebit
                            ? `DEBIT: user1 ➔ ${counterpartyId}`
                            : `CREDIT: ${counterpartyId} ➔ user1`}
                        </Text>
                        <Icon
                          name="RefreshCw"
                          size={11}
                          color={isDebit ? '#B91C1C' : '#047857'}
                        />
                      </TouchableOpacity>

                      {/* Delete Row Button */}
                      <TouchableOpacity
                        style={styles.deleteRowBtn}
                        activeOpacity={0.7}
                        onPress={() => handleDeleteRow(idx)}>
                        <Icon name="Trash2" size={14} color="#EF4444" strokeWidth={2.2} />
                      </TouchableOpacity>
                    </View>

                    {/* Middle Row: Amount Edit, Channel Picker */}
                    <View style={styles.txRowMiddle}>
                      {/* Amount Editable Input */}
                      <View style={styles.amountInputGroup}>
                        <Text style={styles.amountPrefix}>₹</Text>
                        <TextInput
                          style={styles.amountInputField}
                          keyboardType="numeric"
                          value={String(tx.amount)}
                          onChangeText={(val) => handleAmountChange(idx, val)}
                        />
                      </View>

                      {/* Channel Pill Selector */}
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.channelsScroll}>
                        {CHANNELS.map((ch) => (
                          <TouchableOpacity
                            key={ch}
                            style={[
                              styles.channelChip,
                              tx.channel === ch && styles.channelChipActive,
                            ]}
                            onPress={() => handleChannelChange(idx, ch)}>
                            <Text
                              style={[
                                styles.channelChipText,
                                tx.channel === ch && styles.channelChipTextActive,
                              ]}>
                              {ch}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>

                    {/* Bottom Row: Description & Running Balance */}
                    <View style={styles.txRowBottom}>
                      <View style={styles.narrationBox}>
                        <Text style={styles.narrationText} numberOfLines={2}>
                          {tx.rawDescription || 'Bank transfer transaction'}
                        </Text>
                        <Text style={styles.counterpartySub}>
                          Mapped: {counterpartyDesc}
                        </Text>
                      </View>

                      {tx.runningBalance !== null && tx.runningBalance !== undefined && (
                        <View style={styles.balanceBadge}>
                          <Text style={styles.balanceBadgeText}>
                            Bal: ₹{tx.runningBalance.toLocaleString('en-IN')}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Add Transaction Button */}
              <TouchableOpacity
                style={styles.addTxRowBtn}
                activeOpacity={0.8}
                onPress={handleAddManualRow}>
                <Icon name="Edit3" size={14} color="#2563EB" />
                <Text style={styles.addTxRowBtnText}>+ Add Missing Transaction Record</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Bottom Actions Bar */}
            <View style={styles.reviewBottomActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                activeOpacity={0.75}
                onPress={() => setStep('SELECT')}>
                <Text style={styles.cancelBtnText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmAnalyzeBtn}
                activeOpacity={0.85}
                onPress={handleConfirmAndAnalyze}>
                <Icon name="CheckCircle2" size={17} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.confirmAnalyzeBtnText}>
                  Confirm & Run Fraud Detection ({transactions.length} Tx)
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginRight: 10,
  },
  headerTitleBox: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  shieldIconBox: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  privacyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
    gap: 6,
  },
  privacyBannerText: {
    fontSize: 11,
    color: '#065F46',
    fontWeight: '500',
    flex: 1,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
    gap: 8,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '500',
    flex: 1,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    padding: 16,
    paddingBottom: 32,
  },
  stepHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  stepDescription: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 18,
    marginBottom: 16,
  },
  // Direct Device Upload Hero Card
  deviceHeroUploadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.8,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
    marginBottom: 14,
    ...Shadows.card,
  },
  deviceHeroIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceHeroContent: {
    flex: 1,
    marginRight: 8,
  },
  deviceHeroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  deviceHeroTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E3A8A',
  },
  deviceHeroBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  deviceHeroBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1D4ED8',
  },
  deviceHeroSubtitle: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 15,
  },
  orPresetsDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    gap: 8,
  },
  orDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E2E8F0',
  },
  orPresetsText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    ...Shadows.card,
  },
  optionCardHighlight: {
    borderColor: '#93C5FD',
    backgroundColor: '#F8FAFF',
  },
  optionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  optionContent: {
    flex: 1,
    marginRight: 8,
  },
  optionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  verifiedBankBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verifiedBankBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  optionSubtitle: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 6,
  },
  optionMetaRow: {
    flexDirection: 'row',
    gap: 6,
  },
  optionMetaTag: {
    fontSize: 10,
    color: '#475569',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontWeight: '500',
  },
  toggleTextInputBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginVertical: 8,
    gap: 6,
  },
  toggleTextInputBtnText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  manualTextSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  manualTextPrompt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  manualTextInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: '#0F172A',
    fontFamily: 'monospace',
    minHeight: 110,
    backgroundColor: '#F8FAFC',
    marginBottom: 10,
  },
  extractPastedBtn: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  extractPastedBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Uploading state
  uploadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  uploadingCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Shadows.card,
  },
  uploadingFileName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  uploadingFileSize: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 18,
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 4,
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
    marginBottom: 14,
  },
  progressStageText: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 16,
    minHeight: 34,
  },
  securityBullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  securityBulletText: {
    fontSize: 11,
    color: '#065F46',
    flex: 1,
  },

  // Review state
  reviewContainer: {
    flex: 1,
  },
  reviewHeaderCard: {
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  reviewHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reviewFileName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  reviewMetaDetails: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  holderTag: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  holderTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
  },
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  statDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#E2E8F0',
  },
  reviewInstructions: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#DBEAFE',
  },
  reviewInstructionsText: {
    fontSize: 11,
    color: '#1E40AF',
    flex: 1,
  },
  transactionReviewList: {
    flex: 1,
    padding: 12,
  },
  txReviewRowCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    ...Shadows.card,
  },
  txRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  dateBadgeText: {
    fontSize: 10,
    color: '#475569',
    fontWeight: '500',
  },
  directionToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  directionDebit: {
    backgroundColor: '#FEE2E2',
  },
  directionCredit: {
    backgroundColor: '#D1FAE5',
  },
  directionToggleText: {
    fontSize: 11,
    fontWeight: '700',
  },
  deleteRowBtn: {
    padding: 4,
  },
  txRowMiddle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 10,
  },
  amountInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    backgroundColor: '#F8FAFC',
    height: 34,
  },
  amountPrefix: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
    marginRight: 2,
  },
  amountInputField: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    minWidth: 70,
    paddingVertical: 2,
  },
  channelsScroll: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  channelChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  channelChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  channelChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  channelChipTextActive: {
    color: '#FFFFFF',
  },
  txRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  narrationBox: {
    flex: 1,
    marginRight: 8,
  },
  narrationText: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 14,
  },
  counterpartySub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  balanceBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  balanceBadgeText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  addTxRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderStyle: 'dashed',
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    gap: 6,
    marginVertical: 10,
  },
  addTxRowBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
  },
  reviewBottomActions: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  confirmAnalyzeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 12,
    gap: 6,
    ...Shadows.md,
  },
  confirmAnalyzeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
