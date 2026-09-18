(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const APPROVED_STATES = ['APPROVED_TO_COLLAB','ONBOARDING','ACTIVE','INACTIVE'];
  const SUBMITTED_PROGRAMME_STATES = ['UNDER_REVIEW','APPROVED','PUBLISHED','UNPUBLISHED'];
  let currentUser = null;
  let refreshTimer = null;
  let state = null;

  function injectStyles() {
    if (document.getElementById('trainerJourneyStyles')) return;
    const style = document.createElement('style');
    style.id = 'trainerJourneyStyles';
    style.textContent = `
      .trainer-journey-card{margin-bottom:1rem;overflow:hidden}
      .trainer-journey-head{display:flex;justify-content:space-between;gap:1rem;align-items:flex-start;flex-wrap:wrap;margin-bottom:.9rem}
      .trainer-journey-head h2{margin:0 0 .2rem}.journey-summary{font-weight:800;color:#0d3b66;white-space:nowrap}
      .journey-steps{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.55rem}
      .journey-step{border:1px solid #e2e8f0;border-radius:12px;padding:.7rem;background:#fff;min-width:0;cursor:pointer;text-align:left;color:inherit}
      .journey-step:hover{border-color:#94a3b8}.journey-step.complete{background:#f0fdf4;border-color:#bbf7d0}.journey-step.action{background:#fffbeb;border-color:#fde68a}.journey-step.waiting{background:#eff6ff;border-color:#bfdbfe}.journey-step.locked{background:#f8fafc;color:#94a3b8;cursor:default}
      .journey-step-top{display:flex;align-items:center;gap:.4rem;margin-bottom:.35rem}.journey-icon{width:25px;height:25px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:.76rem;font-weight:900;background:#e2e8f0;flex:0 0 auto}
      .journey-step.complete .journey-icon{background:#dcfce7;color:#166534}.journey-step.action .journey-icon{background:#fef3c7;color:#92400e}.journey-step.waiting .journey-icon{background:#dbeafe;color:#1d4ed8}
      .journey-step strong{font-size:.82rem;line-height:1.2}.journey-step-status{font-size:.73rem;line-height:1.25;color:#64748b}.journey-step.complete .journey-step-status{color:#166534}.journey-step.action .journey-step-status{color:#92400e}
      .journey-next{margin-top:.85rem}.journey-next strong{display:block;margin-bottom:.15rem}
      .sidebar [data-nav]{position:relative;padding-right:2.55rem}.trainer-nav-badge{position:absolute;right:.7rem;top:50%;transform:translateY(-50%);min-width:20px;height:20px;padding:0 5px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:900;line-height:1;background:#dc2626;color:#fff;box-shadow:0 0 0 2px #fff}
      .trainer-nav-badge.attention{background:#d97706}.trainer-nav-badge.info{background:#2563eb}
      @media(max-width:980px){.journey-steps{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:620px){.journey-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.trainer-journey-head{display:block}.journey-summary{display:block;margin-top:.35rem}}
    `;
    document.head.appendChild(style);
  }

  function ensureJourneyCard() {
    if (document.getElementById('trainerJourneyCard')) return;
    const host = document.querySelector('.layout > section');
    if (!host) return;
    const card = document.createElement('div');
    card.id = 'trainerJourneyCard';
    card.className = 'panel trainer-journey-card';
    card.innerHTML = `
      <div class="trainer-journey-head">
        <div><h2>Your EasyLatih Collaboration Journey</h2><div class="muted">Follow these steps. The portal will show you what is complete, what needs action and what EasyLatih is reviewing.</div></div>
        <div id="trainerJourneySummary" class="journey-summary">Loading…</div>
      </div>
      <div id="trainerJourneySteps" class="journey-steps"></div>
      <div id="trainerJourneyNext" class="journey-next"></div>`;
    host.insertAdjacentElement('afterbegin', card);
  }

  function buttonForNav(tab) {
    return document.querySelector(`.sidebar [data-nav="${tab}"]`);
  }

  function goTo(tab) {
    const btn = buttonForNav(tab);
    if (btn && !btn.classList.contains('hidden')) btn.click();
  }

  function setNavBadge(tab, value, kind='attention', title='Action required') {
    const btn = buttonForNav(tab);
    if (!btn) return;
    btn.querySelector('.trainer-nav-badge')?.remove();
    if (!value) return;
    const badge = document.createElement('span');
    badge.className = `trainer-nav-badge ${kind}`;
    badge.textContent = value === '!' ? '!' : String(Math.min(Number(value) || 0, 99));
    badge.title = title;
    btn.appendChild(badge);
  }

  function lastSeen(reads, tab) {
    const row = reads.find(x => x.tab_name === tab);
    return row?.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  }

  function isAfter(value, timestamp) {
    if (!value) return false;
    return new Date(value).getTime() > timestamp;
  }

  function latestDocument(docs, type) {
    return docs.filter(d => d.document_type === type).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at))[0] || null;
  }

  function computeJourney(s) {
    const proposals = s.proposals;
    const programmes = s.programmes;
    const profile = s.profile;
    const onboarding = s.onboarding;
    const ttt = latestDocument(s.documents,'TTT_CERTIFICATE');
    const cv = latestDocument(s.documents,'RESUME_CV');
    const approved = APPROVED_STATES.includes(profile.collaboration_status);
    const proposalStarted = proposals.some(p => !['REJECTED','WITHDRAWN'].includes(p.status));
    const proposalClarifications = proposals.filter(p => p.status === 'CLARIFICATION_REQUIRED');
    const programmeProposalIds = new Set(programmes.map(p => p.proposal_id).filter(Boolean));
    const programmeAmendments = proposalClarifications.filter(p => programmeProposalIds.has(p.id));
    const proposalOnlyClarifications = proposalClarifications.filter(p => !programmeProposalIds.has(p.id));
    const termsComplete = Boolean(profile.terms_accepted_at);
    const onboardingComplete = Boolean(onboarding?.onboarding_completed_at) && termsComplete;
    const tttVerified = ttt?.verification_status === 'VERIFIED';
    const cvVerified = cv?.verification_status === 'VERIFIED';
    const docsComplete = tttVerified && cvVerified;
    const docsUploaded = Boolean(ttt) && Boolean(cv);
    const programmeSubmitted = programmes.some(p => SUBMITTED_PROGRAMME_STATES.includes(p.publish_status));
    const programmeDraft = programmes.some(p => p.publish_status === 'DRAFT');
    const active = profile.collaboration_status === 'ACTIVE';

    const steps = [
      {n:1,label:'Programme Proposal',state:proposalStarted?'complete':'action',status:proposalStarted?'Submitted':'Not started',tab:'proposals'},
      {n:2,label:'Approval to Collaborate',state:approved?'complete':proposalStarted?'waiting':'locked',status:approved?'Approved':proposalStarted?'EasyLatih review':'Complete Step 1 first',tab:'proposals'},
      {n:3,label:'Trainer Onboarding',state:onboardingComplete?'complete':approved?'action':'locked',status:onboardingComplete?'Completed':approved?'Incomplete':'Locked',tab:'onboarding'},
      {n:4,label:'Supporting Documents',state:docsComplete?'complete':approved?(docsUploaded?'waiting':'action'):'locked',status:docsComplete?'TTT & CV verified':docsUploaded?'Pending verification':approved?'TTT & CV required':'Locked',tab:'onboarding'},
      {n:5,label:'Programme Development',state:programmeSubmitted?'complete':approved&&onboardingComplete?(programmeDraft?'action':'action'):'locked',status:programmeSubmitted?'Submitted to EasyLatih':programmeDraft?'Amend / submit programme':approved&&onboardingComplete?'Not submitted':'Complete onboarding first',tab:'onboarding'},
      {n:6,label:'Trainer Activation',state:active?'complete':onboardingComplete&&docsComplete?'waiting':'locked',status:active?'Active Trainer':onboardingComplete&&docsComplete?'Waiting for EasyLatih':'Requirements incomplete',tab:'onboarding'}
    ];

    let next = {type:'info',title:'No action required',text:'Your current submission is being reviewed by EasyLatih.',tab:null};
    if (!proposalStarted) {
      next = {type:'warning',title:'Your Next Step: Submit a Programme Proposal',text:'Submit your first programme idea for EasyLatih review.',tab:'proposals'};
    } else if (programmeAmendments.length) {
      next = {type:'warning',title:'Your Next Step: Amend Your Programme',text:`EasyLatih requested an amendment for ${programmeAmendments[0].title}. Open Onboarding / Full Programme Details and review the comments.`,tab:'onboarding'};
    } else if (proposalOnlyClarifications.length) {
      next = {type:'warning',title:'Your Next Step: Reply to EasyLatih',text:`Clarification is required for ${proposalOnlyClarifications[0].title}.`,tab:'comments'};
    } else if (!approved) {
      next = {type:'info',title:'EasyLatih is Reviewing Your Proposal',text:'No action is required at the moment. You will be notified when the review status changes.',tab:null};
    } else if (!onboardingComplete) {
      next = {type:'warning',title:'Your Next Step: Complete Trainer Onboarding',text:'Complete the eTRiS trainer profile, photo consent and Trainer Collaboration Terms.',tab:'onboarding'};
    } else if (!ttt || !cv) {
      const missing = [!ttt?'TTT Certificate':null,!cv?'Resume / CV':null].filter(Boolean).join(' and ');
      next = {type:'warning',title:'Your Next Step: Upload Supporting Documents',text:`Please upload your ${missing}.`,tab:'onboarding'};
    } else if (!docsComplete) {
      next = {type:'info',title:'Documents Pending EasyLatih Verification',text:'Your required documents have been submitted. No action is required unless EasyLatih rejects a document.',tab:'onboarding'};
    } else if (!programmeSubmitted) {
      next = {type:'warning',title:'Your Next Step: Submit Full Programme Details',text:'Complete your programme details and training schedule, then submit them for EasyLatih review.',tab:'onboarding'};
    } else if (!active) {
      next = {type:'info',title:'Waiting for Trainer Activation',text:'Your onboarding requirements are complete. EasyLatih will activate your trainer profile after final verification.',tab:'onboarding'};
    } else {
      next = {type:'success',title:'You’re Up to Date',text:'Your trainer profile is active and your current required steps are complete.',tab:null};
    }

    return {steps,next,approved,onboardingComplete,docsComplete,programmeSubmitted,active,programmeAmendments,proposalOnlyClarifications};
  }

  function renderJourney(journey) {
    const holder = document.getElementById('trainerJourneySteps');
    const summary = document.getElementById('trainerJourneySummary');
    const next = document.getElementById('trainerJourneyNext');
    if (!holder || !summary || !next) return;
    const completed = journey.steps.filter(x=>x.state==='complete').length;
    summary.textContent = `${completed} of ${journey.steps.length} steps complete`;
    holder.innerHTML = journey.steps.map(step => {
      const icon = step.state === 'complete' ? '✓' : step.state === 'action' ? '!' : step.state === 'waiting' ? '…' : step.n;
      return `<button type="button" class="journey-step ${esc(step.state)}" data-journey-tab="${esc(step.tab || '')}" ${step.state==='locked'?'disabled':''}><div class="journey-step-top"><span class="journey-icon">${esc(icon)}</span><strong>${esc(step.label)}</strong></div><div class="journey-step-status">${esc(step.status)}</div></button>`;
    }).join('');
    holder.querySelectorAll('[data-journey-tab]').forEach(btn => btn.addEventListener('click',()=>{ if(btn.dataset.journeyTab) goTo(btn.dataset.journeyTab); }));
    next.innerHTML = `<div class="alert alert-${esc(journey.next.type)}"><strong>${esc(journey.next.title)}</strong><span>${esc(journey.next.text)}</span>${journey.next.tab?` <button type="button" class="btn btn-soft" style="margin-left:.5rem" data-next-tab="${esc(journey.next.tab)}">Open</button>`:''}</div>`;
    next.querySelector('[data-next-tab]')?.addEventListener('click',e=>goTo(e.currentTarget.dataset.nextTab));
  }

  function renderBadges(s, journey) {
    const basicProfileComplete = [s.profile.full_name,s.profile.phone,s.profile.state,s.profile.expertise_summary].every(Boolean);
    const commentsSeen = lastSeen(s.reads,'comments');
    const programmesSeen = lastSeen(s.reads,'programmes');
    const unreadComments = s.comments.filter(c => c.author_role === 'ADMIN' && isAfter(c.created_at,commentsSeen)).length;
    const unreadProgrammeUpdates = s.adminEdits.filter(x => isAfter(x.created_at,programmesSeen)).length;
    const openOpportunities = s.opportunityRecipients.filter(r => {
      if (!['NOTIFIED','VIEWED'].includes(r.recipient_status)) return false;
      const opp = Array.isArray(r.opportunities) ? r.opportunities[0] : r.opportunities;
      if (!opp) return true;
      if (opp.status && opp.status !== 'OPEN') return false;
      if (opp.response_deadline && new Date(opp.response_deadline).getTime() < Date.now()) return false;
      return true;
    }).length;
    const programmeAttention = journey.programmeAmendments.length;

    setNavBadge('proposals',journey.proposalOnlyClarifications.length || 0,'attention','Proposal clarification required');
    setNavBadge('comments',unreadComments || 0,'info','Unread EasyLatih comments');
    setNavBadge('opportunities',openOpportunities || 0,'attention','Opportunities awaiting your response');
    setNavBadge('programmes',(unreadProgrammeUpdates + programmeAttention) || 0,programmeAttention?'attention':'info',programmeAttention?'Programme action / update pending':'New EasyLatih programme updates');
    setNavBadge('onboarding',journey.approved && (!journey.onboardingComplete || !journey.docsComplete) ? '!' : 0,'attention','Onboarding requirement incomplete');
    setNavBadge('profile',basicProfileComplete ? 0 : '!','attention','Basic profile incomplete');
  }

  async function markTabSeen(tab) {
    if (!currentUser || !['comments','programmes'].includes(tab)) return;
    const now = new Date().toISOString();
    await client.from('trainer_tab_reads').upsert({trainer_id:currentUser.id,tab_name:tab,last_seen_at:now},{onConflict:'trainer_id,tab_name'});
    if (state) {
      const existing = state.reads.find(x=>x.tab_name===tab);
      if (existing) existing.last_seen_at=now;
      else state.reads.push({tab_name:tab,last_seen_at:now});
      renderBadges(state,computeJourney(state));
    }
  }

  async function loadState() {
    const {data:userData,error:userError} = await client.auth.getUser();
    if (userError || !userData?.user) return null;
    currentUser = userData.user;

    const [profileRes,onboardingRes,docsRes,proposalRes,programmeRes,readsRes,editRes,recipientRes] = await Promise.all([
      client.from('profiles').select('id,full_name,phone,state,expertise_summary,collaboration_status,terms_accepted_at').eq('id',currentUser.id).single(),
      client.from('trainer_onboarding').select('trainer_id,onboarding_completed_at,photo_consent_at').eq('trainer_id',currentUser.id).maybeSingle(),
      client.from('trainer_documents').select('id,document_type,verification_status,created_at').eq('trainer_id',currentUser.id).neq('document_type','COURSE_CONTENT').order('created_at',{ascending:false}),
      client.from('programme_proposals').select('id,title,status,created_at,updated_at').eq('trainer_id',currentUser.id).order('created_at',{ascending:false}),
      client.from('programmes').select('id,proposal_id,title,publish_status,etris_status,current_version,created_at,updated_at').eq('trainer_id',currentUser.id).order('created_at',{ascending:false}),
      client.from('trainer_tab_reads').select('tab_name,last_seen_at').eq('trainer_id',currentUser.id),
      client.from('programme_admin_edits').select('id,programme_id,created_at').eq('trainer_id',currentUser.id).order('created_at',{ascending:false}).limit(100),
      client.from('opportunity_recipients').select('id,recipient_status,created_at,viewed_at,opportunities(status,response_deadline)').eq('trainer_id',currentUser.id).order('created_at',{ascending:false})
    ]);
    if (profileRes.error || !profileRes.data) return null;

    const proposals = proposalRes.data || [];
    let comments = [];
    if (proposals.length) {
      const commentRes = await client.from('proposal_comments').select('id,proposal_id,author_role,created_at').in('proposal_id',proposals.map(p=>p.id)).eq('visibility','TRAINER').eq('author_role','ADMIN').order('created_at',{ascending:false});
      comments = commentRes.data || [];
    }

    return {
      profile:profileRes.data,
      onboarding:onboardingRes.data || null,
      documents:docsRes.data || [],
      proposals,
      programmes:programmeRes.data || [],
      reads:readsRes.data || [],
      adminEdits:editRes.data || [],
      opportunityRecipients:recipientRes.data || [],
      comments
    };
  }

  async function refresh() {
    const loaded = await loadState().catch(()=>null);
    if (!loaded) return;
    state = loaded;
    const journey = computeJourney(state);
    renderJourney(journey);
    renderBadges(state,journey);
  }

  function scheduleRefresh(delay=800) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh,delay);
  }

  function wireNavigation() {
    document.querySelectorAll('.sidebar [data-nav]').forEach(btn => {
      btn.addEventListener('click',()=>{
        const tab = btn.dataset.nav;
        if (tab === 'comments' || tab === 'programmes') setTimeout(()=>markTabSeen(tab),150);
        scheduleRefresh(500);
      });
    });
    document.addEventListener('click',e=>{
      if (e.target.closest('[data-open-comments]')) setTimeout(()=>markTabSeen('comments'),250);
      if (e.target.closest('#acceptTermsButton,[data-upload-drive-document],[data-submit-programme]')) scheduleRefresh(1400);
    },true);
    document.addEventListener('submit',()=>scheduleRefresh(1500),true);
    window.addEventListener('focus',()=>scheduleRefresh(200));
  }

  document.addEventListener('DOMContentLoaded',()=>{
    injectStyles();
    ensureJourneyCard();
    wireNavigation();
    setTimeout(refresh,450);
  });
})();
