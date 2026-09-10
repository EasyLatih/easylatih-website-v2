(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const fmt=v=>v?new Intl.DateTimeFormat('en-MY',{dateStyle:'medium'}).format(new Date(v)):'-';
  let admin=null;
  let renderTrainerList=()=>{};

  async function verifyAdmin(){
    const {data,error}=await client.auth.getUser();
    if(error||!data.user||data.user.app_metadata?.role!=='admin')return null;
    return data.user;
  }

  async function authHeaders(extra={}){
    const {data}=await client.auth.getSession();
    const token=data.session?.access_token;
    if(!token)throw new Error('Please log in again.');
    return {Authorization:`Bearer ${token}`,apikey:cfg.supabasePublishableKey,...extra};
  }

  function badge(status){
    const s=String(status||'').replaceAll('_',' ');
    const c=['ACTIVE','APPROVED','PUBLISHED','VERIFIED'].includes(status)?'green':['ONBOARDING','UNDER_REVIEW','READY','SUBMITTED','PENDING'].includes(status)?'amber':['REJECTED','INACTIVE'].includes(status)?'red':'blue';
    return `<span class="badge ${c}">${esc(s)}</span>`;
  }

  async function viewDriveDocument(documentId){
    try{
      const response=await fetch(`${cfg.supabaseUrl}/functions/v1/trainer-drive-upload`,{
        method:'POST',
        headers:await authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({action:'download',document_id:documentId})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error(result.error||'Unable to open document.');
      const binary=atob(result.base64||'');
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const blob=new Blob([bytes],{type:result.mime_type||'application/octet-stream'});
      const url=URL.createObjectURL(blob);
      window.open(url,'_blank','noopener');
      setTimeout(()=>URL.revokeObjectURL(url),60000);
    }catch(e){alert(e.message||'Unable to open document.')}
  }

  const whatsAppNumber=value=>{
    const digits=String(value||'').replace(/\D/g,'');
    if(!digits)return '';
    if(digits.startsWith('60'))return digits;
    if(digits.startsWith('0'))return `60${digits.slice(1)}`;
    return digits;
  };

  function trainerNeedsReview(status){return ['APPLICANT','APPROVED_TO_COLLAB','ONBOARDING'].includes(status);}

  async function loadTrainers(){
    const holder=$('adminTrainerList');if(!holder)return;
    const [profileRes,proposalRes,programmeRes]=await Promise.all([
      client.from('profiles').select('*,trainer_onboarding(*),trainer_preferences(categories)').order('created_at',{ascending:false}).limit(300),
      client.from('programme_proposals').select('id,trainer_id,title,status,category,updated_at').order('updated_at',{ascending:false}).limit(1200),
      client.from('programmes').select('id,trainer_id,title,publish_status,category,updated_at').order('updated_at',{ascending:false}).limit(1200)
    ]);
    if(profileRes.error){holder.innerHTML=`<div class="alert alert-danger">${esc(profileRes.error.message)}</div>`;return}
    if(proposalRes.error||programmeRes.error){holder.innerHTML=`<div class="alert alert-danger">Unable to load linked trainer modules.</div>`;return}
    const trainers=(profileRes.data||[]).filter(t=>t.id!==admin?.id);
    const modulesByTrainer={};
    [...(proposalRes.data||[]).map(item=>({...item,source:'Proposal'})),...(programmeRes.data||[]).map(item=>({...item,status:item.publish_status,source:'Module'}))].forEach(item=>{
      (modulesByTrainer[item.trainer_id]||=[]).push(item);
    });

    const render=()=>{
      const query=String($('trainerSearch')?.value||'').trim().toLowerCase();
      const statusFilter=String($('trainerStatusFilter')?.value||'ALL');
      const categoryFilter=String($('trainerCategoryFilter')?.value||'ALL');
      const filtered=trainers.filter(t=>{
        const pref=Array.isArray(t.trainer_preferences)?t.trainer_preferences[0]:t.trainer_preferences;
        const categories=pref?.categories||[];
        const matchingStatus=statusFilter==='ALL'||(statusFilter==='PENDING'&&trainerNeedsReview(t.collaboration_status))||(statusFilter==='ACTIVE'&&t.collaboration_status==='ACTIVE')||(statusFilter==='INACTIVE'&&['INACTIVE','REJECTED'].includes(t.collaboration_status));
        const matchingCategory=categoryFilter==='ALL'||categories.includes(categoryFilter)||(modulesByTrainer[t.id]||[]).some(item=>item.category===categoryFilter);
        const searchable=[t.full_name,t.email,t.phone,t.state,t.expertise_summary,...categories,...(modulesByTrainer[t.id]||[]).map(item=>item.title)].join(' ').toLowerCase();
        return matchingStatus&&matchingCategory&&(!query||searchable.includes(query));
      });
      holder.innerHTML=filtered.length?filtered.map(t=>{
        const onboarding=Array.isArray(t.trainer_onboarding)?t.trainer_onboarding[0]:t.trainer_onboarding;
        const complete=Boolean(onboarding?.onboarding_completed_at);
        const pref=Array.isArray(t.trainer_preferences)?t.trainer_preferences[0]:t.trainer_preferences;
        const categories=pref?.categories||[];
        const linkedModules=(modulesByTrainer[t.id]||[]);
        const phone=whatsAppNumber(t.phone);
        const showActivate=complete&&['APPROVED_TO_COLLAB','ONBOARDING'].includes(t.collaboration_status);
        const profileDetails=[
          ['Qualification',onboarding?.academic_qualification],['Professional certifications',onboarding?.professional_certifications],
          ['Training experience',onboarding?.training_experience],['Industry experience',onboarding?.industry_experience],['TTT / eligibility',onboarding?.ttt_status]
        ].filter(([,value])=>value).map(([label,value])=>`<p><strong>${esc(label)}:</strong> ${esc(value)}</p>`).join('');
        return `<details class="list-card collapsible-card" data-trainer-id="${esc(t.id)}"><summary><strong>${esc(t.full_name||'Trainer')}</strong><span>${badge(t.collaboration_status)}</span></summary><div class="card-details"><div class="meta"><span>${esc(t.email)}</span><span>${esc(t.phone)}</span><span>${esc(t.state)}</span></div><div class="tag-wrap">${categories.length?categories.map(c=>`<span class="tag">${esc(c)}</span>`).join(''):'<span class="muted">No approved category</span>'}</div><div class="admin-profile-grid"><div><p><strong>Main expertise</strong></p><p class="muted">${esc(t.expertise_summary||'-')}</p>${t.professional_bio?`<p><strong>Professional bio</strong></p><p class="muted">${esc(t.professional_bio)}</p>`:''}</div><div><p><strong>Onboarding:</strong> ${complete?'Complete':'Pending'}</p><p><strong>Availability:</strong> ${esc(t.availability_status||'-')}</p><p><strong>Joined:</strong> ${fmt(t.created_at)}</p>${profileDetails}</div></div>${onboarding?.profile_photo_url?`<div class="admin-photo"><img src="${esc(onboarding.profile_photo_url)}" alt="${esc(t.full_name)}"></div>`:''}<div class="admin-detail-section"><div class="admin-module-links"><strong>Proposed modules</strong>${linkedModules.length?linkedModules.map(item=>`<button type="button" class="admin-module-link" data-open-module="${esc(item.title)}">${esc(item.title)} <span class="muted">· ${esc(item.source)} · ${esc(String(item.status||'').replaceAll('_',' '))}</span></button>`).join(''):'<span class="muted">No proposed module yet.</span>'}</div></div><div class="btn-row">${phone?`<a class="btn admin-trainer-whatsapp" href="https://wa.me/${phone}" target="_blank" rel="noopener">WhatsApp trainer</a>`:''}${t.collaboration_status==='APPLICANT'?`<button class="btn btn-primary" data-approve-collaboration="${t.id}">Approve Trainer</button>`:''}${showActivate?`<button class="btn btn-primary" data-activate="${t.id}">Activate Trainer</button>`:''}${t.collaboration_status==='ACTIVE'?`<button class="btn btn-outline" data-inactivate="${t.id}">Set Inactive</button>`:''}</div></div></details>`;
      }).join(''):'<div class="empty">No matching trainers.</div>';
      holder.querySelectorAll('[data-approve-collaboration]').forEach(button=>button.addEventListener('click',()=>setTrainerStatus(button.dataset.approveCollaboration,'APPROVED_TO_COLLAB')));
      holder.querySelectorAll('[data-activate]').forEach(button=>button.addEventListener('click',()=>setTrainerStatus(button.dataset.activate,'ACTIVE')));
      holder.querySelectorAll('[data-inactivate]').forEach(button=>button.addEventListener('click',()=>setTrainerStatus(button.dataset.inactivate,'INACTIVE')));
    };
    renderTrainerList=render;
    ['trainerSearch','trainerStatusFilter','trainerCategoryFilter'].forEach(id=>{
      const control=$(id);if(!control||control.dataset.trainerFilterBound==='1')return;
      control.dataset.trainerFilterBound='1';control.addEventListener(id==='trainerSearch'?'input':'change',()=>renderTrainerList());
    });
    render();
  }
  async function setTrainerStatus(id,status){
    if(!confirm(`Set trainer status to ${status}?`))return;
    const changes={collaboration_status:status};
    if(status==='APPROVED_TO_COLLAB')changes.approved_at=new Date().toISOString();
    const {error}=await client.from('profiles').update(changes).eq('id',id);
    if(error)return alert(error.message);
    await loadTrainers();
  }

  async function loadProgrammes(){
    const holder=$('adminProgrammeList');if(!holder)return;
    const [{data,error},{data:courseDocs,error:docsError}]=await Promise.all([
      client.from('programmes').select('*,profiles(full_name,email,phone),programme_proposals(id,title,status)').order('updated_at',{ascending:false}).limit(300),
      client.from('trainer_documents').select('id,programme_id,file_name,verification_status,created_at').eq('document_type','COURSE_CONTENT').eq('provider','GOOGLE_DRIVE').order('created_at',{ascending:false}).limit(1000)
    ]);
    if(error){holder.innerHTML=`<div class="alert alert-danger">${esc(error.message)}</div>`;return}
    if(docsError){holder.innerHTML=`<div class="alert alert-danger">${esc(docsError.message)}</div>`;return}
    const latestCourseDoc={};
    (courseDocs||[]).forEach(d=>{if(d.programme_id&&!latestCourseDoc[d.programme_id])latestCourseDoc[d.programme_id]=d});

    holder.innerHTML=(data||[]).length?(data||[]).map(p=>{
      const modules=(p.modules||[]).map(m=>m.title||m.name||String(m));
      const doc=latestCourseDoc[p.id]||null;
      const docBlock=doc
        ? `<div class="alert alert-info" style="margin-top:.75rem"><strong>Google Docs Course Outline:</strong> ${esc(doc.file_name)} ${badge(doc.verification_status)}<div class="btn-row" style="margin-top:.5rem"><button type="button" class="btn btn-soft" data-view-course-content="${doc.id}">Open Course Outline</button></div></div>`
        : `<div class="alert alert-warning" style="margin-top:.75rem"><strong>Google Docs Course Outline:</strong> Not generated yet. It is generated automatically when a trainer submits complete programme details.</div>`;
      const trainerName=p.profiles?.full_name||'Trainer';
      return `<div class="list-card" data-programme-id="${p.id}"><div class="list-card-top"><div><h3>${esc(p.title)}</h3><div class="meta"><button type="button" class="admin-module-link" data-open-trainer-profile="${esc(p.trainer_id)}">${esc(trainerName)}</button><span>${esc(p.category)}</span><span>${esc(p.training_type)}</span></div></div>${badge(p.publish_status)}</div><p><strong>Target:</strong> ${esc(p.target_participants||'-')}</p><p class="muted">${esc(p.programme_overview||'-')}</p><div class="review-grid"><div><strong>Objectives</strong><ul>${(p.learning_objectives||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div><strong>Outcomes</strong><ul>${(p.learning_outcomes||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div><strong>Modules</strong><ol>${modules.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div><div><strong>Methodology</strong><p>${esc(p.training_methodology||'-')}</p><strong>Assessment</strong><p>${esc(p.assessment_method||'-')}</p></div></div><div class="meta"><span>Duration: ${esc(p.duration||'-')}</span><span>Contact Hours: ${esc(p.total_contact_hours||'-')}</span><span>eTRiS: ${esc(p.etris_status)}</span><span>Ref: ${esc(p.etris_reference||'-')}</span></div>${docBlock}<div class="btn-row">${p.publish_status==='UNDER_REVIEW'?`<button class="btn btn-primary" data-approve-etris="${p.id}">Approve Module for eTRiS</button><button class="btn btn-outline" data-amend="${p.id}">Return for Amendment</button>`:''}${p.etris_status==='READY'?`<button class="btn btn-primary" data-etris-approved="${p.id}">Mark eTRiS Approved</button>`:''}${p.etris_status==='APPROVED'&&p.publish_status!=='PUBLISHED'?`<button class="btn btn-primary" data-publish="${p.id}">Publish to Course Catalog</button>`:''}${p.publish_status==='PUBLISHED'?`<button class="btn btn-outline" data-unpublish="${p.id}">Remove from Course Catalog</button>`:''}<button class="btn btn-danger" data-delete-programme="${p.id}">Delete Module</button></div></div>`;
    }).join(''):'<div class="empty">No full programme submissions yet.</div>';
    holder.querySelectorAll('[data-view-course-content]').forEach(b=>b.addEventListener('click',()=>viewDriveDocument(b.dataset.viewCourseContent)));
    holder.querySelectorAll('[data-approve-etris]').forEach(b=>b.addEventListener('click',()=>approveForEtris(b.dataset.approveEtris)));
    holder.querySelectorAll('[data-amend]').forEach(b=>b.addEventListener('click',()=>returnAmendment(b.dataset.amend)));
    holder.querySelectorAll('[data-etris-approved]').forEach(b=>b.addEventListener('click',()=>markEtrisApproved(b.dataset.etrisApproved)));
    holder.querySelectorAll('[data-publish]').forEach(b=>b.addEventListener('click',()=>publishProgramme(b.dataset.publish,true)));
    holder.querySelectorAll('[data-unpublish]').forEach(b=>b.addEventListener('click',()=>publishProgramme(b.dataset.unpublish,false)));
    holder.querySelectorAll('[data-delete-programme]').forEach(b=>b.addEventListener('click',()=>deleteProgramme(b.dataset.deleteProgramme)));
  }

  async function proposalForProgramme(id){
    const {data,error}=await client.from('programmes').select('id,proposal_id,trainer_id,title').eq('id',id).single();
    if(error)throw error;return data;
  }

  async function addTrainerComment(proposalId,body){
    if(!proposalId||!body)return;
    const {error}=await client.from('proposal_comments').insert({proposal_id:proposalId,author_id:admin.id,author_role:'ADMIN',visibility:'TRAINER',body});
    if(error)throw error;
  }

  async function approveForEtris(id){
    if(!confirm('Approve these full programme details for eTRiS registration?'))return;
    try{
      const p=await proposalForProgramme(id);
      const a=await client.from('programmes').update({publish_status:'APPROVED',etris_status:'READY'}).eq('id',id);if(a.error)throw a.error;
      if(p.proposal_id){const b=await client.from('programme_proposals').update({status:'APPROVED_FOR_ETRIS'}).eq('id',p.proposal_id);if(b.error)throw b.error;await addTrainerComment(p.proposal_id,'Full programme details approved by EasyLatih. The programme is ready for eTRiS registration.');}
      await loadProgrammes();
    }catch(e){alert(e.message)}
  }

  async function returnAmendment(id){
    const comment=prompt('Tell the trainer what needs to be amended:','');if(!comment)return;
    try{
      const p=await proposalForProgramme(id);
      const a=await client.from('programmes').update({publish_status:'DRAFT'}).eq('id',id);if(a.error)throw a.error;
      if(p.proposal_id){const b=await client.from('programme_proposals').update({status:'CLARIFICATION_REQUIRED'}).eq('id',p.proposal_id);if(b.error)throw b.error;await addTrainerComment(p.proposal_id,`Full programme amendment required: ${comment}`);}
      await loadProgrammes();
    }catch(e){alert(e.message)}
  }

  async function markEtrisApproved(id){
    const ref=prompt('Enter eTRiS reference / registration number (if available):','')||'';
    try{
      const p=await proposalForProgramme(id);
      const {error}=await client.from('programmes').update({etris_status:'APPROVED',etris_reference:ref||null}).eq('id',id);if(error)throw error;
      if(p.proposal_id)await addTrainerComment(p.proposal_id,'EasyLatih has completed the eTRiS registration/review stage. The programme is now eligible for publication.');
      await loadProgrammes();
    }catch(e){alert(e.message)}
  }

  async function publishProgramme(id,publish){
    if(!confirm(publish?'Publish this programme to the EasyLatih catalogue?':'Unpublish this programme?'))return;
    try{
      const p=await proposalForProgramme(id);
      const changes=publish?{publish_status:'PUBLISHED',published_at:new Date().toISOString()}:{publish_status:'UNPUBLISHED'};
      const {error}=await client.from('programmes').update(changes).eq('id',id);if(error)throw error;
      if(p.proposal_id){await client.from('programme_proposals').update({status:publish?'PUBLISHED':'APPROVED_FOR_ETRIS'}).eq('id',p.proposal_id);if(publish)await addTrainerComment(p.proposal_id,'Programme approved and published by EasyLatih.');}
      await loadProgrammes();
    }catch(e){alert(e.message)}
  }

  async function deleteProgramme(id){
    const typed=prompt('This permanently deletes the module record. Type DELETE to continue:','');
    if(typed!=='DELETE')return;
    try{
      const programme=await proposalForProgramme(id);
      const {error}=await client.from('programmes').delete().eq('id',id);
      if(error)throw error;
      if(programme.proposal_id){
        const proposalUpdate=await client.from('programme_proposals').update({status:'APPROVED_TO_COLLAB',updated_at:new Date().toISOString()}).eq('id',programme.proposal_id);
        if(proposalUpdate.error)throw proposalUpdate.error;
        await addTrainerComment(programme.proposal_id,'EasyLatih removed the full module record. Please resubmit the corrected full programme details when requested.');
      }
      await loadProgrammes();
    }catch(e){alert(e.message||'Unable to delete this module.');}
  }

  async function refresh(){await Promise.all([loadTrainers(),loadProgrammes()])}
  document.addEventListener('DOMContentLoaded',async()=>{admin=await verifyAdmin();if(!admin)return;await refresh();$('refreshAdmin')?.addEventListener('click',()=>setTimeout(refresh,350));});
})();
