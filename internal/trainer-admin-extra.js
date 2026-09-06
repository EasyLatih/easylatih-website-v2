(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const fmt=v=>v?new Intl.DateTimeFormat('en-MY',{dateStyle:'medium'}).format(new Date(v)):'-';
  let admin=null;

  async function verifyAdmin(){
    const {data,error}=await client.auth.getUser();
    if(error||!data.user||data.user.app_metadata?.role!=='admin')return null;
    return data.user;
  }

  function badge(status){
    const s=String(status||'').replaceAll('_',' ');
    const c=['ACTIVE','APPROVED','PUBLISHED'].includes(status)?'green':['ONBOARDING','UNDER_REVIEW','READY','SUBMITTED'].includes(status)?'amber':['REJECTED','INACTIVE'].includes(status)?'red':'blue';
    return `<span class="badge ${c}">${esc(s)}</span>`;
  }

  async function loadTrainers(){
    const holder=$('adminTrainerList');if(!holder)return;
    const {data,error}=await client.from('profiles').select('*,trainer_onboarding(*)').order('created_at',{ascending:false}).limit(300);
    if(error){holder.innerHTML=`<div class="alert alert-danger">${esc(error.message)}</div>`;return}
    holder.innerHTML=(data||[]).length?(data||[]).map(t=>{
      const o=Array.isArray(t.trainer_onboarding)?t.trainer_onboarding[0]:t.trainer_onboarding;
      const complete=Boolean(o?.onboarding_completed_at);
      return `<div class="list-card"><div class="list-card-top"><div><h3>${esc(t.full_name)}</h3><div class="meta"><span>${esc(t.email)}</span><span>${esc(t.phone)}</span><span>${esc(t.state)}</span></div></div>${badge(t.collaboration_status)}</div><p class="muted">${esc(t.expertise_summary)}</p><div class="meta"><span>Onboarding: <strong>${complete?'Complete':'Pending'}</strong></span><span>Availability: ${esc(t.availability_status)}</span><span>Joined: ${fmt(t.created_at)}</span></div>${o?.profile_photo_url?`<div class="admin-photo"><img src="${esc(o.profile_photo_url)}" alt="${esc(t.full_name)}"></div>`:''}<div class="btn-row">${complete&&t.collaboration_status!=='ACTIVE'?`<button class="btn btn-primary" data-activate="${t.id}">Activate Trainer</button>`:''}${t.collaboration_status==='ACTIVE'?`<button class="btn btn-outline" data-inactivate="${t.id}">Set Inactive</button>`:''}</div></div>`;
    }).join(''):'<div class="empty">No trainers yet.</div>';
    holder.querySelectorAll('[data-activate]').forEach(b=>b.addEventListener('click',()=>setTrainerStatus(b.dataset.activate,'ACTIVE')));
    holder.querySelectorAll('[data-inactivate]').forEach(b=>b.addEventListener('click',()=>setTrainerStatus(b.dataset.inactivate,'INACTIVE')));
  }

  async function setTrainerStatus(id,status){
    if(!confirm(`Set trainer status to ${status}?`))return;
    const {error}=await client.from('profiles').update({collaboration_status:status}).eq('id',id);
    if(error)return alert(error.message);
    await loadTrainers();
  }

  async function loadProgrammes(){
    const holder=$('adminProgrammeList');if(!holder)return;
    const {data,error}=await client.from('programmes').select('*,profiles(full_name,email,phone),programme_proposals(id,title,status)').order('updated_at',{ascending:false}).limit(300);
    if(error){holder.innerHTML=`<div class="alert alert-danger">${esc(error.message)}</div>`;return}
    holder.innerHTML=(data||[]).length?(data||[]).map(p=>{
      const modules=(p.modules||[]).map(m=>m.title||m.name||String(m));
      return `<div class="list-card"><div class="list-card-top"><div><h3>${esc(p.title)}</h3><div class="meta"><span>${esc(p.profiles?.full_name||'Trainer')}</span><span>${esc(p.category)}</span><span>${esc(p.training_type)}</span></div></div>${badge(p.publish_status)}</div><p><strong>Target:</strong> ${esc(p.target_participants||'-')}</p><p class="muted">${esc(p.programme_overview||'-')}</p><div class="review-grid"><div><strong>Objectives</strong><ul>${(p.learning_objectives||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div><strong>Outcomes</strong><ul>${(p.learning_outcomes||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div><strong>Modules</strong><ol>${modules.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div><div><strong>Methodology</strong><p>${esc(p.training_methodology||'-')}</p><strong>Assessment</strong><p>${esc(p.assessment_method||'-')}</p></div></div><div class="meta"><span>Duration: ${esc(p.duration||'-')}</span><span>Contact Hours: ${esc(p.total_contact_hours||'-')}</span><span>eTRiS: ${esc(p.etris_status)}</span><span>Ref: ${esc(p.etris_reference||'-')}</span></div><div class="btn-row">${p.publish_status==='UNDER_REVIEW'?`<button class="btn btn-primary" data-approve-etris="${p.id}">Approve for eTRiS</button><button class="btn btn-outline" data-amend="${p.id}">Return for Amendment</button>`:''}${p.etris_status==='READY'?`<button class="btn btn-primary" data-etris-approved="${p.id}">Mark eTRiS Approved</button>`:''}${p.etris_status==='APPROVED'&&p.publish_status!=='PUBLISHED'?`<button class="btn btn-primary" data-publish="${p.id}">Publish Programme</button>`:''}${p.publish_status==='PUBLISHED'?`<button class="btn btn-outline" data-unpublish="${p.id}">Unpublish</button>`:''}</div></div>`;
    }).join(''):'<div class="empty">No full programme submissions yet.</div>';
    holder.querySelectorAll('[data-approve-etris]').forEach(b=>b.addEventListener('click',()=>approveForEtris(b.dataset.approveEtris)));
    holder.querySelectorAll('[data-amend]').forEach(b=>b.addEventListener('click',()=>returnAmendment(b.dataset.amend)));
    holder.querySelectorAll('[data-etris-approved]').forEach(b=>b.addEventListener('click',()=>markEtrisApproved(b.dataset.etrisApproved)));
    holder.querySelectorAll('[data-publish]').forEach(b=>b.addEventListener('click',()=>publishProgramme(b.dataset.publish,true)));
    holder.querySelectorAll('[data-unpublish]').forEach(b=>b.addEventListener('click',()=>publishProgramme(b.dataset.unpublish,false)));
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

  async function refresh(){await Promise.all([loadTrainers(),loadProgrammes()])}
  document.addEventListener('DOMContentLoaded',async()=>{admin=await verifyAdmin();if(!admin)return;await refresh();$('refreshTrainerWorkflow')?.addEventListener('click',refresh)});
})();
