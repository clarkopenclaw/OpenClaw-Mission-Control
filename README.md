# Mission Control

Mission Control is moving from a local cron dashboard toward a browser-accessible operating cockpit with markdown-backed business records and Voice Mode intake.

## Stack
- Vite + React + TypeScript
- Express API server for app-backed workflows
- SQLite for operational workflow state
- Markdown under `mission/` as the future source of truth for published operating items

## Current app surface
- `/` — exception-first cockpit shell with live API-backed voice session summary
- `/voice/new` — persisted voice-session creation flow
- `/voice/:sessionId` — session detail + audit trail
- `/ops/cron` — existing OpenClaw cron dashboard, now routed inside the app shell

## Quick start
1) Install dependencies:
```bash
pnpm install
```

2) Start the API server:
```bash
pnpm run dev:server
```

3) Start the client:
```bash
pnpm run dev:client
```

4) Open Mission Control:
```text
http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8787`.

## Existing cron data flow
The cron dashboard still reads from `/data/*.json` generated under `public/data/`.

Generate fresh cron data with:
```bash
./refresh.sh
```

## Voice Mode foundation in this PR
- Adds a routed app shell and cockpit homepage
- Introduces an Express API server with operator auth middleware
- Adds SQLite-backed voice session creation + audit events
- Scaffolds the `mission/` markdown content root for future publish flows
- Keeps the existing cron UI intact under `/ops/cron`

## Build checks
```bash
pnpm run lint
pnpm run typecheck
pnpm run build
```
