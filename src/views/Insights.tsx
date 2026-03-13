import { useEffect, useMemo, useState } from 'react';
import {
  CronJob,
  MarketInsights, SalesInsights, ResearchInsights, OpsInsights, LearningsInsights,
  isRecord, loadJson, formatGeneratedAt,
} from '../types';

type Props = { jobs: CronJob[] };

function ts(raw: unknown): string {
  return formatGeneratedAt(typeof raw === 'number' ? raw : undefined);
}

export default function Insights({ jobs }: Props) {
  const [market, setMarket] = useState<MarketInsights | null>(null);
  const [sales, setSales] = useState<SalesInsights | null>(null);
  const [research, setResearch] = useState<ResearchInsights | null>(null);
  const [ops, setOps] = useState<OpsInsights | null>(null);
  const [learnings, setLearnings] = useState<LearningsInsights | null>(null);

  useEffect(() => {
    void (async () => {
      const [mkt, sl, res, op, lrn] = await Promise.allSettled([
        loadJson('/data/insights/market.json'),
        loadJson('/data/insights/sales.json'),
        loadJson('/data/insights/research.json'),
        loadJson('/data/insights/ops.json'),
        loadJson('/data/insights/learnings.json'),
      ]);
      if (mkt.status === 'fulfilled' && isRecord(mkt.value)) setMarket(mkt.value as MarketInsights);
      if (sl.status === 'fulfilled' && isRecord(sl.value)) setSales(sl.value as SalesInsights);
      if (res.status === 'fulfilled' && isRecord(res.value)) setResearch(res.value as ResearchInsights);
      if (op.status === 'fulfilled' && isRecord(op.value)) setOps(op.value as OpsInsights);
      if (lrn.status === 'fulfilled' && isRecord(lrn.value)) setLearnings(lrn.value as LearningsInsights);
    })();
  }, []);

  const healthCounts = useMemo(() => {
    let ok = 0, err = 0, pending = 0;
    for (const job of jobs.filter((j) => j.enabled)) {
      const s = (job.state?.lastRunStatus || job.state?.lastStatus || '').toLowerCase();
      if (s.includes('ok')) ok++;
      else if (s.includes('err') || s.includes('fail')) err++;
      else pending++;
    }
    return { ok, err, pending };
  }, [jobs]);

  return (
    <div className="insights">
      <div className="insights-grid">
        {/* Market Card */}
        <section className="section">
          <div className="section-header">
            <span className="section-title">Market</span>
            <span className="insights-timestamp">{market ? ts(market.generatedAt) : 'No data'}</span>
          </div>
          <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
            {market ? (
              <>
                <div className="insights-metric">
                  <span className="insights-metric-label">Thesis</span>
                  <span className="insights-metric-value">{market.thesis?.title || '--'}</span>
                </div>
                <div className="insights-metric">
                  <span className="insights-metric-label">Pillars</span>
                  <span className="insights-metric-value">{market.thesis?.pillars?.length ?? 0}</span>
                </div>
                <div className="insights-metric">
                  <span className="insights-metric-label">Buying Power</span>
                  <span className="insights-metric-value">
                    ${(market.holdings?.buyingPower ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="insights-metric">
                  <span className="insights-metric-label">Daily P&L</span>
                  <span className="insights-metric-value" style={{
                    color: (market.holdings?.dailyChange ?? 0) >= 0 ? 'var(--ok)' : 'var(--err)',
                  }}>
                    {(market.holdings?.dailyChange ?? 0) >= 0 ? '+' : ''}
                    ${(market.holdings?.dailyChange ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {market.holdings?.dailyChangePct != null && (
                      <span style={{ fontSize: '13px', marginLeft: '6px' }}>
                        ({(market.holdings.dailyChangePct >= 0 ? '+' : '')}{market.holdings.dailyChangePct.toFixed(2)}%)
                      </span>
                    )}
                  </span>
                </div>
                {market.holdings?.positions?.length > 0 && (
                  <ul className="insights-list">
                    {market.holdings.positions.map((p) => (
                      <li key={p.ticker} className="insights-list-item">
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{p.ticker}</span>
                        <span className="mono" style={{ marginLeft: '8px' }}>{p.shares} shares</span>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="insights-metric">
                  <span className="insights-metric-label">Themes</span>
                  <span className="insights-metric-value">{market.themes?.length ?? 0}</span>
                </div>
              </>
            ) : (
              <div className="empty-state">No data yet</div>
            )}
          </div>
        </section>

        {/* Sales Card */}
        <section className="section">
          <div className="section-header">
            <span className="section-title">Sales</span>
            <span className="insights-timestamp">{sales ? ts(sales.generatedAt) : 'No data'}</span>
          </div>
          <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
            {sales ? (
              <>
                <div className="insights-metric">
                  <span className="insights-metric-label">Pipeline Total</span>
                  <span className="insights-metric-value">{sales.pipeline?.total ?? 0}</span>
                </div>
                {sales.pipeline?.byStage && Object.entries(sales.pipeline.byStage).map(([stage, count]) => (
                  <div key={stage} className="insights-metric">
                    <span className="insights-metric-label">{stage}</span>
                    <span className="insights-metric-value">{count}</span>
                  </div>
                ))}
                {sales.signals?.length > 0 && (
                  <>
                    <div className="insights-metric-label" style={{ paddingTop: '8px' }}>Recent Signals</div>
                    <ul className="insights-list">
                      {sales.signals.map((s, i) => (
                        <li key={i} className="insights-list-item">{s}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <div className="empty-state">No data yet</div>
            )}
          </div>
        </section>

        {/* Research Card */}
        <section className="section">
          <div className="section-header">
            <span className="section-title">Research</span>
            <span className="insights-timestamp">{research ? ts(research.generatedAt) : 'No data'}</span>
          </div>
          <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
            {research?.entries?.length ? (
              research.entries.map((entry, i) => (
                <div key={i} style={{ display: 'grid', gap: '8px' }}>
                  <span className="mono small" style={{ color: 'var(--accent)' }}>{entry.date}</span>
                  <ol style={{ margin: 0, paddingLeft: '20px', display: 'grid', gap: '4px' }}>
                    {entry.problems?.map((p, j) => (
                      <li key={j} style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{p}</li>
                    ))}
                  </ol>
                  {entry.opportunity && (
                    <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 500 }}>
                      Opportunity: {entry.opportunity}
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="empty-state">No data yet</div>
            )}
          </div>
        </section>

        {/* Ops Card */}
        <section className="section">
          <div className="section-header">
            <span className="section-title">Operations</span>
            <span className="insights-timestamp">{ops ? ts(ops.generatedAt) : 'No data'}</span>
          </div>
          <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
            <div className="insights-metric">
              <span className="insights-metric-label">Cron Health</span>
              <div className="dash-health" style={{ gap: '12px' }}>
                {healthCounts.ok > 0 && <span className="dash-health-item ok"><span className="status-dot" />{healthCounts.ok}</span>}
                {healthCounts.err > 0 && <span className="dash-health-item err"><span className="status-dot" />{healthCounts.err}</span>}
                {healthCounts.pending > 0 && <span className="dash-health-item pending"><span className="status-dot" />{healthCounts.pending}</span>}
              </div>
            </div>
            {ops ? (
              <>
                <div className="insights-metric">
                  <span className="insights-metric-label">Friction Items</span>
                  <span className="insights-metric-value">{ops.frictionCount}</span>
                </div>
                {ops.frictionTop?.length > 0 && (
                  <ul className="insights-list">
                    {ops.frictionTop.map((t, i) => (
                      <li key={i} className="insights-list-item">{t}</li>
                    ))}
                  </ul>
                )}
                <div className="insights-metric">
                  <span className="insights-metric-label">Regressions</span>
                  <span className="insights-metric-value">{ops.regressionCount}</span>
                </div>
                {ops.regressionTop?.length > 0 && (
                  <ul className="insights-list">
                    {ops.regressionTop.map((t, i) => (
                      <li key={i} className="insights-list-item">{t}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="empty-state">No ops data yet</div>
            )}
          </div>
        </section>

        {/* Learnings Card (full width) */}
        <section className="section insights-full">
          <div className="section-header">
            <span className="section-title">Learnings</span>
            <span className="insights-timestamp">{learnings ? ts(learnings.generatedAt) : 'No data'}</span>
          </div>
          <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
            {learnings?.recent?.length ? (
              <>
                <ul className="insights-list">
                  {learnings.recent.map((l, i) => (
                    <li key={i} className="insights-list-item" style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
                      <span className="mono" style={{ flexShrink: 0, fontSize: '11px', color: 'var(--text-dim)' }}>{l.date}</span>
                      <span style={{
                        flexShrink: 0,
                        fontSize: '10px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--accent)',
                        background: 'var(--accent-dim)',
                        border: '1px solid rgba(240,180,41,0.25)',
                        borderRadius: '4px',
                        padding: '2px 6px',
                      }}>{l.area}</span>
                      <span>{l.summary}</span>
                    </li>
                  ))}
                </ul>
                {learnings.decisionsNeeded?.length > 0 && (
                  <>
                    <div className="insights-metric-label" style={{ color: 'var(--accent)', paddingTop: '8px' }}>Decisions Needed</div>
                    <ul className="insights-list">
                      {learnings.decisionsNeeded.map((d, i) => (
                        <li key={i} className="insights-list-item" style={{ color: 'var(--accent)' }}>{d}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <div className="empty-state">No data yet</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
