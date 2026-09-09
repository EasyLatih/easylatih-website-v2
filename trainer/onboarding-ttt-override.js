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

  function formatStatus(eligible, qualificationType, accreditation, referenceNo) {
    if (eligible === 'NO') return 'HRD Corp TTT Eligibility: No';
    if (eligible !== 'YES') return '';
    return `HRD Corp TTT Eligibility: Yes | Type: ${qualificationType} | Accreditation: ${accreditation} | Reference No: ${referenceNo}`;
  }

  function parseStatus(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    if (/^HRD Corp TTT Eligibility:\s*No$/i.test(raw) || /^HRD Corp TTT:\s*No$/i.test(raw)) {
      return {eligible:'NO', qualificationType:'', accreditation:'', referenceNo:''};
    }

    const current = raw.match(/^HRD Corp TTT Eligibility:\s*Yes\s*\|\s*Type:\s*(.*?)\s*\|\s*Accreditation:\s*(.*?)\s*\|\s*Reference No:\s*(.+)$/i);
    if (current) {
      return {
        eligible:'YES',
        qualificationType:current[1].trim(),
        accreditation:current[2].trim(),
        referenceNo:current[3].trim()
      };
    }

    // Backward compatibility for the earlier onboarding format.
    const legacy = raw.match(/^HRD Corp TTT:\s*Yes\s*\|\s*Accreditation:\s*(.*?)\s*\|\s*TTT Certificate No:\s*(.+)$/i);
    if (legacy) {
      return {
        eligible:'YES',
        qualificationType:'HRD Corp TTT',
        accreditation:legacy[1].trim(),
        referenceNo:legacy[2].trim()
      };
    }
    return null;
  }

  function updateReferenceLabel() {
    const type = String($('tttQualificationType')?.value || '').trim();
    const label = $('tttReferenceLabel');
    const input = $('tttCertificateNo');
    if (!label || !input) return;
    if (type === 'HRD Corp TTT Exempted') {
      label.textContent = 'TTT Exemption Certificate / Reference No.';
      input.placeholder = 'Enter exemption certificate / reference number';
    } else {
      label.textContent = 'TTT Certificate No.';
      input.placeholder = 'Enter TTT certificate number';
    }
  }

  function syncConditionalFields() {
    const yes = $('tttCertifiedYes')?.checked;
    const details = $('tttCertifiedDetails');
    if (details) details.classList.toggle('hidden', !yes);
    if (!yes) {
      if ($('tttQualificationType')) $('tttQualificationType').value='';
      if ($('tttAccreditationStatus')) $('tttAccreditationStatus').value='';
      if ($('tttCertificateNo')) $('tttCertificateNo').value='';
    }
    updateReferenceLabel();
  }

  function syncHiddenStatus() {
    const hidden = $('onboarding_ttt');
    if (!hidden) return false;
    const eligible = $('tttCertifiedYes')?.checked ? 'YES' : $('tttCertifiedNo')?.checked ? 'NO' : '';
    const qualificationType = String($('tttQualificationType')?.value || '').trim();
    const accreditation = String($('tttAccreditationStatus')?.value || '').trim();
    const referenceNo = String($('tttCertificateNo')?.value || '').trim();
    hidden.value = formatStatus(eligible, qualificationType, accreditation, referenceNo);
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
    if ($('tttCertifiedYes')) $('tttCertifiedYes').checked = parsed.eligible === 'YES';
    if ($('tttCertifiedNo')) $('tttCertifiedNo').checked = parsed.eligible === 'NO';
    if ($('tttQualificationType')) $('tttQualificationType').value = parsed.qualificationType || '';
    if ($('tttAccreditationStatus')) $('tttAccreditationStatus').value = parsed.accreditation || '';
    if ($('tttCertificateNo')) $('tttCertificateNo').value = parsed.referenceNo || '';
    syncConditionalFields();
  }

  function buildTttQuestion() {
    const old = $('onboarding_ttt');
    if (!old || old.dataset.structuredTtt === '1') return;
    const field = old.closest('.field');
    if (!field) return;
    const existingValue = String(old.value || '').trim();

    field.innerHTML = `
      <label>Do you hold HRD Corp TTT or an official HRD Corp TTT Exemption?</label>
      <div style="display:flex;gap:1rem;flex-wrap:wrap;margin:.45rem 0 .25rem">
        <label class="checkbox-row" style="margin:0"><input id="tttCertifiedYes" type="radio" name="ttt_certified_ui" value="YES"><span>Yes</span></label>
        <label class="checkbox-row" style="margin:0"><input id="tttCertifiedNo" type="radio" name="ttt_certified_ui" value="NO"><span>No</span></label>
      </div>
      <span class="help">Select Yes if you either completed HRD Corp Train-The-Trainer (TTT) or have been officially granted TTT Exemption by HRD Corp.</span>
      <div id="tttCertifiedDetails" class="hidden" style="margin-top:.85rem;padding:1rem;border:1px solid #dfe5ec;border-radius:12px;background:#f8fafc">
        <div class="form-grid">
          <div class="field">
            <label>TTT Qualification Type</label>
            <select id="tttQualificationType">
              <option value="">Select type</option>
              <option value="HRD Corp TTT">HRD Corp TTT</option>
              <option value="HRD Corp TTT Exempted">HRD Corp TTT Exempted</option>
            </select>
          </div>
          <div class="field">
            <label>HRD Corp Trainer Status</label>
            <select id="tttAccreditationStatus">
              <option value="">Select status</option>
              <option value="Accredited">Accredited</option>
              <option value="Pre-Accredited">Pre-Accredited</option>
              <option value="Non-Accredited">Non-Accredited</option>
            </select>
          </div>
          <div class="field full">
            <label id="tttReferenceLabel">TTT Certificate No.</label>
            <input id="tttCertificateNo" maxlength="100" autocomplete="off" placeholder="Enter TTT certificate number">
          </div>
        </div>
      </div>
      <input id="onboarding_ttt" data-structured-ttt="1" type="hidden" name="ttt_status" value="">`;

    if (existingValue) $('onboarding_ttt').value = existingValue;
    $('tttCertifiedYes')?.addEventListener('change', () => { syncConditionalFields(); syncHiddenStatus(); });
    $('tttCertifiedNo')?.addEventListener('change', () => { syncConditionalFields(); syncHiddenStatus(); });
    $('tttQualificationType')?.addEventListener('change', () => { updateReferenceLabel(); syncHiddenStatus(); });
    $('tttAccreditationStatus')?.addEventListener('change', syncHiddenStatus);
    $('tttCertificateNo')?.addEventListener('input', syncHiddenStatus);
    restoreFromSavedValue();
  }

  function validateTtt() {
    const eligible = $('tttCertifiedYes')?.checked ? 'YES' : $('tttCertifiedNo')?.checked ? 'NO' : '';
    if (!eligible) {
      showMessage('Please select Yes or No for HRD Corp TTT / TTT Exemption.');
      return false;
    }
    if (eligible === 'YES') {
      if (!String($('tttQualificationType')?.value || '').trim()) {
        showMessage('Please select whether you hold HRD Corp TTT or HRD Corp TTT Exemption.');
        return false;
      }
      if (!String($('tttAccreditationStatus')?.value || '').trim()) {
        showMessage('Please select your HRD Corp trainer status: Accredited, Pre-Accredited or Non-Accredited.');
        return false;
      }
      if (!String($('tttCertificateNo')?.value || '').trim()) {
        showMessage('Please enter your TTT certificate or exemption reference number.');
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
