import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { CockpitPanel } from '../../../../shared/schemas/cockpit';
import { getCockpitHome } from '../api/getCockpitHome';
import { VoiceEntryButton } from '../../voice/components/VoiceEntryButton';

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function Panel({ panel }: { panel: CockpitPanel }) {
  return (
    <section className="card cockpit-panel">
      <div className="card-title">
        <h2>{panel.title}</h2>
        <span className="badge">{panel.items.length}</span>
      </div>

      {panel.items.length === 0 ? (
        <div className="small">{panel.emptyMessage}</div>
      ) : (
        <div className="panel-list">
          {panel.items.map((item) => (
            <Link key={item.id} to={item.href} className="panel-item">
              <div className="panel-item-top">
                <strong>{item.title}</strong>
                {item.badge ? <span className="badge">{item.badge}</span> : null}
              </div>
              <div className="small">{item.description}</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export default function HomePage() {
  const homeQuery = useQuery({
    queryKey: ['cockpit-home'],
    queryFn: getCockpitHome,
  });

  return (
    <div className="container page-stack">
      <section className="card hero-card">
        <div className="hero-copy">
          <div>
            <h2>Exception-first cockpit</h2>
            <div className="sub">This foundation PR adds the routed app shell, persisted voice sessions, and a real API boundary.</div>
          </div>

          <div className="hero-actions">
            <VoiceEntryButton />
            <Link className="button" to="/ops/cron">
              Open cron ops
            </Link>
          </div>
        </div>

        {homeQuery.isLoading ? <div className="small">Loading cockpit summary…</div> : null}
        {homeQuery.error instanceof Error ? <div className="small">Failed to load cockpit summary: {homeQuery.error.message}</div> : null}

        {homeQuery.data ? (
          <>
            <div className="summary-grid">
              <div className="summary-card">
                <div className="summary-label">Voice sessions</div>
                <div className="summary-value">{homeQuery.data.voiceSummary.totalSessions}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Active review queue</div>
                <div className="summary-value">{homeQuery.data.voiceSummary.activeSessions}</div>
              </div>
              <div className="summary-card">
                <div className="summary-label">Failed sessions</div>
                <div className="summary-value">{homeQuery.data.voiceSummary.failedSessions}</div>
              </div>
            </div>

            <div className="hint">Generated {formatTimestamp(homeQuery.data.generatedAt)}</div>
          </>
        ) : null}
      </section>

      <div className="cockpit-grid">
        {homeQuery.data?.panels.map((panel) => <Panel key={panel.id} panel={panel} />)}
      </div>
    </div>
  );
}
