(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

  function removeAdminFeeFields() {
    const form = document.getElementById('createOpportunityForm');
    if (!form) return false;

    ['trainer_fee_min','trainer_fee_max'].forEach(name => {
      form.querySelector(`[name="${name}"]`)?.closest('.field')?.remove();
    });

    if (!form.querySelector('[data-trainer-fee-note]')) {
      const deadline = form.querySelector('[name="response_deadline"]')?.closest('.field');
      if (deadline) {
        const note = document.createElement('div');
        note.className = 'field full';
        note.dataset.trainerFeeNote = '1';
        note.innerHTML = '<div class="alert alert-info" style="margin:0"><strong>Trainer fee:</strong> EasyLatih does not set a fee range here. Interested trainers will propose their own fee when responding.</div>';
        deadline.insertAdjacentElement('afterend', note);
      }
    }
    return true;
  }

  async function submitInterestedResponse(button) {
    const opportunityId = button.dataset.interest;
    if (!opportunityId) return;

    let proposedFee = null;
    while (proposedFee === null) {
      const input = prompt('Proposed trainer fee (RM):', '');
      if (input === null) return;
      const value = Number(String(input).replace(/,/g,'').trim());
      if (Number.isFinite(value) && value > 0) proposedFee = value;
      else alert('Please enter your proposed trainer fee in RM.');
    }

    const remarks = prompt('Any remarks or availability notes? (Optional)', '') || '';
    const { data: auth } = await client.auth.getUser();
    const user = auth?.user;
    if (!user) return alert('Please log in again.');

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Submitting…';

    const { error } = await client.from('opportunity_responses').upsert({
      opportunity_id: opportunityId,
      trainer_id: user.id,
      response: 'INTERESTED',
      proposed_fee: proposedFee,
      remarks,
      responded_at: new Date().toISOString()
    }, { onConflict:'opportunity_id,trainer_id' });

    if (error) {
      button.disabled = false;
      button.textContent = oldText;
      return alert(error.message || 'Unable to submit response.');
    }

    const card = button.closest('.list-card');
    if (card) {
      const row = card.querySelector('.btn-row');
      if (row) row.innerHTML = `<span class="badge green">INTERESTED</span><span class="muted">Proposed fee: RM ${Number(proposedFee).toLocaleString('en-MY')}</span>`;
    }
    alert('Response submitted with your proposed trainer fee.');
  }

  function installTrainerInterestedOverride() {
    if (!/\/trainer\/dashboard(?:\.html)?$/.test(location.pathname)) return;
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-interest]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      submitInterestedResponse(button);
    }, true);
  }

  function init() {
    if (/\/internal\/trainer-admin(?:\.html)?$/.test(location.pathname)) {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (removeAdminFeeFields() || attempts >= 30) clearInterval(timer);
      }, 150);
      removeAdminFeeFields();
    }
    installTrainerInterestedOverride();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
