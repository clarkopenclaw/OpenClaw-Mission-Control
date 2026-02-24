# Mission Control (local)

Local React dashboard for monitoring OpenClaw cron jobs and workflow health.

## Stack
- Vite + React + TypeScript
- JSON data generated locally by `refresh.sh`

## Quick start
1) Generate fresh data:
```bash
cd ~/Documents/mission-control
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

The app reads from `/data/*.json` (`data/cron-jobs.json`, `data/agents.json`, `data/meta.json`).

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
