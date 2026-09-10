(() => {
  const $ = id => document.getElementById(id);
  const state = { view: 'action-required', moduleFilter: 'pending', timer: null, observer: null };
  const normalise = value => String(value || '').toUpperCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();

  function directCards(id) {
    const holder = $(id);
    return holder ? [...holder.children].filter(child => child.classList?.contains('list-card')) : [];
  }

  function badges(card) {
    return [...card.querySelectorAll('.badge')].map(el => normalise(el.textContent));
  }

  function hasAny(values, expected) {
    return expected.some(value => values.includes(value));
  }

  function moduleState(card) {
    const values = badges(card);
    if (card.closest('#adminProposalList')) {
      if (hasAny(values,['PUBLISHED'])) return 'published';
      if (hasAny(values,['REJECTED','WITHDRAWN','INACTIVE'])) return 'archive';
      if (hasAny(values,['APPROVED TO COLLAB','ONBOARDING','FULL DETAILS SUBMITTED','APPROVED FOR ETRIS'])) return 'approved';
      return 'pending';
    }
    if (card.closest('#adminProgrammeList')) {
      if (hasAny(values,['PUBLISHED'])) return 'published';
      if (hasAny(values,['UNPUBLISHED'])) return 'archive';
      if (hasAny(values,['APPROVED'])) return 'approved';
      return 'pending';
    }
    return 'pending';
  }

  function moduleCards() {
    return [...directCards('adminProposalList'), ...directCards('adminProgrammeList')];
  }

  function setView(view, shouldScroll = false) {
    const panel = document.querySelector(`[data-admin-view-panel="${view}"]`);
    if (!panel) return;
    state.view = view;
    document.querySelectorAll('[data-admin-view-panel]').forEach(item => item.classList.toggle('hidden', item !== panel));
    document.querySelectorAll('[data-admin-view]').forEach(button => button.classList.toggle('active', button.dataset.adminView === view));
    document.dispatchEvent(new CustomEvent('admin-dashboard-view',{detail:{view}}));
    if (shouldScroll) panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function setTrainerStatusFilter(status) {
    const select = $('trainerStatusFilter');
    if (!select) return;
    select.value = status || 'ALL';
    select.dispatchEvent(new Event('change',{bubbles:true}));
  }

  function setModuleFilter(filter) {
    state.moduleFilter = filter || 'pending';
    document.querySelectorAll('[data-module-library-filter]').forEach(button => {
      const active = button.dataset.moduleLibraryFilter === state.moduleFilter;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    ['adminProposalPanel','adminProgrammePanel'].forEach(panelId => {
      const panel = $(panelId);
      if (!panel) return;
      const cards = [...panel.querySelectorAll(':scope .list > .list-card')];
      const visible = cards.filter(card => {
        const show = state.moduleFilter === 'all' || moduleState(card) === state.moduleFilter;
        card.classList.toggle('admin-record-hidden', !show);
        return show;
      });
      panel.classList.toggle('admin-module-empty', cards.length > 0 && visible.length === 0);
    });
  }

  function updateModuleCounts() {
    const counts = {pending:0,approved:0,published:0};
    moduleCards().forEach(card => {
      const kind = moduleState(card);
      if (Object.hasOwn(counts,kind)) counts[kind] += 1;
    });
    const targets = {
      adminModulePendingCount: counts.pending,
      adminModuleApprovedCount: counts.approved,
      adminModulePublishedCount: counts.published,
      adminCountModuleReview: counts.pending
    };
    Object.entries(targets).forEach(([id,value]) => { const el=$(id); if(el)el.textContent=String(value); });
    return counts;
  }

  function updateActionCounts() {
    const trainerCount = directCards('adminTrainerList').filter(card => badges(card).includes('APPLICANT')).length;
    const profileChangeCount = directCards('adminCategoryRequestList').length;
    const moduleCounts = updateModuleCounts();
    const opportunityCount = document.querySelectorAll('#adminOpportunityList [data-award-response]').length;
    const targets = {
      adminCountNewTrainers: trainerCount,
      adminCountProfileChanges: profileChangeCount,
      adminCountOpportunityResponses: opportunityCount,
      adminActionBadge: trainerCount + profileChangeCount + moduleCounts.pending + opportunityCount
    };
    Object.entries(targets).forEach(([id,value]) => { const el=$(id); if(el)el.textContent=String(value); });
  }

  function moveDynamicBlocks() {
    const trainerMount = $('adminTrainerReviewMount');
    ['adminSupportingDocsBlock','adminActivationChecklistBlock'].forEach(id => {
      const block = $(id);
      if (block && trainerMount && block.parentElement !== trainerMount) trainerMount.appendChild(block);
    });

    const waiting = $('adminWaitingListSection');
    const waitingMount = $('adminWaitingListMount');
    if (waiting && waitingMount && waiting.parentElement !== waitingMount) waitingMount.appendChild(waiting);

    const consultancy = $('adminConsultancyPoolSection');
    const consultancyMount = $('adminConsultancyLibraryMount');
    if (consultancy && consultancyMount && consultancy.parentElement !== consultancyMount) consultancyMount.appendChild(consultancy);

    const scheduled = $('adminScheduledTrainingSection');
    const scheduledMount = $('adminScheduledTrainingMount');
    if (scheduled && scheduledMount && scheduled.parentElement !== scheduledMount) scheduledMount.appendChild(scheduled);

    const source = $('adminTalentPoolsBlock');
    if (source && !source.children.length) source.style.display = 'none';
  }

  function sync() {
    moveDynamicBlocks();
    setModuleFilter(state.moduleFilter);
    updateActionCounts();
  }

  function scheduleSync() {
    clearTimeout(state.timer);
    state.timer = setTimeout(sync, 80);
  }

  function openTrainer(trainerId) {
    setView('trainers', true);
    setTrainerStatusFilter('ALL');
    setTimeout(() => {
      const card = document.querySelector(`#adminTrainerList [data-trainer-id="${trainerId}"]`);
      if (!card) return;
      if (card.tagName === 'DETAILS') card.open = true;
      card.scrollIntoView({behavior:'smooth',block:'center'});
    }, 160);
  }

  function openModule(title) {
    setView('modules', true);
    setModuleFilter('all');
    setTimeout(() => {
      const card = moduleCards().find(item => String(item.querySelector('h3')?.textContent || '').trim() === String(title || '').trim());
      if (!card) return;
      card.scrollIntoView({behavior:'smooth',block:'center'});
      card.classList.add('admin-search-highlight');
      setTimeout(() => card.classList.remove('admin-search-highlight'), 1600);
    }, 120);
  }

  function viewForCard(card) {
    if (card.closest('#adminOpportunityList')) return 'opportunities';
    if (card.closest('#archivedOpportunityList')) return 'archive';
    if (card.closest('#adminConsultancyPool')) return 'consultancy';
    if (card.closest('#adminProposalList') || card.closest('#adminProgrammeList')) return 'modules';
    return 'trainers';
  }

  function bindControls() {
    document.querySelectorAll('[data-admin-view]').forEach(button => button.addEventListener('click', () => setView(button.dataset.adminView, true)));

    document.querySelectorAll('[data-admin-action-target]').forEach(button => button.addEventListener('click', () => {
      const target = button.dataset.adminActionTarget;
      setView(target, true);
      if (button.dataset.trainerStatus) setTrainerStatusFilter(button.dataset.trainerStatus);
      if (button.dataset.moduleFilter) setModuleFilter(button.dataset.moduleFilter);
      const scrollTarget = $(button.dataset.scrollTarget);
      if (scrollTarget) setTimeout(() => scrollTarget.scrollIntoView({behavior:'smooth',block:'start'}), 140);
    }));

    document.querySelectorAll('[data-module-library-filter]').forEach(button => button.addEventListener('click', () => setModuleFilter(button.dataset.moduleLibraryFilter)));

    document.querySelectorAll('[data-admin-collapse-toggle]').forEach(button => button.addEventListener('click', () => {
      const panel = $(button.dataset.adminCollapseToggle);
      if (!panel) return;
      const collapsed = panel.classList.toggle('is-collapsed');
      button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      button.textContent = collapsed ? 'Open form' : 'Close form';
    }));
    document.querySelectorAll('[data-admin-collapse-open]').forEach(button => button.addEventListener('click', () => {
      const panel = $(button.dataset.adminCollapseOpen);
      const toggle = document.querySelector(`[data-admin-collapse-toggle="${button.dataset.adminCollapseOpen}"]`);
      if (!panel) return;
      panel.classList.remove('is-collapsed');
      if (toggle) { toggle.setAttribute('aria-expanded','true'); toggle.textContent='Close form'; }
      setTimeout(() => panel.scrollIntoView({behavior:'smooth',block:'start'}), 20);
    }));

    document.addEventListener('click', event => {
      const moduleButton = event.target.closest('[data-open-module]');
      if (moduleButton) { event.preventDefault(); openModule(moduleButton.dataset.openModule); return; }
      const trainerButton = event.target.closest('[data-open-trainer-profile]');
      if (trainerButton) { event.preventDefault(); openTrainer(trainerButton.dataset.openTrainerProfile); }
    });

    document.addEventListener('admin-search-target', event => {
      const card = event.detail?.card;
      if (!card) return;
      const view = viewForCard(card);
      setView(view, false);
      if (view === 'modules') setModuleFilter('all');
      if (view === 'trainers') setTrainerStatusFilter('ALL');
      if (card.tagName === 'DETAILS') card.open = true;
    });
  }

  function observe() {
    state.observer?.disconnect();
    state.observer = new MutationObserver(scheduleSync);
    state.observer.observe(document.querySelector('.admin-dashboard-content'), {childList:true,subtree:true,characterData:true});
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindControls();
    observe();
    sync();
    setTimeout(sync, 500);
    setTimeout(sync, 1400);
  });
})();
