(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const $ = id => document.getElementById(id);
  const splitLines = value => String(value || '').split('\n').map(x => x.trim()).filter(Boolean);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const formatIdentityNo = value => {
    const raw=String(value||'').trim();
    if(/[A-Za-z]/.test(raw)) return raw.toUpperCase().replace(/\s+/g,'');
    const digits=raw.replace(/\D/g,'').slice(0,12);
    if(digits.length<=6) return digits;
    if(digits.length<=8) return `${digits.slice(0,6)}-${digits.slice(6)}`;
    return `${digits.slice(0,6)}-${digits.slice(6,8)}-${digits.slice(8)}`;
  };
  const isNumericIdentity = value => !/[A-Za-z]/.test(String(value||''));
  let user = null;
  let profile = null;
  let onboarding = null;
  let etrisProfile = null;
  let programmes = [];
  let eligibleProposals = [];

  function msg(id,text,type='info'){
    const el=$(id); if(!el)return;
    el.className=text?`alert alert-${type}`:'hidden';
    el.textContent=text||'';
  }

  async function getUser(){
    const {data,error}=await client.auth.getUser();
    if(error || !data.user) return null;
    return data.user;
  }

  async function refreshProfile(){
    if(!user) user=await getUser();
    if(!user)return null;
    const {data,error}=await client.from('profiles').select('*').eq('id',user.id).single();
    if(error)throw error;
    profile=data;
    return profile;
  }

  function buildEtrisFields(){
    const form=$('onboardingForm');
    if(!form)return;
    const heading=form.querySelector('h3');
    const intro=form.querySelector('p.muted');
    const grid=form.querySelector('.form-grid');
    if(!grid || grid.dataset.etrisBuilt==='1') return;
    grid.dataset.etrisBuilt='1';
    if(heading) heading.textContent='2. eTRiS Trainer Profile';
    if(intro) intro.textContent='Complete the structured trainer information required for EasyLatih to prepare your eTRiS trainer profile.';
    grid.innerHTML=`
      <div class="field full">
        <h4 style="margin:.25rem 0 .75rem">Personal Details</h4>
        <div class="form-grid">
          <div class="field full"><label>Full Name (as per IC/Passport)</label><input id="etris_full_name" required maxlength="180" autocomplete="name"></div>
          <div class="field"><label>IC No. / Passport No.</label><input id="etris_identity_no" required maxlength="40" autocomplete="off" placeholder="030303-03-3333"><span class="help">Malaysian IC numbers are formatted automatically as YYMMDD-PB-####. Passport numbers remain alphanumeric.</span></div>
          <div class="field"><label>Race</label><input id="etris_race" required maxlength="80" autocomplete="off"></div>
          <div class="field"><label>Mobile No.</label><input id="etris_mobile" required maxlength="40" autocomplete="tel"></div>
          <div class="field"><label>Email Address</label><input id="etris_email" type="email" readonly></div>
        </div>
        <span class="help">IC/Passport number and race are kept in a restricted eTRiS profile record and are not published in the public trainer catalogue.</span>
      </div>

      <div class="field full">
        <div class="panel-header" style="margin-bottom:.25rem"><div><h4 style="margin:0">Academic Qualification</h4><div class="muted">Add each qualification separately.</div></div><button id="addAcademicQualification" type="button" class="btn btn-soft">+ Add Qualification</button></div>
        <div id="academicQualificationRows"></div>
      </div>

      <div class="field full">
        <div class="panel-header" style="margin-bottom:.25rem"><div><h4 style="margin:0">Professional Certification</h4><div class="muted">Optional if you do not hold a professional certification.</div></div><button id="addProfessionalCertification" type="button" class="btn btn-soft">+ Add Certification</button></div>
        <div id="professionalCertificationRows"></div>
      </div>

      <div class="field full">
        <div class="panel-header" style="margin-bottom:.25rem"><div><h4 style="margin:0">Career Experience</h4><div class="muted">Provide previous relevant positions separately.</div></div><button id="addCareerExperience" type="button" class="btn btn-soft">+ Add Career Experience</button></div>
        <div id="careerExperienceRows"></div>
      </div>

      <div class="field full">
        <div class="panel-header" style="margin-bottom:.25rem"><div><h4 style="margin:0">Training Experience</h4><div class="muted">Provide relevant programmes conducted.</div></div><button id="addTrainingExperience" type="button" class="btn btn-soft">+ Add Training Experience</button></div>
        <div id="trainingExperienceRows"></div>
      </div>

      <div class="field full">
        <h4 style="margin:.25rem 0 .75rem">EasyLatih / HRD Corp Information</h4>
        <div class="field"><label>HRD Corp TTT / Trainer Status</label><textarea id="onboarding_ttt" name="ttt_status" required placeholder="e.g. HRD Corp TTT Certified / Accredited Trainer / Exempted and relevant details."></textarea></div>
      </div>`;

    $('etris_identity_no')?.addEventListener('input',e=>{e.target.value=formatIdentityNo(e.target.value)});
    $('addAcademicQualification')?.addEventListener('click',()=>appendRepeatRow('academicQualificationRows','academic',{}));
    $('addProfessionalCertification')?.addEventListener('click',()=>appendRepeatRow('professionalCertificationRows','certification',{}));
    $('addCareerExperience')?.addEventListener('click',()=>appendRepeatRow('careerExperienceRows','career',{}));
    $('addTrainingExperience')?.addEventListener('click',()=>appendRepeatRow('trainingExperienceRows','training',{}));
  }

  function repeatRowTemplate(type,row={}){
    const commonStart='<div data-repeat-row style="border:1px solid #dfe5ec;border-radius:12px;padding:1rem;margin:.75rem 0;background:#fff"><div class="form-grid">';
    const commonEnd='</div><div class="btn-row" style="margin-top:.5rem"><button type="button" class="btn btn-soft" data-remove-row>Remove</button></div></div>';
    if(type==='academic') return `${commonStart}
      <div class="field full"><label>Qualification</label><input data-field="qualification" value="${esc(row.qualification||'')}" maxlength="180" placeholder="e.g. Bachelor of Strategic Studies"></div>
      <div class="field"><label>Year Awarded</label><input data-field="year_awarded" type="number" min="1900" max="2100" value="${esc(row.year_awarded||'')}"></div>
      <div class="field"><label>Name of Academic Institution</label><input data-field="institution" value="${esc(row.institution||'')}" maxlength="220"></div>${commonEnd}`;
    if(type==='certification') return `${commonStart}
      <div class="field full"><label>Professional Certification</label><input data-field="certification" value="${esc(row.certification||'')}" maxlength="220"></div>
      <div class="field"><label>Certification Body</label><input data-field="certification_body" value="${esc(row.certification_body||'')}" maxlength="220"></div>
      <div class="field"><label>Year Awarded</label><input data-field="year_awarded" type="number" min="1900" max="2100" value="${esc(row.year_awarded||'')}"></div>${commonEnd}`;
    if(type==='career') return `${commonStart}
      <div class="field"><label>Year From</label><input data-field="year_from" maxlength="20" value="${esc(row.year_from||'')}" placeholder="e.g. 2020"></div>
      <div class="field"><label>Year To</label><input data-field="year_to" maxlength="20" value="${esc(row.year_to||'')}" placeholder="e.g. 2024 / Present"></div>
      <div class="field"><label>Position</label><input data-field="position" value="${esc(row.position||'')}" maxlength="180"></div>
      <div class="field"><label>Company / Organization</label><input data-field="company_organization" value="${esc(row.company_organization||'')}" maxlength="220"></div>${commonEnd}`;
    return `${commonStart}
      <div class="field"><label>Year From</label><input data-field="year_from" maxlength="20" value="${esc(row.year_from||'')}" placeholder="e.g. 2022"></div>
      <div class="field"><label>Year To</label><input data-field="year_to" maxlength="20" value="${esc(row.year_to||'')}" placeholder="e.g. 2026 / Present"></div>
      <div class="field full"><label>Training Program Conducted</label><input data-field="training_program_conducted" value="${esc(row.training_program_conducted||'')}" maxlength="300"></div>${commonEnd}`;
  }

  function appendRepeatRow(containerId,type,row){
    const holder=$(containerId); if(!holder)return;
    const box=document.createElement('div');
    box.innerHTML=repeatRowTemplate(type,row).trim();
    const node=box.firstElementChild;
    node.querySelector('[data-remove-row]')?.addEventListener('click',()=>{
      node.remove();
      if(!holder.querySelector('[data-repeat-row]') && type!=='certification') appendRepeatRow(containerId,type,{});
    });
    holder.appendChild(node);
  }

  function renderRepeatRows(containerId,type,rows,required=true){
    const holder=$(containerId); if(!holder)return;
    holder.innerHTML='';
    const list=Array.isArray(rows)?rows:[];
    if(list.length) list.forEach(row=>appendRepeatRow(containerId,type,row));
    else if(required || type==='certification') appendRepeatRow(containerId,type,{});
  }

  function collectRepeatRows(containerId,fields){
    const holder=$(containerId); if(!holder)return[];
    return [...holder.querySelectorAll('[data-repeat-row]')].map(row=>{
      const item={};
      fields.forEach(field=>{item[field]=String(row.querySelector(`[data-field="${field}"]`)?.value||'').trim()});
      return item;
    }).filter(item=>Object.values(item).some(Boolean));
  }

  function validateCompleteRows(rows,fields,label){
    if(!rows.length) throw new Error(`Please add at least one ${label}.`);
    if(rows.some(row=>fields.some(field=>!row[field]))) throw new Error(`Please complete all fields for each ${label}.`);
  }

  async function loadOnboarding(){
    user=await getUser(); if(!user)return;
    buildEtrisFields();
    try{await refreshProfile();}catch{return;}
    if(!['APPROVED_TO_COLLAB','ONBOARDING','ACTIVE'].includes(profile.collaboration_status)) return;
    const [{data:o,error:oError},{data:e,error:eError}]=await Promise.all([
      client.from('trainer_onboarding').select('*').eq('trainer_id',user.id).maybeSingle(),
      client.from('trainer_etris_profiles').select('*').eq('trainer_id',user.id).maybeSingle()
    ]);
    if(oError) throw oError;
    if(eError) throw eError;
    onboarding=o||null;
    etrisProfile=e||null;

    if($('etris_full_name')) $('etris_full_name').value=profile.full_name||'';
    if($('etris_identity_no')) $('etris_identity_no').value=formatIdentityNo(e?.identity_no||'');
    if($('etris_race')) $('etris_race').value=e?.race||'';
    if($('etris_mobile')) $('etris_mobile').value=profile.phone||'';
    if($('etris_email')) $('etris_email').value=profile.email||user.email||'';
    if($('onboarding_ttt')) $('onboarding_ttt').value=o?.ttt_status||'';

    renderRepeatRows('academicQualificationRows','academic',e?.academic_qualifications||[],true);
    renderRepeatRows('professionalCertificationRows','certification',e?.professional_certifications||[],false);
    renderRepeatRows('careerExperienceRows','career',e?.career_experience||[],true);
    renderRepeatRows('trainingExperienceRows','training',e?.training_experience||[],true);

    if($('photoConsent')) $('photoConsent').checked=Boolean(o?.photo_consent_at);
    renderPhoto(o?.profile_photo_url);
    if($('onboardingStatus')){
      $('onboardingStatus').innerHTML=o?.onboarding_completed_at
        ? '<span class="badge green">ONBOARDING COMPLETE</span>'
        : '<span class="badge amber">ONBOARDING PENDING</span>';
    }
    await loadProgrammeEditor();
  }

  function renderPhoto(url){
    const box=$('photoPreview'); if(!box)return;
    box.innerHTML=url?`<img src="${esc(url)}" alt="Trainer profile photo">`:'<span>No photo uploaded</span>';
  }

  async function uploadPhoto(file){
    if(!file)return onboarding?.profile_photo_url||null;
    const allowed=['image/jpeg','image/png','image/webp'];
    if(!allowed.includes(file.type)) throw new Error('Profile photo must be JPG, PNG or WebP.');
    if(file.size>3*1024*1024) throw new Error('Profile photo must be 3 MB or smaller.');
    const ext=file.name.split('.').pop().toLowerCase();
    const path=`${user.id}/profile-${Date.now()}.${ext}`;
    const {error}=await client.storage.from('trainer-profile-photos').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
    if(error)throw error;
    const {data}=client.storage.from('trainer-profile-photos').getPublicUrl(path);
    return {url:data.publicUrl,path};
  }

  async function saveOnboarding(e){
    e.preventDefault();
    if(!user)return;
    try{await refreshProfile();}catch(err){return msg('onboardingMessage',err.message||'Unable to refresh trainer status.','danger');}
    if(!['ONBOARDING','ACTIVE'].includes(profile.collaboration_status)){
      return msg('onboardingMessage','Please accept the Trainer Collaboration Terms before completing onboarding.','warning');
    }
    const f=new FormData(e.currentTarget);
    if(!f.get('photo_consent')) return msg('onboardingMessage','Photo and marketing consent is required for an approved EasyLatih trainer profile.','danger');

    const fullName=String($('etris_full_name')?.value||'').trim();
    const identityNo=formatIdentityNo($('etris_identity_no')?.value||'');
    const race=String($('etris_race')?.value||'').trim();
    const mobile=String($('etris_mobile')?.value||'').trim();
    const email=String($('etris_email')?.value||profile.email||user.email||'').trim();
    const tttStatus=String(f.get('ttt_status')||'').trim();
    const academic=collectRepeatRows('academicQualificationRows',['qualification','year_awarded','institution']);
    const certifications=collectRepeatRows('professionalCertificationRows',['certification','certification_body','year_awarded']);
    const career=collectRepeatRows('careerExperienceRows',['year_from','year_to','position','company_organization']);
    const training=collectRepeatRows('trainingExperienceRows',['year_from','year_to','training_program_conducted']);

    try{
      if(!fullName||!identityNo||!race||!mobile||!email) throw new Error('Please complete all Personal Details required for eTRiS.');
      if(isNumericIdentity(identityNo) && !/^\d{6}-\d{2}-\d{4}$/.test(identityNo)) throw new Error('Malaysian IC number must contain 12 digits and will be saved in the format 030303-03-3333.');
      validateCompleteRows(academic,['qualification','year_awarded','institution'],'academic qualification');
      if(certifications.some(row=>['certification','certification_body','year_awarded'].some(field=>!row[field]))) throw new Error('Please complete all fields for each professional certification, or remove the incomplete entry.');
      validateCompleteRows(career,['year_from','year_to','position','company_organization'],'career experience');
      validateCompleteRows(training,['year_from','year_to','training_program_conducted'],'training experience');
      if(!tttStatus) throw new Error('Please provide your HRD Corp TTT / Trainer Status.');

      msg('onboardingMessage','Saving eTRiS trainer profile…','info');
      const photoFile=$('profilePhoto')?.files?.[0]||null;
      const oldPhotoPath=onboarding?.profile_photo_storage_path||null;
      let photoUrl=onboarding?.profile_photo_url||null;
      let photoPath=oldPhotoPath;
      if(photoFile){
        const uploaded=await uploadPhoto(photoFile);
        photoUrl=uploaded.url; photoPath=uploaded.path;
      }
      if(!photoUrl) throw new Error('Please upload a professional trainer profile photo.');

      const profileUpdate=await client.from('profiles').update({full_name:fullName,phone:mobile,updated_at:new Date().toISOString()}).eq('id',user.id);
      if(profileUpdate.error) throw profileUpdate.error;

      const etrisRow={
        trainer_id:user.id,
        identity_no:identityNo,
        race,
        academic_qualifications:academic,
        professional_certifications:certifications,
        career_experience:career,
        training_experience:training,
        updated_at:new Date().toISOString()
      };
      const etrisSave=await client.from('trainer_etris_profiles').upsert(etrisRow,{onConflict:'trainer_id'});
      if(etrisSave.error) throw etrisSave.error;

      const now=new Date().toISOString();
      const row={
        trainer_id:user.id,
        academic_qualification:academic.map(x=>`${x.qualification} (${x.year_awarded}) - ${x.institution}`).join('\n'),
        professional_certifications:certifications.map(x=>`${x.certification} - ${x.certification_body} (${x.year_awarded})`).join('\n'),
        working_experience:career.map(x=>`${x.year_from}-${x.year_to}: ${x.position}, ${x.company_organization}`).join('\n'),
        training_experience:training.map(x=>`${x.year_from}-${x.year_to}: ${x.training_program_conducted}`).join('\n'),
        industry_experience:onboarding?.industry_experience||'',
        ttt_status:tttStatus,
        profile_photo_url:photoUrl,
        profile_photo_storage_path:photoPath,
        photo_consent_version:cfg.collaborationTermsVersion,
        photo_consent_at:onboarding?.photo_consent_at||now,
        onboarding_completed_at:onboarding?.onboarding_completed_at||now,
        updated_at:now
      };
      const {error}=await client.from('trainer_onboarding').upsert(row,{onConflict:'trainer_id'});
      if(error)throw error;
      if(!onboarding?.photo_consent_at){
        const agreement=await client.from('trainer_agreements').insert({trainer_id:user.id,agreement_type:'PHOTO_MARKETING_CONSENT',version:cfg.collaborationTermsVersion,accepted_at:row.photo_consent_at});
        if(agreement.error)throw agreement.error;
      }
      if(photoFile&&oldPhotoPath&&oldPhotoPath!==photoPath){
        await client.storage.from('trainer-profile-photos').remove([oldPhotoPath]);
      }
      msg('onboardingMessage','eTRiS trainer profile saved and onboarding marked complete.','success');
      await loadOnboarding();
    }catch(err){msg('onboardingMessage',err.message||'Unable to save trainer profile.','danger')}
  }

  async function loadProgrammeEditor(){
    if(!user || !['APPROVED_TO_COLLAB','ONBOARDING','ACTIVE'].includes(profile?.collaboration_status)) return;
    const [{data:props,error:propsError},{data:progs,error:progsError}]=await Promise.all([
      client.from('programme_proposals').select('*').eq('trainer_id',user.id).in('status',['APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS','PUBLISHED']).order('created_at',{ascending:false}),
      client.from('programmes').select('*').eq('trainer_id',user.id).order('created_at',{ascending:false})
    ]);
    if(propsError) throw propsError;
    if(progsError) throw progsError;
    eligibleProposals=props||[];
    programmes=progs||[];
    const select=$('programmeProposal'); if(!select)return;
    const current=select.value;
    select.innerHTML='<option value="">Select approved proposal</option>'+eligibleProposals.map(p=>`<option value="${p.id}">${esc(p.title)}</option>`).join('');
    let selectedProposal=null;
    if(current && eligibleProposals.some(p=>p.id===current)){
      select.value=current;
      selectedProposal=eligibleProposals.find(p=>p.id===current)||null;
    }else if(eligibleProposals.length===1){
      select.value=eligibleProposals[0].id;
      selectedProposal=eligibleProposals[0];
    }
    renderProgrammeSubmissionList();
    if(selectedProposal){
      const existing=programmes.find(p=>p.proposal_id===selectedProposal.id);
      setProgrammeForm(existing||null,selectedProposal);
    }else if(!eligibleProposals.length){
      setProgrammeForm(null,null);
      msg('programmeFormMessage','No approved proposal is available for full programme submission yet.','info');
    }
  }

  function renderProgrammeSubmissionList(){
    const holder=$('fullProgrammeList'); if(!holder)return;
    holder.innerHTML=programmes.length?programmes.map(p=>`<div class="list-card"><div class="list-card-top"><div><h3>${esc(p.title)}</h3><div class="meta"><span>${esc(p.category)}</span><span>${esc(p.training_type)}</span><span>eTRiS: ${esc(p.etris_status)}</span></div></div><span class="badge ${p.publish_status==='PUBLISHED'?'green':p.publish_status==='UNDER_REVIEW'?'amber':'blue'}">${esc(p.publish_status.replaceAll('_',' '))}</span></div><div class="btn-row"><button type="button" class="btn btn-soft" data-edit-programme="${p.id}">Open Details</button></div></div>`).join(''):'<div class="empty">No full programme submission yet.</div>';
    holder.querySelectorAll('[data-edit-programme]').forEach(b=>b.addEventListener('click',()=>openProgramme(b.dataset.editProgramme)));
  }

  function setProgrammeForm(programme,proposal){
    const form=$('fullProgrammeForm'); if(!form)return;
    form.dataset.programmeId=programme?.id||'';
    const set=(name,val)=>{const el=form.elements[name];if(el)el.value=val??''};
    set('proposal_id',proposal?.id||programme?.proposal_id||'');
    set('title',programme?.title||proposal?.title||'');
    set('category',programme?.category||proposal?.category||'');
    set('training_type',programme?.training_type||proposal?.training_type||'BOTH');
    set('programme_overview',programme?.programme_overview||proposal?.summary||'');
    set('learning_objectives',(programme?.learning_objectives||[]).join('\n'));
    set('learning_outcomes',(programme?.learning_outcomes||[]).join('\n'));
    set('target_participants',programme?.target_participants||proposal?.target_audience||'');
    set('prerequisites',programme?.prerequisites||'');
    set('duration',programme?.duration||proposal?.duration||'');
    set('total_contact_hours',programme?.total_contact_hours||'');
    set('delivery_method',programme?.delivery_method||proposal?.delivery_method||'');
    set('training_methodology',programme?.training_methodology||'');
    set('modules',(programme?.modules||[]).map(m=>m.title||m.name||String(m)).join('\n'));
    set('assessment_method',programme?.assessment_method||'');
    set('maximum_participants',programme?.maximum_participants||'');
    set('venue_requirements',programme?.venue_requirements||'');

    const termsReady=['ONBOARDING','ACTIVE'].includes(profile?.collaboration_status);
    const reviewLocked=Boolean(programme && programme.publish_status!=='DRAFT');
    const locked=!termsReady || reviewLocked;
    form.querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=Boolean(locked)});
    if($('programmeProposal')) $('programmeProposal').disabled=false;
    if($('saveProgrammeDraft')) $('saveProgrammeDraft').disabled=Boolean(locked);
    if($('submitProgrammeReview')) $('submitProgrammeReview').disabled=Boolean(locked);

    if(!termsReady){
      msg('programmeFormMessage','Approved proposal found. Please accept the Trainer Collaboration Terms first to continue with full programme details.','warning');
    }else if(reviewLocked){
      msg('programmeFormMessage',`This programme is ${programme.publish_status.replaceAll('_',' ')} and is locked until EasyLatih returns it for amendment.`,'info');
    }else{
      msg('programmeFormMessage','','info');
    }
  }

  function openProgramme(id){
    const p=programmes.find(x=>x.id===id); if(!p)return;
    const proposal=eligibleProposals.find(x=>x.id===p.proposal_id);
    if($('programmeProposal')) $('programmeProposal').value=p.proposal_id||'';
    setProgrammeForm(p,proposal);
    $('fullProgrammeForm')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function programmePayload(form){
    const f=new FormData(form);
    const proposal=eligibleProposals.find(p=>p.id===String(f.get('proposal_id')));
    if(!proposal) throw new Error('Please select an approved programme proposal.');
    return {
      proposal_id:proposal.id,trainer_id:user.id,
      title:String(f.get('title')||'').trim(),category:String(f.get('category')||'').trim(),training_type:String(f.get('training_type')||'BOTH'),
      programme_overview:String(f.get('programme_overview')||'').trim(),learning_objectives:splitLines(f.get('learning_objectives')),learning_outcomes:splitLines(f.get('learning_outcomes')),
      target_participants:String(f.get('target_participants')||'').trim(),prerequisites:String(f.get('prerequisites')||'').trim(),duration:String(f.get('duration')||'').trim(),
      total_contact_hours:Number(f.get('total_contact_hours')||0)||null,delivery_method:String(f.get('delivery_method')||'').trim(),training_methodology:String(f.get('training_methodology')||'').trim(),
      modules:splitLines(f.get('modules')).map((title,index)=>({module:index+1,title})),assessment_method:String(f.get('assessment_method')||'').trim(),maximum_participants:Number(f.get('maximum_participants')||0)||null,
      venue_requirements:String(f.get('venue_requirements')||'').trim()
    };
  }

  async function saveProgramme(submit=false){
    const form=$('fullProgrammeForm'); if(!form)return;
    try{
      await refreshProfile();
      if(!['ONBOARDING','ACTIVE'].includes(profile?.collaboration_status)) throw new Error('Please accept the Trainer Collaboration Terms before saving full programme details.');
      msg('programmeFormMessage',submit?'Submitting full programme for EasyLatih review…':'Saving draft…','info');
      const row=programmePayload(form);
      const required=[row.title,row.category,row.programme_overview,row.target_participants,row.duration,row.delivery_method,row.training_methodology];
      if(submit && (!required.every(Boolean)||!row.learning_objectives.length||!row.learning_outcomes.length||!row.modules.length)) throw new Error('Please complete the programme overview, objectives, outcomes, modules and delivery details before submission.');
      let id=form.dataset.programmeId;
      if(id){
        const {error}=await client.from('programmes').update(row).eq('id',id); if(error)throw error;
      }else{
        const {data,error}=await client.from('programmes').insert({...row,publish_status:'DRAFT',etris_status:'NOT_SUBMITTED'}).select('id').single(); if(error)throw error; id=data.id; form.dataset.programmeId=id;
      }
      if(submit){
        const {error}=await client.from('programmes').update({publish_status:'UNDER_REVIEW'}).eq('id',id); if(error)throw error;
      }
      msg('programmeFormMessage',submit?'Full programme submitted. EasyLatih will review it before eTRiS registration and publication.':'Programme draft saved.','success');
      await loadProgrammeEditor();
      if(submit) setProgrammeForm(programmes.find(p=>p.id===id),eligibleProposals.find(p=>p.id===row.proposal_id));
    }catch(err){msg('programmeFormMessage',err.message||'Unable to save programme.','danger')}
  }

  async function refreshAfterTermsAcceptance(){
    for(let attempt=0;attempt<10;attempt++){
      await new Promise(resolve=>setTimeout(resolve,300));
      try{await refreshProfile();}catch{}
      if(['ONBOARDING','ACTIVE'].includes(profile?.collaboration_status)){
        await loadOnboarding();
        return;
      }
    }
  }

  function wire(){
    $('onboardingForm')?.addEventListener('submit',saveOnboarding);
    $('profilePhoto')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)renderPhoto(URL.createObjectURL(f));});
    $('programmeProposal')?.addEventListener('change',e=>{
      const proposal=eligibleProposals.find(p=>p.id===e.target.value);
      const existing=programmes.find(p=>p.proposal_id===e.target.value);
      setProgrammeForm(existing||null,proposal||null);
    });
    $('saveProgrammeDraft')?.addEventListener('click',()=>saveProgramme(false));
    $('submitProgrammeReview')?.addEventListener('click',()=>{if(confirm('Submit this full programme to EasyLatih for review? You will not be able to edit it while it is under review.'))saveProgramme(true)});
    $('acceptTermsButton')?.addEventListener('click',refreshAfterTermsAcceptance);
  }

  document.addEventListener('DOMContentLoaded',async()=>{buildEtrisFields();wire();await loadOnboarding();});
})();