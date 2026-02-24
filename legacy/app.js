async function loadJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
  return res.json();
}

function badge(text) {
  const cls = String(text || '').toLowerCase();
  const klass = cls.includes('ok') ? 'ok' : (cls.includes('err') || cls.includes('fail')) ? 'err' : cls.includes('idle') ? 'idle' : '';
  return `<span class="badge ${klass}">${text ?? '—'}</span>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
}

function renderJobs(jobs, agentModelById) {
  const q = (document.querySelector('#q').value || '').toLowerCase();
  const onlyEnabled = document.querySelector('#onlyEnabled').checked;

  const filtered = jobs.filter(j => {
    const name = (j.name || '').toLowerCase();
    const agent = (j.agentId || '').toLowerCase();
    const okQ = !q || name.includes(q) || agent.includes(q);
    const okE = !onlyEnabled || j.enabled;
    return okQ && okE;
  });

  const rows = filtered.map(j => {
    const agentId = j.agentId || '(default)';
    const model = agentModelById?.[agentId] || agentModelById?.['(default)'] || '—';
    const thinking = j.payload?.thinking || j.thinking || '—';
    const sched = j.schedule?.kind === 'cron'
      ? `cron ${j.schedule.expr} @ ${j.schedule.tz || ''}`
      : j.schedule?.kind || '—';

    const next = j.state?.nextRunAtMs ? new Date(j.state.nextRunAtMs).toLocaleString() : '—';
    const last = j.state?.lastRunAtMs ? new Date(j.state.lastRunAtMs).toLocaleString() : '—';

    return `
      <tr>
        <td><div><b>${escapeHtml(j.name)}</b></div><div class="small mono">${escapeHtml(j.id)}</div></td>
        <td class="mono">${escapeHtml(agentId)}</td>
        <td class="mono">${escapeHtml(model)}</td>
        <td class="mono">${escapeHtml(thinking)}</td>
        <td>${j.enabled ? badge('enabled') : badge('disabled')}</td>
        <td class="mono">${escapeHtml(sched)}</td>
        <td class="mono">${escapeHtml(next)}</td>
        <td class="mono">${escapeHtml(last)}</td>
        <td>${badge(j.state?.lastRunStatus || j.state?.lastStatus || '—')}</td>
      </tr>
    `;
  }).join('');

  return `
    <table class="table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Agent</th>
          <th>Model</th>
          <th>Thinking</th>
          <th>Enabled</th>
          <th>Schedule</th>
          <th>Next</th>
          <th>Last</th>
          <th>Last status</th>
        </tr>
      </thead>
      <tbody>
        ${rows || `<tr><td colspan="9" class="small">No jobs match filter.</td></tr>`}
      </tbody>
    </table>
  `;
}

async function listAuditReports() {
  // We can’t read the filesystem directly from a file:// page.
  // Instead, we show the canonical folder path + instructions.
  return `
    <div class="small">
      Open the folder in Finder:<br/>
      <code>~/Documents/openclaw-for-smb/second-brain/build-notes/workflow-audit/</code>
      <div style="margin-top:8px">If you want clickable report links in this dashboard, I can add a tiny local HTTP server mode (optional) that lists files.</div>
    </div>
  `;
}

async function main() {
  try {
    const meta = await loadJson('./data/meta.json');
    document.querySelector('#meta').textContent = `Generated: ${new Date(meta.generatedAt * 1000).toLocaleString()}`;
  } catch {
    document.querySelector('#meta').textContent = 'No data found. Run refresh.sh.';
  }

  let jobs = [];
  let agentModelById = {};

  try {
    const agents = await loadJson('./data/agents.json');
    const list = agents?.agents || agents?.list || agents || [];
    for (const a of list) {
      if (a?.id) agentModelById[a.id] = a.model || a.primaryModel || a?.defaults?.model?.primary || '—';
    }
    // add default fallback if available
    const defaultModel = agents?.defaults?.model?.primary || agents?.agentDefaults?.model || agents?.defaults?.model;
    if (defaultModel) agentModelById['(default)'] = defaultModel;
  } catch {}

  try {
    const cron = await loadJson('./data/cron-jobs.json');
    jobs = Array.isArray(cron) ? cron : (cron.jobs || cron.data || []);
    document.querySelector('#jobs').innerHTML = renderJobs(jobs, agentModelById);
  } catch (e) {
    document.querySelector('#jobs').innerHTML = `<div class="small">Failed to load jobs. Run refresh.sh. (${escapeHtml(e.message)})</div>`;
  }

  document.querySelector('#audit').innerHTML = await listAuditReports();

  document.querySelector('#q').addEventListener('input', () => {
    document.querySelector('#jobs').innerHTML = renderJobs(jobs, agentModelById);
  });
  document.querySelector('#onlyEnabled').addEventListener('change', () => {
    document.querySelector('#jobs').innerHTML = renderJobs(jobs, agentModelById);
  });
  document.querySelector('#reload').addEventListener('click', () => location.reload());
}

main();
