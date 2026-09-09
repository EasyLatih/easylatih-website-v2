(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const $ = id => document.getElementById(id);
  let lastLoadedValue = '';

  function showMessage(text, type='danger') {
    const el = $('onboardingMessage');
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.textContent = text;
    el.scrollIntoView({behavior:'smooth', block:'center'});
  }

  function formatStatus(certified, accreditation, certificateNo) {
    if (certified === 'NO') return 'HRD Corp TTT: No';
    if (certified !== 'YES') return '';
    return `HRD Corp TTT: Yes | Accreditation: ${accreditation} | TTT Certificate No: ${certificateNo}`;
  }

  function parseStatus(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^HRD Corp TTT:\s*No$/i.test(raw)) return {certified:'NO', accreditation:'', certificateNo:''};
    const match = raw.match(/^HRD Corp TTT:\s*Yes\s*\|\s*Accreditation:\s*(.*?)\s*\|\s*TTT Certificate No:\s*(.+)$/i);
    if (match) return {certified:'YES', accreditation:match[1].trim(), certificateNo:match[2].trim()};
    return null;
  }

  function syncConditionalFields() {
    const yes = $('tttCertifiedYes')?.checked;
    const details = $('tttCertifiedDetails');
    if (details) details.classList.toggle('hidden', !yes);
    if (!yes) {
      if ($('tttAccreditationStatus')) $('tttAccreditationStatus').value='';
      if ($('tttCertificateNo')) $('tttCertificateNo').value='';
    }
  }

  function syncHiddenStatus() {
    const hidden = $('onboarding_ttt');
    if (!hidden) return false;
    const certified = $('tttCertifiedYes')?.checked ? 'YES' : $('tttCertifiedNo')?.checked ? 'NO' : '';
    const accreditation = String($('tttAccreditationStatus')?.value || '').trim();
    const certificateNo = String($('tttCertificateNo')?.value || '').trim();
    hidden.value = formatStatus(certified, accreditation, certificateNo);
    return Boolean(hidden.value);
  }

  function restoreFromSavedValue() {
    const hidden = $('onboarding_ttt');
    if (!hidden) return;
    const raw = String(hidden.value || '').trim();
    if (!raw || raw === lastLoadedValue) return;
    const parsed = parseStatus(raw);
    if (!parsed) return;
    lastLoadedValue = raw;
    if ($('tttCertifiedYes')) $('tttCertifiedYes').checked = parsed.certified === 'YES';
    if ($('tttCertifiedNo')) $('tttCertifiedNo').checked = parsed.certified === 'NO';
    if ($('tttAccreditationStatus')) $('tttAccreditationStatus').value = parsed.accreditation || '';
    if ($('tttCertificateNo')) $('tttCertificateNo').value = parsed.certificateNo || '';
    syncConditionalFields();
  }

  function buildTttQuestion() {
    const old = $('onboarding_ttt');
    if (!old || old.dataset.structuredTtt === '1') return;
    const field = old.closest('.field');
    if (!field) return;
    const existingValue = String(old.value || '').trim();

    field.innerHTML = `
      <label>Have you completed HRD Corp Train-The-Trainer (TTT)?</label>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;margin:.45rem 0 .25rem">
        <label class="checkbox-row" style="margin:0"><input id="tttCertifiedYes" type="radio" name="ttt_certified_ui" value="YES"><span>Yes</span></label>
        <label class="checkbox-row" style="margin:0"><input id="tttCertifiedNo" type="radio" name="ttt_certified_ui" value="NO"><span>No</span></label>
      </div>
      <span class="help">Select Yes only if you hold an HRD Corp TTT certificate.</span>
      <div id="tttCertifiedDetails" class="hidden" style="margin-top:.85rem;padding:1rem;border:1px solid #dfe5ec;border-radius:12px;background:#f8fafc">
        <div class="form-grid">
          <div class="field">
            <label>HRD Corp Trainer Status</label>
            <select id="tttAccreditationStatus">
              <option value="">Select status</option>
              <option value="Accredited">Accredited</option>
              <option value="Pre-Accredited">Pre-Accredited</option>
              <option value="Non-Accredited">Non-Accredited</option>
            </select>
          </div>
          <div class="field">
            <label>TTT Certificate No.</label>
            <input id="tttCertificateNo" maxlength="100" autocomplete="off" placeholder="Enter certificate number">
          </div>
        </div>
      </div>
      <input id="onboarding_ttt" data-structured-ttt="1" type="hidden" name="ttt_status" value="">`;

    if (existingValue) $('onboarding_ttt').value = existingValue;
    $('tttCertifiedYes')?.addEventListener('change', () => { syncConditionalFields(); syncHiddenStatus(); });
    $('tttCertifiedNo')?.addEventListener('change', () => { syncConditionalFields(); syncHiddenStatus(); });
    $('tttAccreditationStatus')?.addEventListener('change', syncHiddenStatus);
    $('tttCertificateNo')?.addEventListener('input', syncHiddenStatus);
    restoreFromSavedValue();
  }

  function validateTtt() {
    const certified = $('tttCertifiedYes')?.checked ? 'YES' : $('tttCertifiedNo')?.checked ? 'NO' : '';
    if (!certified) {
      showMessage('Please select Yes or No for HRD Corp TTT.');
      return false;
    }
    if (certified === 'YES') {
      if (!String($('tttAccreditationStatus')?.value || '').trim()) {
        showMessage('Please select your HRD Corp trainer status: Accredited, Pre-Accredited or Non-Accredited.');
        return false;
      }
      if (!String($('tttCertificateNo')?.value || '').trim()) {
        showMessage('Please enter your TTT Certificate No.');
        return false;
      }
    }
    syncHiddenStatus();
    return true;
  }

  function improveSaveBehaviour() {
    const form = $('onboardingForm');
    if (!form || form.dataset.saveFix === '1') return;
    form.dataset.saveFix = '1';
    form.noValidate = true;
    form.addEventListener('submit', event => {
      buildTttQuestion();
      if (!validateTtt()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, true);
  }

  function start() {
    buildTttQuestion();
    improveSaveBehaviour();
    let checks = 0;
    const timer = setInterval(() => {
      buildTttQuestion();
      restoreFromSavedValue();
      improveSaveBehaviour();
      checks += 1;
      if (checks >= 20) clearInterval(timer);
    }, 250);
  }

  document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0));
})();
