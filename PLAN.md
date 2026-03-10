# Agent Session Health Panel - Implementation Plan

## Objective
Add Agent Session Health panel to Mission Control showing:
- List of agents with session counts
- Active sessions with model/age/token usage  
- Identify hot/idle sessions

## Files to modify
1. `refresh.sh` - Add export of session data from `openclaw status --json`
2. `src/SessionHealth.tsx` - New component for the panel
3. `src/App.tsx` - Integrate the new panel
4. `src/App.css` - Add styling for the new panel

## Data export changes
- Export sessions object from `openclaw status --json` to `public/data/sessions.json`
- Parse and display agent-level aggregates

## Component structure
- SessionHealth component with agent list and session table
- Reuse existing badgeClass and formatting utilities
- Keep consistent with existing UI patterns

## Test plan
1. pnpm run lint
2. pnpm run typecheck
3. pnpm run build
4. Manual UI verification

## Risk
- Session data might be large; consider pagination or limiting to recent sessions