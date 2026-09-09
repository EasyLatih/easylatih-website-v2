(() => {
  const TTT_STORAGE_TYPE = 'TTT_CERTIFICATE'; // Legacy storage key: covers TTT certificate OR official HRD Corp TTT exemption evidence.

  function isExempted() {
    const value = String(document.getElementById('onboarding_ttt')?.value || '');
    return /Type:\s*HRD Corp TTT Exempted/i.test(value);
  }

  function updateSupportingDocumentLabel() {
    const field = document.querySelector(`[data-doc-type="${TTT_STORAGE_TYPE}"]`);
    if (!field) return;
    const label = field.querySelector('label');
    const help = field.querySelector('.help');
    const empty = field.querySelector('.empty');
    const exempted = isExempted();

    if (label) {
      label.innerHTML = exempted
        ? 'HRD Corp TTT Exemption Evidence <span class="muted">(required)</span>'
        : 'HRD Corp TTT Certificate / TTT Exemption Evidence <span class="muted">(required)</span>';
    }
    if (help) {
      help.textContent = exempted
        ? 'Upload your official HRD Corp TTT exemption certificate, letter or supporting evidence. PDF, DOC, DOCX, JPG or PNG. Maximum 10 MB.'
        : 'Upload your HRD Corp TTT certificate, or official HRD Corp TTT exemption certificate/letter if you are exempted. PDF, DOC, DOCX, JPG or PNG. Maximum 10 MB.';
    }
    if (empty && !empty.dataset.tttEvidenceText) {
      empty.dataset.tttEvidenceText = '1';
      empty.textContent = 'No TTT certificate / exemption evidence uploaded yet.';
    }
  }

  function updateJourneyWording() {
    const root = document.getElementById('trainerJourneyCard');
    if (!root) return;
    root.querySelectorAll('.journey-step-status').forEach(el => {
      el.textContent = el.textContent
        .replace('TTT & CV verified', 'TTT / Exemption & CV verified')
        .replace('TTT & CV required', 'TTT / Exemption & CV required');
    });
    root.querySelectorAll('.alert span').forEach(el => {
      el.textContent = el.textContent.replace('TTT Certificate', 'TTT certificate / exemption evidence');
    });
  }

  function refresh() {
    updateSupportingDocumentLabel();
    updateJourneyWording();
  }

  document.addEventListener('DOMContentLoaded', () => {
    refresh();
    document.addEventListener('change', e => {
      if (e.target?.id === 'tttQualificationType' || e.target?.name === 'ttt_certified_ui') setTimeout(refresh, 0);
    });
    const observer = new MutationObserver(() => refresh());
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(refresh, 300);
    setTimeout(refresh, 1000);
  });
})();
