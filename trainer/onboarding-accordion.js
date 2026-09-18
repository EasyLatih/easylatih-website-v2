(() => {
  const $ = id => document.getElementById(id);
  const ITEMS = [
    { key:'photo', title:'Profile Photo & Consent', required:true },
    { key:'personal', title:'Personal Details', required:true },
    { key:'academic', title:'Academic Qualification', required:true },
    { key:'certification', title:'Professional Certification', required:false },
    { key:'career', title:'Career Experience', required:true },
    { key:'training', title:'Training Experience', required:true },
    { key:'ttt', title:'HRD Corp TTT / Exemption', required:true }
  ];

  function injectStyles(){
    if(document.getElementById('onboardingAccordionStyles')) return;
    const style=document.createElement('style');
    style.id='onboardingAccordionStyles';
    style.textContent=`
      #onboardingForm .onboarding-accordion-list{display:grid;gap:.7rem;margin-top:1rem}
      #onboardingForm .onboarding-accordion-item{border:1px solid #dfe5ec;border-radius:14px;background:#fff;overflow:hidden}
      #onboardingForm .onboarding-accordion-item.is-incomplete{border-color:#f4c56a}
      #onboardingForm .onboarding-accordion-item.is-complete{border-color:#b9dec7}
      #onboardingForm .onboarding-accordion-head{width:100%;border:0;background:#fff;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.05rem;text-align:left;cursor:pointer;color:inherit}
      #onboardingForm .onboarding-accordion-head:hover{background:#f8fafc}
      #onboardingForm .onboarding-accordion-title{display:flex;align-items:center;gap:.7rem;min-width:0;font-weight:800;color:#17324d}
      #onboardingForm .onboarding-accordion-number{width:28px;height:28px;border-radius:999px;background:#edf2f7;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;font-size:.8rem}
      #onboardingForm .onboarding-accordion-meta{display:flex;align-items:center;gap:.55rem;flex:0 0 auto}
      #onboardingForm .onboarding-section-status{display:inline-flex;align-items:center;gap:.35rem;border-radius:999px;padding:.27rem .58rem;font-size:.72rem;font-weight:800;white-space:nowrap;background:#fef3c7;color:#92400e}
      #onboardingForm .onboarding-section-status.complete{background:#dcfce7;color:#166534}
      #onboardingForm .onboarding-section-status.optional{background:#e2e8f0;color:#475569}
      #onboardingForm .onboarding-chevron{font-size:1rem;transition:transform .18s ease;color:#64748b}
      #onboardingForm .onboarding-accordion-item.open .onboarding-chevron{transform:rotate(180deg)}
      #onboardingForm .onboarding-accordion-body{display:none;padding:0 1.05rem 1.05rem}
      #onboardingForm .onboarding-accordion-item.open .onboarding-accordion-body{display:block}
      #onboardingForm .onboarding-accordion-body>.profile-photo-grid{margin-top:.2rem}
      #onboardingForm .onboarding-accordion-body>.field.full{margin:0}
      #onboardingForm .onboarding-accordion-body>.field.full>h4:first-child{display:none}
      #onboardingForm .onboarding-accordion-body .panel-header h4{display:none}
      #onboardingForm .onboarding-accordion-body .panel-header{justify-content:flex-end}
      #onboardingForm .onboarding-accordion-hint{margin:.7rem 0 0;color:#64748b;font-size:.83rem}
      @media(max-width:620px){
        #onboardingForm .onboarding-accordion-head{padding:.9rem}.onboarding-section-status{font-size:.68rem}
        #onboardingForm .onboarding-accordion-meta{gap:.3rem}
      }
    `;
    document.head.appendChild(style);
  }

  function hasValue(el){
    return Boolean(String(el?.value || '').trim());
  }

  function rowsState(containerId, fields, optional=false){
    const holder=$(containerId);
    if(!holder) return {complete:false, optional};
    const rows=[...holder.querySelectorAll('[data-repeat-row]')];
    const values=rows.map(row=>fields.map(field=>String(row.querySelector(`[data-field="${field}"]`)?.value||'').trim()));
    const nonEmptyRows=values.filter(row=>row.some(Boolean));
    if(optional && !nonEmptyRows.length) return {complete:true, optional:true};
    if(!nonEmptyRows.length) return {complete:false, optional:false};
    return {complete:nonEmptyRows.every(row=>row.every(Boolean)), optional:false};
  }

  function photoState(){
    const preview=$('photoPreview');
    const hasExistingPhoto=Boolean(preview?.querySelector('img') || (preview && !/no photo uploaded/i.test(String(preview.textContent||'')) && preview.children.length));
    const hasPhoto=Boolean($('profilePhoto')?.files?.length || hasExistingPhoto);
    const consent=Boolean($('photoConsent')?.checked);
    return {complete:hasPhoto && consent, optional:false};
  }

  function personalState(){
    const ids=['etris_full_name','etris_identity_no','etris_race','etris_mobile','etris_email'];
    return {complete:ids.every(id=>hasValue($(id))), optional:false};
  }

  function tttState(){
    const yes=Boolean($('tttCertifiedYes')?.checked);
    const no=Boolean($('tttCertifiedNo')?.checked);
    if(no) return {complete:true, optional:false};
    if(yes){
      const type=hasValue($('tttQualificationType'));
      const accreditation=hasValue($('tttAccreditationStatus'));
      const certificateNo=hasValue($('tttCertificateNo'));
      return {complete:type && accreditation && certificateNo, optional:false};
    }
    const raw=String($('onboarding_ttt')?.value||'').trim();
    if(/^(HRD Corp TTT Eligibility:\s*No|HRD Corp TTT:\s*No)$/i.test(raw)) return {complete:true, optional:false};
    if(/^HRD Corp TTT Eligibility:\s*Yes\s*\|\s*Type:\s*(HRD Corp TTT|HRD Corp TTT Exempted)\s*\|\s*Accreditation:\s*(Accredited|Pre-Accredited|Non-Accredited)\s*\|\s*Reference No:\s*.+$/i.test(raw)) return {complete:true, optional:false};
    if(/^HRD Corp TTT:\s*Yes\s*\|\s*Accreditation:\s*(Accredited|Pre-Accredited|Non-Accredited)\s*\|\s*TTT Certificate No:\s*.+$/i.test(raw)) return {complete:true, optional:false};
    return {complete:false, optional:false};
  }

  function getState(key){
    if(key==='photo') return photoState();
    if(key==='personal') return personalState();
    if(key==='academic') return rowsState('academicQualificationRows',['qualification','year_awarded','institution']);
    if(key==='certification') return rowsState('professionalCertificationRows',['certification','certification_body','year_awarded'],true);
    if(key==='career') return rowsState('careerExperienceRows',['year_from','year_to','position','company_organization']);
    if(key==='training') return rowsState('trainingExperienceRows',['year_from','year_to','training_program_conducted']);
    if(key==='ttt') return tttState();
    return {complete:false,optional:false};
  }

  function targetFor(key){
    const form=$('onboardingForm');
    if(!form) return null;
    if(key==='photo') return form.querySelector('.profile-photo-grid');
    const grid=form.querySelector(':scope > .form-grid');
    if(!grid) return null;
    const sections=[...grid.children].filter(el=>el.classList.contains('field') && el.classList.contains('full'));
    const byHeading=(needle)=>sections.find(el=>String(el.querySelector('h4')?.textContent||'').trim().toLowerCase().includes(needle));
    if(key==='personal') return byHeading('personal details');
    if(key==='academic') return byHeading('academic qualification');
    if(key==='certification') return byHeading('professional certification');
    if(key==='career') return byHeading('career experience');
    if(key==='training') return byHeading('training experience');
    if(key==='ttt') return byHeading('easylatih / hrd corp information');
    return null;
  }

  function makeItem(def,index,target){
    const item=document.createElement('div');
    item.className='onboarding-accordion-item';
    item.dataset.onboardingSection=def.key;
    const head=document.createElement('button');
    head.type='button';
    head.className='onboarding-accordion-head';
    head.setAttribute('aria-expanded','false');
    head.innerHTML=`
      <span class="onboarding-accordion-title"><span class="onboarding-accordion-number">${index+1}</span><span>${def.title}</span></span>
      <span class="onboarding-accordion-meta"><span class="onboarding-section-status">! Incomplete</span><span class="onboarding-chevron">⌄</span></span>`;
    const body=document.createElement('div');
    body.className='onboarding-accordion-body';
    target.parentNode.insertBefore(item,target);
    item.appendChild(head);
    item.appendChild(body);
    body.appendChild(target);
    head.addEventListener('click',()=>{
      const open=!item.classList.contains('open');
      item.classList.toggle('open',open);
      head.setAttribute('aria-expanded',open?'true':'false');
    });
    return item;
  }

  function refreshStatuses(){
    ITEMS.forEach(def=>{
      const item=document.querySelector(`[data-onboarding-section="${def.key}"]`);
      if(!item) return;
      const badge=item.querySelector('.onboarding-section-status');
      const state=getState(def.key);
      item.classList.toggle('is-complete',state.complete);
      item.classList.toggle('is-incomplete',!state.complete && !state.optional);
      if(!badge) return;
      if(state.optional){
        badge.className='onboarding-section-status optional';
        badge.textContent='Optional';
      }else if(state.complete){
        badge.className='onboarding-section-status complete';
        badge.textContent='✓ Complete';
      }else{
        badge.className='onboarding-section-status';
        badge.textContent='! Incomplete';
      }
    });
  }

  function startHydrationRefresh(){
    let ticks=0;
    let stableCompleteTicks=0;
    const timer=setInterval(()=>{
      refreshStatuses();
      ticks+=1;
      const requiredComplete=ITEMS.filter(x=>x.required).every(x=>getState(x.key).complete);
      stableCompleteTicks=requiredComplete ? stableCompleteTicks+1 : 0;
      if(stableCompleteTicks>=3 || ticks>=48) clearInterval(timer);
    },250);
  }

  function build(){
    const form=$('onboardingForm');
    if(!form || form.dataset.accordionBuilt==='1') return false;
    const targets=ITEMS.map(def=>targetFor(def.key));
    if(targets.some(x=>!x)) return false;
    form.dataset.accordionBuilt='1';
    injectStyles();

    const list=document.createElement('div');
    list.className='onboarding-accordion-list';
    const first=targets[0];
    first.parentNode.insertBefore(list,first);
    ITEMS.forEach((def,index)=>{
      const target=targets[index];
      const item=makeItem(def,index,target);
      list.appendChild(item);
    });
    const hint=document.createElement('div');
    hint.className='onboarding-accordion-hint';
    hint.textContent='Open the sections marked Incomplete and complete the required information before saving.';
    list.insertAdjacentElement('afterend',hint);

    form.addEventListener('input',()=>requestAnimationFrame(refreshStatuses));
    form.addEventListener('change',()=>requestAnimationFrame(refreshStatuses));
    document.addEventListener('easylatih:onboarding-hydrated',refreshStatuses);
    refreshStatuses();
    startHydrationRefresh();
    return true;
  }

  function start(){
    let attempts=0;
    const timer=setInterval(()=>{
      const built=build();
      refreshStatuses();
      attempts+=1;
      if(built || attempts>=40){
        clearInterval(timer);
        setTimeout(refreshStatuses,300);
        setTimeout(refreshStatuses,1000);
        setTimeout(refreshStatuses,2500);
        setTimeout(refreshStatuses,5000);
      }
    },150);
  }

  document.addEventListener('DOMContentLoaded',start);
})();
