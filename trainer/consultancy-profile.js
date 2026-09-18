(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const $ = id => document.getElementById(id);
  let user = null;
  let saved = null;

  function injectStyles() {
    if ($('consultancyProfileStyles')) return;
    const style = document.createElement('style');
    style.id = 'consultancyProfileStyles';
    style.textContent = `
      #consultancyProfileCard{padding:0;overflow:hidden}
      #consultancyProfileCard .consultancy-head{width:100%;border:0;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.05rem;text-align:left;cursor:pointer;color:inherit}
      #consultancyProfileCard .consultancy-head:hover{background:#f8fafc}
      #consultancyProfileCard .consultancy-title{display:flex;align-items:center;gap:.7rem;min-width:0}
      #consultancyProfileCard .consultancy-title strong{color:#17324d}
      #consultancyProfileCard .consultancy-icon{width:30px;height:30px;border-radius:999px;background:#e0f2fe;color:#075985;display:inline-flex;align-items:center;justify-content:center;font-weight:900;flex:0 0 auto}
      #consultancyProfileCard .consultancy-meta{display:flex;align-items:center;gap:.55rem;flex:0 0 auto}
      #consultancyProfileCard .consultancy-status{display:inline-flex;align-items:center;border-radius:999px;padding:.27rem .58rem;font-size:.72rem;font-weight:800;background:#e2e8f0;color:#475569;white-space:nowrap}
      #consultancyProfileCard .consultancy-status.available{background:#dcfce7;color:#166534}
      #consultancyProfileCard .consultancy-status.unavailable{background:#f1f5f9;color:#64748b}
      #consultancyProfileCard .consultancy-chevron{transition:transform .18s ease;color:#64748b}
      #consultancyProfileCard.open .consultancy-chevron{transform:rotate(180deg)}
      #consultancyProfileBody{display:none;padding:0 1.05rem 1.05rem}
      #consultancyProfileCard.open #consultancyProfileBody{display:block}
      #consultancyDetails.hidden{display:none!important}
      @media(max-width:620px){#consultancyProfileCard .consultancy-head{padding:.9rem}.consultancy-status{font-size:.68rem}}
    `;
    document.head.appendChild(style);
  }

  function setMessage(text, type='info') {
    const el = $('consultancyProfileMessage');
    if (!el) return;
    el.className = text ? `alert alert-${type}` : 'hidden';
    el.textContent = text || '';
  }

  function buildCard() {
    if ($('consultancyProfileCard')) return true;
    const onboardingForm = $('onboardingForm');
    if (!onboardingForm) return false;
    injectStyles();

    const card = document.createElement('div');
    card.id = 'consultancyProfileCard';
    card.className = 'form-card';
    card.style.marginTop = '1rem';
    card.innerHTML = `
      <button type="button" class="consultancy-head" id="consultancyProfileToggle" aria-expanded="false">
        <span class="consultancy-title"><span class="consultancy-icon">C</span><span><strong>Optional: Consultancy Profile</strong><span class="muted" style="display:block;margin-top:.12rem">Join EasyLatih's consultant pool for suitable consultancy assignments.</span></span></span>
        <span class="consultancy-meta"><span id="consultancyProfileStatus" class="consultancy-status">Optional</span><span class="consultancy-chevron">⌄</span></span>
      </button>
      <div id="consultancyProfileBody">
        <div id="consultancyProfileMessage" class="hidden"></div>
        <div class="field full">
          <label>Are you available for consultancy assignments?</label>
          <div style="display:flex;gap:1rem;flex-wrap:wrap;margin:.45rem 0 .25rem">
            <label class="checkbox-row" style="margin:0"><input id="consultancyAvailableYes" type="radio" name="consultancy_available" value="YES"><span>Yes</span></label>
            <label class="checkbox-row" style="margin:0"><input id="consultancyAvailableNo" type="radio" name="consultancy_available" value="NO"><span>No</span></label>
          </div>
          <span class="help">Optional. This does not affect your trainer onboarding or trainer activation status.</span>
        </div>
        <div id="consultancyDetails" class="hidden" style="margin-top:.8rem">
          <div class="form-grid">
            <div class="field full"><label>Consultancy Areas / Services</label><textarea id="consultancySummary" maxlength="1200" placeholder="Briefly summarise the consultancy work you can provide, e.g. HR policy review, payroll process improvement, SOP development, business process review."></textarea><span class="help">Keep it concise. EasyLatih will use this to match suitable client requests.</span></div>
            <div class="field full"><label>Typical Deliverables</label><textarea id="consultancyDeliverables" maxlength="1200" placeholder="Briefly summarise expected deliverables, e.g. gap analysis report, revised SOP, policy document, implementation roadmap, advisory sessions."></textarea></div>
            <div class="field"><label>Indicative Rate Basis</label><select id="consultancyRateBasis"><option value="">Select rate basis</option><option value="HOURLY">Per Hour</option><option value="HALF_DAY">Half Day</option><option value="DAILY">Per Day</option><option value="PROJECT">Per Project</option><option value="NEGOTIABLE">Negotiable</option></select></div>
            <div class="field"><label>Indicative Rate (RM)</label><input id="consultancyRateAmount" type="number" min="0" step="50" placeholder="e.g. 1500"><span class="help">Leave blank only if you select Negotiable.</span></div>
            <div class="field full"><label>Rate Notes <span class="muted">(optional)</span></label><input id="consultancyRateNotes" maxlength="300" placeholder="e.g. Excludes travel and accommodation / final fee depends on project scope"></div>
          </div>
        </div>
        <div class="btn-row"><button id="saveConsultancyProfile" type="button" class="btn btn-primary">Save Consultancy Profile</button></div>
      </div>`;

    const anchor = $('supportingDocumentsCard') || onboardingForm;
    anchor.insertAdjacentElement('afterend', card);

    $('consultancyProfileToggle')?.addEventListener('click', () => {
      const open = !card.classList.contains('open');
      card.classList.toggle('open', open);
      $('consultancyProfileToggle')?.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    $('consultancyAvailableYes')?.addEventListener('change', syncDetails);
    $('consultancyAvailableNo')?.addEventListener('change', syncDetails);
    $('consultancyRateBasis')?.addEventListener('change', syncRate);
    $('saveConsultancyProfile')?.addEventListener('click', saveProfile);
    return true;
  }

  function syncDetails() {
    const yes = Boolean($('consultancyAvailableYes')?.checked);
    $('consultancyDetails')?.classList.toggle('hidden', !yes);
    updateStatus();
  }

  function syncRate() {
    const negotiable = $('consultancyRateBasis')?.value === 'NEGOTIABLE';
    const amount = $('consultancyRateAmount');
    if (amount) {
      amount.disabled = negotiable;
      if (negotiable) amount.value = '';
    }
  }

  function updateStatus() {
    const status = $('consultancyProfileStatus');
    if (!status) return;
    if ($('consultancyAvailableYes')?.checked) {
      status.className = 'consultancy-status available';
      status.textContent = 'Consultant Pool: Yes';
    } else if ($('consultancyAvailableNo')?.checked) {
      status.className = 'consultancy-status unavailable';
      status.textContent = 'Not Available';
    } else {
      status.className = 'consultancy-status';
      status.textContent = 'Optional';
    }
  }

  function fill(row) {
    saved = row || null;
    if (!row) {
      updateStatus();
      return;
    }
    if (row.available_for_consultancy) $('consultancyAvailableYes').checked = true;
    else $('consultancyAvailableNo').checked = true;
    $('consultancySummary').value = row.consultancy_summary || '';
    $('consultancyDeliverables').value = row.deliverables_summary || '';
    $('consultancyRateBasis').value = row.rate_basis || '';
    $('consultancyRateAmount').value = row.rate_amount ?? '';
    $('consultancyRateNotes').value = row.rate_notes || '';
    syncDetails();
    syncRate();
  }

  async function loadProfile() {
    if (!user) return;
    const { data, error } = await client.from('trainer_consultancy_profiles').select('*').eq('trainer_id', user.id).maybeSingle();
    if (error) return setMessage(error.message || 'Unable to load consultancy profile.', 'danger');
    fill(data || null);
  }

  async function saveProfile() {
    if (!user) return;
    const yes = Boolean($('consultancyAvailableYes')?.checked);
    const no = Boolean($('consultancyAvailableNo')?.checked);
    if (!yes && !no) return setMessage('Please select Yes or No for consultancy availability.', 'danger');

    const summary = String($('consultancySummary')?.value || '').trim();
    const deliverables = String($('consultancyDeliverables')?.value || '').trim();
    const rateBasis = String($('consultancyRateBasis')?.value || '').trim();
    const rateRaw = String($('consultancyRateAmount')?.value || '').trim();
    const rateNotes = String($('consultancyRateNotes')?.value || '').trim();

    if (yes) {
      if (!summary) return setMessage('Please summarise the consultancy work you can provide.', 'danger');
      if (!deliverables) return setMessage('Please summarise your typical consultancy deliverables.', 'danger');
      if (!rateBasis) return setMessage('Please select an indicative rate basis.', 'danger');
      if (rateBasis !== 'NEGOTIABLE' && (!rateRaw || Number(rateRaw) < 0)) return setMessage('Please enter your indicative consultancy rate.', 'danger');
    }

    const btn = $('saveConsultancyProfile');
    const old = btn?.textContent || 'Save Consultancy Profile';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    setMessage('Saving consultancy profile…', 'info');
    const now = new Date().toISOString();
    const payload = {
      trainer_id: user.id,
      available_for_consultancy: yes,
      consultancy_summary: yes ? summary : null,
      deliverables_summary: yes ? deliverables : null,
      rate_basis: yes ? rateBasis : null,
      rate_amount: yes && rateBasis !== 'NEGOTIABLE' && rateRaw ? Number(rateRaw) : null,
      rate_notes: yes && rateNotes ? rateNotes : null,
      updated_at: now
    };
    const { data, error } = await client.from('trainer_consultancy_profiles').upsert(payload, { onConflict: 'trainer_id' }).select('*').single();
    if (error) {
      setMessage(error.message || 'Unable to save consultancy profile.', 'danger');
      if (btn) { btn.disabled = false; btn.textContent = old; }
      return;
    }
    saved = data;
    setMessage(yes ? 'Consultancy profile saved. You are now available in the EasyLatih consultant pool.' : 'Consultancy preference saved.', 'success');
    updateStatus();
    if (btn) { btn.disabled = false; btn.textContent = 'Saved ✓'; setTimeout(() => btn.textContent = old, 1200); }
  }

  async function init() {
    const auth = await client.auth.getUser();
    user = auth.data?.user || null;
    if (!user) return;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      if (buildCard()) {
        clearInterval(timer);
        await loadProfile();
      } else if (attempts >= 40) clearInterval(timer);
    }, 150);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
