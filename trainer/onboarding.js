(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;
  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const $ = id => document.getElementById(id);
  const splitLines = value => String(value || '').split('\n').map(x => x.trim()).filter(Boolean);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  let user = null;
  let profile = null;
  let onboarding = null;
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

  async function loadOnboarding(){
    user=await getUser(); if(!user)return;
    try{await refreshProfile();}catch{return;}
    if(!['APPROVED_TO_COLLAB','ONBOARDING','ACTIVE'].includes(profile.collaboration_status)) return;
    const {data:o}=await client.from('trainer_onboarding').select('*').eq('trainer_id',user.id).maybeSingle();
    onboarding=o||null;
    const map={
      onboarding_academic:o?.academic_qualification,
      onboarding_certifications:o?.professional_certifications,
      onboarding_working:o?.working_experience,
      onboarding_training:o?.training_experience,
      onboarding_industry:o?.industry_experience,
      onboarding_ttt:o?.ttt_status
    };
    Object.entries(map).forEach(([id,val])=>{if($(id))$(id).value=val||''});
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
    const photoFile=$('profilePhoto')?.files?.[0]||null;
    try{
      msg('onboardingMessage','Saving onboarding details…','info');
      const oldPhotoPath=onboarding?.profile_photo_storage_path||null;
      let photoUrl=onboarding?.profile_photo_url||null;
      let photoPath=oldPhotoPath;
      if(photoFile){
        const uploaded=await uploadPhoto(photoFile);
        photoUrl=uploaded.url; photoPath=uploaded.path;
      }
      if(!photoUrl) throw new Error('Please upload a professional trainer profile photo.');
      const row={
        trainer_id:user.id,
        academic_qualification:String(f.get('academic_qualification')||'').trim(),
        professional_certifications:String(f.get('professional_certifications')||'').trim(),
        working_experience:String(f.get('working_experience')||'').trim(),
        training_experience:String(f.get('training_experience')||'').trim(),
        industry_experience:String(f.get('industry_experience')||'').trim(),
        ttt_status:String(f.get('ttt_status')||'').trim(),
        profile_photo_url:photoUrl,
        profile_photo_storage_path:photoPath,
        photo_consent_version:cfg.collaborationTermsVersion,
        photo_consent_at:onboarding?.photo_consent_at||new Date().toISOString(),
        updated_at:new Date().toISOString()
      };
      const complete=[row.academic_qualification,row.working_experience,row.training_experience,row.ttt_status,row.profile_photo_url].every(Boolean);
      if(complete) row.onboarding_completed_at=onboarding?.onboarding_completed_at||new Date().toISOString();
      const {error}=await client.from('trainer_onboarding').upsert(row,{onConflict:'trainer_id'});
      if(error)throw error;
      if(!onboarding?.photo_consent_at){
        const agreement=await client.from('trainer_agreements').insert({trainer_id:user.id,agreement_type:'PHOTO_MARKETING_CONSENT',version:cfg.collaborationTermsVersion,accepted_at:row.photo_consent_at});
        if(agreement.error)throw agreement.error;
      }
      if(photoFile&&oldPhotoPath&&oldPhotoPath!==photoPath){
        await client.storage.from('trainer-profile-photos').remove([oldPhotoPath]);
      }
      msg('onboardingMessage',complete?'Onboarding saved and marked complete.':'Onboarding saved. Complete the remaining required fields to finish.','success');
      await loadOnboarding();
    }catch(err){msg('onboardingMessage',err.message||'Unable to save onboarding.','danger')}
  }

  async function loadProgrammeEditor(){
    if(!user || !['ONBOARDING','ACTIVE'].includes(profile?.collaboration_status)) return;
    const [{data:props},{data:progs}]=await Promise.all([
      client.from('programme_proposals').select('*').eq('trainer_id',user.id).in('status',['APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS','PUBLISHED']).order('created_at',{ascending:false}),
      client.from('programmes').select('*').eq('trainer_id',user.id).order('created_at',{ascending:false})
    ]);
    eligibleProposals=props||[]; programmes=progs||[];
    const select=$('programmeProposal'); if(!select)return;
    const current=select.value;
    select.innerHTML='<option value="">Select approved proposal</option>'+eligibleProposals.map(p=>`<option value="${p.id}">${esc(p.title)}</option>`).join('');
    if(current && eligibleProposals.some(p=>p.id===current)) select.value=current;
    renderProgrammeSubmissionList();
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
    const locked=programme && programme.publish_status!=='DRAFT';
    form.querySelectorAll('input,select,textarea,button').forEach(el=>{ if(el.type!=='button') el.disabled=Boolean(locked); });
    if($('saveProgrammeDraft')) $('saveProgrammeDraft').disabled=Boolean(locked);
    if($('submitProgrammeReview')) $('submitProgrammeReview').disabled=Boolean(locked);
    msg('programmeFormMessage',locked?`This programme is ${programme.publish_status.replaceAll('_',' ')} and is locked until EasyLatih returns it for amendment.`:'','info');
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
  }

  document.addEventListener('DOMContentLoaded',async()=>{wire();await loadOnboarding();});
})();
