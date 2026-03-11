import {
  createVoiceSessionResponseSchema,
  listVoiceSessionsResponseSchema,
  type CreateVoiceSessionInput,
  type CreateVoiceSessionResponse,
  type ListVoiceSessionsResponse,
  type VoiceSessionDetail,
  voiceSessionDetailSchema,
} from '../../../../shared/schemas/voice';
import { apiGet, apiPost } from '../../../shared/api/client';

export function createVoiceSession(input: CreateVoiceSessionInput): Promise<CreateVoiceSessionResponse> {
  return apiPost('/api/voice-sessions', input, createVoiceSessionResponseSchema);
}

export function getVoiceSession(sessionId: string): Promise<VoiceSessionDetail> {
  return apiGet(`/api/voice-sessions/${sessionId}`, voiceSessionDetailSchema);
}

export function listVoiceSessions(): Promise<ListVoiceSessionsResponse> {
  return apiGet('/api/voice-sessions', listVoiceSessionsResponseSchema);
}
