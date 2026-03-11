import { z } from 'zod';

export const voiceDepartmentSchema = z.enum(['ceo', 'product-engineering', 'growth-sales', 'operations']);
export type VoiceDepartment = z.infer<typeof voiceDepartmentSchema>;

export const voiceNoteTypeSchema = z.enum(['general', 'task', 'decision', 'issue', 'approval', 'update']);
export type VoiceNoteType = z.infer<typeof voiceNoteTypeSchema>;

export const voiceSessionStatusSchema = z.enum([
  'created',
  'uploading',
  'uploaded',
  'transcribing',
  'awaiting_review',
  'review_in_progress',
  'ready_to_publish',
  'published',
  'failed',
  'discarded',
]);
export type VoiceSessionStatus = z.infer<typeof voiceSessionStatusSchema>;

export const voiceAuditEventTypeSchema = z.enum([
  'session_created',
  'session_updated',
  'transcription_requested',
  'transcription_completed',
  'transcription_failed',
  'publish_requested',
  'published',
  'discarded',
]);
export type VoiceAuditEventType = z.infer<typeof voiceAuditEventTypeSchema>;

export const createVoiceSessionInputSchema = z.object({
  department: voiceDepartmentSchema,
  noteType: voiceNoteTypeSchema,
  sourceRoute: z.string().min(1).max(200),
});
export type CreateVoiceSessionInput = z.infer<typeof createVoiceSessionInputSchema>;

export const voiceSessionSchema = z.object({
  id: z.string().min(1),
  department: voiceDepartmentSchema,
  noteType: voiceNoteTypeSchema,
  sourceRoute: z.string().min(1),
  source: z.literal('mission-control-ui'),
  createdBy: z.string().min(1),
  status: voiceSessionStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type VoiceSession = z.infer<typeof voiceSessionSchema>;

export const voiceAuditEventSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  eventType: voiceAuditEventTypeSchema,
  actor: z.string().min(1),
  createdAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()),
});
export type VoiceAuditEvent = z.infer<typeof voiceAuditEventSchema>;

export const createVoiceSessionResponseSchema = z.object({
  session: voiceSessionSchema,
});
export type CreateVoiceSessionResponse = z.infer<typeof createVoiceSessionResponseSchema>;

export const voiceSessionDetailSchema = z.object({
  session: voiceSessionSchema,
  auditEvents: z.array(voiceAuditEventSchema),
});
export type VoiceSessionDetail = z.infer<typeof voiceSessionDetailSchema>;

export const listVoiceSessionsResponseSchema = z.object({
  sessions: z.array(voiceSessionSchema),
});
export type ListVoiceSessionsResponse = z.infer<typeof listVoiceSessionsResponseSchema>;
