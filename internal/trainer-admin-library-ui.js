(() => {
  const $ = id => document.getElementById(id);
  const norm = value => String(value || '').toUpperCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const PAGE_SIZE = 10;
  const state = {
    trainerPage: 1,
    trainerSelected: '',
    modulePage: 1,
    moduleSelected: '',
    moduleFilter: 'pending',
    consultancyPage: 1,
    consultancySelected: '',
    timer: null,
    busy: false
  };

  function directCards(holder) {
    return holder ? [...holder.children].filter(el => el.classList?.contains('list-card')) : [];
  }

  function holderLoaded(holder) {
    if (!holder) return false;
    if (directCards(holder).length) return true;
    const empty = [...holder.children].find(el => el.classList?.contains('empty'));
    return Boolean(empty && !/loading/i.test(empty.textContent || ''));
  }

  function cardTitle(card) {
    return String(card.querySelector('h3')?.textContent || card.querySelector('summary strong')?.textContent || 'Untitled').trim();
  }

  function badgeText(card) {
    return norm(card.dataset.recordStatus || card.querySelector('.badge')?.textContent || '');
  }

  function badgeTone(status) {
    const s = norm(status);
    if (['ACTIVE','APPROVED','PUBLISHED','VERIFIED','APPROVED FOR ETRIS','READY'].some(x => s.includes(x))) return 'green';
    if (['UNDER REVIEW','SUBMITTED','PENDING','ONBOARDING','SHORTLISTED','CLARIFICATION REQUIRED'].some(x => s.includes(x))) return 'amber';
    if (['REJECTED','INACTIVE','UNPUBLISHED','WITHDRAWN'].some(x => s.includes(x))) return 'red';
    return 'blue';
  }

  function moduleState(card) {
    const source = card.dataset.moduleSource || (card.dataset.programmeId ? 'programme' : 'proposal');
    const s = badgeText(card);
    if (source === 'programme') {
      if (s === 'PUBLISHED') return 'published';
      if (s === 'UNPUBLISHED') return 'archive';
      if (s === 'APPROVED') return 'approved';
      return 'pending';
    }
    if (s === 'PUBLISHED') return 'published';
    if (['REJECTED','WITHDRAWN','INACTIVE'].includes(s)) return 'archive';
    if (['APPROVED TO COLLAB','ONBOARDING','FULL DETAILS SUBMITTED','APPROVED FOR ETRIS'].includes(s)) return 'approved';
    return 'pending';
  }

  function rowHtml(entry, selectedId) {
    const status = entry.status || '';
    return `<button type="button" class="apple-library-row ${String(entry.id) === String(selectedId) ? 'active' : ''}" data-library-target="${esc(entry.id)}">
      <span class="apple-library-row-main">
        <span class="apple-library-row-title">${esc(entry.title)}</span>
        ${entry.meta ? `<span class="apple-library-row-meta">${esc(entry.meta)}</span>` : ''}
      </span>
      <span class="apple-library-row-end"><span class="apple-library-row-status ${badgeTone(status)}" title="${esc(norm(status))}"></span><span class="apple-library-chevron">›</span></span>
    </button>`;
  }

  function paginatorHtml(page,totalPages,start,end,total) {
    if (!total) return '';
    return `<div class="apple-library-pagination">
      <div class="apple-library-page-count">${start + 1}–${end} of ${total}</div>
      <div class="apple-library-page-actions">
        <button type="button" class="btn btn-soft" data-page-delta="-1" ${page <= 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${page} of ${totalPages}</span>
        <button type="button" class="btn btn-soft" data-page-delta="1" ${page >= totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>`;
  }

  function renderIndex(index, entries, options) {
    const {
      pageKey, selectedKey, grouped = false, onSelect, onPage,
      emptyText = 'No records found.'
    } = options;
    const sorted = entries.slice().sort((a,b) => {
      const groupCompare = String(a.group || '').localeCompare(String(b.group || ''));
      return grouped && groupCompare ? groupCompare : String(a.title || '').localeCompare(String(b.title || ''));
    });
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state[pageKey] = Math.min(Math.max(1, state[pageKey] || 1), totalPages);
    const page = state[pageKey];
    const start = (page - 1) * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, total);
    const pageEntries = sorted.slice(start,end);

    if (!pageEntries.some(x => String(x.id) === String(state[selectedKey]))) {
      state[selectedKey] = pageEntries[0]?.id || '';
    }

    let body = '';
    if (!pageEntries.length) {
      body = `<div class="apple-library-index-empty">${esc(emptyText)}</div>`;
    } else if (grouped) {
      let current = null;
      pageEntries.forEach(entry => {
        const group = entry.group || 'Other';
        if (group !== current) {
          current = group;
          body += `<div class="apple-library-group-title">${esc(group)}</div>`;
        }
        body += rowHtml(entry,state[selectedKey]);
      });
    } else {
      body = pageEntries.map(entry => rowHtml(entry,state[selectedKey])).join('');
    }

    index.innerHTML = `<div class="apple-library-index-list">${body}</div>${paginatorHtml(page,totalPages,start,end,total)}`;

    index.onclick = event => {
      const row = event.target.closest('[data-library-target]');
      if (row) {
        onSelect(row.dataset.libraryTarget);
        return;
      }
      const pageButton = event.target.closest('[data-page-delta]');
      if (pageButton && !pageButton.disabled) {
        const next = state[pageKey] + Number(pageButton.dataset.pageDelta || 0);
        state[pageKey] = Math.min(Math.max(1,next),totalPages);
        onPage();
      }
    };

    return pageEntries;
  }

  function selectCards(wrapper, selectedCards) {
    const selected = new Set(selectedCards || []);
    wrapper.querySelectorAll('.apple-library-detail > .list-card').forEach(card => {
      const active = selected.has(card);
      card.classList.toggle('apple-selected',active);
      if (card.tagName === 'DETAILS') card.open = active;
    });
  }

  function createWrapper(holder) {
    holder.querySelector(':scope > .empty')?.remove();
    const wrapper = document.createElement('div');
    wrapper.className = 'apple-library';
    const index = document.createElement('div');
    index.className = 'apple-library-index';
    const detail = document.createElement('div');
    detail.className = 'apple-library-detail';
    wrapper.append(index,detail);
    holder.prepend(wrapper);
    return {wrapper,index,detail};
  }

  function buildTrainerLibrary() {
    const holder = $('adminTrainerList');
    if (!holder) return;
    if (holder.querySelector(':scope > .apple-library')) return;
    const cards = directCards(holder);
    if (!cards.length) return;

    const {wrapper,index,detail} = createWrapper(holder);
    cards.forEach(card => {
      card.classList.add('apple-detail-card');
      detail.appendChild(card);
    });

    const entries = cards.map(card => ({
      id: card.dataset.trainerId || cardTitle(card),
      title: cardTitle(card),
      status: badgeText(card),
      card
    }));

    function select(id) {
      state.trainerSelected = id;
      const entry = entries.find(x => String(x.id) === String(id));
      selectCards(wrapper,entry ? [entry.card] : []);
      index.querySelectorAll('.apple-library-row').forEach(row => row.classList.toggle('active',row.dataset.libraryTarget === String(id)));
    }

    function renderPage() {
      renderIndex(index,entries,{
        pageKey:'trainerPage',
        selectedKey:'trainerSelected',
        grouped:false,
        onSelect:select,
        onPage:renderPage,
        emptyText:'No matching trainers.'
      });
      select(state.trainerSelected);
    }

    wrapper._trainerRenderPage = renderPage;
    wrapper._trainerEntries = entries;
    renderPage();
    holder.classList.add('apple-library-ready');
  }

  function moduleKey(card) {
    return card.dataset.programmeId || card.dataset.proposalId || cardTitle(card);
  }

  function extractOldModuleCards(host,source) {
    return [...host.querySelectorAll(`.apple-library-detail > .list-card[data-module-source="${source}"]`)];
  }

  function buildModuleLibrary() {
    const host = $('adminUnifiedModuleLibrary');
    const proposalHolder = $('adminProposalList');
    const programmeHolder = $('adminProgrammeList');
    if (!host || !proposalHolder || !programmeHolder) return;

    const freshProposals = directCards(proposalHolder);
    const freshProgrammes = directCards(programmeHolder);
    const oldWrapper = host.querySelector(':scope > .apple-library');
    const oldProposals = oldWrapper ? extractOldModuleCards(host,'proposal') : [];
    const oldProgrammes = oldWrapper ? extractOldModuleCards(host,'programme') : [];

    const proposalLoaded = holderLoaded(proposalHolder);
    const programmeLoaded = holderLoaded(programmeHolder);
    const hasFresh = freshProposals.length || freshProgrammes.length || proposalLoaded || programmeLoaded;

    if (oldWrapper && !hasFresh) return;

    let proposals = proposalLoaded ? freshProposals : (freshProposals.length ? freshProposals : oldProposals);
    let programmes = programmeLoaded ? freshProgrammes : (freshProgrammes.length ? freshProgrammes : oldProgrammes);

    oldWrapper?.remove();
    host.innerHTML = '';

    proposals.forEach(card => {
      card.dataset.moduleSource = 'proposal';
      if (!card.dataset.proposalId) {
        const el = card.querySelector('[data-approve],[data-clarify],[data-shortlist],[data-reject],[data-note]');
        const d = el?.dataset || {};
        card.dataset.proposalId = d.approve || d.clarify || d.shortlist || d.reject || d.note || '';
      }
    });
    programmes.forEach(card => card.dataset.moduleSource = 'programme');

    if (!proposals.length && !programmes.length) {
      host.innerHTML = '<div class="empty">No modules found.</div>';
      return;
    }

    const proposalsById = new Map(proposals.filter(c=>c.dataset.proposalId).map(c=>[c.dataset.proposalId,c]));
    const usedProposalIds = new Set();
    const entries = [];

    programmes.forEach(programme => {
      const proposalId = programme.dataset.proposalId || '';
      const proposal = proposalId ? proposalsById.get(proposalId) : null;
      if (proposalId) usedProposalIds.add(proposalId);
      if (proposal) proposal.dataset.moduleDuplicate = '1';
      entries.push({
        id: moduleKey(programme),
        title: cardTitle(programme),
        group: String(programme.dataset.category || 'Other').trim() || 'Other',
        status: badgeText(programme),
        primary: programme,
        cards: proposal ? [programme,proposal] : [programme],
        state: moduleState(programme)
      });
    });

    proposals.filter(proposal => !usedProposalIds.has(proposal.dataset.proposalId)).forEach(proposal => {
      entries.push({
        id: moduleKey(proposal),
        title: cardTitle(proposal),
        group: String(proposal.dataset.category || 'Other').trim() || 'Other',
        status: badgeText(proposal),
        primary: proposal,
        cards: [proposal],
        state: moduleState(proposal)
      });
    });

    const {wrapper,index,detail} = createWrapper(host);
    [...programmes,...proposals].forEach(card => {
      card.classList.add('apple-detail-card');
      detail.appendChild(card);
    });

    function filteredEntries() {
      const filter = state.moduleFilter || 'pending';
      return entries.filter(entry => filter === 'all' || entry.state === filter);
    }

    function select(id) {
      state.moduleSelected = id;
      const entry = entries.find(x => String(x.id) === String(id));
      selectCards(wrapper,entry?.cards || []);
      index.querySelectorAll('.apple-library-row').forEach(row => row.classList.toggle('active',row.dataset.libraryTarget === String(id)));
      detail.querySelectorAll('.admin-linked-proposal-label').forEach(el=>el.remove());
      if (entry?.cards?.length > 1) {
        const proposal = entry.cards.find(card => card.dataset.moduleSource === 'proposal');
        if (proposal) {
          const label = document.createElement('div');
          label.className = 'admin-linked-proposal-label';
          label.textContent = 'Original Proposal & Review History';
          proposal.insertAdjacentElement('beforebegin',label);
        }
      }
    }

    function renderPage() {
      const filtered = filteredEntries();
      renderIndex(index,filtered,{
        pageKey:'modulePage',
        selectedKey:'moduleSelected',
        grouped:true,
        onSelect:select,
        onPage:renderPage,
        emptyText:'No modules in this status.'
      });
      select(state.moduleSelected);
    }

    wrapper.dataset.moduleLibrary = '1';
    wrapper._moduleRenderPage = renderPage;
    wrapper._moduleEntries = entries;
    renderPage();
  }

  function buildConsultancyLibrary() {
    const holder = $('adminConsultancyPool');
    if (!holder || holder.querySelector(':scope > .apple-library')) return;
    const cards = directCards(holder);
    if (!cards.length) return;

    const {wrapper,index,detail} = createWrapper(holder);
    cards.forEach(card => {
      card.classList.add('apple-detail-card');
      detail.appendChild(card);
    });

    const entries = cards.map(card => ({
      id: card.dataset.trainerId || cardTitle(card),
      title: cardTitle(card),
      group: String(card.dataset.consultancyCategory || 'Other').trim() || 'Other',
      status: badgeText(card) || 'ACTIVE',
      card
    }));

    function select(id) {
      state.consultancySelected = id;
      const entry = entries.find(x => String(x.id) === String(id));
      selectCards(wrapper,entry ? [entry.card] : []);
      index.querySelectorAll('.apple-library-row').forEach(row => row.classList.toggle('active',row.dataset.libraryTarget === String(id)));
    }

    function renderPage() {
      renderIndex(index,entries,{
        pageKey:'consultancyPage',
        selectedKey:'consultancySelected',
        grouped:true,
        onSelect:select,
        onPage:renderPage,
        emptyText:'No consultancy profiles found.'
      });
      select(state.consultancySelected);
    }

    renderPage();
    holder.classList.add('apple-library-ready');
  }

  function refreshAll() {
    if (state.busy) return;
    state.busy = true;
    try {
      buildTrainerLibrary();
      buildModuleLibrary();
      buildConsultancyLibrary();
      document.body.classList.add('admin-library-enhanced');
    } finally {
      state.busy = false;
    }
  }

  function scheduleRefresh() {
    clearTimeout(state.timer);
    state.timer = setTimeout(refreshAll,100);
  }

  function activateTrainerTab(status) {
    const target = status || 'ALL';
    state.trainerPage = 1;
    state.trainerSelected = '';
    document.querySelectorAll('[data-trainer-library-tab]').forEach(btn => {
      const active = btn.dataset.trainerLibraryTab === target;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',active ? 'true' : 'false');
    });
    const select = $('trainerStatusFilter');
    if (select && select.value !== target) {
      select.value = target;
      select.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }

  function setModuleFilter(filter) {
    state.moduleFilter = filter || 'pending';
    state.modulePage = 1;
    state.moduleSelected = '';
    const wrapper = $('adminUnifiedModuleLibrary')?.querySelector(':scope > .apple-library');
    if (wrapper?._moduleRenderPage) wrapper._moduleRenderPage();
  }

  function selectTrainer(id) {
    const holder = $('adminTrainerList');
    const wrapper = holder?.querySelector(':scope > .apple-library');
    if (!wrapper) return false;
    const entries=(wrapper._trainerEntries||[]).slice().sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')));
    const index=entries.findIndex(entry=>String(entry.id)===String(id));
    if(index<0)return false;
    state.trainerPage=Math.floor(index/PAGE_SIZE)+1;
    state.trainerSelected=id;
    wrapper._trainerRenderPage?.();
    return true;
  }

  function selectModuleCard(card) {
    if (!card) return false;
    const wrapper = $('adminUnifiedModuleLibrary')?.querySelector(':scope > .apple-library');
    if (!wrapper) return false;
    const entries=wrapper._moduleEntries||[];
    let entry=entries.find(item=>item.cards?.includes(card));
    if(!entry){
      const id=moduleKey(card);
      entry=entries.find(item=>String(item.id)===String(id));
    }
    if(!entry)return false;
    if(state.moduleFilter!=='all'&&entry.state!==state.moduleFilter){
      state.moduleFilter='all';
      document.querySelectorAll('[data-module-library-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.moduleLibraryFilter==='all'));
    }
    const filtered=entries.filter(item=>state.moduleFilter==='all'||item.state===state.moduleFilter)
      .slice().sort((a,b)=>{
        const groupCompare=String(a.group||'').localeCompare(String(b.group||''));
        return groupCompare||String(a.title||'').localeCompare(String(b.title||''));
      });
    const index=filtered.findIndex(item=>item===entry);
    state.modulePage=index>=0?Math.floor(index/PAGE_SIZE)+1:1;
    state.moduleSelected=entry.id;
    wrapper._moduleRenderPage?.();
    return true;
  }

  window.EasyLatihAdminLibrary = {
    refresh: refreshAll,
    selectTrainer,
    selectModuleCard,
    setModuleFilter,
    activateTrainerTab
  };

  document.addEventListener('DOMContentLoaded',() => {
    document.querySelectorAll('[data-trainer-library-tab]').forEach(btn => {
      btn.addEventListener('click',() => activateTrainerTab(btn.dataset.trainerLibraryTab));
    });

    ['trainerSearch','trainerCategoryFilter'].forEach(id => {
      const control = $(id);
      if (control) {
        const eventName = id === 'trainerSearch' ? 'input' : 'change';
        control.addEventListener(eventName,() => {
          state.trainerPage = 1;
          state.trainerSelected = '';
        });
      }
    });

    document.querySelectorAll('[data-module-library-filter]').forEach(btn => {
      btn.addEventListener('click',() => setModuleFilter(btn.dataset.moduleLibraryFilter || 'pending'));
    });

    ['adminTrainerList','adminProposalList','adminProgrammeList','adminConsultancyPool'].forEach(id => {
      const node = $(id);
      if (!node) return;
      new MutationObserver(mutations => {
        if (mutations.some(m => m.target === node)) scheduleRefresh();
      }).observe(node,{childList:true});
    });

    const consultancyMount = $('adminConsultancyLibraryMount');
    if (consultancyMount) new MutationObserver(()=>scheduleRefresh()).observe(consultancyMount,{childList:true,subtree:true});

    document.addEventListener('admin-dashboard-view',event => {
      if (['trainers','modules','consultancy'].includes(event.detail?.view)) setTimeout(refreshAll,40);
    });

    setTimeout(refreshAll,160);
    setTimeout(refreshAll,700);
    setTimeout(refreshAll,1500);
  });
})();