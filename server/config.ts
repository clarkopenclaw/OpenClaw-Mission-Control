const DEFAULT_PORT = 8787;
const DEFAULT_DB_PATH = 'var/mission-control.db';
const DEFAULT_CONTENT_ROOT = 'mission';
const DEFAULT_AUTH_HEADER = 'x-openclaw-user';
const DEFAULT_DEV_USER = 'clark';

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value === 'true';
}

function parsePort(value: string | undefined): number {
  const fallback = DEFAULT_PORT;

  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: parsePort(process.env.PORT),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  dbPath: process.env.MISSION_CONTROL_DB_PATH ?? DEFAULT_DB_PATH,
  contentRoot: process.env.MISSION_CONTROL_CONTENT_ROOT ?? DEFAULT_CONTENT_ROOT,
  authTrustHeader: process.env.MISSION_CONTROL_AUTH_TRUST_HEADER ?? DEFAULT_AUTH_HEADER,
  devUser: process.env.MISSION_CONTROL_DEV_USER ?? DEFAULT_DEV_USER,
  voiceModeEnabled: parseBoolean(process.env.MISSION_CONTROL_VOICE_MODE_ENABLED, process.env.NODE_ENV !== 'production'),
};

export type AppConfig = typeof config;
