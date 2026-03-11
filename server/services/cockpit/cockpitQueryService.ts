import type { DatabaseSync } from 'node:sqlite';
import { cockpitHomeResponseSchema, type CockpitHomeResponse, type CockpitPanel } from '../../../shared/schemas/cockpit';
import type { VoiceSession } from '../../../shared/schemas/voice';
import { getVoiceSessionSummary, listVoiceSessions } from '../voice/voiceSessionService';

function describeVoiceSession(session: VoiceSession): string {
  if (session.status === 'created') {
    return `Created by ${session.createdBy} in ${session.department}. Audio capture and upload are the next step.`;
  }

  if (session.status === 'failed') {
    return `Voice processing failed for ${session.department}. Operator review is required.`;
  }

  return `Voice session is currently ${session.status.replaceAll('_', ' ')}.`;
}

function buildNeedsAttentionPanel(sessions: VoiceSession[]): CockpitPanel {
  const actionableStatuses = new Set(['created', 'failed', 'awaiting_review', 'ready_to_publish']);

  return {
    id: 'needs-attention',
    title: 'Needs attention',
    emptyMessage: 'No voice sessions need operator attention yet.',
    items: sessions
      .filter((session) => actionableStatuses.has(session.status))
      .slice(0, 6)
      .map((session) => ({
        id: session.id,
        title: `Voice session ${session.id}`,
        description: describeVoiceSession(session),
        href: `/voice/${session.id}`,
        badge: session.status,
        status: session.status,
        source: 'voice' as const,
      })),
  };
}

export function getCockpitHome(db: DatabaseSync): CockpitHomeResponse {
  const sessions = listVoiceSessions(db, 12);

  return cockpitHomeResponseSchema.parse({
    generatedAt: new Date().toISOString(),
    voiceSummary: getVoiceSessionSummary(db),
    panels: [
      buildNeedsAttentionPanel(sessions),
      {
        id: 'waiting-on-ryan',
        title: 'Waiting on Ryan',
        emptyMessage: 'No voice-derived approvals or decisions are waiting on Ryan yet.',
        items: [],
      },
      {
        id: 'recently-shipped',
        title: 'Recently shipped',
        emptyMessage: 'No voice-created work has been published yet.',
        items: [],
      },
    ],
  });
}
