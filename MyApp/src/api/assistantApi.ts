/**
 * Assistant API Client — FraudShield
 *
 * Communicates with the backend conversational AI endpoint (/api/assistant/chat).
 * Handles detection-aware explanations and guided scam recovery triage.
 *
 * Privacy & Security:
 * - Never communicates with third-party LLMs directly from mobile.
 * - All requests are proxied via FraudShield backend.
 * - Only transmits safe, minimal detection metadata and safe message snippets.
 */

import apiClient from './client';

export interface AssistantDetectionContext {
  detectionId?: string;
  source?: string;
  classification?: string;
  riskScore?: number;
  reasons?: string[];
  safePreview?: string;
}

export interface AssistantChatPayload {
  message: string;
  mode?: 'detection_explanation' | 'general_help';
  conversationId?: string;
  detectionContext?: AssistantDetectionContext;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AssistantChatResponse {
  success: boolean;
  conversationId: string;
  mode: 'detection_explanation' | 'general_help';
  response: string;
  suggestedFollowUps: string[];
  actionChecklist: string[];
  urgency: 'low' | 'medium' | 'high' | 'immediate';
  message?: string;
}

const ASSISTANT_BASE = '/api/assistant';

export const assistantApi = {
  /**
   * Send a chat message to the assistant
   * POST /api/assistant/chat
   */
  sendMessage: async (
    payload: AssistantChatPayload,
  ): Promise<AssistantChatResponse> => {
    const response = await apiClient.post<AssistantChatResponse>(
      `${ASSISTANT_BASE}/chat`,
      payload,
    );
    return response.data;
  },
};

export default assistantApi;
