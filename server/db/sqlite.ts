import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AppConfig } from '../config';
import { migrations } from './migrations';

let database: DatabaseSync | null = null;

function ensureDatabaseFile(config: AppConfig): string {
  const resolvedPath = resolve(process.cwd(), config.dbPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  return resolvedPath;
}

function runMigrations(db: DatabaseSync) {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL);');

  const appliedRows = db.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: string }>;
  const appliedMigrationIds = new Set(appliedRows.map((row) => row.id));
  const insertMigration = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');

  for (const migration of migrations) {
    if (appliedMigrationIds.has(migration.id)) {
      continue;
    }

    db.exec('BEGIN');

    try {
      db.exec(migration.sql);
      insertMigration.run(migration.id, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
}

export function getDatabase(config: AppConfig): DatabaseSync {
  if (database) {
    return database;
  }

  database = new DatabaseSync(ensureDatabaseFile(config));
  runMigrations(database);
  return database;
}
