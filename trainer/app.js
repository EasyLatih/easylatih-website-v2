(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  const configured = Boolean(cfg.supabaseUrl && cfg.supabasePublishableKey && window.supabase);
  const client = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  const ACTIVE_PROPOSAL_STATUSES = ['SUBMITTED','UNDER_REVIEW','CLARIFICATION_REQUIRED','SHORTLISTED','APPROVED_TO_COLLAB','ONBOARDING','FULL_DETAILS_SUBMITTED','APPROVED_FOR_ETRIS'];

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>'\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
  const money = (value) => value === null || value === undefined || value === '' ? '-' : `RM${Number(value).toLocaleString('en-MY')}`;
  const fmtDate = (value) => value ? new Intl.DateTimeFormat('en-MY',{dateStyle:'medium'}).format(new Date(value)) : '-';
  const fmtDateTime = (value) => value ? new Intl.DateTimeFormat('en-MY',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '-';

  function showMessage(id, text, type='info') {
    const el = $(id);
    if (!el) return;
    if (!text) { el.className='hidden'; el.textContent=''; return; }
    el.className = `alert alert-${type}`;
    el.textContent = text;
  }

  function statusBadge(status) {
    const label = String(status || 'UNKNOWN').replaceAll('_',' ');
    const green = ['APPROVED_TO_COLLAB','ACTIVE','PUBLISHED','AWARDED','INTERESTED','APPROVED_FOR_ETRIS'].includes(status);
    const amber = ['SUBMITTED','UNDER_REVIEW','SHORTLISTED','CLARIFICATION_REQUIRED','ONBOARDING','FULL_DETAILS_SUBMITTED','PENDING'].includes(status);
    const red = ['REJECTED','WITHDRAWN','CLOSED','NOT_INTERESTED','UNAVAILABLE'].includes(status);
    return `<span class="badge ${green?'green':amber?'amber':red?'red':'blue'}">${esc(label)}</span>`;
  }

  function setupBanner() {
    document.querySelectorAll('[data-needs-backend]').forEach(el => {
      if (!configured) el.classList.remove('hidden');
    });
    document.querySelectorAll('[data-disable-without-backend]').forEach(el => {
      if (!configured) el.disabled = true;
    });
  }

  async function getSession() {
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session;
  }

  async function requireSession() {
    const session = await getSession();
    if (!session) {
      location.replace('./index.html?login=1');
      return null;
    }
    return session;
  }

  async function loadPublicStats() {
    const ids = ['registeredStat','approvedStat','activeStat','publishedStat'];
    if (!client) { ids.forEach(id => { if ($(id)) $(id).textContent='—'; }); return; }
    const { data, error } = await client.from('portal_stats').select('*').eq('id',1).maybeSingle();
    if (error || !data) return;
    if ($('registeredStat')) $('registeredStat').textContent = Number(data.registered_trainers || 0).toLocaleString();
    if ($('approvedStat')) $('approvedStat').textContent = Number(data.approved_collaborators || 0).toLocaleString();
    if ($('activeStat')) $('activeStat').textContent = Number(data.active_trainers || 0).toLocaleString();
    if ($('publishedStat')) $('publishedStat').textContent = Number(data.published_programmes || 0).toLocaleString();
  }

  async function loadCategoryIntake() {
    const holder = $('categoryIntake');
    if (!holder) return;
    if (!client) {
      holder.innerHTML = '<div class="muted">Category intake will appear once the EasyLatih Supabase project is connected.</div>';
      return;
    }
    const { data, error } = await client.from('training_categories').select('name,intake_status,active_trainer_count').order('sort_order');
    if (error) { holder.innerHTML='<div class="muted">Unable to load category intake.</div>'; return; }
    holder.innerHTML = (data || []).map(row => `
      <div class="category-row">
        <div>${esc(row.name)}</div>
        <div>${Number(row.active_trainer_count || 0)} trainers</div>
        <div class="category-status ${String(row.intake_status).toLowerCase()}">${esc(row.intake_status)}</div>
      </div>`).join('') || '<div class="muted">No categories configured.</div>';
  }

  async function initRegistration() {
    setupBanner();
    await Promise.all([loadPublicStats(), loadCategoryIntake()]);

    const qs = new URLSearchParams(location.search);
    if (qs.get('login') === '1') {
      $('loginCard')?.scrollIntoView({behavior:'smooth'});
    }

    const session = await getSession().catch(() => null);
    if (session && $('continuePortal')) $('continuePortal').classList.remove('hidden');

    $('registerForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formEl = e.currentTarget;
      if (!client) return showMessage('registerMessage','Backend belum disambungkan. Registration belum dibuka.','warning');
      const form = new FormData(formEl);
      if (!form.get('privacy_ack')) return showMessage('registerMessage','Please acknowledge the Privacy Notice to continue.','danger');
      const password = String(form.get('password') || '');
      if (password.length < 8) return showMessage('registerMessage','Password must be at least 8 characters.','danger');
      const btn = $('registerButton'); btn.disabled = true;
      showMessage('registerMessage','Creating your trainer account…','info');
      try {
        const { data, error } = await client.auth.signUp({
          email: String(form.get('email')).trim(),
          password,
          options: { data: {
            full_name: String(form.get('full_name')).trim(),
            phone: String(form.get('phone')).trim(),
            state: String(form.get('state')).trim(),
            expertise_summary: String(form.get('expertise_summary')).trim(),
            linkedin_url: String(form.get('linkedin_url') || '').trim(),
            privacy_notice_version: cfg.privacyNoticeVersion,
            privacy_acknowledged_at: new Date().toISOString(),
            marketing_consent: Boolean(form.get('marketing_consent'))
          }}
        });
        if (error) throw error;
        if (data.session) {
          location.href='./dashboard.html';
        } else {
          formEl.reset();
          showMessage('registerMessage','Account created. Please check your email to verify your account, then log in.','success');
        }
      } catch (err) {
        showMessage('registerMessage', err.message || 'Unable to create account.','danger');
      } finally { btn.disabled = false; }
    });

    $('loginForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!client) return showMessage('loginMessage','Backend belum disambungkan. Login belum dibuka.','warning');
      const form = new FormData(e.currentTarget);
      const btn = $('loginButton'); btn.disabled=true;
      showMessage('loginMessage','Signing in…','info');
      try {
        const { error } = await client.auth.signInWithPassword({email:String(form.get('email')).trim(),password:String(form.get('password'))});
        if (error) throw error;
        location.href='./dashboard.html';
      } catch (err) { showMessage('loginMessage',err.message || 'Unable to sign in.','danger'); }
      finally { btn.disabled=false; }
    });
  }

  let currentUser = null;
  let currentProfile = null;
  let currentProposals = [];

  function switchSection(name) {
    document.querySelectorAll('[data-section]').forEach(el => el.classList.toggle('hidden', el.dataset.section !== name));
    document.querySelectorAll('[data-nav]').forEach(el => el.classList.toggle('active', el.dataset.nav === name));
  }

  async function loadProfile() {
    const { data, error } = await client.from('profiles').select('*, trainer_preferences(*)').eq('id',currentUser.id).single();
    if (error) throw error;
    currentProfile = data;
    if ($('trainerName')) $('trainerName').textContent = data.full_name || currentUser.email;
    if ($('collabStatus')) $('collabStatus').innerHTML = statusBadge(data.collaboration_status || 'APPLICANT');
    if ($('profileCompletion')) {
      const required = [data.full_name,data.phone,data.state,data.expertise_summary];
      const pct = Math.round(required.filter(Boolean).length/required.length*100);
      $('profileCompletion').textContent=`${pct}%`;
      if ($('profileProgressBar')) $('profileProgressBar').style.width=`${pct}%`;
    }
    const pref = Array.isArray(data.trainer_preferences) ? data.trainer_preferences[0] : data.trainer_preferences;
    fillProfileForm(data,pref || {});
    const onboardingUnlocked = ['APPROVED_TO_COLLAB','ONBOARDING','ACTIVE'].includes(data.collaboration_status);
    document.querySelectorAll('[data-onboarding]').forEach(el => el.classList.toggle('hidden',!onboardingUnlocked));
    if (!onboardingUnlocked && $('onboardingLocked')) $('onboardingLocked').classList.remove('hidden');
  }

  function fillProfileForm(p,pref) {
    const values = {
      profile_full_name:p.full_name, profile_phone:p.phone, profile_state:p.state,
      profile_expertise_summary:p.expertise_summary, profile_linkedin_url:p.linkedin_url,
      profile_bio:p.professional_bio, profile_availability:p.availability_status,
      profile_travel_states:(pref.travel_states || []).join(', '),
      profile_expertise_tags:(pref.expertise_tags || []).join(', ')
    };
    Object.entries(values).forEach(([id,val]) => { if ($(id)) $(id).value=val || ''; });
    if ($('pref_public')) $('pref_public').checked = Boolean(pref.accepts_public ?? true);
    if ($('pref_inhouse')) $('pref_inhouse').checked = Boolean(pref.accepts_inhouse ?? true);
    if ($('pref_online')) $('pref_online').checked = Boolean(pref.accepts_online ?? true);
    if ($('approvedCategoryList')) $('approvedCategoryList').innerHTML = (pref.categories || []).length ? (pref.categories || []).map(x=>`<span class="tag">${esc(x)}</span>`).join('') : '<span class="muted">No approved category yet.</span>';
  }

  async function loadProposals() {
    const { data, error } = await client.from('programme_proposals').select('*').eq('trainer_id',currentUser.id).order('created_at',{ascending:false});
    if (error) throw error;
    currentProposals = data || [];
    const activeCount = currentProposals.filter(p => ACTIVE_PROPOSAL_STATUSES.includes(p.status)).length;
    if ($('activeProposalCount')) $('activeProposalCount').textContent = `${activeCount}/${cfg.maxActiveProposals || 5}`;
    if ($('proposalSlots')) $('proposalSlots').textContent = Math.max(0,(cfg.maxActiveProposals || 5)-activeCount);
    if ($('proposalSubmitButton')) $('proposalSubmitButton').disabled = activeCount >= (cfg.maxActiveProposals || 5);
    const holder = $('proposalList');
    if (!holder) return;
    holder.innerHTML = currentProposals.length ? currentProposals.map(p => `
      <div class="list-card">
        <div class="list-card-top"><div><h3>${esc(p.title)}</h3><div class="meta"><span>${esc(p.category)}</span><span>${esc(p.training_type)}</span><span>${esc(p.duration)}</span></div></div>${statusBadge(p.status)}</div>
        <div class="muted">Target: ${esc(p.target_audience)}</div>
        <div class="tag-wrap">${(p.key_learning_points || []).slice(0,5).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div>
        <div class="btn-row"><button class="btn btn-soft" data-open-comments="${p.id}">View comments</button></div>
      </div>`).join('') : '<div class="empty">No programme proposal yet. You may submit up to 5 active proposals.</div>';
    holder.querySelectorAll('[data-open-comments]').forEach(btn => btn.addEventListener('click',() => loadProposalComments(btn.dataset.openComments)));
  }

  async function submitProposal(formEl) {
    const activeCount = currentProposals.filter(p => ACTIVE_PROPOSAL_STATUSES.includes(p.status)).length;
    if (activeCount >= (cfg.maxActiveProposals || 5)) throw new Error('You already have 5 active proposals. Please wait until one is completed, rejected or withdrawn.');
    const f = new FormData(formEl);
    const points = String(f.get('key_learning_points') || '').split('\n').map(x=>x.trim()).filter(Boolean).slice(0,5);
    const row = {
      trainer_id:currentUser.id,
      title:String(f.get('title')).trim(), category:String(f.get('category')).trim(), training_type:String(f.get('training_type')).trim(),
      target_audience:String(f.get('target_audience')).trim(), problem_statement:String(f.get('problem_statement')).trim(), summary:String(f.get('summary')).trim(),
      key_learning_points:points, duration:String(f.get('duration')).trim(), delivery_method:String(f.get('delivery_method')).trim(),
      preferred_location:String(f.get('preferred_location') || '').trim(), expected_fee:Number(f.get('expected_fee') || 0) || null,
      status:'SUBMITTED'
    };
    const { error } = await client.from('programme_proposals').insert(row);
    if (error) throw error;
  }

  async function loadProposalComments(proposalId) {
    const proposal = currentProposals.find(p=>p.id===proposalId);
    if ($('commentProposalTitle')) $('commentProposalTitle').textContent = proposal?.title || 'Proposal';
    if ($('commentProposalId')) $('commentProposalId').value = proposalId;
    switchSection('comments');
    const holder=$('commentThread'); holder.innerHTML='<div class="muted">Loading comments…</div>';
    const { data,error } = await client.from('proposal_comments').select('*').eq('proposal_id',proposalId).eq('visibility','TRAINER').order('created_at');
    if (error) { holder.innerHTML='<div class="alert alert-danger">Unable to load comments.</div>'; return; }
    holder.innerHTML=(data||[]).length ? data.map(c=>`<div class="comment ${c.author_role==='ADMIN'?'admin':''}"><div class="comment-head"><strong>${esc(c.author_role==='ADMIN'?'EasyLatih':currentProfile.full_name)}</strong><span>${fmtDateTime(c.created_at)}</span></div><div>${esc(c.body)}</div></div>`).join('') : '<div class="empty">No comments yet.</div>';
  }

  async function loadOpportunities() {
    const holder=$('opportunityList'); if(!holder) return;
    const { data,error } = await client.from('opportunity_recipients').select('id,viewed_at,recipient_status,opportunity_id,opportunities(*)').eq('trainer_id',currentUser.id).order('created_at',{ascending:false});
    if(error){holder.innerHTML='<div class="alert alert-danger">Unable to load opportunities.</div>';return;}
    const rows=data||[];
    holder.innerHTML=rows.length?rows.map(r=>{const o=Array.isArray(r.opportunities)?(r.opportunities[0]||{}):(r.opportunities||{});const fee=(o.trainer_fee_min||o.trainer_fee_max)?`${money(o.trainer_fee_min)}${o.trainer_fee_max&&o.trainer_fee_max!==o.trainer_fee_min?` – ${money(o.trainer_fee_max)}`:''}`:'To be discussed';return `<div class="list-card"><div class="list-card-top"><div><h3>${esc(o.title||o.topic)}</h3><div class="meta"><span>${esc(o.training_type)}</span><span>${esc(o.category)}</span><span>${esc(o.location||'TBC')}</span><span>${fmtDate(o.training_date)}</span></div></div>${statusBadge(o.status)}</div><div class="opportunity-details"><p><strong>Client industry:</strong> ${esc(o.client_industry||'Not stated')}</p><p><strong>Target participants:</strong> ${esc(o.target_audience||'Not stated')}</p><p><strong>Duration / estimated pax:</strong> ${esc(o.duration||'Not stated')} · ${esc(o.estimated_pax||'-')} pax</p><p><strong>Trainer fee offered:</strong> ${fee}</p>${(o.expertise_tags||[]).length?`<p><strong>Requested expertise:</strong> ${esc((o.expertise_tags||[]).join(', '))}</p>`:''}${o.special_requirements?`<p><strong>Special requirements:</strong> ${esc(o.special_requirements)}</p>`:''}</div><p class="muted">Response deadline: <strong>${fmtDateTime(o.response_deadline)}</strong></p><div class="btn-row"><button class="btn btn-primary" data-interest="${o.id}">I'm Interested</button><button class="btn btn-outline" data-unavailable="${o.id}">Not Available</button><button class="btn btn-soft" data-decline="${o.id}">Not Interested</button></div></div>`}).join(''):'<div class="empty">No matching opportunities at the moment.</div>';
    holder.querySelectorAll('[data-interest]').forEach(b=>b.addEventListener('click',()=>respondOpportunity(b.dataset.interest,'INTERESTED')));
    holder.querySelectorAll('[data-unavailable]').forEach(b=>b.addEventListener('click',()=>respondOpportunity(b.dataset.unavailable,'UNAVAILABLE')));
    holder.querySelectorAll('[data-decline]').forEach(b=>b.addEventListener('click',()=>respondOpportunity(b.dataset.decline,'NOT_INTERESTED')));
  }

  async function respondOpportunity(opportunityId,response) {
    let fee=null,remarks='';
    if(response==='INTERESTED'){
      const input=prompt('Proposed trainer fee (RM). Leave blank if you accept the stated range.','');
      fee=input?Number(input):null;
      remarks=prompt('Any remarks or availability notes?','')||'';
    }
    const { error } = await client.from('opportunity_responses').upsert({opportunity_id:opportunityId,trainer_id:currentUser.id,response,proposed_fee:fee,remarks,responded_at:new Date().toISOString()},{onConflict:'opportunity_id,trainer_id'});
    if(error) return alert(error.message);
    alert('Response submitted.');
    loadOpportunities();
  }

  async function loadProgrammes() {
    const holder=$('programmeList'); if(!holder)return;
    const {data,error}=await client.from('programmes').select('*').eq('trainer_id',currentUser.id).order('created_at',{ascending:false});
    if(error){holder.innerHTML='<div class="alert alert-danger">Unable to load programmes.</div>';return;}
    holder.innerHTML=(data||[]).length?(data||[]).map(p=>`<div class="list-card"><div class="list-card-top"><h3>${esc(p.title)}</h3>${statusBadge(p.publish_status)}</div><div class="meta"><span>${esc(p.category)}</span><span>eTRiS: ${esc(p.etris_status)}</span><span>Version ${esc(p.current_version||1)}</span></div></div>`).join(''):'<div class="empty">Approved programmes will appear here after onboarding and full programme review.</div>';
  }

  async function saveProfile(e) {
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const profileUpdate={
      full_name:String(f.get('full_name')).trim(),phone:String(f.get('phone')).trim(),state:String(f.get('state')).trim(),
      expertise_summary:String(f.get('expertise_summary')).trim(),linkedin_url:String(f.get('linkedin_url')||'').trim(),
      professional_bio:String(f.get('professional_bio')||'').trim(),availability_status:String(f.get('availability_status')||'AVAILABLE')
    };
    const prefUpdate={trainer_id:currentUser.id,accepts_public:Boolean(f.get('accepts_public')),accepts_inhouse:Boolean(f.get('accepts_inhouse')),accepts_online:Boolean(f.get('accepts_online')),
      travel_states:String(f.get('travel_states')||'').split(',').map(x=>x.trim()).filter(Boolean),expertise_tags:String(f.get('expertise_tags')||'').split(',').map(x=>x.trim()).filter(Boolean)};
    const [a,b]=await Promise.all([client.from('profiles').update(profileUpdate).eq('id',currentUser.id),client.from('trainer_preferences').upsert(prefUpdate,{onConflict:'trainer_id'})]);
    if(a.error)throw a.error;if(b.error)throw b.error;
    showMessage('profileMessage','Profile updated.','success');
    await loadProfile();
  }

  async function requestCategoryChange(e) {
    e.preventDefault(); const form=e.currentTarget; const f=new FormData(form);
    const requested_categories=f.getAll('requested_categories').map(x=>String(x).trim()).filter(Boolean);
    if (!requested_categories.length || requested_categories.length>3) throw new Error('Please select between 1 and 3 categories.');
    const {error}=await client.from('trainer_category_change_requests').insert({trainer_id:currentUser.id,requested_categories,reason:String(f.get('reason')).trim()});
    if(error) throw error; form.reset(); showMessage('categoryRequestMessage','Request submitted for EasyLatih review.','success');
  }

  async function acceptCollaborationTerms() {
    if(!confirm('I confirm that I have read and accept the EasyLatih Trainer Collaboration Terms.')) return;
    const {error}=await client.from('trainer_agreements').insert({trainer_id:currentUser.id,agreement_type:'TRAINER_COLLABORATION',version:cfg.collaborationTermsVersion,accepted_at:new Date().toISOString()});
    if(error)return alert(error.message);
    await client.from('profiles').update({terms_accepted_at:new Date().toISOString(),terms_version:cfg.collaborationTermsVersion,collaboration_status:'ONBOARDING'}).eq('id',currentUser.id);
    alert('Terms accepted. You can now complete the onboarding details.');
    await loadProfile();
  }

  async function initDashboard() {
    setupBanner();
    if(!client){ switchSection('overview'); return; }
    const session=await requireSession(); if(!session)return;
    currentUser=session.user;
    $('userEmail').textContent=currentUser.email;
    document.querySelectorAll('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>switchSection(btn.dataset.nav)));
    $('logoutButton')?.addEventListener('click',async()=>{await client.auth.signOut();location.replace('./index.html');});
    $('proposalForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const formEl=e.currentTarget;showMessage('proposalMessage','Submitting…','info');try{await submitProposal(formEl);formEl.reset();showMessage('proposalMessage','Programme proposal submitted for EasyLatih review.','success');await loadProposals();}catch(err){showMessage('proposalMessage',err.message,'danger');}});
    $('commentForm')?.addEventListener('submit',async(e)=>{e.preventDefault();const formEl=e.currentTarget;const f=new FormData(formEl);const proposalId=String(f.get('proposal_id'));const body=String(f.get('body')).trim();if(!body)return;const{error}=await client.from('proposal_comments').insert({proposal_id:proposalId,author_id:currentUser.id,author_role:'TRAINER',visibility:'TRAINER',body});if(error)return alert(error.message);formEl.reset();$('commentProposalId').value=proposalId;loadProposalComments(proposalId);});
    $('profileForm')?.addEventListener('submit',async(e)=>{try{await saveProfile(e);}catch(err){showMessage('profileMessage',err.message,'danger');}});
    $('categoryChangeRequestForm')?.addEventListener('submit',async(e)=>{try{await requestCategoryChange(e);}catch(err){showMessage('categoryRequestMessage',err.message,'danger');}});
    $('acceptTermsButton')?.addEventListener('click',acceptCollaborationTerms);
    await Promise.all([loadProfile(),loadProposals(),loadOpportunities(),loadProgrammes()]);
  }

  async function initAdmin() {
    setupBanner();
    if(!client)return;
    const session=await getSession();
    if(!session){location.replace('../trainer/index.html?login=1');return;}
    if(session.user.app_metadata?.role!=='admin'){
      document.body.innerHTML='<div class="page"><div class="alert alert-danger"><strong>Access denied.</strong> This page requires an EasyLatih admin account.</div></div>';return;
    }
    $('adminEmail').textContent=session.user.email;
    $('adminLogout')?.addEventListener('click',async()=>{await client.auth.signOut();location.replace('../trainer/index.html');});
    await refreshAdmin();
    $('refreshAdmin')?.addEventListener('click',refreshAdmin);
    $('createOpportunityForm')?.addEventListener('submit',createOpportunity);
  }

  async function refreshAdmin(){
    const [{data:stats},{data:proposals},{data:opps},{data:categoryRequests}] = await Promise.all([
      client.from('portal_stats').select('*').eq('id',1).maybeSingle(),
      client.from('programme_proposals').select('*,profiles(full_name,email,phone,state)').order('created_at',{ascending:false}).limit(200),
      client.from('opportunities').select('*,opportunity_responses(*)').order('created_at',{ascending:false}).limit(100),
      client.from('trainer_category_change_requests').select('*,profiles(full_name,state)').eq('status','PENDING').order('created_at',{ascending:false})
    ]);
    if(stats){ ['registered_trainers','approved_collaborators','active_trainers','published_programmes','proposals_under_review'].forEach(k=>{const el=$(k);if(el)el.textContent=Number(stats[k]||0).toLocaleString();}); }
    renderAdminProposals(proposals||[]);
    renderAdminCategoryRequests(categoryRequests||[]);
    renderAdminOpportunities(opps||[]);
  }

  function renderAdminCategoryRequests(rows){
    const holder=$('adminCategoryRequestList'); if(!holder)return;
    holder.innerHTML=rows.length?rows.map(r=>`<div class="list-card"><div class="list-card-top"><div><h3>${esc(r.profiles?.full_name||'Trainer')}</h3><div class="meta"><span>${esc(r.profiles?.state||'-')}</span><span>${fmtDate(r.created_at)}</span></div></div>${statusBadge(r.status)}</div><div class="tag-wrap">${(r.requested_categories||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div><p class="muted">${esc(r.reason)}</p><div class="btn-row"><button class="btn btn-primary" data-category-approve="${r.id}">Approve Categories</button><button class="btn btn-danger" data-category-reject="${r.id}">Reject</button></div></div>`).join(''):'<div class="empty">No pending category requests.</div>';
    holder.querySelectorAll('[data-category-approve]').forEach(b=>b.addEventListener('click',()=>reviewCategoryRequest(b.dataset.categoryApprove,'APPROVED')));
    holder.querySelectorAll('[data-category-reject]').forEach(b=>b.addEventListener('click',()=>reviewCategoryRequest(b.dataset.categoryReject,'REJECTED')));
  }

  async function reviewCategoryRequest(id,status){
    const admin_note=prompt(status==='APPROVED'?'Optional note to trainer:':'Reason for rejection:','') ?? '';
    if(status==='REJECTED'&&!admin_note.trim()) return;
    const {error}=await client.from('trainer_category_change_requests').update({status,admin_note,reviewed_by:currentUser.id,reviewed_at:new Date().toISOString()}).eq('id',id);
    if(error)return alert(error.message); await refreshAdmin();
  }

  function renderAdminProposals(rows){
    const holder=$('adminProposalList');if(!holder)return;
    holder.innerHTML=rows.length?rows.map(p=>`<div class="list-card"><div class="list-card-top"><div><h3>${esc(p.title)}</h3><div class="meta"><span>${esc(p.profiles?.full_name||'Trainer')}</span><span>${esc(p.category)}</span><span>${esc(p.training_type)}</span><span>${fmtDate(p.created_at)}</span></div></div>${statusBadge(p.status)}</div><p><strong>Target:</strong> ${esc(p.target_audience)}</p><p class="muted">${esc(p.summary)}</p><div class="tag-wrap">${(p.key_learning_points||[]).map(x=>`<span class="tag">${esc(x)}</span>`).join('')}</div><div class="btn-row"><button class="btn btn-primary" data-approve="${p.id}">Approve to Collaborate</button><button class="btn btn-soft" data-clarify="${p.id}">Request Clarification</button><button class="btn btn-outline" data-shortlist="${p.id}">Shortlist</button><button class="btn btn-danger" data-reject="${p.id}">Reject</button><button class="btn btn-outline" data-note="${p.id}">Internal Note</button></div></div>`).join(''):'<div class="empty">No proposals.</div>';
    holder.querySelectorAll('[data-approve]').forEach(b=>b.addEventListener('click',()=>adminProposalAction(b.dataset.approve,'APPROVED_TO_COLLAB','Congratulations. EasyLatih would like to invite you to collaborate. Please complete your trainer onboarding and collaboration terms in the portal.')));
    holder.querySelectorAll('[data-clarify]').forEach(b=>b.addEventListener('click',()=>adminPromptComment(b.dataset.clarify,'CLARIFICATION_REQUIRED','TRAINER')));
    holder.querySelectorAll('[data-shortlist]').forEach(b=>b.addEventListener('click',()=>adminProposalAction(b.dataset.shortlist,'SHORTLISTED')));
    holder.querySelectorAll('[data-reject]').forEach(b=>b.addEventListener('click',()=>adminPromptComment(b.dataset.reject,'REJECTED','TRAINER')));
    holder.querySelectorAll('[data-note]').forEach(b=>b.addEventListener('click',()=>adminPromptComment(b.dataset.note,null,'INTERNAL')));
  }

  async function adminProposalAction(id,status,comment){
    if(status){const{error}=await client.from('programme_proposals').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);}
    if(comment){const{error}=await client.from('proposal_comments').insert({proposal_id:id,author_id:(await getSession()).user.id,author_role:'ADMIN',visibility:'TRAINER',body:comment});if(error)return alert(error.message);}
    await refreshAdmin();
  }

  async function adminPromptComment(id,status,visibility){
    const body=prompt(visibility==='INTERNAL'?'Internal note (trainer cannot see this):':'Comment to trainer:','');if(!body)return;
    if(status){const{error}=await client.from('programme_proposals').update({status,updated_at:new Date().toISOString()}).eq('id',id);if(error)return alert(error.message);}
    const session=await getSession();
    const{error}=await client.from('proposal_comments').insert({proposal_id:id,author_id:session.user.id,author_role:'ADMIN',visibility,body});if(error)return alert(error.message);
    await refreshAdmin();
  }

  async function createOpportunity(e){
    e.preventDefault();const formEl=e.currentTarget;const f=new FormData(formEl);
    const row={title:String(f.get('title')).trim(),training_type:String(f.get('training_type')),category:String(f.get('category')),expertise_tags:String(f.get('expertise_tags')||'').split(',').map(x=>x.trim()).filter(Boolean),client_industry:String(f.get('client_industry')||'').trim(),location:String(f.get('location')||'').trim(),training_date:f.get('training_date')||null,duration:String(f.get('duration')||'').trim(),target_audience:String(f.get('target_audience')||'').trim(),estimated_pax:Number(f.get('estimated_pax')||0)||null,trainer_fee_min:Number(f.get('trainer_fee_min')||0)||null,trainer_fee_max:Number(f.get('trainer_fee_max')||0)||null,special_requirements:String(f.get('special_requirements')||'').trim(),response_deadline:f.get('response_deadline')?new Date(String(f.get('response_deadline'))).toISOString():null,status:'OPEN'};
    const{error}=await client.from('opportunities').insert(row);if(error)return showMessage('opportunityMessage',error.message,'danger');
    formEl.reset();showMessage('opportunityMessage','Opportunity published. Matching active trainers have been queued for notification.','success');await refreshAdmin();
  }

  function renderAdminOpportunities(rows){
    const holder=$('adminOpportunityList'),archiveHolder=$('archivedOpportunityList');if(!holder)return;
    const active=rows.filter(o=>o.status==='OPEN'&&new Date(o.response_deadline)>=new Date());
    const archived=rows.filter(o=>!active.includes(o));
    const card=o=>{const responses=o.opportunity_responses||[];const interested=responses.filter(r=>r.response==='INTERESTED');return `<div class="list-card"><div class="list-card-top"><div><h3>${esc(o.title)}</h3><div class="meta"><span>${esc(o.training_type)}</span><span>${esc(o.category)}</span><span>${esc(o.location||'TBC')}</span><span>${fmtDate(o.training_date)}</span></div></div>${statusBadge(o.status)}</div><p class="muted">${interested.length} interested · ${responses.length} responses · deadline ${fmtDateTime(o.response_deadline)}</p>${interested.length?`<div class="table-wrap"><table><thead><tr><th>Trainer</th><th>Fee</th><th>Remarks</th><th>Action</th></tr></thead><tbody>${interested.map(r=>`<tr><td>${esc(r.trainer_name||r.trainer_id)}</td><td>${money(r.proposed_fee)}</td><td>${esc(r.remarks||'-')}</td><td>${r.is_awarded?'<span class="tag">Awarded</span>':`<button class="btn btn-soft" data-shortlist-response="${r.id}">${r.is_shortlisted?'Shortlisted':'Shortlist'}</button> <button class="btn btn-primary" data-award-response="${r.id}">Award</button>`}</td></tr>`).join('')}</tbody></table></div>`:''}<div class="btn-row">${o.status==='OPEN'?`<button class="btn btn-outline" data-archive-opportunity="${o.id}">Archive</button>`:''}<button class="btn btn-danger" data-delete-opportunity="${o.id}">Delete</button></div></div>`};
    holder.innerHTML=active.length?active.map(card).join(''):'<div class="empty">No active opportunities.</div>';
    if(archiveHolder)archiveHolder.innerHTML=archived.length?archived.map(card).join(''):'<div class="empty">No archived opportunities.</div>';
    document.querySelectorAll('[data-award-response]').forEach(b=>b.addEventListener('click',()=>awardOpportunity(b.dataset.awardResponse)));
    document.querySelectorAll('[data-shortlist-response]').forEach(b=>b.addEventListener('click',()=>shortlistOpportunity(b.dataset.shortlistResponse)));
    document.querySelectorAll('[data-archive-opportunity]').forEach(b=>b.addEventListener('click',()=>setOpportunityStatus(b.dataset.archiveOpportunity,'ARCHIVED')));
    document.querySelectorAll('[data-delete-opportunity]').forEach(b=>b.addEventListener('click',()=>deleteOpportunity(b.dataset.deleteOpportunity)));
  }

  async function shortlistOpportunity(responseId){const{error}=await client.from('opportunity_responses').update({is_shortlisted:true,shortlisted_at:new Date().toISOString()}).eq('id',responseId);if(error)return alert(error.message);await refreshAdmin();}
  async function setOpportunityStatus(id,status){if(!confirm('Archive this opportunity?'))return;const{error}=await client.from('opportunities').update({status}).eq('id',id);if(error)return alert(error.message);await refreshAdmin();}
  async function deleteOpportunity(id){if(!confirm('Delete this opportunity permanently? This cannot be undone.'))return;const{error}=await client.from('opportunities').delete().eq('id',id);if(error)return alert(error.message);await refreshAdmin();}

  async function awardOpportunity(responseId){
    if(!confirm('Award this training opportunity to the selected trainer?'))return;
    const{data:resp,error}=await client.from('opportunity_responses').select('id,opportunity_id,trainer_id').eq('id',responseId).single();if(error)return alert(error.message);
    const a=await client.from('opportunity_responses').update({is_awarded:true,awarded_at:new Date().toISOString()}).eq('id',responseId);if(a.error)return alert(a.error.message);
    const b=await client.from('opportunities').update({status:'AWARDED',awarded_trainer_id:resp.trainer_id}).eq('id',resp.opportunity_id);if(b.error)return alert(b.error.message);
    await refreshAdmin();
  }
  window.EasyLatihPortal = { initRegistration, initDashboard, initAdmin, switchSection };
})();
