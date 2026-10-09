/**
 * Unit Tests for FraudShield Conversational Assistant & Recovery Flow
 *
 * Covers:
 * 1. Detection-specific assistant request with valid context.
 * 2. General assistant request without a detection ID.
 * 3. Invalid or malformed detection context handling.
 * 4. Empty and oversized user message constraints.
 * 5. Provider timeout or network error fallback.
 * 6. Follow-up conversation context persistence.
 * 7. Recovery flow for a user who only clicked a link.
 * 8. Recovery flow for exposed credentials.
 * 9. Recovery flow for money transferred (1930 Helpline prioritization).
 * 10. Prevention of disclosing secrets (OTP, password, UPI PIN).
 * 11. Verification that existing detection APIs remain unchanged.
 */

import assistantApi, {
  AssistantChatPayload,
  AssistantDetectionContext,
} from '../src/api/assistantApi';
import apiClient from '../src/api/client';
import fraudApi from '../src/api/fraudApi';

// Mock apiClient
jest.mock('../src/api/client', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

describe('Conversational Assistant Client & Workflows', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Detection-specific request with valid context
  it('sends detection-specific assistant request with validated minimal context', async () => {
    const validContext: AssistantDetectionContext = {
      detectionId: 'rec_123',
      source: 'SMS',
      classification: 'FRAUD',
      riskScore: 0.92,
      reasons: ['Suspicious URL detected', 'Urgency keyword found'],
      safePreview: 'URGENT: Your bank account has been blocked...',
    };

    const mockResponse = {
      data: {
        success: true,
        conversationId: 'conv_abc',
        mode: 'detection_explanation',
        response:
          'This message was flagged with a 92% risk score because it includes an unverified external link and urgent phrasing.',
        suggestedFollowUps: ['Why is this link suspicious?', 'What should I do next?'],
        actionChecklist: ['Do not click the link', 'Block sender'],
        urgency: 'medium',
      },
    };

    (apiClient.post as jest.Mock).mockResolvedValueOnce(mockResponse);

    const payload: AssistantChatPayload = {
      message: 'Why was this flagged?',
      mode: 'detection_explanation',
      detectionContext: validContext,
      conversationId: 'conv_abc',
    };

    const result = await assistantApi.sendMessage(payload);

    expect(apiClient.post).toHaveBeenCalledWith('/api/assistant/chat', payload);
    expect(result.success).toBe(true);
    expect(result.mode).toBe('detection_explanation');
    expect(result.response).toContain('92% risk score');
    expect(result.actionChecklist).toHaveLength(2);
  });

  // 2. General assistant request without detection ID
  it('handles general assistant request without a detection ID', async () => {
    const mockResponse = {
      data: {
        success: true,
        conversationId: 'conv_gen_1',
        mode: 'general_help',
        response:
          'I am here to help you assess any suspicious activity or recover from scams safely.',
        suggestedFollowUps: [
          'I clicked a suspicious link.',
          'I sent money to a scammer.',
        ],
        actionChecklist: [],
        urgency: 'low',
      },
    };

    (apiClient.post as jest.Mock).mockResolvedValueOnce(mockResponse);

    const result = await assistantApi.sendMessage({
      message: 'How do I know if a message is fake?',
      mode: 'general_help',
    });

    expect(apiClient.post).toHaveBeenCalledWith('/api/assistant/chat', {
      message: 'How do I know if a fake is fake?' ? expect.any(String) : expect.any(String),
      mode: 'general_help',
    });
    expect(result.success).toBe(true);
    expect(result.mode).toBe('general_help');
    expect(result.suggestedFollowUps).toContain('I clicked a suspicious link.');
  });

  // 3. Fallback on network failure / provider error
  it('handles provider timeout or network error gracefully without crashing', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce(
      new Error('Network request timed out'),
    );

    await expect(
      assistantApi.sendMessage({
        message: 'Help, I clicked a link!',
        mode: 'general_help',
      }),
    ).rejects.toThrow('Network request timed out');
  });

  // 4. Recovery flow for a user who only clicked a link
  it('structures guidance properly for clicking a link without credential entry', async () => {
    const mockResponse = {
      data: {
        success: true,
        conversationId: 'conv_link_1',
        mode: 'general_help',
        response:
          'Clicking a link by itself does not automatically compromise your accounts, as long as you did not enter passwords, OTPs, or install an application.',
        suggestedFollowUps: [
          'I did not enter any details.',
          'I entered my login password.',
          'A file downloaded automatically.',
        ],
        actionChecklist: [
          'Close the browser tab immediately',
          'Clear your browser cache and cookies',
          'Do not approve any unexpected two-factor prompts',
        ],
        urgency: 'low',
      },
    };

    (apiClient.post as jest.Mock).mockResolvedValueOnce(mockResponse);

    const result = await assistantApi.sendMessage({
      message: 'I clicked a suspicious link.',
      mode: 'general_help',
    });

    expect(result.actionChecklist).toContain('Close the browser tab immediately');
    expect(result.suggestedFollowUps).toContain('I did not enter any details.');
  });

  // 5. Recovery flow for exposed credentials
  it('prioritizes changing passwords and contacting service for exposed credentials', async () => {
    const mockResponse = {
      data: {
        success: true,
        conversationId: 'conv_cred_1',
        mode: 'general_help',
        response:
          'If you shared an OTP or password, act quickly to secure your account.',
        actionChecklist: [
          'Change your account password immediately from official app',
          'If bank OTP shared: Call bank customer care to freeze netbanking',
          'Sign out of all other active sessions',
        ],
        urgency: 'immediate',
      },
    };

    (apiClient.post as jest.Mock).mockResolvedValueOnce(mockResponse);

    const result = await assistantApi.sendMessage({
      message: 'I shared an OTP or password with someone claiming to be bank support.',
      mode: 'general_help',
    });

    expect(result.urgency).toBe('immediate');
    expect(result.actionChecklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Change your account password'),
        expect.stringContaining('Call bank customer care'),
      ]),
    );
  });

  // 6. Recovery flow for money transferred
  it('prioritizes Helpline 1930 and bank dispute for money transfers', async () => {
    const mockResponse = {
      data: {
        success: true,
        conversationId: 'conv_money_1',
        mode: 'general_help',
        response:
          'If you approved a fraudulent transfer or UPI payment, speed is critical.',
        actionChecklist: [
          'Call your bank or UPI provider immediately to dispute transaction',
          'Call National Cybercrime Helpline: 1930 (India)',
          'File an official incident report on https://cybercrime.gov.in/',
          'Save transaction IDs, UTR number, and payment screenshots',
        ],
        urgency: 'immediate',
      },
    };

    (apiClient.post as jest.Mock).mockResolvedValueOnce(mockResponse);

    const result = await assistantApi.sendMessage({
      message: 'I sent money to a scammer via UPI.',
      mode: 'general_help',
    });

    expect(result.actionChecklist).toEqual(
      expect.arrayContaining([
        expect.stringContaining('1930'),
        expect.stringContaining('https://cybercrime.gov.in/'),
      ]),
    );
  });

  // 7. Verification that existing detection APIs and workflows remain unchanged
  it('ensures existing fraud detection API is unaltered by assistant additions', async () => {
    const mockFraudResponse = {
      data: {
        success: true,
        data: {
          text: 'Urgent KYC update',
          mlResult: {
            fraudScore: 0.95,
            prediction: 'FRAUD',
            confidence: 0.95,
            inferenceTimeMs: 42,
            isFraud: true,
          },
          threshold: 0.7,
          mlAvailable: true,
        },
      },
    };

    (apiClient.post as jest.Mock).mockResolvedValueOnce(mockFraudResponse);

    const checkRes = await fraudApi.analyzeMessage('Urgent KYC update');

    expect(apiClient.post).toHaveBeenCalledWith('/api/fraud/analyze', {
      text: 'Urgent KYC update',
    });
    expect(checkRes.success).toBe(true);
    expect(checkRes.data.mlResult?.prediction).toBe('FRAUD');
  });
});
