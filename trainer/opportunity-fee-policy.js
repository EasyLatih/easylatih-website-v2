(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const money = value => `RM ${Number(value || 0).toLocaleString('en-MY')}`;
  let activeOpportunityId = '';
  let activeButton = null;
  let adminTimer = null;

  function injectStyles() {
    if (document.getElementById('opportunityFeePolicyStyles')) return;
    const style = document.createElement('style');
    style.id = 'opportunityFeePolicyStyles';
    style.textContent = `
      #trainerFeeModal{position:fixed;inset:0;background:rgba(15,23,42,.58);z-index:9999;display:none;align-items:center;justify-content:center;padding:1rem}
      #trainerFeeModal.open{display:flex}
      #trainerFeeModal .fee-modal-card{background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(15,23,42,.25);width:min(680px,100%);max-height:90vh;overflow:auto;padding:1.15rem}
      #trainerFeeModal .fee-modal-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;margin-bottom:.9rem}
      #trainerFeeModal .fee-modal-head h3{margin:0;color:#0d3b66}
      #trainerFeeModal .fee-close{border:0;background:#f1f5f9;border-radius:9px;width:36px;height:36px;cursor:pointer;font-size:1.15rem}
      #trainerFeeModal .fee-basis{display:grid;grid-template-columns:1fr 1fr;gap:.65rem;margin:.75rem 0 1rem}
      #trainerFeeModal .fee-basis label{border:1px solid #cbd5e1;border-radius:11px;padding:.75rem;cursor:pointer;font-weight:700}
      #trainerFeeModal .fee-tier{display:grid;grid-template-columns:1fr 1fr 1.25fr auto;gap:.5rem;align-items:end;margin:.55rem 0}
      #trainerFeeModal .fee-tier .field{margin:0}
      #trainerFeeModal .fee-tier-remove{height:42px;border:1px solid #cbd5e1;background:#fff;border-radius:9px;padding:0 .7rem;cursor:pointer}
      #trainerFeeModal .fee-hidden{display:none!important}
      #trainerFeeModal .fee-actions{display:flex;justify-content:flex-end;gap:.55rem;margin-top:1rem}
      .admin-fee-tiers{display:grid;gap:.2rem;min-width:170px}
      .admin-fee-tiers div{font-size:.78rem;line-height:1.3}
      @media(max-width:620px){#trainerFeeModal .fee-basis{grid-template-columns:1fr}#trainerFeeModal .fee-tier{grid-template-columns:1fr 1fr}#trainerFeeModal .fee-tier .fee-amount{grid-column:1/2}#trainerFeeModal .fee-tier-remove{grid-column:2/3}}
    `;
    document.head.appendChild(style);
  }

  function removeAdminFeeFields() {
    const form = document.getElementById('createOpportunityForm');
    if (!form) return false;
    ['trainer_fee_min','trainer_fee_max'].forEach(name => form.querySelector(`[name="${name}"]`)?.closest('.field')?.remove());
    if (!form.querySelector('[data-trainer-fee-note]')) {
      const deadline = form.querySelector('[name="response_deadline"]')?.closest('.field');
      if (deadline) {
        const note = document.createElement('div');
        note.className = 'field full';
        note.dataset.trainerFeeNote = '1';
        note.innerHTML = '<div class="alert alert-info" style="margin:0"><strong>Trainer fee:</strong> EasyLatih does not set a fee range. Each interested trainer submits their own fee proposal, either per day or by trainee-count range.</div>';
        deadline.insertAdjacentElement('afterend', note);
      }
    }
    return true;
  }

  function addTierRow(values={}) {
    const holder = document.getElementById('feeTierRows');
    if (!holder) return;
    const row = document.createElement('div');
    row.className = 'fee-tier';
    row.innerHTML = `
      <div class="field"><label>Min Pax</label><input data-fee-min type="number" min="1" step="1" value="${esc(values.min_pax ?? '')}" placeholder="2"></div>
      <div class="field"><label>Max Pax</label><input data-fee-max type="number" min="1" step="1" value="${esc(values.max_pax ?? '')}" placeholder="10"></div>
      <div class="field fee-amount"><label>Fee (RM)</label><input data-fee-amount type="number" min="1" step="50" value="${esc(values.fee ?? '')}" placeholder="2500"></div>
      <button type="button" class="fee-tier-remove" title="Remove range">×</button>`;
    row.querySelector('.fee-tier-remove')?.addEventListener('click',()=>{
      if (holder.querySelectorAll('.fee-tier').length > 1) row.remove();
      else row.querySelectorAll('input').forEach(i=>i.value='');
    });
    holder.appendChild(row);
  }

  function syncBasis() {
    const basis = document.querySelector('input[name="trainer_fee_basis"]:checked')?.value || 'PER_DAY';
    document.getElementById('feePerDayFields')?.classList.toggle('fee-hidden', basis !== 'PER_DAY');
    document.getElementById('feePaxFields')?.classList.toggle('fee-hidden', basis !== 'PAX_RANGE');
  }

  function buildModal() {
    if (document.getElementById('trainerFeeModal')) return;
    injectStyles();
    const modal = document.createElement('div');
    modal.id = 'trainerFeeModal';
    modal.innerHTML = `
      <div class="fee-modal-card" role="dialog" aria-modal="true" aria-labelledby="trainerFeeModalTitle">
        <div class="fee-modal-head"><div><h3 id="trainerFeeModalTitle">Propose Trainer Fee</h3><div id="trainerFeeOpportunityTitle" class="muted"></div></div><button type="button" class="fee-close" aria-label="Close">×</button></div>
        <div class="muted">Choose how you charge for this training request. You may quote one daily rate or different fees based on trainee-count ranges.</div>
        <div class="fee-basis">
          <label><input type="radio" name="trainer_fee_basis" value="PER_DAY" checked> Per Day</label>
          <label><input type="radio" name="trainer_fee_basis" value="PAX_RANGE"> Based on Number of Trainees</label>
        </div>
        <div id="feePerDayFields"><div class="field"><label>Trainer Fee per Day (RM)</label><input id="trainerDailyRate" type="number" min="1" step="50" placeholder="e.g. 2500"></div></div>
        <div id="feePaxFields" class="fee-hidden">
          <div class="muted">Add as many non-overlapping trainee ranges as needed. Example: 2–10 pax, 11–20 pax, 21–30 pax.</div>
          <div id="feeTierRows"></div>
          <button id="addFeeTier" type="button" class="btn btn-outline" style="margin-top:.55rem">+ Add Fee Range</button>
        </div>
        <div class="field" style="margin-top:.9rem"><label>Remarks / Availability Notes <span class="muted">(Optional)</span></label><textarea id="trainerFeeRemarks" maxlength="1000" placeholder="Any conditions, travel notes, material requirements, etc."></textarea></div>
        <div id="trainerFeeError" class="alert alert-danger fee-hidden"></div>
        <div class="fee-actions"><button type="button" class="btn btn-outline" data-fee-cancel>Cancel</button><button type="button" class="btn btn-primary" id="submitTrainerFee">Submit Interest & Fee Proposal</button></div>
      </div>`;
    document.body.appendChild(modal);
    addTierRow();
    modal.querySelectorAll('input[name="trainer_fee_basis"]').forEach(r=>r.addEventListener('change',syncBasis));
    modal.querySelector('.fee-close')?.addEventListener('click',closeModal);
    modal.querySelector('[data-fee-cancel]')?.addEventListener('click',closeModal);
    modal.addEventListener('click',e=>{ if(e.target===modal) closeModal(); });
    document.getElementById('addFeeTier')?.addEventListener('click',()=>addTierRow());
    document.getElementById('submitTrainerFee')?.addEventListener('click',submitStructuredFee);
  }

  function showError(message='') {
    const el = document.getElementById('trainerFeeError');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('fee-hidden', !message);
  }

  function closeModal() {
    document.getElementById('trainerFeeModal')?.classList.remove('open');
    activeOpportunityId = '';
    activeButton = null;
    showError('');
  }

  async function openModal(button) {
    buildModal();
    activeButton = button;
    activeOpportunityId = button.dataset.interest || '';
    if (!activeOpportunityId) return;
    const card = button.closest('.list-card');
    document.getElementById('trainerFeeOpportunityTitle').textContent = card?.querySelector('h3')?.textContent || '';
    document.querySelector('input[name="trainer_fee_basis"][value="PER_DAY"]').checked = true;
    document.getElementById('trainerDailyRate').value = '';
    document.getElementById('trainerFeeRemarks').value = '';
    const rows = document.getElementById('feeTierRows');
    if (rows) { rows.innerHTML=''; addTierRow(); }
    syncBasis();
    showError('');

    const { data: auth } = await client.auth.getUser();
    const user = auth?.user;
    if (user) {
      const { data } = await client.from('opportunity_responses').select('fee_basis,fee_structure,remarks').eq('opportunity_id',activeOpportunityId).eq('trainer_id',user.id).maybeSingle();
      if (data?.fee_basis === 'PER_DAY' || data?.fee_basis === 'PAX_RANGE') {
        document.querySelector(`input[name="trainer_fee_basis"][value="${data.fee_basis}"]`).checked = true;
        if (data.fee_basis === 'PER_DAY') document.getElementById('trainerDailyRate').value = data.fee_structure?.daily_rate || '';
        if (data.fee_basis === 'PAX_RANGE') {
          rows.innerHTML='';
          const tiers = Array.isArray(data.fee_structure?.tiers) ? data.fee_structure.tiers : [];
          (tiers.length ? tiers : [{}]).forEach(addTierRow);
        }
        document.getElementById('trainerFeeRemarks').value = data.remarks || '';
        syncBasis();
      }
    }

    document.getElementById('trainerFeeModal')?.classList.add('open');
  }

  function collectTiers() {
    const tiers = [...document.querySelectorAll('#feeTierRows .fee-tier')].map(row=>({
      min_pax:Number(row.querySelector('[data-fee-min]')?.value),
      max_pax:Number(row.querySelector('[data-fee-max]')?.value),
      fee:Number(row.querySelector('[data-fee-amount]')?.value)
    }));
    if (!tiers.length || tiers.some(t=>!Number.isInteger(t.min_pax)||!Number.isInteger(t.max_pax)||t.min_pax<1||t.max_pax<t.min_pax||!Number.isFinite(t.fee)||t.fee<=0)) {
      throw new Error('Please complete every trainee range with a valid minimum pax, maximum pax and fee.');
    }
    tiers.sort((a,b)=>a.min_pax-b.min_pax);
    for (let i=1;i<tiers.length;i++) {
      if (tiers[i].min_pax <= tiers[i-1].max_pax) throw new Error('Trainee ranges cannot overlap. Please adjust the min/max pax values.');
    }
    return tiers;
  }

  async function submitStructuredFee() {
    if (!activeOpportunityId) return;
    showError('');
    const basis = document.querySelector('input[name="trainer_fee_basis"]:checked')?.value || 'PER_DAY';
    let structure = {};
    let legacyFee = null;
    try {
      if (basis === 'PER_DAY') {
        const rate = Number(document.getElementById('trainerDailyRate')?.value);
        if (!Number.isFinite(rate) || rate <= 0) throw new Error('Please enter your trainer fee per day.');
        structure = { daily_rate: rate };
        legacyFee = rate;
      } else {
        structure = { tiers: collectTiers() };
      }
    } catch (e) {
      showError(e.message || 'Please complete your fee proposal.');
      return;
    }

    const remarks = String(document.getElementById('trainerFeeRemarks')?.value || '').trim();
    const { data: auth } = await client.auth.getUser();
    const user = auth?.user;
    if (!user) return showError('Please log in again.');
    const btn = document.getElementById('submitTrainerFee');
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = 'Submitting…';

    const { error } = await client.from('opportunity_responses').upsert({
      opportunity_id: activeOpportunityId,
      trainer_id: user.id,
      response: 'INTERESTED',
      proposed_fee: legacyFee,
      fee_basis: basis,
      fee_structure: structure,
      remarks,
      responded_at: new Date().toISOString()
    }, { onConflict:'opportunity_id,trainer_id' });

    btn.disabled = false;
    btn.textContent = oldText;
    if (error) return showError(error.message || 'Unable to submit response.');

    const card = activeButton?.closest('.list-card');
    const row = card?.querySelector('.btn-row');
    if (row) {
      const summary = basis === 'PER_DAY' ? `${money(structure.daily_rate)} / day` : `${structure.tiers.length} pax-based fee range${structure.tiers.length===1?'':'s'}`;
      row.innerHTML = `<span class="badge green">INTERESTED</span><span class="muted">Fee proposal: ${esc(summary)}</span><button type="button" class="btn btn-soft" data-interest="${esc(activeOpportunityId)}">Edit Fee Proposal</button>`;
    }
    closeModal();
    alert('Interest and fee proposal submitted.');
  }

  function installTrainerInterestedOverride() {
    if (!/\/trainer\/dashboard(?:\.html)?$/.test(location.pathname)) return;
    buildModal();
    document.addEventListener('click', event => {
      const button = event.target.closest?.('[data-interest]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      openModal(button);
    }, true);
  }

  function feeHtml(row) {
    if (row?.fee_basis === 'PER_DAY') {
      const rate = Number(row.fee_structure?.daily_rate || row.proposed_fee || 0);
      return rate > 0 ? `<strong>${money(rate)} / day</strong>` : '-';
    }
    if (row?.fee_basis === 'PAX_RANGE') {
      const tiers = Array.isArray(row.fee_structure?.tiers) ? row.fee_structure.tiers : [];
      return tiers.length ? `<div class="admin-fee-tiers"><strong>By trainee range</strong>${tiers.map(t=>`<div>${esc(t.min_pax)}–${esc(t.max_pax)} pax: <strong>${money(t.fee)}</strong></div>`).join('')}</div>` : '-';
    }
    return row?.proposed_fee != null ? money(row.proposed_fee) : '-';
  }

  async function enhanceAdminResponseFees() {
    const holder = document.getElementById('adminOpportunityList');
    if (!holder) return;
    const ids = [...holder.querySelectorAll('[data-award-response]')].map(b=>b.dataset.awardResponse).filter(Boolean);
    if (!ids.length) return;
    const { data,error } = await client.from('opportunity_responses').select('id,fee_basis,fee_structure,proposed_fee').in('id',ids);
    if (error) return;
    const byId = Object.fromEntries((data||[]).map(r=>[r.id,r]));
    holder.querySelectorAll('[data-award-response]').forEach(btn=>{
      const tr = btn.closest('tr');
      const feeCell = tr?.children?.[1];
      const row = byId[btn.dataset.awardResponse];
      if (!feeCell || !row) return;
      const html = feeHtml(row);
      if (feeCell.innerHTML !== html) feeCell.innerHTML = html;
    });
  }

  function installAdminEnhancements() {
    if (!/\/internal\/trainer-admin(?:\.html)?$/.test(location.pathname)) return;
    let attempts=0;
    const initTimer=setInterval(()=>{
      attempts+=1;
      const ready=removeAdminFeeFields();
      if(ready||attempts>=30) clearInterval(initTimer);
    },150);
    removeAdminFeeFields();
    const holder=document.getElementById('adminOpportunityList');
    if(holder){
      new MutationObserver(()=>{
        clearTimeout(adminTimer);
        adminTimer=setTimeout(enhanceAdminResponseFees,120);
      }).observe(holder,{childList:true,subtree:true});
    }
    setTimeout(enhanceAdminResponseFees,400);
    setTimeout(enhanceAdminResponseFees,1200);
  }

  function init() {
    injectStyles();
    installTrainerInterestedOverride();
    installAdminEnhancements();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
