(() => {
  const TYPES = [
    ['ALL','All'],
    ['TRAINER','Trainers'],
    ['WAITING','Waiting List'],
    ['CONSULTANT','Consultants'],
    ['PROGRAMME','Programmes'],
    ['PROPOSAL','Proposals'],
    ['OPPORTUNITY','Opportunities']
  ];

  const state = { query:'', type:'ALL', timer:null, built:false };
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const normalise = value => String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();

  function injectStyles(){
    if($('adminGlobalSearchStyles')) return;
    const style=document.createElement('style');
    style.id='adminGlobalSearchStyles';
    style.textContent=`
      #adminGlobalSearchPanel{margin:1rem 0 1.25rem;padding:1rem 1.05rem;border:1px solid #dfe5ec;border-radius:14px;background:#fff}
      #adminGlobalSearchPanel .admin-search-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:.65rem;align-items:center}
      #adminGlobalSearchPanel .admin-search-input-wrap{position:relative}
      #adminGlobalSearchPanel .admin-search-input-wrap span{position:absolute;left:.85rem;top:50%;transform:translateY(-50%);color:#64748b;pointer-events:none}
      #adminGlobalSearch{width:100%;padding:.78rem .9rem .78rem 2.35rem;border:1px solid #cbd5e1;border-radius:10px;font:inherit;background:#fff}
      #adminGlobalSearch:focus{outline:2px solid #bfdbfe;outline-offset:1px;border-color:#60a5fa}
      #adminGlobalSearchPanel .admin-search-filters{display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.75rem}
      #adminGlobalSearchPanel .admin-search-chip{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:.36rem .68rem;font-size:.78rem;font-weight:700;cursor:pointer;color:#475569}
      #adminGlobalSearchPanel .admin-search-chip.active{background:#17324d;color:#fff;border-color:#17324d}
      #adminGlobalSearchResults{margin-top:.8rem;display:grid;gap:.55rem}
      #adminGlobalSearchResults .admin-search-result{border:1px solid #e2e8f0;border-radius:11px;padding:.75rem .85rem;background:#f8fafc;cursor:pointer;text-align:left;width:100%;color:inherit}
      #adminGlobalSearchResults .admin-search-result:hover{background:#f1f5f9;border-color:#cbd5e1}
      #adminGlobalSearchResults .admin-search-result-top{display:flex;align-items:center;justify-content:space-between;gap:.7rem}
      #adminGlobalSearchResults .admin-search-result-title{font-weight:800;color:#17324d}
      #adminGlobalSearchResults .admin-search-result-type{font-size:.68rem;font-weight:800;border-radius:999px;padding:.2rem .48rem;background:#e2e8f0;color:#475569;white-space:nowrap}
      #adminGlobalSearchResults .admin-search-result-snippet{margin-top:.25rem;color:#64748b;font-size:.8rem;line-height:1.35}
      #adminGlobalSearchPanel .admin-search-summary{margin-top:.55rem;color:#64748b;font-size:.8rem}
      .admin-search-highlight{box-shadow:0 0 0 3px rgba(59,130,246,.22)!important;transition:box-shadow .2s ease}
      @media(max-width:700px){#adminGlobalSearchPanel .admin-search-row{grid-template-columns:1fr}#adminGlobalSearchPanel .admin-search-row .btn{display:none}}
    `;
    document.head.appendChild(style);
  }

  function cardType(card){
    if(card.closest('#adminWaitingList')) return 'WAITING';
    if(card.closest('#adminConsultancyPool')) return 'CONSULTANT';
    if(card.closest('#adminProposalList')) return 'PROPOSAL';
    if(card.closest('#adminProgrammeList')) return 'PROGRAMME';
    if(card.closest('#adminOpportunityList')) return 'OPPORTUNITY';
    if(card.closest('#adminTrainerList')) return 'TRAINER';
    return null;
  }

  function collectCards(){
    return [...document.querySelectorAll('.list-card')].map((card,index)=>{
      const type=cardType(card);
      if(!type) return null;
      const title=String(card.querySelector('h3,h4,strong')?.textContent || `${type} ${index+1}`).trim();
      const raw=String(card.textContent || '').replace(/\s+/g,' ').trim();
      return {card,type,title,raw,search:normalise(raw)};
    }).filter(Boolean);
  }

  function excerpt(raw, query){
    const clean=String(raw||'').replace(/\s+/g,' ').trim();
    if(!query) return clean.slice(0,180)+(clean.length>180?'…':'');
    const n=normalise(clean);
    const firstTerm=normalise(query).split(' ').find(Boolean) || '';
    const pos=n.indexOf(firstTerm);
    if(pos<0) return clean.slice(0,180)+(clean.length>180?'…':'');
    const start=Math.max(0,pos-65);
    const end=Math.min(clean.length,pos+140);
    return `${start?'…':''}${clean.slice(start,end)}${end<clean.length?'…':''}`;
  }

  function matches(item){
    if(state.type!=='ALL' && item.type!==state.type) return false;
    const terms=normalise(state.query).split(' ').filter(Boolean);
    return terms.every(term=>item.search.includes(term));
  }

  function labelFor(type){ return TYPES.find(x=>x[0]===type)?.[1] || type; }

  function render(){
    const results=$('adminGlobalSearchResults');
    const summary=$('adminGlobalSearchSummary');
    if(!results || !summary) return;
    const query=String($('adminGlobalSearch')?.value||'').trim();
    state.query=query;
    const items=collectCards();

    if(!query && state.type==='ALL'){
      results.innerHTML='';
      summary.textContent='Search by trainer name, email, phone, state, expertise, programme, proposal, status or consultancy area.';
      return;
    }

    const found=items.filter(matches);
    summary.textContent=`${found.length} result${found.length===1?'':'s'} found${state.type==='ALL'?'':` in ${labelFor(state.type)}`}.`;
    if(!found.length){
      results.innerHTML='<div class="empty">No matching record found.</div>';
      return;
    }

    results.innerHTML=found.slice(0,60).map((item,i)=>`
      <button type="button" class="admin-search-result" data-admin-search-result="${i}">
        <span class="admin-search-result-top"><span class="admin-search-result-title">${esc(item.title)}</span><span class="admin-search-result-type">${esc(labelFor(item.type))}</span></span>
        <span class="admin-search-result-snippet">${esc(excerpt(item.raw,query))}</span>
      </button>`).join('') + (found.length>60?'<div class="muted">Showing first 60 matches. Refine your search to narrow the results.</div>':'');

    [...results.querySelectorAll('[data-admin-search-result]')].forEach((btn,i)=>{
      btn.addEventListener('click',()=>{
        const target=found[i]?.card;
        if(!target) return;
        document.dispatchEvent(new CustomEvent('admin-search-target',{detail:{card:target,type:found[i]?.type}}));
        setTimeout(()=>{
          target.scrollIntoView({behavior:'smooth',block:'center'});
          target.classList.add('admin-search-highlight');
          setTimeout(()=>target.classList.remove('admin-search-highlight'),1800);
        },40);
      });
    });
  }

  function schedule(){ clearTimeout(state.timer); state.timer=setTimeout(render,120); }

  function build(){
    if(state.built || $('adminGlobalSearchPanel')) return;
    const kpis=document.querySelector('.kpi-grid');
    if(!kpis) return;
    injectStyles();
    const panel=document.createElement('section');
    panel.id='adminGlobalSearchPanel';
    panel.innerHTML=`
      <div class="admin-search-row">
        <div class="admin-search-input-wrap"><span>⌕</span><input id="adminGlobalSearch" type="search" autocomplete="off" placeholder="Search trainer, email, expertise, programme, status, consultancy…"></div>
        <button id="adminGlobalSearchClear" type="button" class="btn btn-outline">Clear</button>
      </div>
      <div class="admin-search-filters" id="adminGlobalSearchFilters">${TYPES.map(([value,label])=>`<button type="button" class="admin-search-chip${value==='ALL'?' active':''}" data-search-type="${value}">${label}</button>`).join('')}</div>
      <div id="adminGlobalSearchSummary" class="admin-search-summary">Search by trainer name, email, phone, state, expertise, programme, proposal, status or consultancy area.</div>
      <div id="adminGlobalSearchResults"></div>`;
    kpis.insertAdjacentElement('afterend',panel);

    $('adminGlobalSearch')?.addEventListener('input',schedule);
    $('adminGlobalSearch')?.addEventListener('keydown',e=>{if(e.key==='Escape'){e.currentTarget.value='';state.type='ALL';syncChips();render();}});
    $('adminGlobalSearchClear')?.addEventListener('click',()=>{
      const input=$('adminGlobalSearch'); if(input) input.value='';
      state.type='ALL'; syncChips(); render(); input?.focus();
    });
    $('adminGlobalSearchFilters')?.addEventListener('click',e=>{
      const btn=e.target.closest('[data-search-type]'); if(!btn) return;
      state.type=btn.dataset.searchType || 'ALL'; syncChips(); render();
    });

    document.addEventListener('keydown',e=>{
      if(e.key==='/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')){
        e.preventDefault(); $('adminGlobalSearch')?.focus();
      }
    });

    const main=document.querySelector('main');
    if(main){
      const observer=new MutationObserver(mutations=>{
        if(mutations.every(m=>m.target.closest?.('#adminGlobalSearchPanel'))) return;
        if(state.query || state.type!=='ALL') schedule();
      });
      observer.observe(main,{childList:true,subtree:true,characterData:true});
    }
    state.built=true;
  }

  function syncChips(){
    document.querySelectorAll('[data-search-type]').forEach(btn=>btn.classList.toggle('active',btn.dataset.searchType===state.type));
  }

  function init(){
    let attempts=0;
    const timer=setInterval(()=>{
      attempts+=1;
      build();
      if(state.built || attempts>=30) clearInterval(timer);
    },150);
  }

  document.addEventListener('DOMContentLoaded',init);
})();