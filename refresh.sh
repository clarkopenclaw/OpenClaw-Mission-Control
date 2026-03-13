#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$ROOT_DIR/public/data"
mkdir -p "$DATA_DIR"

# Jobs list
openclaw cron list --all --json > "$DATA_DIR/cron-jobs.json"

# Agents (for model mapping)
openclaw agents list --json > "$DATA_DIR/agents.json"

# Recent runs
# Note: `openclaw cron runs` may require a specific job id depending on OpenClaw version.
# We keep this best-effort and don't fail refresh if unsupported.
openclaw cron runs --help > "$DATA_DIR/cron-runs-help.txt" 2>&1 || true

# Timestamp
node -e 'process.stdout.write(JSON.stringify({ generatedAt: Math.floor(Date.now() / 1000) }, null, 2) + "\n")' > "$DATA_DIR/meta.json"

echo "Wrote: $DATA_DIR/cron-jobs.json"
echo "Wrote: $DATA_DIR/agents.json"
echo "Wrote: $DATA_DIR/cron-runs-help.txt"
echo "Wrote: $DATA_DIR/meta.json"

# ── Insights Data Pipeline ──
INSIGHTS_DIR="$DATA_DIR/insights"
mkdir -p "$INSIGHTS_DIR"
WS=~/.openclaw/workspace-clark-workspace

