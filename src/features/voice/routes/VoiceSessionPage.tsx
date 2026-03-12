import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { getVoiceSession } from '../api/voiceApi';

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

export default function VoiceSessionPage() {
  const { sessionId } = useParams();

  const sessionQuery = useQuery({
    queryKey: ['voice-session', sessionId],
    queryFn: () => getVoiceSession(sessionId ?? ''),
    enabled: Boolean(sessionId),
  });

  return (
    <div className="container page-stack">
      <section className="card hero-card">
        <div className="hero-copy">
          <div>
            <h2>Voice session</h2>
            <div className="sub">Persisted session detail and audit trail for the future upload → transcription → review pipeline.</div>
          </div>

          <div className="hero-actions">
            <Link className="button" to="/voice/new">
              Start another session
            </Link>
          </div>
        </div>
      </section>

      {sessionQuery.isLoading ? <section className="card small">Loading voice session…</section> : null}
      {sessionQuery.error instanceof Error ? <section className="card small">Failed to load session: {sessionQuery.error.message}</section> : null}

      {sessionQuery.data ? (
        <div className="two-column-grid">
          <section className="card">
            <div className="card-title">
              <h2>{sessionQuery.data.session.id}</h2>
              <span className="badge">{sessionQuery.data.session.status}</span>
            </div>

            <dl className="detail-grid">
              <div>
                <dt>Department</dt>
                <dd>{sessionQuery.data.session.department}</dd>
              </div>
              <div>
                <dt>Note type</dt>
                <dd>{sessionQuery.data.session.noteType}</dd>
              </div>
              <div>
                <dt>Created by</dt>
                <dd>{sessionQuery.data.session.createdBy}</dd>
              </div>
              <div>
                <dt>Source route</dt>
                <dd>{sessionQuery.data.session.sourceRoute}</dd>
              </div>
              <div>
                <dt>Created at</dt>
                <dd>{formatTimestamp(sessionQuery.data.session.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated at</dt>
                <dd>{formatTimestamp(sessionQuery.data.session.updatedAt)}</dd>
              </div>
            </dl>
          </section>

          <section className="card">
            <h2>Next steps</h2>
            <ol className="checklist">
              <li className="checklist-item done">Session created in SQLite with audit event</li>
              <li className="checklist-item">Audio upload endpoint</li>
              <li className="checklist-item">Deepgram transcription worker</li>
              <li className="checklist-item">Transcript review + correction</li>
              <li className="checklist-item">Markdown publish + cockpit surfacing</li>
            </ol>
          </section>
        </div>
      ) : null}

      {sessionQuery.data ? (
        <section className="card">
          <h2>Audit trail</h2>

          {sessionQuery.data.auditEvents.length === 0 ? (
            <div className="small">No audit events yet.</div>
          ) : (
            <div className="timeline">
              {sessionQuery.data.auditEvents.map((event) => (
                <div key={event.id} className="timeline-item">
                  <div className="timeline-title">{event.eventType}</div>
                  <div className="small">
                    {event.actor} · {formatTimestamp(event.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
