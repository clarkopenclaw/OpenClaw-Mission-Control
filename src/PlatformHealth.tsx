import { useEffect, useState } from 'react';

type PlatformStatus = {
  gateway: {
    mode: string;
    url: string;
    reachable: boolean;
    connectLatencyMs: number;
    version: string;
    platform: string;
  };
  gatewayService: {
    label: string;
    installed: boolean;
    loadedText: string;
  };
  securityAudit: {
    summary: { critical: number; warn: number; info: number };
    findings: Array<{ severity: string; title: string; detail: string }>;
  };
  update: {
    root: string;
    installKind: string;
    packageManager: string;
    registry: { latestVersion: string };
  };
  sessions: { count: number };
  memory: { files: number; chunks: number };
};

async function loadJson(path: string): Promise<unknown> {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to load ${path}: ${res.status}`);
  }
  return res.json();
}

function extractPlatformStatus(payload: unknown): PlatformStatus | null {
  if (!payload || typeof payload !== 'object') return null;
  return payload as PlatformStatus;
}

function severityBadge(severity: string): string {
  if (severity === 'critical') return 'badge err';
  if (severity === 'warn') return 'badge';
  return 'badge ok';
}

export default function PlatformHealth() {
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string>('Loading...');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    void (async () => {
      try {
        const statusData = await loadJson('/data/openclaw-status.json');
        const extracted = extractPlatformStatus(statusData);
        setStatus(extracted);

        const metaRes = await fetch('/data/meta.json', { cache: 'no-store' });
        if (metaRes.ok) {
          const meta = await metaRes.json();
          const ts = meta?.generatedAt;
          if (ts) {
            const date = new Date(ts > 1e12 ? ts : ts * 1000);
            setGeneratedAt(date.toLocaleString());
          }
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load platform status');
      }
    })();
  }, []);

  if (error) {
    return (
      <section className="card">
        <h2>Platform health</h2>
        <div className="small">Failed to load: {error}. Run ./refresh.sh.</div>
      </section>
    );
  }

  if (!status) {
    return (
      <section className="card">
        <h2>Platform health</h2>
        <div className="small">Loading...</div>
      </section>
    );
  }

  const { gateway, gatewayService, securityAudit, update, sessions, memory } = status;

  return (
    <section className="card">
      <div className="card-title">
        <h2>Platform health</h2>
        <div className="small mono">Generated: {generatedAt}</div>
      </div>

      <div className="health-grid">
        <div className="health-item">
          <div className="health-label">Gateway</div>
          <div className="health-value">
            <span className={gateway.reachable ? 'badge ok' : 'badge err'}>
              {gateway.reachable ? 'reachable' : 'unreachable'}
            </span>
            <span className="mono">{gateway.connectLatencyMs}ms</span>
          </div>
          <div className="small mono">{gateway.version} · {gateway.platform}</div>
        </div>

        <div className="health-item">
          <div className="health-label">Service</div>
          <div className="health-value">
            <span className="badge">{gatewayService.loadedText}</span>
          </div>
          <div className="small mono">{gatewayService.label}</div>
        </div>

        <div className="health-item">
          <div className="health-label">Sessions</div>
          <div className="health-value mono">{sessions.count}</div>
        </div>

        <div className="health-item">
          <div className="health-label">Memory</div>
          <div className="health-value mono">{memory.files} files · {memory.chunks} chunks</div>
        </div>
      </div>

      <h3>Security</h3>
      <div className="health-summary">
        <span className={securityAudit.summary.critical > 0 ? 'badge err' : 'badge ok'}>
          {securityAudit.summary.critical} critical
        </span>
        <span className={securityAudit.summary.warn > 0 ? 'badge' : 'badge ok'}>
          {securityAudit.summary.warn} warn
        </span>
        <span className="badge ok">{securityAudit.summary.info} info</span>
      </div>

      {securityAudit.findings.length > 0 && (
        <div className="findings-list">
          {securityAudit.findings.slice(0, 3).map((f, i) => (
            <div key={i} className="finding-item">
              <span className={severityBadge(f.severity)}>{f.severity}</span>
              <span className="finding-title">{f.title}</span>
            </div>
          ))}
        </div>
      )}

      <h3>Updates</h3>
      <div className="health-summary">
        <span className="mono">{update.packageManager}</span>
        <span className="badge">{update.installKind}</span>
        <span className="mono">latest: {update.registry?.latestVersion ?? '—'}</span>
      </div>
    </section>
  );
}