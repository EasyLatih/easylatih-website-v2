(() => {
  let timer = null;

  function section() { return document.getElementById('adminScheduledTrainingSection'); }
  function tabs() { return document.getElementById('adminWorkflowTabs'); }

  function countSessions() {
    return document.querySelectorAll('#adminScheduledTrainingList > .list-card').length;
  }

  function updateCount() {
    const badge=document.querySelector('[data-admin-scheduled-tab] .admin-tab-count');
    if(badge)badge.textContent=String(countSessions());
  }

  function hideScheduled() {
    const s=section();
    if(s)s.classList.add('admin-tab-hidden');
    document.querySelector('[data-admin-scheduled-tab]')?.classList.remove('active');
  }

  function showScheduled() {
    const s=section(); if(!s)return;
    document.querySelectorAll('[data-admin-workflow-tab]').forEach(btn=>{
      btn.classList.remove('active');
      btn.setAttribute('aria-selected','false');
    });
    document.querySelectorAll('.admin-workflow-section').forEach(el=>{
      if(el!==s)el.classList.add('admin-tab-hidden');
    });
    s.classList.remove('admin-tab-hidden','is-collapsed');
    const btn=document.querySelector('[data-admin-scheduled-tab]');
    btn?.classList.add('active');
    btn?.setAttribute('aria-selected','true');
    updateCount();
    s.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function ensureTab() {
    const host=tabs(); const s=section();
    if(!host || !s)return false;
    if(!document.querySelector('[data-admin-scheduled-tab]')){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='admin-workflow-tab';
      btn.dataset.adminScheduledTab='1';
      btn.setAttribute('role','tab');
      btn.setAttribute('aria-selected','false');
      btn.innerHTML='<span>Scheduled Training</span><span class="admin-tab-count">0</span>';
      btn.addEventListener('click',showScheduled);
      host.appendChild(btn);
    }
    s.classList.add('admin-tab-hidden');
    updateCount();
    return true;
  }

  function scheduleEnsure(){
    clearTimeout(timer);
    timer=setTimeout(()=>{
      ensureTab();
      updateCount();
    },100);
  }

  document.addEventListener('click',event=>{
    if(event.target.closest?.('[data-admin-workflow-tab]'))hideScheduled();
  },true);

  document.addEventListener('admin-scheduled-training-updated',updateCount);

  document.addEventListener('DOMContentLoaded',()=>{
    if(!ensureTab()){
      const interval=setInterval(()=>{if(ensureTab())clearInterval(interval);},150);
      setTimeout(()=>clearInterval(interval),5000);
    }
    const main=document.querySelector('main');
    if(main)new MutationObserver(scheduleEnsure).observe(main,{childList:true,subtree:true});
  });
})();
