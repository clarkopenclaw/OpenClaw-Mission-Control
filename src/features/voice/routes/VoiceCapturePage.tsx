import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { VoiceDepartment, VoiceNoteType } from '../../../../shared/schemas/voice';
import { createVoiceSession } from '../api/voiceApi';

const DEPARTMENTS: Array<{ value: VoiceDepartment; label: string }> = [
  { value: 'ceo', label: 'CEO' },
  { value: 'product-engineering', label: 'Product / Engineering' },
  { value: 'growth-sales', label: 'Growth / Sales' },
  { value: 'operations', label: 'Operations' },
];

const NOTE_TYPES: Array<{ value: VoiceNoteType; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'task', label: 'Task' },
  { value: 'decision', label: 'Decision' },
  { value: 'issue', label: 'Issue' },
  { value: 'approval', label: 'Approval' },
  { value: 'update', label: 'Update' },
];

export default function VoiceCapturePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [department, setDepartment] = useState<VoiceDepartment>('operations');
  const [noteType, setNoteType] = useState<VoiceNoteType>('general');

  const createSessionMutation = useMutation({
    mutationFn: createVoiceSession,
    onSuccess: ({ session }) => {
      navigate(`/voice/${session.id}`);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    createSessionMutation.mutate({
      department,
      noteType,
      sourceRoute: location.pathname,
    });
  }

  return (
    <div className="container page-stack">
      <section className="card hero-card">
        <div className="hero-copy">
          <div>
            <h2>Start a voice intake</h2>
            <div className="sub">This PR establishes the persisted voice-session and audit boundary before audio upload and Deepgram transcription land.</div>
          </div>
        </div>
      </section>

      <div className="two-column-grid">
        <section className="card">
          <h2>Session metadata</h2>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="field">
              <span>Department</span>
              <select value={department} onChange={(event) => setDepartment(event.target.value as VoiceDepartment)}>
                {DEPARTMENTS.map((departmentOption) => (
                  <option key={departmentOption.value} value={departmentOption.value}>
                    {departmentOption.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Note type</span>
              <select value={noteType} onChange={(event) => setNoteType(event.target.value as VoiceNoteType)}>
                {NOTE_TYPES.map((noteTypeOption) => (
                  <option key={noteTypeOption.value} value={noteTypeOption.value}>
                    {noteTypeOption.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="hint">Next PRs attach browser recording, file upload, transcript review, and markdown publishing to this same persisted session id.</div>

            {createSessionMutation.error instanceof Error ? (
              <div className="small">Failed to create session: {createSessionMutation.error.message}</div>
            ) : null}

            <div className="actions-row">
              <button type="submit" disabled={createSessionMutation.isPending}>
                {createSessionMutation.isPending ? 'Creating…' : 'Create voice session'}
              </button>
            </div>
          </form>
        </section>

        <section className="card">
          <h2>Planned flow</h2>
          <ol className="checklist">
            <li className="checklist-item done">Create a durable session + audit trail</li>
            <li className="checklist-item">Attach browser recording and upload UX</li>
            <li className="checklist-item">Send prerecorded audio to Deepgram</li>
            <li className="checklist-item">Review and correct transcript blocks</li>
            <li className="checklist-item">Publish markdown-backed operating items</li>
          </ol>
        </section>
      </div>
    </div>
  );
}
