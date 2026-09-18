(() => {
  function refresh() {
    const block = document.getElementById('adminActivationChecklistBlock');
    if (!block) return;
    block.querySelectorAll('span').forEach(el => {
      if (el.textContent === 'TTT Certificate verified') el.textContent = 'TTT Certificate / Exemption Evidence verified';
    });
    document.querySelectorAll('[data-activate]').forEach(btn => {
      if (btn.title && btn.title.includes('verified TTT')) {
        btn.title = btn.title.replace('verified TTT', 'verified TTT / Exemption evidence');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(refresh, 300);
    setTimeout(refresh, 1000);
  });
})();
