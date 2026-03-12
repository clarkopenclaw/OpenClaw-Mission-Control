# Mission Control (local)

Local React dashboard for monitoring OpenClaw cron jobs and workflow health.

## Stack
- Vite + React + TypeScript
- JSON data generated locally by `refresh.sh`

## Quick start
1) Generate fresh data:
```bash
cd /Users/clarkopenclaw/.openclaw/workspace-clark-workspace/_repos/OpenClaw-Mission-Control
./refresh.sh
```

2) Install dependencies:
```bash
pnpm install
# or
npm install
```

3) Start dev server:
```bash
pnpm dev
# or
npm run dev
```

4) Open dashboard:
```text
http://localhost:5173
```

The app reads from `/data/*.json` (generated under `public/data/cron-jobs.json`, `public/data/agents.json`, `public/data/meta.json`).

## Homepage
The homepage is an exception-first cockpit built from those local generated JSON files. Above the fold it highlights:
- Needs attention
- Waiting on Ryan
- Recently shipped

The full automation explorer stays below the fold with search plus table/calendar/agenda views.

## Validate OpenClaw JSON parsing
```bash
node verify-data.mjs
```

## Build checks
```bash
pnpm run lint && pnpm run typecheck && pnpm run build
# or
npm run lint && npm run typecheck && npm run build
```

## Legacy static reference
Old static files are kept under `legacy/`:
- `legacy/index.html`
- `legacy/app.js`
- `legacy/style.css`
