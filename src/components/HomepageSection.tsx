import type { HomepageItem } from '../lib/homepage';

type Props = {
  title: string;
  description: string;
  emptyText: string;
  items: HomepageItem[];
  tone: 'attention' | 'waiting' | 'shipped';
};

function formatDateFromMs(epochMs?: number): string {
  if (!epochMs || Number.isNaN(epochMs)) {
    return '—';
  }
  return new Date(epochMs).toLocaleString();
}

function badgeClass(value: string): string {
  const text = value.toLowerCase();
  if (text.includes('ok')) return 'badge ok';
  if (text.includes('err') || text.includes('fail')) return 'badge err';
  if (text.includes('idle')) return 'badge idle';
  return 'badge';
}

export default function HomepageSection({ title, description, emptyText, items, tone }: Props) {
  return (
    <section className={`card home-section ${tone}`}>
      <div className="home-section-head">
        <div className="home-section-copy">
          <h2>{title}</h2>
          <div className="small">{description}</div>
        </div>
        <div className="home-section-count mono">{items.length}</div>
      </div>

      {items.length === 0 ? (
        <div className="home-empty small">{emptyText}</div>
      ) : (
        <div className="home-list">
          {items.map((item) => {
            const lastLabel = item.lastRunAtMs
              ? `Last: ${formatDateFromMs(item.lastRunAtMs)}`
              : item.updatedAtMs
                ? `Updated: ${formatDateFromMs(item.updatedAtMs)}`
                : 'Last: —';

            return (
              <article key={item.key} className="home-item">
                <div className="home-item-top">
                  <div className="home-item-copy">
                    <div className="home-item-title">
                      <b>{item.name}</b>
                    </div>
                    <div className="home-item-reason">{item.reason}</div>
                  </div>

                  <div className="home-item-badges">
                    <span className="badge">{item.enabled ? 'enabled' : 'disabled'}</span>
                    {item.status !== '—' ? <span className={badgeClass(item.status)}>{item.status}</span> : null}
                    {item.deliveryStatus !== '—' ? <span className="badge">{item.deliveryStatus}</span> : null}
                  </div>
                </div>

                <div className="home-item-meta small mono">
                  Agent: {item.agentId}
                  {item.model !== '—' ? ` · Model: ${item.model}` : ''}
                </div>

                <div className="home-item-meta small mono">
                  {lastLabel}
                  {item.nextRunAtMs ? ` · Next: ${formatDateFromMs(item.nextRunAtMs)}` : ''}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
