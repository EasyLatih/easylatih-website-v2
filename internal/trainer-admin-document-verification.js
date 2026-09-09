(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt',"'":'&#39;','"':'&quot;'}[ch]));
  let adminId = '';
  let profiles = [];
  let documents = [];
  let onboarding = [];
  let agreements = [];
  let timer = null;
  let docsObserver = null;
  let isLoading = false;
  let reloadQueued = false;

  function supportingDocs(trainerId) {
    return documents.filter(d => d.trainer_id === trainerId && d.programme_id == null && d.document_type !== 'COURSE_CONTENT');
  }

  function hasVerified(trainerId, type) {
    return supportingDocs(trainerId).some(d => d.document_type === type && d.verification_status === 'VERIFIED');
  }

  function readiness(trainerId) {
    const o = onboarding.find(x => x.trainer_id === trainerId);
    const terms = agreements.some(a => a.trainer_id === trainerId && a.agreement_type === 'TRAINER_COLLABORATION' && a.accepted_at);
    const completed = Boolean(o?.onboarding_completed_at);
    const ttt = hasVerified(trainerId, 'TTT_CERTIFICATE');
    const resume = hasVerified(trainerId, 'RESUME_CV');
    return {
      ready: terms && completed && ttt && resume,
      terms,
      completed,
      ttt,
      resume
    };
  }

  function checkItem(ok, label) {
    return `<div style="display:flex;gap:.5rem;align-items:center;margin:.25rem 0"><strong style="color:${ok ? '#15803d' : '#b45309'}">${ok ? '✓' : '○'}</strong><span>${esc(label)}</span></div>`;
  }

  function renderActivationChecklist() {
    const trainerList = document.getElementById('adminTrainerList');
    if (!trainerList) return;

    let block = document.getElementById('adminActivationChecklistBlock');
    if (!block) {
      block = document.createElement('div');
      block.id = 'adminActivationChecklistBlock';
      block.style.marginTop = '1.25rem';
      const anchor = document.getElementById('adminSupportingDocsBlock') || trainerList;
      anchor.insertAdjacentElement('afterend', block);
    }

    const trainers = profiles.filter(p => p.id !== adminId && ['APPROVED_TO_COLLAB','ONBOARDING','ACTIVE'].includes(p.collaboration_status));
    const html = `
      <div class="panel-header" style="margin-top:1rem"><div><h3 style="margin:0">Activation Checklist</h3><div class="muted">Trainer can only be activated after all mandatory requirements are complete.</div></div></div>
      <div class="list">
        ${trainers.length ? trainers.map(p => {
          const r = readiness(p.id);
          return `<div class="list-card">
            <div class="list-card-top"><div><h3>${esc(p.full_name || 'Trainer')}</h3><div class="meta"><span>${esc(p.email || '')}</span></div></div><span class="badge ${r.ready ? 'green' : 'amber'}">${r.ready ? 'READY TO ACTIVATE' : 'NOT READY'}</span></div>
            <div style="margin-top:.65rem">
              ${checkItem(r.terms, 'Trainer Collaboration Terms accepted')}
              ${checkItem(r.completed, 'Onboarding completed')}
              ${checkItem(r.ttt, 'TTT Certificate / Exemption Evidence verified')}
              ${checkItem(r.resume, 'Resume / CV verified')}
            </div>
          </div>`;
        }).join('') : '<div class="empty">No trainers currently in onboarding.</div>'}
      </div>`;

    // Avoid needless DOM replacement. Replacing the block on every observer pass
    // was causing the verification status area to visibly flicker.
    if (block.innerHTML !== html) block.innerHTML = html;
  }

  function applyActivationLocks() {
    document.querySelectorAll('[data-activate]').forEach(btn => {
      const trainerId = btn.dataset.activate;
      const r = readiness(trainerId);
      const nextDisabled = !r.ready;
      const nextTitle = r.ready
        ? 'All activation requirements are complete.'
        : 'Complete T&C, onboarding, verified TTT / Exemption evidence and verified Resume / CV first.';
      if (btn.disabled !== nextDisabled) btn.disabled = nextDisabled;
      if (btn.title !== nextTitle) btn.title = nextTitle;
    });
  }

  async function setDocumentStatus(documentId, status) {
    const doc = documents.find(d => d.id === documentId);
    if (!doc) return;
    const action = status === 'VERIFIED' ? 'verify' : 'reject';
    if (!confirm(`${action === 'verify' ? 'Verify' : 'Reject'} ${doc.file_name}?`)) return;

    const { error } = await client
      .from('trainer_documents')
      .update({ verification_status: status, updated_at: new Date().toISOString() })
      .eq('id', documentId);

    if (error) {
      alert(error.message || 'Unable to update document status.');
      return;
    }

    await loadData(true);
  }

  function ensureActionButton(row, id, kind) {
    const attr = kind === 'verify' ? 'data-verify-document' : 'data-reject-document';
    let btn = row.querySelector(`[${attr}="${id}"]`);
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = kind === 'verify' ? 'btn btn-primary' : 'btn btn-outline';
    if (kind === 'verify') btn.dataset.verifyDocument = id;
    else btn.dataset.rejectDocument = id;
    btn.textContent = kind === 'verify' ? 'Verify' : 'Reject';
    btn.addEventListener('click', () => setDocumentStatus(id, kind === 'verify' ? 'VERIFIED' : 'REJECTED'));
    row.appendChild(btn);
    return btn;
  }

  function enhanceDocumentButtons() {
    const block = document.getElementById('adminSupportingDocsBlock');
    if (!block) return;

    block.querySelectorAll('[data-admin-view-document]').forEach(viewBtn => {
      const id = viewBtn.dataset.adminViewDocument;
      const doc = documents.find(d => d.id === id);
      if (!doc || doc.document_type === 'COURSE_CONTENT') return;
      const row = viewBtn.closest('.btn-row');
      if (!row) return;

      const verify = row.querySelector(`[data-verify-document="${id}"]`);
      const reject = row.querySelector(`[data-reject-document="${id}"]`);

      if (doc.verification_status === 'VERIFIED') {
        verify?.remove();
        ensureActionButton(row, id, 'reject');
      } else if (doc.verification_status === 'REJECTED') {
        reject?.remove();
        ensureActionButton(row, id, 'verify');
      } else {
        ensureActionButton(row, id, 'verify');
        ensureActionButton(row, id, 'reject');
      }
    });
  }

  function observeDocsBlock() {
    const block = document.getElementById('adminSupportingDocsBlock');
    if (!block) return false;
    docsObserver?.disconnect();
    docsObserver = new MutationObserver(() => scheduleLoad());
    docsObserver.observe(block, { childList: true, subtree: true });
    return true;
  }

  async function loadData(force = false) {
    if (isLoading) {
      reloadQueued = true;
      return;
    }
    isLoading = true;
    try {
      const { data: userData } = await client.auth.getUser();
      if (userData?.user?.app_metadata?.role !== 'admin') return;
      adminId = userData.user.id;

      const [pRes, dRes, oRes, aRes] = await Promise.all([
        client.from('profiles').select('id,full_name,email,collaboration_status').limit(500),
        client.from('trainer_documents').select('id,trainer_id,programme_id,document_type,file_name,verification_status').order('created_at',{ascending:false}).limit(2000),
        client.from('trainer_onboarding').select('trainer_id,onboarding_completed_at').limit(500),
        client.from('trainer_agreements').select('trainer_id,agreement_type,accepted_at').limit(1000)
      ]);

      if (pRes.error || dRes.error || oRes.error || aRes.error) return;
      profiles = pRes.data || [];
      documents = dRes.data || [];
      onboarding = oRes.data || [];
      agreements = aRes.data || [];

      // Disconnect while this script adjusts its own buttons so its DOM writes do
      // not recursively trigger another database reload.
      docsObserver?.disconnect();
      enhanceDocumentButtons();
      renderActivationChecklist();
      applyActivationLocks();
      observeDocsBlock();
    } finally {
      isLoading = false;
      if (reloadQueued) {
        reloadQueued = false;
        clearTimeout(timer);
        timer = setTimeout(() => loadData(force), 120);
      }
    }
  }

  function scheduleLoad() {
    clearTimeout(timer);
    timer = setTimeout(() => loadData(), 180);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadData(true);
    const trainerList = document.getElementById('adminTrainerList');
    if (trainerList) new MutationObserver(scheduleLoad).observe(trainerList, { childList: true, subtree: true });

    const waitForDocsBlock = setInterval(() => {
      if (!observeDocsBlock()) return;
      clearInterval(waitForDocsBlock);
      scheduleLoad();
    }, 200);
    setTimeout(() => clearInterval(waitForDocsBlock), 10000);
  });
})();
