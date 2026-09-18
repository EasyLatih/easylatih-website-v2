(() => {
  const $ = id => document.getElementById(id);
  const norm = value => String(value || '').toUpperCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const state = { moduleFilter: 'pending', trainerSelected: '', consultancySelected: '', moduleSelected: '', busy:false, timer:null };

  function directCards(holder) {
    return holder ? [...holder.children].filter(el => el.classList?.contains('list-card')) : [];
  }

  function cardTitle(card) {
    return String(card.querySelector('h3')?.textContent || card.querySelector('summary strong')?.textContent || 'Untitled').trim();
  }

  function badgeText(card) {
    return norm(card.querySelector('.badge')?.textContent || card.dataset.recordStatus || '');
  }

  function badgeTone(status) {
    const s=norm(status);
    if (['ACTIVE','APPROVED','PUBLISHED','VERIFIED','APPROVED FOR ETRIS'].some(x=>s.includes(x))) return 'green';
    if (['UNDER REVIEW','SUBMITTED','PENDING','ONBOARDING','SHORTLISTED','CLARIFICATION REQUIRED','READY'].some(x=>s.includes(x))) return 'amber';
    if (['REJECTED','INACTIVE','UNPUBLISHED','WITHDRAWN'].some(x=>s.includes(x))) return 'red';
    return 'blue';
  }

  function trainerGroup(card) {
    const s=badgeText(card);
    if (s.includes('ACTIVE')) return 'Active Trainers';
    if (s.includes('INACTIVE') || s.includes('REJECTED')) return 'Inactive';
    if (s.includes('APPLICANT')) return 'New Applications';
    if (s.includes('ONBOARDING') || s.includes('APPROVED TO COLLAB')) return 'Onboarding';
    return 'Other';
  }

  function firstTrainerCategory(card) {
    return String(card.querySelector('.tag')?.textContent || '').trim();
  }

  function moduleState(card) {
    const source=card.dataset.moduleSource || (card.dataset.programmeId ? 'programme' : 'proposal');
    const s=norm(card.dataset.recordStatus || badgeText(card));
    if (source==='programme') {
      if (s==='PUBLISHED') return 'published';
      if (s==='UNPUBLISHED') return 'archive';
      if (s==='APPROVED') return 'approved';
      return 'pending';
    }
    if (s==='PUBLISHED') return 'published';
    if (['REJECTED','WITHDRAWN','INACTIVE'].includes(s)) return 'archive';
    if (['APPROVED TO COLLAB','ONBOARDING','FULL DETAILS SUBMITTED','APPROVED FOR ETRIS'].includes(s)) return 'approved';
    return 'pending';
  }

  function makeRow(card, group, selectedId, kind) {
    const id = kind==='trainer'
      ? card.dataset.trainerId
      : kind==='consultancy'
        ? card.dataset.trainerId
        : (card.dataset.programmeId || card.dataset.proposalId || cardTitle(card));
    const status = badgeText(card);
    const row = document.createElement('button');
    row.type='button';
    row.className='apple-library-row';
    row.dataset.libraryTarget=id;
    row.dataset.libraryKind=kind;
    row.dataset.libraryGroup=group;
    row.innerHTML = `<span class="apple-library-row-main"><span class="apple-library-row-title">${esc(cardTitle(card))}</span></span><span style="display:flex;align-items:center;gap:.5rem"><span class="apple-library-row-status ${badgeTone(status)}" title="${esc(status)}"></span><span class="apple-library-chevron">›</span></span>`;
    if (String(selectedId)===String(id)) row.classList.add('active');
    return {row,id};
  }

  function buildGroupedIndex(index, entries, selectedId, kind, onSelect) {
    index.innerHTML='';
    const groups=new Map();
    entries.forEach(entry => {
      const group=entry.group || 'Other';
      if(!groups.has(group)) groups.set(group,[]);
      groups.get(group).push(entry.card);
    });
    groups.forEach((cards,group)=>{
      const section=document.createElement('section');
      section.className='apple-library-group';
      section.dataset.libraryGroup=group;
      const title=document.createElement('div');
      title.className='apple-library-group-title';
      title.textContent=group;
      section.appendChild(title);
      cards
        .slice()
        .sort((a,b)=>cardTitle(a).localeCompare(cardTitle(b)))
        .forEach(card=>{
          const {row,id}=makeRow(card,group,selectedId,kind);
          row.addEventListener('click',()=>onSelect(id));
          section.appendChild(row);
        });
      index.appendChild(section);
    });
  }

  function selectInLayout(wrapper,id,kind) {
    if(!wrapper)return;
    wrapper.querySelectorAll('.apple-library-row').forEach(row=>row.classList.toggle('active',String(row.dataset.libraryTarget)===String(id)));
    let selected=null;
    wrapper.querySelectorAll('.apple-library-detail .list-card').forEach(card=>{
      const cardId=kind==='trainer'||kind==='consultancy'
        ? card.dataset.trainerId
        : (card.dataset.programmeId || card.dataset.proposalId || cardTitle(card));
      const active=String(cardId)===String(id);
      card.classList.toggle('apple-selected',active);
      if(card.tagName==='DETAILS') card.open=active;
      if(active) selected=card;
    });
    return selected;
  }

  function enhanceSimpleLibrary(holder,kind,groupFn,rememberKey) {
    if(!holder || holder.querySelector(':scope > .apple-library')) return;
    const cards=directCards(holder);
    if(!cards.length) return;

    holder.querySelector(':scope > .empty')?.remove();
    const wrapper=document.createElement('div');
    wrapper.className='apple-library';
    const index=document.createElement('div');
    index.className='apple-library-index';
    const detail=document.createElement('div');
    detail.className='apple-library-detail';
    wrapper.append(index,detail);
    holder.prepend(wrapper);

    cards.forEach(card=>{
      card.classList.add('apple-detail-card');
      detail.appendChild(card);
    });

    let selected=state[rememberKey];
    const ids=cards.map(card=>kind==='trainer'||kind==='consultancy'?card.dataset.trainerId:(card.dataset.programmeId||card.dataset.proposalId||cardTitle(card)));
    if(!ids.includes(selected)) selected=ids[0] || '';

    const entries=cards.map(card=>({card,group:groupFn(card)}));
    const choose=id=>{
      state[rememberKey]=id;
      selectInLayout(wrapper,id,kind);
    };
    buildGroupedIndex(index,entries,selected,kind,choose);
    choose(selected);
    holder.classList.add('apple-library-ready');
  }

  function restoreModuleCardsBeforeRebuild(host,proposalHolder,programmeHolder) {
    if(!host)return;
    const old=[...host.querySelectorAll('.apple-library-detail .list-card[data-module-source]')];
    if(!old.length)return;
    const freshProposal=directCards(proposalHolder).length>0;
    const freshProgramme=directCards(programmeHolder).length>0;
    old.forEach(card=>{
      const source=card.dataset.moduleSource;
      if(source==='proposal') {
        if(freshProposal) card.remove(); else proposalHolder?.appendChild(card);
      } else {
        if(freshProgramme) card.remove(); else programmeHolder?.appendChild(card);
      }
    });
  }

  function buildModuleLibrary(force=false) {
    const host=$('adminUnifiedModuleLibrary');
    const proposalHolder=$('adminProposalList');
    const programmeHolder=$('adminProgrammeList');
    if(!host||!proposalHolder||!programmeHolder)return;

    const hasFresh=directCards(proposalHolder).length || directCards(programmeHolder).length;
    if(host.querySelector(':scope > .apple-library') && !force && !hasFresh)return;

    if(host.querySelector(':scope > .apple-library')) {
      restoreModuleCardsBeforeRebuild(host,proposalHolder,programmeHolder);
      host.innerHTML='';
    }

    const proposals=directCards(proposalHolder);
    const programmes=directCards(programmeHolder);
    if(!proposals.length&&!programmes.length){
      if(!host.querySelector('.empty')) host.innerHTML='<div class="empty">No modules found.</div>';
      return;
    }

    proposals.forEach(card=>{
      card.dataset.moduleSource='proposal';
      if(!card.dataset.proposalId){
        const id=card.querySelector('[data-approve],[data-clarify],[data-shortlist],[data-reject],[data-note]')?.dataset;
        card.dataset.proposalId=id?.approve||id?.clarify||id?.shortlist||id?.reject||id?.note||'';
      }
      if(!card.dataset.category){
        card.dataset.category=String(card.querySelector('.meta span')?.textContent||'Other').trim();
      }
    });
    programmes.forEach(card=>{
      card.dataset.moduleSource='programme';
      if(!card.dataset.category){
        card.dataset.category=String(card.querySelector('.meta span:nth-of-type(1)')?.textContent||'Other').trim();
      }
    });

    const programmeProposalIds=new Set(programmes.map(c=>c.dataset.proposalId).filter(Boolean));
    const visibleProposals=proposals.filter(c=>!programmeProposalIds.has(c.dataset.proposalId));
    const cards=[...visibleProposals,...programmes];

    proposals.filter(c=>programmeProposalIds.has(c.dataset.proposalId)).forEach(c=>c.classList.add('admin-library-duplicate'));

    const wrapper=document.createElement('div');
    wrapper.className='apple-library';
    const index=document.createElement('div');
    index.className='apple-library-index';
    const detail=document.createElement('div');
    detail.className='apple-library-detail';
    wrapper.append(index,detail);
    host.innerHTML='';
    host.appendChild(wrapper);

    cards.forEach(card=>{
      card.classList.add('apple-detail-card');
      detail.appendChild(card);
    });

    applyModuleFilter();
  }

  function applyModuleFilter() {
    const host=$('adminUnifiedModuleLibrary');
    const wrapper=host?.querySelector(':scope > .apple-library');
    if(!wrapper)return;
    const all=[...wrapper.querySelectorAll('.apple-library-detail .list-card[data-module-source]')];
    const filter=state.moduleFilter||'pending';
    const cards=all.filter(card=>filter==='all'||moduleState(card)===filter);
    all.forEach(card=>card.classList.toggle('admin-record-hidden',!cards.includes(card)));

    const ids=cards.map(card=>card.dataset.programmeId||card.dataset.proposalId||cardTitle(card));
    let selected=state.moduleSelected;
    if(!ids.includes(selected)) selected=ids[0]||'';
    state.moduleSelected=selected;

    const entries=cards.map(card=>({card,group:String(card.dataset.category||'Other').trim()||'Other'}));
    const choose=id=>{
      state.moduleSelected=id;
      selectInLayout(wrapper,id,'module');
    };
    buildGroupedIndex(wrapper.querySelector('.apple-library-index'),entries,selected,'module',choose);

    const detail=wrapper.querySelector('.apple-library-detail');
    detail?.querySelector('[data-library-empty]')?.remove();
    if(selected) choose(selected);
    else if(detail){
      const empty=document.createElement('div');
      empty.className='apple-library-detail-empty';
      empty.dataset.libraryEmpty='1';
      empty.textContent='No modules in this category/status.';
      detail.appendChild(empty);
    }
  }

  function consultancyGroup(card) {
    return String(card.dataset.consultancyCategory||'Other').trim()||'Other';
  }

  function refreshAll() {
    if(state.busy)return;
    state.busy=true;
    try{
      enhanceSimpleLibrary($('adminTrainerList'),'trainer',trainerGroup,'trainerSelected');
      enhanceSimpleLibrary($('adminConsultancyPool'),'consultancy',consultancyGroup,'consultancySelected');
      buildModuleLibrary(false);
      document.body.classList.add('admin-library-enhanced');
    }finally{
      state.busy=false;
    }
  }

  function scheduleRefresh() {
    clearTimeout(state.timer);
    state.timer=setTimeout(refreshAll,100);
  }

  function selectTrainer(id) {
    const wrapper=$('adminTrainerList')?.querySelector(':scope > .apple-library');
    if(!wrapper)return false;
    state.trainerSelected=id;
    selectInLayout(wrapper,id,'trainer');
    wrapper.querySelector('.apple-library-row.active')?.scrollIntoView({block:'nearest'});
    return true;
  }

  function selectModuleCard(card) {
    if(!card)return false;
    const host=$('adminUnifiedModuleLibrary');
    const wrapper=host?.querySelector(':scope > .apple-library');
    if(!wrapper)return false;
    const id=card.dataset.programmeId||card.dataset.proposalId||cardTitle(card);
    state.moduleSelected=id;
    if(state.moduleFilter!=='all' && moduleState(card)!==state.moduleFilter) {
      state.moduleFilter='all';
      document.querySelectorAll('[data-module-library-filter]').forEach(btn=>btn.classList.toggle('active',btn.dataset.moduleLibraryFilter==='all'));
      applyModuleFilter();
    }
    selectInLayout(wrapper,id,'module');
    wrapper.querySelector('.apple-library-row.active')?.scrollIntoView({block:'nearest'});
    return true;
  }

  window.EasyLatihAdminLibrary={
    refresh:refreshAll,
    selectTrainer,
    selectModuleCard,
    setModuleFilter(filter){
      state.moduleFilter=filter||'pending';
      applyModuleFilter();
    }
  };

  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('[data-module-library-filter]').forEach(btn=>btn.addEventListener('click',()=>{
      state.moduleFilter=btn.dataset.moduleLibraryFilter||'pending';
      setTimeout(applyModuleFilter,0);
    }));

    ['adminTrainerList','adminProposalList','adminProgrammeList','adminConsultancyPool'].forEach(id=>{
      const node=$(id);
      if(node)new MutationObserver(mutations=>{
        const directChange=mutations.some(m=>m.target===node);
        if(directChange)scheduleRefresh();
      }).observe(node,{childList:true});
    });
    const consultancyMount=$('adminConsultancyLibraryMount');
    if(consultancyMount)new MutationObserver(()=>scheduleRefresh()).observe(consultancyMount,{childList:true,subtree:true});

    document.addEventListener('admin-dashboard-view',e=>{
      if(['trainers','modules','consultancy'].includes(e.detail?.view)) setTimeout(refreshAll,40);
    });

    setTimeout(refreshAll,160);
    setTimeout(refreshAll,700);
    setTimeout(refreshAll,1500);
  });
})();