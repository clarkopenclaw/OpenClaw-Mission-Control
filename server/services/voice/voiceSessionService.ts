import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import {
  type CreateVoiceSessionInput,
  type VoiceAuditEvent,
  type VoiceSession,
  type VoiceSessionDetail,
  type VoiceSessionStatus,
} from '../../../shared/schemas/voice';

type VoiceSessionRow = {
  id: string;
  department: VoiceSession['department'];
  note_type: VoiceSession['noteType'];
  source_route: string;
  source: VoiceSession['source'];
  created_by: string;
  status: VoiceSessionStatus;
  created_at: string;
  updated_at: string;
};

type AuditEventRow = {
  id: string;
  session_id: string;
  event_type: VoiceAuditEvent['eventType'];
  actor: string;
  metadata_json: string;
  created_at: string;
};

function mapVoiceSession(row: VoiceSessionRow): VoiceSession {
  return {
    id: row.id,
    department: row.department,
    noteType: row.note_type,
    sourceRoute: row.source_route,
    source: row.source,
    createdBy: row.created_by,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditEvent(row: AuditEventRow): VoiceAuditEvent {
  return {
    id: row.id,
    sessionId: row.session_id,
    eventType: row.event_type,
    actor: row.actor,
    createdAt: row.created_at,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>,
  };
}

function buildNextSessionId(db: DatabaseSync, createdAt: string): string {
  const dateToken = createdAt.slice(0, 10);
  const prefix = `vc-${dateToken}`;
  const countRow = db.prepare('SELECT COUNT(*) AS count FROM voice_sessions WHERE id LIKE ?').get(`${prefix}-%`) as {
    count: number;
  };

  return `${prefix}-${String(countRow.count + 1).padStart(3, '0')}`;
}

function appendAuditEvent(
  db: DatabaseSync,
  sessionId: string,
  eventType: VoiceAuditEvent['eventType'],
  actor: string,
  metadata: Record<string, unknown>,
) {
  db.prepare(
    `
      INSERT INTO audit_events (id, session_id, event_type, actor, metadata_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(randomUUID(), sessionId, eventType, actor, JSON.stringify(metadata), new Date().toISOString());
}

export function createVoiceSession(db: DatabaseSync, input: CreateVoiceSessionInput, createdBy: string): VoiceSession {
  const createdAt = new Date().toISOString();
  const sessionId = buildNextSessionId(db, createdAt);

  db.prepare(
    `
      INSERT INTO voice_sessions (
        id,
        department,
        note_type,
        source_route,
        source,
        created_by,
        status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    sessionId,
    input.department,
    input.noteType,
    input.sourceRoute,
    'mission-control-ui',
    createdBy,
    'created',
    createdAt,
    createdAt,
  );

  appendAuditEvent(db, sessionId, 'session_created', createdBy, {
    department: input.department,
    noteType: input.noteType,
    sourceRoute: input.sourceRoute,
  });

  const row = db.prepare(
    `
      SELECT id, department, note_type, source_route, source, created_by, status, created_at, updated_at
      FROM voice_sessions
      WHERE id = ?
    `,
  ).get(sessionId) as VoiceSessionRow;

  return mapVoiceSession(row);
}

export function getVoiceSessionDetail(db: DatabaseSync, sessionId: string): VoiceSessionDetail | null {
  const sessionRow = db.prepare(
    `
      SELECT id, department, note_type, source_route, source, created_by, status, created_at, updated_at
      FROM voice_sessions
      WHERE id = ?
    `,
  ).get(sessionId) as VoiceSessionRow | undefined;

  if (!sessionRow) {
    return null;
  }

  const auditRows = db.prepare(
    `
      SELECT id, session_id, event_type, actor, metadata_json, created_at
      FROM audit_events
      WHERE session_id = ?
      ORDER BY created_at DESC
    `,
  ).all(sessionId) as AuditEventRow[];

  return {
    session: mapVoiceSession(sessionRow),
    auditEvents: auditRows.map(mapAuditEvent),
  };
}

export function listVoiceSessions(db: DatabaseSync, limit = 10): VoiceSession[] {
  const rows = db.prepare(
    `
      SELECT id, department, note_type, source_route, source, created_by, status, created_at, updated_at
      FROM voice_sessions
      ORDER BY created_at DESC
      LIMIT ?
    `,
  ).all(limit) as VoiceSessionRow[];

  return rows.map(mapVoiceSession);
}

export function getVoiceSessionSummary(db: DatabaseSync) {
  const totalRow = db.prepare('SELECT COUNT(*) AS count FROM voice_sessions').get() as { count: number };
  const activeRow = db.prepare(
    `
      SELECT COUNT(*) AS count
      FROM voice_sessions
      WHERE status IN ('created', 'uploading', 'uploaded', 'transcribing', 'awaiting_review', 'review_in_progress', 'ready_to_publish')
    `,
  ).get() as { count: number };
  const failedRow = db.prepare("SELECT COUNT(*) AS count FROM voice_sessions WHERE status = 'failed'").get() as {
    count: number;
  };

  return {
    totalSessions: totalRow.count,
    activeSessions: activeRow.count,
    failedSessions: failedRow.count,
  };
}
