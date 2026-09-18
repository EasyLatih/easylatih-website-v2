(() => {
  const $ = id => document.getElementById(id);

  function openCreateOpportunity() {
    const tab = document.querySelector('[data-admin-workflow-tab="OPPORTUNITIES"]');
    tab?.click();

    setTimeout(() => {
      const form = $('createOpportunityForm');
      const panel = form?.closest('.admin-workflow-section') || form?.closest('.panel');
      if (!panel) return;
      panel.classList.remove('admin-tab-hidden', 'is-collapsed');
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const title = form.querySelector('input[name="title"]');
      setTimeout(() => title?.focus(), 250);
    }, 40);
  }

  function build() {
    const summary = $('adminActionSummary');
    if (!summary || $('adminCreateTrainingRequestShortcut')) return false;

    const btn = document.createElement('button');
    btn.id = 'adminCreateTrainingRequestShortcut';
    btn.type = 'button';
    btn.innerHTML = '<strong style="font-size:1.05rem">＋ Create</strong><span>Training request / opportunity</span>';
    btn.title = 'Create a training request and notify matching active trainers';
    btn.addEventListener('click', openCreateOpportunity);
    summary.appendChild(btn);
    return true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (build() || tries >= 40) clearInterval(timer);
    }, 150);
  });
})();
