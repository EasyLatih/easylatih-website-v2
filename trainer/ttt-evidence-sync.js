(() => {
  const TTT_STORAGE_TYPE = 'TTT_CERTIFICATE'; // Legacy storage key: covers TTT certificate OR official HRD Corp TTT exemption evidence.
  let refreshTimer = null;
  let refreshing = false;

  function isExempted() {
    const value = String(document.getElementById('onboarding_ttt')?.value || '');
    return /Type:\s*HRD Corp TTT Exempted/i.test(value);
  }

  function setHtmlIfChanged(el, html) {
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }

  function setTextIfChanged(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function updateSupportingDocumentLabel() {
    const field = document.querySelector(`[data-doc-type="${TTT_STORAGE_TYPE}"]`);
    if (!field) return;
    const label = field.querySelector('label');
    const help = field.querySelector('.help');
    const empty = field.querySelector('.empty');
    const exempted = isExempted();

    const labelHtml = exempted
      ? 'HRD Corp TTT Exemption Evidence <span class="muted">(required)</span>'
      : 'HRD Corp TTT Certificate / TTT Exemption Evidence <span class="muted">(required)</span>';
    const helpText = exempted
      ? 'Upload your official HRD Corp TTT exemption certificate, letter or supporting evidence. PDF, DOC, DOCX, JPG or PNG. Maximum 10 MB.'
      : 'Upload your HRD Corp TTT certificate, or official HRD Corp TTT exemption certificate/letter if you are exempted. PDF, DOC, DOCX, JPG or PNG. Maximum 10 MB.';

    setHtmlIfChanged(label, labelHtml);
    setTextIfChanged(help, helpText);

    if (empty && !empty.dataset.tttEvidenceText) {
      empty.dataset.tttEvidenceText = '1';
      setTextIfChanged(empty, 'No TTT certificate / exemption evidence uploaded yet.');
    }
  }

  function updateJourneyWording() {
    const root = document.getElementById('trainerJourneyCard');
    if (!root) return;

    root.querySelectorAll('.journey-step-status').forEach(el => {
      const next = el.textContent
        .replace('TTT & CV verified', 'TTT / Exemption & CV verified')
        .replace('TTT & CV required', 'TTT / Exemption & CV required');
      setTextIfChanged(el, next);
    });

    root.querySelectorAll('.alert span').forEach(el => {
      const next = el.textContent.replace('TTT Certificate', 'TTT certificate / exemption evidence');
      setTextIfChanged(el, next);
    });
  }

  function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      updateSupportingDocumentLabel();
      updateJourneyWording();
    } finally {
      refreshing = false;
    }
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, 80);
  }

  document.addEventListener('DOMContentLoaded', () => {
    refresh();
    document.addEventListener('change', e => {
      if (e.target?.id === 'tttQualificationType' || e.target?.name === 'ttt_certified_ui') scheduleRefresh();
    });
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(refresh, 300);
    setTimeout(refresh, 1000);
  });
})();
