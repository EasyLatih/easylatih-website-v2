(() => {
  const TABS = [
    ['NEW','New'],
    ['PENDING','Pending'],
    ['APPROVED','Approved'],
    ['WAITING','Waiting List'],
    ['CONSULTANCY','Consultancy Pool'],
    ['OPPORTUNITIES','Opportunities'],
    ['CLOSED','Closed']
  ];

  const state = { active:'NEW', built:false, timer:null, initialised:false, visited:new Set() };
  const $ = id => document.getElementById(id);
  const norm = value => String(value || '').toUpperCase().replace(/_/g,' ').replace(/\s+/g,' ').trim();
  const badgeTexts = card => [...card.querySelectorAll('.badge')].map(el => norm(el.textContent));
  const hasBadge = (card, value) => badgeTexts(card).includes(norm(value));

  function injectStyles(){
    if ($('adminWorkflowStyles')) return;
    const style = document.createElement('style');
    style.id = 'adminWorkflowStyles';
    style.textContent = `
      #adminWorkflow{margin:1rem 0 1.25rem}
      #adminActionSummary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.7rem;margin-bottom:.9rem}
      #adminActionSummary button{border:1px solid #dfe5ec;background:#fff;border-radius:12px;padding:.85rem .9rem;text-align:left;cursor:pointer;color:inherit}
      #adminActionSummary button:hover{background:#f8fafc;border-color:#cbd5e1}
      #adminActionSummary strong{display:block;font-size:1.25rem;color:#0d3b66;margin-bottom:.15rem}
      #adminActionSummary span{font-size:.78rem;color:#64748b;font-weight:700}
      #adminWorkflowTabs{display:flex;gap:.45rem;overflow-x:auto;padding:.2rem 0 .45rem;scrollbar-width:thin}
      #adminWorkflowTabs .admin-workflow-tab{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:.55rem .8rem;white-space:nowrap;cursor:pointer;font:inherit;font-size:.82rem;font-weight:800;color:#475569;display:inline-flex;align-items:center;gap:.45rem}
      #adminWorkflowTabs .admin-workflow-tab.active{background:#0d3b66;border-color:#0d3b66;color:#fff}
      #adminWorkflowTabs .admin-tab-count{min-width:1.4rem;height:1.4rem;border-radius:999px;padding:0 .35rem;display:inline-flex;align-items:center;justify-content:center;background:#e2e8f0;color:#334155;font-size:.68rem}
      #adminWorkflowTabs .admin-workflow-tab.active .admin-tab-count{background:rgba(255,255,255,.2);color:#fff}
      .admin-tab-hidden{display:none!important}
      .admin-workflow-section{border:1px solid #e2e8f0;border-radius:14px;background:#fff;margin:0 0 .85rem;overflow:hidden}
      .admin-workflow-section.panel{padding:0}
      .admin-workflow-section>.panel-header{margin:0!important;padding:1rem 1.05rem;cursor:pointer;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:1rem}
      .admin-workflow-section>.panel-header:hover{background:#f8fafc}
      .admin-workflow-section>.panel-header h2,.admin-workflow-section>.panel-header h3{margin:0}
      .admin-workflow-controls{display:flex;align-items:center;gap:.5rem;flex:0 0 auto}
      .admin-workflow-section-count{display:inline-flex;align-items:center;justify-content:center;min-width:1.65rem;height:1.65rem;padding:0 .45rem;border-radius:999px;background:#edf2f7;color:#334155;font-size:.72rem;font-weight:800}
      .admin-workflow-chevron{color:#64748b;font-size:1rem;transition:transform .18s ease}
      .admin-workflow-section.is-collapsed>.admin-collapsible-body{display:none}
      .admin-workflow-section:not(.is-collapsed)>.panel-header .admin-workflow-chevron{transform:rotate(180deg)}
      .admin-collapsible-body{padding:0 1.05rem 1.05rem}
      .admin-collapsible-body>.alert:first-child{margin-top:0}
      .admin-collapsible-body>.list{margin-top:.15rem}
      #adminTalentPoolsBlock{margin-top:0!important}
      #adminTalentPoolsBlock>.admin-pool-section{margin-bottom:.85rem}
      @media(max-width:900px){#adminActionSummary{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:560px){#adminActionSummary{grid-template-columns:1fr}#adminWorkflowTabs .admin-workflow-tab{padding:.5rem .68rem}}
    `;
    document.head.appendChild(style);
  }

  function panelByList(id){ return $(id)?.closest('.panel') || null; }
  function createOpportunityPanel(){ return $('createOpportunityForm')?.closest('.panel') || null; }

  function waitingEmails(){
    return new Set([...document.querySelectorAll('#adminWaitingList .list-card')].map(card => {
      const spans=[...card.querySelectorAll('.meta span')].map(x=>String(x.textContent||'').trim().toLowerCase());
      return spans.find(x=>x.includes('@')) || '';
    }).filter(Boolean));
  }

  function trainerEmail(card){
    return [...card.querySelectorAll('.meta span')].map(x=>String(x.textContent||'').trim().toLowerCase()).find(x=>x.includes('@')) || '';
  }

  function classify(card, holderId){
    const statuses = badgeTexts(card);

    if (holderId === 'adminWaitingList') return 'WAITING';
    if (holderId === 'adminConsultancyPool') return 'CONSULTANCY';
    if (holderId === 'adminOpportunityList') return 'OPPORTUNITIES';

    if (holderId === 'adminProposalList') {
      if (statuses.includes('SUBMITTED')) return 'NEW';
      if (statuses.some(x => ['REJECTED','WITHDRAWN'].includes(x))) return 'CLOSED';
      if (statuses.some(x => ['APPROVED TO COLLAB','APPROVED FOR ETRIS','PUBLISHED'].includes(x))) return 'APPROVED';
      return 'PENDING';
    }

    if (holderId === 'adminTrainerList') {
      const email = trainerEmail(card);
      if (email && waitingEmails().has(email)) return 'WAITING';
      if (statuses.includes('APPLICANT') || statuses.includes('REGISTERED')) return 'NEW';
      if (statuses.includes('ACTIVE')) return 'APPROVED';
      if (statuses.some(x => ['INACTIVE','REJECTED'].includes(x))) return 'CLOSED';
      return 'PENDING';
    }

    if (holderId === 'adminProgrammeList') {
      if (statuses.includes('PUBLISHED')) return 'APPROVED';
      if (statuses.includes('UNPUBLISHED')) return 'CLOSED';
      return 'PENDING';
    }

    if (card.closest('#adminSupportingDocsBlock')) {
      if (statuses.some(x => ['PENDING','REJECTED','EXPIRED'].includes(x))) return 'PENDING';
      if (statuses.length && statuses.every(x => x === 'VERIFIED')) return 'APPROVED';
      return 'PENDING';
    }

    if (card.closest('#adminActivationChecklistBlock')) {
      if (statuses.includes('ACTIVE')) return 'APPROVED';
      return 'PENDING';
    }

    return 'PENDING';
  }

  function assignStates(){
    ['adminProposalList','adminTrainerList','adminProgrammeList','adminOpportunityList','adminWaitingList','adminConsultancyPool'].forEach(holderId => {
      const holder=$(holderId); if(!holder)return;
      holder.querySelectorAll(':scope > .list-card').forEach(card => { card.dataset.workflowState = classify(card, holderId); });
    });
    document.querySelectorAll('#adminSupportingDocsBlock .list-card').forEach(card => { card.dataset.workflowState = classify(card,'docs'); });
    document.querySelectorAll('#adminActivationChecklistBlock .list-card').forEach(card => { card.dataset.workflowState = classify(card,'activation'); });
  }

  function directHeader(section){
    return [...section.children].find(el => el.classList?.contains('panel-header')) || null;
  }

  function cleanHeading(header){
    const heading=header?.querySelector('h2,h3');
    if(!heading)return;
    const cleaned=String(heading.textContent||'').replace(/^\s*\d+\.\s*/,'').trim();
    if(heading.textContent!==cleaned) heading.textContent=cleaned;
  }

  function enhanceSection(section){
    if(!section || section.dataset.workflowEnhanced==='1') return;
    const header=directHeader(section);
    if(!header)return;
    cleanHeading(header);
    section.dataset.workflowEnhanced='1';
    section.classList.add('admin-workflow-section','is-collapsed');

    const body=document.createElement('div');
    body.className='admin-collapsible-body';
    let node=header.nextSibling;
    while(node){
      const next=node.nextSibling;
      body.appendChild(node);
      node=next;
    }
    section.appendChild(body);

    const controls=document.createElement('div');
    controls.className='admin-workflow-controls';
    controls.innerHTML='<span class="admin-workflow-section-count">0</span><span class="admin-workflow-chevron">⌄</span>';
    header.appendChild(controls);
    header.addEventListener('click',e=>{
      if(e.target.closest('button,a,input,select,textarea,label')) return;
      section.classList.toggle('is-collapsed');
    });
  }

  function getSections(){
    const sections=[
      panelByList('adminProposalList'),
      panelByList('adminTrainerList'),
      panelByList('adminProgrammeList'),
      $('adminSupportingDocsBlock'),
      $('adminActivationChecklistBlock'),
      $('adminWaitingListSection'),
      $('adminConsultancyPoolSection'),
      createOpportunityPanel(),
      panelByList('adminOpportunityList')
    ].filter(Boolean);
    sections.forEach(enhanceSection);
    return sections;
  }

  function cardsForSection(section){
    return [...section.querySelectorAll('.list-card')].filter(card => !card.closest('.admin-workflow-section') || card.closest('.admin-workflow-section')===section);
  }

  function sectionMode(section){
    if(section.id==='adminWaitingListSection') return 'WAITING';
    if(section.id==='adminConsultancyPoolSection') return 'CONSULTANCY';
    if(section===createOpportunityPanel() || section===panelByList('adminOpportunityList')) return 'OPPORTUNITIES';
    return 'MIXED';
  }

  function visibleCards(section){
    return cardsForSection(section).filter(card => card.dataset.workflowState===state.active);
  }

  function setSectionCount(section,count){
    const counter=directHeader(section)?.querySelector('.admin-workflow-section-count');
    if(counter && counter.textContent!==String(count)) counter.textContent=String(count);
  }

  function updateSections(){
    const sections=getSections();
    sections.forEach(section=>{
      const mode=sectionMode(section);
      const cards=cardsForSection(section);

      if(mode!=='MIXED'){
        const show=mode===state.active;
        section.classList.toggle('admin-tab-hidden',!show);
        cards.forEach(card=>card.classList.remove('admin-tab-hidden'));
        setSectionCount(section,cards.length);
        return;
      }

      if(['WAITING','CONSULTANCY','OPPORTUNITIES'].includes(state.active)){
        section.classList.add('admin-tab-hidden');
        return;
      }

      cards.forEach(card=>card.classList.toggle('admin-tab-hidden',card.dataset.workflowState!==state.active));
      const shown=visibleCards(section);
      section.classList.toggle('admin-tab-hidden',shown.length===0);
      setSectionCount(section,shown.length);
    });

    const host=$('adminTalentPoolsBlock');
    if(host){
      const any=[...host.children].some(el=>!el.classList.contains('admin-tab-hidden'));
      host.classList.toggle('admin-tab-hidden',!any);
    }
  }

  function countState(tab){
    if(tab==='OPPORTUNITIES') return document.querySelectorAll('#adminOpportunityList .list-card').length;
    if(tab==='WAITING') return document.querySelectorAll('#adminWaitingList .list-card').length;
    if(tab==='CONSULTANCY') return document.querySelectorAll('#adminConsultancyPool .list-card').length;
    return [...document.querySelectorAll('[data-workflow-state]')].filter(card=>card.dataset.workflowState===tab).length;
  }

  function updateTabCounts(){
    TABS.forEach(([key])=>{
      const el=document.querySelector(`[data-admin-workflow-tab="${key}"] .admin-tab-count`);
      if(el) el.textContent=String(countState(key));
    });
  }

  function actionCounts(){
    const newProposals=[...document.querySelectorAll('#adminProposalList .list-card')].filter(c=>c.dataset.workflowState==='NEW').length;
    const pendingDocs=[...document.querySelectorAll('#adminSupportingDocsBlock .badge')].filter(b=>norm(b.textContent)==='PENDING').length;
    const readyActivate=[...document.querySelectorAll('#adminActivationChecklistBlock .badge')].filter(b=>norm(b.textContent)==='READY TO ACTIVATE').length;
    const programmeReview=[...document.querySelectorAll('#adminProgrammeList .list-card')].filter(c=>hasBadge(c,'UNDER REVIEW')).length;
    return {newProposals,pendingDocs,readyActivate,programmeReview};
  }

  function updateActionSummary(){
    const counts=actionCounts();
    Object.entries(counts).forEach(([key,value])=>{
      const el=document.querySelector(`[data-admin-action-count="${key}"]`);
      if(el) el.textContent=String(value);
    });
  }

  function build(){
    if(state.built || $('adminWorkflow')) return;
    injectStyles();
    const anchor=$('adminGlobalSearchPanel') || document.querySelector('.kpi-grid');
    if(!anchor)return;
    const wrap=document.createElement('section');
    wrap.id='adminWorkflow';
    wrap.innerHTML=`
      <div id="adminActionSummary">
        <button type="button" data-admin-action-tab="NEW" data-admin-action-section="adminProposalList"><strong data-admin-action-count="newProposals">0</strong><span>New proposals</span></button>
        <button type="button" data-admin-action-tab="PENDING" data-admin-action-section="adminSupportingDocsBlock"><strong data-admin-action-count="pendingDocs">0</strong><span>Documents to verify</span></button>
        <button type="button" data-admin-action-tab="PENDING" data-admin-action-section="adminActivationChecklistBlock"><strong data-admin-action-count="readyActivate">0</strong><span>Ready to activate</span></button>
        <button type="button" data-admin-action-tab="PENDING" data-admin-action-section="adminProgrammeList"><strong data-admin-action-count="programmeReview">0</strong><span>Programmes to review</span></button>
      </div>
      <div id="adminWorkflowTabs" role="tablist">${TABS.map(([key,label])=>`<button type="button" class="admin-workflow-tab" data-admin-workflow-tab="${key}" role="tab"><span>${label}</span><span class="admin-tab-count">0</span></button>`).join('')}</div>`;
    anchor.insertAdjacentElement('afterend',wrap);

    wrap.querySelectorAll('[data-admin-workflow-tab]').forEach(btn=>btn.addEventListener('click',()=>activate(btn.dataset.adminWorkflowTab,true)));
    wrap.querySelectorAll('[data-admin-action-tab]').forEach(btn=>btn.addEventListener('click',()=>{
      activate(btn.dataset.adminActionTab,true);
      const targetId=btn.dataset.adminActionSection;
      const target = targetId==='adminProposalList' || targetId==='adminProgrammeList' ? panelByList(targetId) : $(targetId);
      if(target){target.classList.remove('is-collapsed');target.scrollIntoView({behavior:'smooth',block:'start'});}
    }));
    state.built=true;
  }

  function ensureOpenSection(){
    if(state.visited.has(state.active)) return;
    const sections=getSections().filter(s=>!s.classList.contains('admin-tab-hidden'));
    if(!sections.length)return;
    const preferred = state.active==='OPPORTUNITIES' ? panelByList('adminOpportunityList') : sections[0];
    (preferred||sections[0])?.classList.remove('is-collapsed');
    state.visited.add(state.active);
  }

  function activate(tab,userInitiated=false){
    if(!TABS.some(([key])=>key===tab)) tab='NEW';
    state.active=tab;
    document.querySelectorAll('[data-admin-workflow-tab]').forEach(btn=>{
      const active=btn.dataset.adminWorkflowTab===tab;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',active?'true':'false');
    });
    updateSections();
    updateTabCounts();
    updateActionSummary();
    ensureOpenSection();
    if(userInitiated) document.querySelector('#adminWorkflowTabs')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function smartInitialTab(){
    if(state.initialised)return;
    const preferred=countState('NEW')>0?'NEW':'PENDING';
    state.initialised=true;
    activate(preferred,false);
  }

  function refresh(){
    build();
    if(!state.built)return;
    assignStates();
    updateSections();
    updateTabCounts();
    updateActionSummary();
    smartInitialTab();
  }

  function schedule(){ clearTimeout(state.timer); state.timer=setTimeout(refresh,120); }

  document.addEventListener('admin-search-target',e=>{
    const card=e.detail?.card;
    if(!card)return;
    assignStates();
    const tab=card.dataset.workflowState || 'PENDING';
    activate(tab,false);
    const section=card.closest('.admin-workflow-section');
    section?.classList.remove('is-collapsed');
    setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'center'}),30);
  });

  document.addEventListener('DOMContentLoaded',()=>{
    refresh();
    const main=document.querySelector('main');
    if(main){
      new MutationObserver(mutations=>{
        if(mutations.every(m=>m.target.closest?.('#adminWorkflow'))) return;
        schedule();
      }).observe(main,{childList:true,subtree:true,characterData:true});
    }
    setTimeout(refresh,500);
    setTimeout(refresh,1200);
  });
})();