# insights/market.json
(
  THESIS_FILE="$WS/.cron_state/market_thesis.json"
  THEMES_FILE="$WS/.cron_state/market_theme_tickers.json"
  # Find the latest holdings file
  HOLDINGS_FILE=$(ls -t "$WS"/.cron_state/market_holdings_robinhood_*.json 2>/dev/null | head -1 || true)

  THESIS='null'
  HOLDINGS='null'
  THEMES='[]'

  [ -f "$THESIS_FILE" ] && THESIS=$(cat "$THESIS_FILE")
  [ -n "$HOLDINGS_FILE" ] && [ -f "$HOLDINGS_FILE" ] && HOLDINGS=$(cat "$HOLDINGS_FILE")
  [ -f "$THEMES_FILE" ] && THEMES=$(jq '.' "$THEMES_FILE" 2>/dev/null || echo '[]')

  jq -n \
    --argjson thesis "$THESIS" \
    --argjson holdings "$HOLDINGS" \
    --argjson themes "$THEMES" \
    '{
      generatedAt: (now | floor),
      thesis: (if $thesis != null then { title: ($thesis.title // "--"), pillars: ($thesis.pillars // []) } else { title: "--", pillars: [] } end),
      holdings: (if $holdings != null then {
        positions: ($holdings.positions // []),
        buyingPower: ($holdings.buyingPower // 0),
        dailyChange: ($holdings.dailyChange // 0),
        dailyChangePct: ($holdings.dailyChangePct // 0)
      } else { positions: [], buyingPower: 0, dailyChange: 0, dailyChangePct: 0 } end),
      themes: (if ($themes | type) == "array" then $themes else [] end)
    }' > "$INSIGHTS_DIR/market.json"
) || true
echo "Wrote: $INSIGHTS_DIR/market.json"

# insights/sales.json
(
  PIPELINE_FILE="$WS/outbound/linkedin/pipeline.md"
  INSIGHTS_FILE="$WS/outbound/linkedin/insights.md"

  TOTAL=0
  BY_STAGE='{}'
  SIGNALS='[]'

  if [ -f "$PIPELINE_FILE" ]; then
    BY_STAGE=$(awk -F'|' '
      NR > 2 && NF >= 3 {
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", $3)
        stage = $3
        if (stage != "" && stage != "stage") counts[stage]++
      }
      END {
        printf "{"
        first = 1
        for (s in counts) {
          if (!first) printf ","
          printf "\"%s\":%d", s, counts[s]
          first = 0
        }
        printf "}"
      }
    ' "$PIPELINE_FILE")
    TOTAL=$(echo "$BY_STAGE" | jq '[.[]] | add // 0')
  fi

  if [ -f "$INSIGHTS_FILE" ]; then
    SIGNALS=$(sed -n '/^## /{ h; d; }; H; ${x; p;}' "$INSIGHTS_FILE" | grep -E '^\s*[-*]' | head -5 | sed 's/^[[:space:]]*[-*][[:space:]]*//' | jq -R . | jq -s '.')
  fi

  jq -n \
    --argjson total "$TOTAL" \
    --argjson byStage "$BY_STAGE" \
    --argjson signals "$SIGNALS" \
    '{
      generatedAt: (now | floor),
      pipeline: { total: $total, byStage: $byStage },
      signals: $signals
    }' > "$INSIGHTS_DIR/sales.json"
) || true
echo "Wrote: $INSIGHTS_DIR/sales.json"

# insights/research.json
(
  RESEARCH_DIR=~/Documents/openclaw-for-smb/second-brain/market-research
  ENTRIES='[]'

  if [ -d "$RESEARCH_DIR" ]; then
    ENTRIES=$(node -e "
      const fs = require('fs');
      const path = require('path');
      const dir = '$RESEARCH_DIR';
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort().reverse().slice(0, 3);
      const entries = files.map(f => {
        const text = fs.readFileSync(path.join(dir, f), 'utf8');
        const date = f.replace('.md', '');
        const problems = (text.match(/^\s*\d+\..*/gm) || []).slice(0, 3).map(l => l.replace(/^\s*\d+\.\s*/, ''));
        const oppLine = text.split('\n').find(l => /opportunity/i.test(l)) || '';
        const opportunity = oppLine.replace(/.*[Oo]pportunity\s*[:：]\s*/, '').trim();
        return { date, problems, opportunity };
      });
      process.stdout.write(JSON.stringify(entries));
    " 2>/dev/null || echo '[]')
  fi

  jq -n --argjson entries "$ENTRIES" '{
    generatedAt: (now | floor),
    entries: $entries
  }' > "$INSIGHTS_DIR/research.json"
) || true
echo "Wrote: $INSIGHTS_DIR/research.json"

# insights/ops.json
(
  FRICTION_FILE="$WS/FRICTION.md"
  REGRESSION_FILE="$WS/REGRESSIONS.md"

  FRICTION_COUNT=0
  REGRESSION_COUNT=0
  FRICTION_TOP='[]'
  REGRESSION_TOP='[]'

  if [ -f "$FRICTION_FILE" ]; then
    FRICTION_COUNT=$(grep -c '^## ' "$FRICTION_FILE" 2>/dev/null || echo 0)
    FRICTION_TOP=$(grep '^## ' "$FRICTION_FILE" | head -3 | sed 's/^## //' | jq -R . | jq -s '.')
  fi

  if [ -f "$REGRESSION_FILE" ]; then
    REGRESSION_COUNT=$(grep -c '^## ' "$REGRESSION_FILE" 2>/dev/null || echo 0)
    REGRESSION_TOP=$(grep '^## ' "$REGRESSION_FILE" | head -3 | sed 's/^## //' | jq -R . | jq -s '.')
  fi

  jq -n \
    --argjson fc "$FRICTION_COUNT" \
    --argjson rc "$REGRESSION_COUNT" \
    --argjson ft "$FRICTION_TOP" \
    --argjson rt "$REGRESSION_TOP" \
    '{
      generatedAt: (now | floor),
      frictionCount: $fc,
      regressionCount: $rc,
      frictionTop: $ft,
      regressionTop: $rt
    }' > "$INSIGHTS_DIR/ops.json"
) || true
echo "Wrote: $INSIGHTS_DIR/ops.json"

# insights/learnings.json
(
  LEARNINGS_FILE="$WS/.learnings/LEARNINGS.md"
  RECENT='[]'
  DECISIONS='[]'

  if [ -f "$LEARNINGS_FILE" ]; then
    RECENT=$(node -e "
      const fs = require('fs');
      const text = fs.readFileSync('$LEARNINGS_FILE', 'utf8');
      const entries = [];
      const blocks = text.split(/^## /m).slice(1);
      for (const block of blocks.slice(-5)) {
        const lines = block.trim().split('\n');
        const heading = lines[0] || '';
        const dateMatch = heading.match(/\d{4}-\d{2}-\d{2}/);
        const date = dateMatch ? dateMatch[0] : '';
        const areaMatch = heading.match(/\[([^\]]+)\]/);
        const area = areaMatch ? areaMatch[1] : 'general';
        const summary = lines.slice(1).filter(l => l.trim()).slice(0, 2).join(' ').trim().substring(0, 200);
        entries.push({ date, summary, area });
      }
      process.stdout.write(JSON.stringify(entries));
    " 2>/dev/null || echo '[]')

    DECISIONS=$(grep -i 'decision\|decide\|TODO\|action item' "$LEARNINGS_FILE" 2>/dev/null | head -5 | sed 's/^[[:space:]]*[-*][[:space:]]*//' | jq -R . | jq -s '.' || echo '[]')
  fi

  jq -n \
    --argjson recent "$RECENT" \
    --argjson decisions "$DECISIONS" \
    '{
      generatedAt: (now | floor),
      recent: $recent,
      decisionsNeeded: $decisions
    }' > "$INSIGHTS_DIR/learnings.json"
) || true
echo "Wrote: $INSIGHTS_DIR/learnings.json"
