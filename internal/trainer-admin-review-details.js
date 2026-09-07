(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const fmt = (v) => v ? new Intl.DateTimeFormat('en-MY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)) : '-';
  let timer = null;
  let profiles = {};
  let documents = [];
  let internalNotes = {};
  let programmeProposalMap = {};

  async function authHeaders(extra = {}) {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('Please log in again.');
    return { Authorization: `Bearer ${token}`, apikey: cfg.supabasePublishableKey, ...extra };
  }

  async function viewDriveDocument(documentId) {
    try {
      const response = await fetch(`${cfg.supabaseUrl}/functions/v1/trainer-drive-upload`, {
        method: 'POST',
        headers: await authHeaders({'Content-Type':'application/json'}),
        body: JSON.stringify({ action: 'download', document_id: documentId })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to open document.');
      const binary = atob(result.base64 || '');
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: result.mime_type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      alert(e.message || 'Unable to open document.');
    }
  }

  function labelDocumentType(type) {
    const labels = {
      TTT_CERTIFICATE: 'TTT Certificate',
      ACCREDITED_TRAINER_CERTIFICATE: 'Accredited Trainer Certificate',
      RESUME_CV: 'Resume / CV',
      OTHER_RELEVANT_CERTIFICATE: 'Other Relevant Certificate',
      COURSE_CONTENT: 'Course Outline'
    };
    return labels[type] || String(type || '').replaceAll('_',' ');
  }

  function statusBadge(status) {
    const s = String(status || 'PENDING');
    const cls = s === 'VERIFIED' ? 'green' : s === 'REJECTED' || s === 'EXPIRED' ? 'red' : 'amber';
    return `<span class="badge ${cls}">${esc(s.replaceAll('_',' '))}</span>`;
  }

  function renderSupportingDocuments() {
    const trainerList = document.getElementById('adminTrainerList');
    if (!trainerList) return;
    let block = document.getElementById('adminSupportingDocsBlock');
    if (!block) {
      block = document.createElement('div');
      block.id = 'adminSupportingDocsBlock';
      block.style.marginTop = '1.25rem';
      trainerList.insertAdjacentElement('afterend', block);
    }

    const docs = documents.filter(d => d.document_type !== 'COURSE_CONTENT');
    const byTrainer = {};
    docs.forEach(d => (byTrainer[d.trainer_id] ||= []).push(d));
    const trainerIds = Object.keys(byTrainer);

    block.innerHTML = `
      <div class="panel-header" style="margin-top:1rem"><div><h3 style="margin:0">Submitted Trainer Documents</h3><div class="muted">Supporting documents submitted during onboarding. Only EasyLatih admin can access these files.</div></div></div>
      <div class="list">
        ${trainerIds.length ? trainerIds.map(trainerId => {
          const trainer = profiles[trainerId] || {};
          const rows = byTrainer[trainerId].map(d => `
            <div style="display:flex;justify-content:space-between;gap:.75rem;align-items:center;padding:.65rem 0;border-top:1px solid #eef2f7;flex-wrap:wrap">
              <div><strong>${esc(labelDocumentType(d.document_type))}</strong><div class="muted">${esc(d.file_name || '-')} · ${fmt(d.created_at)}</div></div>
              <div class="btn-row" style="margin:0">${statusBadge(d.verification_status)}<button type="button" class="btn btn-soft" data-admin-view-document="${esc(d.id)}">View Document</button></div>
            </div>`).join('');
          return `<div class="list-card"><div class="list-card-top"><div><h3>${esc(trainer.full_name || 'Trainer')}</h3><div class="meta"><span>${esc(trainer.email || '')}</span></div></div></div>${rows}</div>`;
        }).join('') : '<div class="empty">No supporting documents submitted yet.</div>'}
      </div>`;

    block.querySelectorAll('[data-admin-view-document]').forEach(btn => {
      btn.addEventListener('click', () => viewDriveDocument(btn.dataset.adminViewDocument));
    });
  }

  function noteHtml(notes) {
    if (!notes?.length) return '';
    return `<div data-admin-internal-notes class="alert alert-warning" style="margin-top:.75rem"><strong>Internal Notes — EasyLatih only</strong>${notes.map(n => `<div style="margin-top:.45rem"><span class="muted">${fmt(n.created_at)}</span><br>${esc(n.body)}</div>`).join('')}</div>`;
  }

  function injectProposalNotes() {
    const holder = document.getElementById('adminProposalList');
    if (!holder) return;
    holder.querySelectorAll('.list-card').forEach(card => {
      card.querySelector('[data-admin-internal-notes]')?.remove();
      const noteButton = card.querySelector('[data-note]');
      const proposalId = noteButton?.dataset.note;
      const html = noteHtml(internalNotes[proposalId]);
      if (!html) return;
      const row = card.querySelector('.btn-row');
      if (row) row.insertAdjacentHTML('beforebegin', html);
    });
  }

  function programmeIdFromCard(card) {
    const el = card.querySelector('[data-approve-etris],[data-amend],[data-etris-approved],[data-publish],[data-unpublish]');
    if (!el) return '';
    return el.dataset.approveEtris || el.dataset.amend || el.dataset.etrisApproved || el.dataset.publish || el.dataset.unpublish || '';
  }

  function injectProgrammeNotes() {
    const holder = document.getElementById('adminProgrammeList');
    if (!holder) return;
    holder.querySelectorAll('.list-card').forEach(card => {
      card.querySelector('[data-admin-internal-notes]')?.remove();
      const programmeId = programmeIdFromCard(card);
      const proposalId = programmeProposalMap[programmeId];
      const html = noteHtml(internalNotes[proposalId]);
      if (!html) return;
      const rows = card.querySelectorAll('.btn-row');
      const row = rows.length ? rows[rows.length - 1] : null;
      if (row) row.insertAdjacentHTML('beforebegin', html);
    });
  }

  async function loadData() {
    const { data: userData } = await client.auth.getUser();
    if (userData?.user?.app_metadata?.role !== 'admin') return;

    const [profileRes, docRes, noteRes, programmeRes] = await Promise.all([
      client.from('profiles').select('id,full_name,email').limit(500),
      client.from('trainer_documents').select('id,trainer_id,programme_id,document_type,file_name,verification_status,created_at,provider').eq('provider','GOOGLE_DRIVE').order('created_at',{ascending:false}).limit(2000),
      client.from('proposal_comments').select('id,proposal_id,body,created_at').eq('visibility','INTERNAL').order('created_at',{ascending:false}).limit(1000),
      client.from('programmes').select('id,proposal_id').limit(1000)
    ]);

    if (profileRes.error || docRes.error || noteRes.error || programmeRes.error) return;

    profiles = {};
    (profileRes.data || []).forEach(p => profiles[p.id] = p);
    documents = docRes.data || [];
    internalNotes = {};
    (noteRes.data || []).forEach(n => (internalNotes[n.proposal_id] ||= []).push(n));
    programmeProposalMap = {};
    (programmeRes.data || []).forEach(p => { if (p.proposal_id) programmeProposalMap[p.id] = p.proposal_id; });

    renderSupportingDocuments();
    injectProposalNotes();
    injectProgrammeNotes();
  }

  function scheduleRefresh() {
    clearTimeout(timer);
    timer = setTimeout(loadData, 120);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    ['adminProposalList','adminTrainerList','adminProgrammeList'].forEach(id => {
      const holder = document.getElementById(id);
      if (holder) new MutationObserver(scheduleRefresh).observe(holder, { childList: true, subtree: true });
    });
  });
})();
