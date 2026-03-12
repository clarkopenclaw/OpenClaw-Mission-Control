export const migrations = [
  {
    id: '001_voice_mode_foundation',
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS voice_sessions (
        id TEXT PRIMARY KEY,
        department TEXT NOT NULL,
        note_type TEXT NOT NULL,
        source_route TEXT NOT NULL,
        source TEXT NOT NULL,
        created_by TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS voice_transcript_revisions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL,
        revision_source TEXT NOT NULL,
        transcript_blocks_json TEXT NOT NULL,
        speaker_map_json TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES voice_sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS voice_item_drafts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        item_kind TEXT NOT NULL,
        source_block_ids_json TEXT NOT NULL,
        field_values_json TEXT NOT NULL,
        validation_status TEXT NOT NULL,
        publish_target_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES voice_sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        actor TEXT NOT NULL,
        metadata_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES voice_sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_voice_sessions_created_at ON voice_sessions(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_voice_sessions_status ON voice_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_audit_events_session_id ON audit_events(session_id, created_at DESC);
    `,
  },
] as const;
