/**
 * Unit Tests for FraudShield Manual Scan Handler
 */

import { handleManualScanRequest, ManualScanRequest } from '../src/fraudDetection/manualScanHandler';
import { messageFraudProcessor } from '../src/fraudDetection/messageFraudProcessor';
import * as accessibilityService from '../src/utils/accessibilityService';

// Mock accessibilityService.reportManualScanResult
jest.mock('../src/utils/accessibilityService', () => ({
  reportManualScanResult: jest.fn().mockResolvedValue(true),
  showFloatingBot: jest.fn().mockResolvedValue(true),
  hideFloatingBot: jest.fn().mockResolvedValue(true),
  isFloatingBotVisible: jest.fn().mockResolvedValue(true),
}));

// Mock react-native NativeModules and Alert
jest.mock('react-native', () => {
  const listeners: Record<string, Function> = {};
  return {
    NativeModules: {
      AccessibilityBridgeModule: {
        showFraudOverlay: jest.fn(),
        showFloatingBot: jest.fn(),
        hideFloatingBot: jest.fn(),
        isFloatingBotVisible: jest.fn(),
        reportManualScanResult: jest.fn(),
      },
    },
    DeviceEventEmitter: {
      addListener: jest.fn((event: string, callback: Function) => {
        listeners[event] = callback;
        return {
          remove: jest.fn(() => {
            delete listeners[event];
          }),
        };
      }),
      emit: jest.fn((event: string, data: any) => {
        if (listeners[event]) {
          listeners[event](data);
        }
      }),
    },
    Alert: {
      alert: jest.fn(),
    },
    Platform: {
      OS: 'android',
    },
  };
});

describe('FraudShield Manual Scan Handler Pipeline Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles empty or missing text gracefully without crashing', async () => {
    const emptyRequest: ManualScanRequest = {
      text: '',
      timestamp: Date.now(),
    };

    const response = await handleManualScanRequest(emptyRequest);

    expect(response.status).toBe('SKIPPED_EMPTY');
    expect(response.isFraud).toBe(false);
    expect(accessibilityService.reportManualScanResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'SKIPPED_EMPTY',
        isFraud: false,
      }),
    );
  });

  it('routes suspicious text through the pipeline and identifies high risk', async () => {
    const spyProcess = jest.spyOn(messageFraudProcessor, 'processMessage').mockResolvedValueOnce({
      status: 'PROCESSED_FRAUD',
      messageHash: 'test-hash-fraud',
      cached: false,
      alertShown: true,
      riskScore: 0.94,
      classification: 'FRAUD',
      localFilterResult: {
        score: 12,
        threshold: 5,
        shouldSendToBackend: true,
        matchedKeywords: ['cash prize', 'claim prize', 'immediately'],
        matchedCategories: ['prize_reward', 'urgent_action'],
        matchedPatterns: [],
        hasUrl: true,
        reasons: ['High urgency', 'Prize indicators'],
      },
    });

    const request: ManualScanRequest = {
      text: 'Congratulations! You have won a cash prize of ₹50,000. Claim your prize immediately by clicking this link: http://scam.cc',
      sourcePackage: 'com.whatsapp',
      timestamp: Date.now(),
    };

    const response = await handleManualScanRequest(request);

    expect(spyProcess).toHaveBeenCalledWith(
      request.text,
      expect.objectContaining({
        source: 'MANUAL_SCAN',
      }),
    );

    expect(response.status).toBe('PROCESSED_FRAUD');
    expect(response.isFraud).toBe(true);
    expect(response.riskScore).toBe(0.94);
    expect(response.scorePercentage).toBe(94);

    expect(accessibilityService.reportManualScanResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'PROCESSED_FRAUD',
        isFraud: true,
        riskScore: 0.94,
        scorePercentage: 94,
      }),
    );

    spyProcess.mockRestore();
  });

  it('routes benign text through Stage 1 local filter without backend load', async () => {
    const spyProcess = jest.spyOn(messageFraudProcessor, 'processMessage').mockResolvedValueOnce({
      status: 'FILTERED_LOW_RISK',
      messageHash: 'test-hash-benign',
      cached: false,
      alertShown: false,
      riskScore: 0,
      classification: 'NOT_FRAUD',
      localFilterResult: {
        score: 1,
        threshold: 5,
        shouldSendToBackend: false,
        matchedKeywords: ['payment'],
        matchedCategories: ['financial_common'],
        matchedPatterns: [],
        hasUrl: false,
        reasons: ['Matched common payment term'],
      },
    });

    const request: ManualScanRequest = {
      text: 'Your payment of ₹500 to XYZ Store was successful.',
      sourcePackage: 'com.google.android.apps.messaging',
      timestamp: Date.now(),
    };

    const response = await handleManualScanRequest(request);

    expect(response.status).toBe('FILTERED_LOW_RISK');
    expect(response.isFraud).toBe(false);
    expect(response.riskScore).toBe(0);

    expect(accessibilityService.reportManualScanResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'FILTERED_LOW_RISK',
        isFraud: false,
      }),
    );

    spyProcess.mockRestore();
  });

  it('handles repeated manual scans with local cache hit', async () => {
    const spyProcess = jest.spyOn(messageFraudProcessor, 'processMessage').mockResolvedValueOnce({
      status: 'CACHED',
      messageHash: 'test-cached-hash',
      cached: true,
      alertShown: false,
      riskScore: 0.92,
      classification: 'FRAUD',
    });

    const request: ManualScanRequest = {
      text: 'Suspicious text scanned for second time',
      sourcePackage: 'com.android.chrome',
      timestamp: Date.now(),
    };

    const response = await handleManualScanRequest(request);

    expect(response.status).toBe('CACHED');
    expect(response.isFraud).toBe(true);
    expect(response.riskScore).toBe(0.92);

    spyProcess.mockRestore();
  });
});
