(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  let snapshot = null;
  let applying = false;
  let timer = null;

  const isNoTtt = value => /^HRD Corp TTT:\s*No$/i.test(String(value || '').trim());

  function latest(docs, type) {
    return docs.filter(d => d.document_type === type && d.programme_id == null)
      .sort((a,b) => new Date(b.created_at) - new Date(a.created_at))[0] || null;
  }

  function setStep(step, state, status, label) {
    if (!step) return;
    const strong = step.querySelector('strong');
    const statusEl = step.querySelector('.journey-step-status');
    const icon = step.querySelector('.journey-icon');
    if (label && strong && strong.textContent !== label) strong.textContent = label;
    ['complete','action','waiting','locked'].forEach(c => step.classList.remove(c));
    step.classList.add(state);
    step.disabled = state === 'locked';
    if (statusEl && statusEl.textContent !== status) statusEl.textContent = status;
    if (icon) icon.textContent = state === 'complete' ? '✓' : state === 'action' ? '!' : state === 'waiting' ? '…' : icon.textContent;
  }

  function removeOnboardingBadge() {
    const nav = document.querySelector('.sidebar [data-nav="onboarding"]');
    nav?.querySelector('.trainer-nav-badge')?.remove();
  }

  function updateTttDocumentField(waiting) {
    const field = document.querySelector('[data-doc-type="TTT_CERTIFICATE"]');
    if (!field) return;
    field.classList.toggle('hidden', waiting);
    let note = document.getElementById('waitingListTttNote');
    if (waiting) {
      if (!note) {
        note = document.createElement('div');
        note.id = 'waitingListTttNote';
        note.className = 'alert alert-info';
        note.style.marginBottom = '.8rem';
        note.innerHTML = '<strong>Trainer Waiting List:</strong> You indicated that you do not currently hold HRD Corp TTT or an official TTT exemption. You may continue your EasyLatih collaboration and programme submissions, but you will remain in the trainer waiting list until this requirement is available and verified.';
        field.parentNode?.insertBefore(note, field);
      }
    } else {
      note?.remove();
    }
  }

  function updateJourney() {
    if (!snapshot || !snapshot.waiting) return;
    const root = document.getElementById('trainerJourneyCard');
    if (!root) return;
    const steps = [...root.querySelectorAll('.journey-step')];
    const docsStep = steps.find(s => s.querySelector('strong')?.textContent.includes('Supporting Documents'));
    const activationStep = steps.find(s => {
      const t = s.querySelector('strong')?.textContent || '';
      return t.includes('Trainer Activation') || t.includes('Trainer Waiting List');
    });
    const cv = latest(snapshot.documents, 'RESUME_CV');
    const cvVerified = cv?.verification_status === 'VERIFIED';
    const cvUploaded = Boolean(cv);

    if (cvVerified) setStep(docsStep, 'complete', 'Resume / CV verified • TTT not held');
    else if (cvUploaded) setStep(docsStep, 'waiting', 'Resume / CV pending verification • TTT not held');
    else setStep(docsStep, 'action', 'Resume / CV required • TTT not held');

    setStep(activationStep, 'waiting', 'Waiting for HRD Corp TTT / official exemption', 'Trainer Waiting List');

    const completed = steps.filter(x => x.classList.contains('complete')).length;
    const summary = document.getElementById('trainerJourneySummary');
    if (summary) summary.textContent = `${completed} of ${steps.length} steps complete`;

    const next = document.getElementById('trainerJourneyNext');
    if (next && snapshot.onboardingComplete && cvVerified) {
      next.innerHTML = '<div class="alert alert-info"><strong>Trainer Waiting List</strong><span>Your onboarding and Resume / CV are complete. You may continue submitting programmes and may also opt into the consultancy pool. Trainer activation will become available once HRD Corp TTT or an official TTT exemption is available and verified.</span></div>';
      removeOnboardingBadge();
    } else if (next && snapshot.onboardingComplete && !cvUploaded) {
      next.innerHTML = '<div class="alert alert-warning"><strong>Your Next Step: Upload Resume / CV</strong><span>You do not need to upload TTT evidence while you are on the trainer waiting list. Please upload your Resume / CV for EasyLatih verification.</span></div>';
    }
  }

  function apply() {
    if (applying || !snapshot) return;
    applying = true;
    try {
      updateTttDocumentField(snapshot.waiting);
      updateJourney();
    } finally {
      applying = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(apply, 80);
  }

  async function load() {
    const { data: auth } = await client.auth.getUser();
    const user = auth?.user;
    if (!user) return;
    const [oRes, dRes, pRes] = await Promise.all([
      client.from('trainer_onboarding').select('ttt_status,onboarding_completed_at').eq('trainer_id', user.id).maybeSingle(),
      client.from('trainer_documents').select('document_type,programme_id,verification_status,created_at').eq('trainer_id', user.id).order('created_at',{ascending:false}).limit(200),
      client.from('profiles').select('collaboration_status,terms_accepted_at').eq('id', user.id).single()
    ]);
    if (oRes.error || dRes.error || pRes.error) return;
    const onboarding = oRes.data || null;
    snapshot = {
      waiting: isNoTtt(onboarding?.ttt_status) && pRes.data?.collaboration_status !== 'ACTIVE',
      onboardingComplete: Boolean(onboarding?.onboarding_completed_at && pRes.data?.terms_accepted_at),
      documents: dRes.data || []
    };
    apply();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList:true, subtree:true });
    setTimeout(apply, 300);
    setTimeout(apply, 1000);
  }

  document.addEventListener('DOMContentLoaded', load);
})();
