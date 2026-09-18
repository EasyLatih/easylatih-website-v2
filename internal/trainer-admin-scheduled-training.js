(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const money = value => value === null || value === undefined || value === '' ? '-' : `RM ${Number(value).toLocaleString('en-MY',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
  const fmtDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'}) : '-';
  const fmtTime = value => value ? String(value).slice(0,5) : '';
  const states = ['Johor','Kedah','Kelantan','Melaka','Negeri Sembilan','Pahang','Perak','Perlis','Pulau Pinang','Sabah','Sarawak','Selangor','Terengganu','Kuala Lumpur','Labuan','Putrajaya'];

  let programmes = [];
  let trainers = [];
  let sessions = [];
  let editingId = '';

  function ensureStyles() {
    if (document.getElementById('scheduledTrainingAdminStyles')) return;
    const style = document.createElement('style');
    style.id = 'scheduledTrainingAdminStyles';
    style.textContent = `
      #adminScheduledTrainingSection .schedule-beta-note{margin:.75rem 0}
      #adminScheduledTrainingForm .locked-field{background:#f8fafc;color:#64748b}
      #adminScheduledTrainingList .schedule-links{display:flex;flex-wrap:wrap;gap:.45rem;margin:.65rem 0}
      #adminScheduledTrainingList .schedule-links a{font-size:.78rem}
      #adminScheduledTrainingList .schedule-lock{font-size:.75rem;color:#92400e;font-weight:700}
      #adminScheduledTrainingList .schedule-status-actions{display:flex;flex-wrap:wrap;gap:.45rem;margin-top:.65rem}
      #adminScheduledTrainingList .schedule-details{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.3rem 1rem;margin-top:.65rem;font-size:.82rem}
      @media(max-width:700px){#adminScheduledTrainingList .schedule-details{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureSection() {
    if (document.getElementById('adminScheduledTrainingSection')) return;
    ensureStyles();
    const main = document.querySelector('main.page') || document.querySelector('main');
    if (!main) return;
    const section = document.createElement('section');
    section.id = 'adminScheduledTrainingSection';
    section.className = 'panel';
    section.innerHTML = `
      <div class="panel-header"><div><h2>Scheduled Training</h2><div class="muted">Create actual public training sessions from published programmes. The assigned trainer is locked once a session is published.</div></div></div>
      <div class="alert alert-info schedule-beta-note"><strong>Beta rule:</strong> Public scheduled training has a fixed assigned trainer. If that trainer can no longer deliver after publication, postpone/cancel the session and create a replacement rather than silently switching trainers.</div>
      <div id="scheduledTrainingMessage" class="hidden"></div>
      <form id="adminScheduledTrainingForm" class="form-card">
        <div class="panel-header"><div><h3 id="scheduledTrainingFormTitle">Create Scheduled Training</h3><div class="muted">Links may point to Google Drive / Google Docs / your registration page.</div></div><button type="button" class="btn btn-soft" id="newScheduledTraining">New Session</button></div>
        <div class="form-grid">
          <div class="field full"><label>Published Programme</label><select name="programme_id" required><option value="">Select published programme</option></select></div>
          <div class="field full"><label>Assigned Trainer</label><select name="assigned_trainer_id" required><option value="">Select trainer</option></select><span class="help" id="scheduledTrainerHelp">Defaults to the programme owner where possible. This becomes locked after publish.</span></div>
          <div class="field"><label>Start Date</label><input type="date" name="start_date" required></div>
          <div class="field"><label>End Date <span class="muted">(optional)</span></label><input type="date" name="end_date"></div>
          <div class="field"><label>Start Time</label><input type="time" name="start_time"></div>
          <div class="field"><label>End Time</label><input type="time" name="end_time"></div>
          <div class="field"><label>Delivery Mode</label><select name="delivery_mode" required><option value="PHYSICAL">Physical</option><option value="ONLINE">Online</option><option value="HYBRID">Hybrid</option></select></div>
          <div class="field"><label>State</label><select name="state"><option value="">Select state</option>${states.map(x=>`<option>${x}</option>`).join('')}</select></div>
          <div class="field"><label>City</label><input name="city" maxlength="120" placeholder="Kuantan"></div>
          <div class="field"><label>Venue / Platform</label><input name="venue" maxlength="250" placeholder="AC Hotel / EasyLatih Training Room / Zoom"></div>
          <div class="field"><label>Fee per Participant (RM)</label><input name="participant_fee" type="number" min="0" step="1"></div>
          <div class="field"><label>Capacity</label><input name="capacity" type="number" min="1" step="1"></div>
          <div class="field"><label>Registration Deadline</label><input name="registration_deadline" type="datetime-local"></div>
          <div class="field"><label>Initial Status</label><select name="status"><option value="DRAFT">Draft</option><option value="PUBLISHED">Publish now</option></select></div>
          <div class="field full"><label>Trainer Profile PDF / Google Drive Link</label><input name="trainer_profile_url" type="url" placeholder="https://drive.google.com/..."></div>
          <div class="field full"><label>Final Course Content Link</label><input name="final_course_content_url" type="url" placeholder="https://docs.google.com/... or PDF link"></div>
          <div class="field full"><label>Registration Link</label><input name="registration_url" type="url" placeholder="https://..."></div>
          <div class="field full"><label>Internal Notes <span class="muted">(not public)</span></label><textarea name="internal_notes" maxlength="1500"></textarea></div>
        </div>
        <label class="checkbox-row"><input type="checkbox" name="hrd_claimable" value="1" checked><span>HRD Corp Claimable</span></label>
        <div class="btn-row"><button class="btn btn-primary" type="submit" id="saveScheduledTraining">Save Scheduled Training</button><button class="btn btn-outline hidden" type="button" id="cancelScheduledEdit">Cancel Edit</button></div>
      </form>
      <div style="height:1rem"></div>
      <div class="panel-header"><div><h3>Scheduled Sessions</h3><div class="muted">Draft and published sessions are managed here. Published sessions automatically appear on the beta public schedule.</div></div><button type="button" class="btn btn-outline" id="refreshScheduledTraining">Refresh</button></div>
      <div id="adminScheduledTrainingList" class="list"><div class="empty">Loading scheduled training…</div></div>`;
    main.appendChild(section);
  }

  function message(text,type='info') {
    const el = document.getElementById('scheduledTrainingMessage');
    if (!el) return;
    if (!text) { el.className='hidden'; el.textContent=''; return; }
    el.className=`alert alert-${type}`;
    el.textContent=text;
  }

  function form() { return document.getElementById('adminScheduledTrainingForm'); }
  function selectedProgramme(id) { return programmes.find(p=>p.id===id); }
  function trainerName(id) { return trainers.find(t=>t.id===id)?.full_name || 'Trainer'; }

  function populateSelects() {
    const f=form(); if(!f)return;
    const pSel=f.elements.programme_id;
    const tSel=f.elements.assigned_trainer_id;
    const pCurrent=pSel.value;
    const tCurrent=tSel.value;
    pSel.innerHTML='<option value="">Select published programme</option>'+programmes.map(p=>`<option value="${esc(p.id)}">${esc(p.title)}${p.duration?` · ${esc(p.duration)}`:''}</option>`).join('');
    tSel.innerHTML='<option value="">Select trainer</option>'+trainers.map(t=>`<option value="${esc(t.id)}">${esc(t.full_name || t.email || 'Trainer')}</option>`).join('');
    if(programmes.some(p=>p.id===pCurrent))pSel.value=pCurrent;
    if(trainers.some(t=>t.id===tCurrent))tSel.value=tCurrent;
  }

  function onProgrammeChange() {
    const f=form(); if(!f || editingId)return;
    const p=selectedProgramme(f.elements.programme_id.value);
    if(!p)return;
    if(trainers.some(t=>t.id===p.trainer_id)) f.elements.assigned_trainer_id.value=p.trainer_id;
    if(!f.elements.final_course_content_url.value && p.course_outline_doc_url) f.elements.final_course_content_url.value=p.course_outline_doc_url;
  }

  function resetForm() {
    editingId='';
    const f=form(); if(!f)return;
    f.reset();
    f.elements.hrd_claimable.checked=true;
    f.elements.status.value='DRAFT';
    f.elements.assigned_trainer_id.disabled=false;
    f.elements.assigned_trainer_id.classList.remove('locked-field');
    document.getElementById('scheduledTrainerHelp').textContent='Defaults to the programme owner where possible. This becomes locked after publish.';
    document.getElementById('scheduledTrainingFormTitle').textContent='Create Scheduled Training';
    document.getElementById('saveScheduledTraining').textContent='Save Scheduled Training';
    document.getElementById('cancelScheduledEdit').classList.add('hidden');
    populateSelects();
    message('');
  }

  function editSession(id) {
    const row=sessions.find(x=>x.id===id); if(!row)return;
    editingId=id;
    const f=form(); if(!f)return;
    f.elements.programme_id.value=row.programme_id;
    f.elements.assigned_trainer_id.value=row.assigned_trainer_id;
    f.elements.start_date.value=row.start_date || '';
    f.elements.end_date.value=row.end_date || '';
    f.elements.start_time.value=fmtTime(row.start_time);
    f.elements.end_time.value=fmtTime(row.end_time);
    f.elements.delivery_mode.value=row.delivery_mode || 'PHYSICAL';
    f.elements.state.value=row.state || '';
    f.elements.city.value=row.city || '';
    f.elements.venue.value=row.venue || '';
    f.elements.participant_fee.value=row.participant_fee ?? '';
    f.elements.capacity.value=row.capacity ?? '';
    f.elements.registration_deadline.value=row.registration_deadline ? new Date(new Date(row.registration_deadline).getTime()-new Date(row.registration_deadline).getTimezoneOffset()*60000).toISOString().slice(0,16) : '';
    f.elements.trainer_profile_url.value=row.trainer_profile_url || '';
    f.elements.final_course_content_url.value=row.final_course_content_url || '';
    f.elements.registration_url.value=row.registration_url || '';
    f.elements.internal_notes.value=row.internal_notes || '';
    f.elements.hrd_claimable.checked=Boolean(row.hrd_claimable);
    f.elements.status.value=row.status==='DRAFT'?'DRAFT':'PUBLISHED';
    f.elements.assigned_trainer_id.disabled=Boolean(row.trainer_locked);
    f.elements.assigned_trainer_id.classList.toggle('locked-field',Boolean(row.trainer_locked));
    document.getElementById('scheduledTrainerHelp').textContent=row.trainer_locked?'Trainer locked because this public session has already been published.':'Trainer can still be changed while this session remains draft.';
    document.getElementById('scheduledTrainingFormTitle').textContent=`Edit: ${row.programme_title}`;
    document.getElementById('saveScheduledTraining').textContent='Save Changes';
    document.getElementById('cancelScheduledEdit').classList.remove('hidden');
    document.getElementById('adminScheduledTrainingSection')?.classList.remove('is-collapsed');
    f.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function saveSession(event) {
    event.preventDefault();
    const f=event.currentTarget;
    const programme=selectedProgramme(f.elements.programme_id.value);
    if(!programme)return message('Please select a published programme.','danger');
    const existing=editingId?sessions.find(x=>x.id===editingId):null;
    const trainerId=existing?.trainer_locked ? existing.assigned_trainer_id : f.elements.assigned_trainer_id.value;
    if(!trainerId)return message('Please assign a trainer.','danger');
    const endDate=f.elements.end_date.value || null;
    if(endDate && endDate < f.elements.start_date.value)return message('End date cannot be earlier than start date.','danger');

    const row={
      programme_id:programme.id,
      assigned_trainer_id:trainerId,
      programme_title:programme.title,
      category:programme.category || null,
      duration:programme.duration || null,
      start_date:f.elements.start_date.value,
      end_date:endDate,
      start_time:f.elements.start_time.value || null,
      end_time:f.elements.end_time.value || null,
      venue:String(f.elements.venue.value||'').trim() || null,
      city:String(f.elements.city.value||'').trim() || null,
      state:String(f.elements.state.value||'').trim() || null,
      delivery_mode:f.elements.delivery_mode.value,
      participant_fee:f.elements.participant_fee.value?Number(f.elements.participant_fee.value):null,
      capacity:f.elements.capacity.value?Number(f.elements.capacity.value):null,
      registration_deadline:f.elements.registration_deadline.value?new Date(f.elements.registration_deadline.value).toISOString():null,
      trainer_profile_url:String(f.elements.trainer_profile_url.value||'').trim() || null,
      final_course_content_url:String(f.elements.final_course_content_url.value||'').trim() || null,
      registration_url:String(f.elements.registration_url.value||'').trim() || null,
      hrd_claimable:f.elements.hrd_claimable.checked,
      status: existing && existing.status!=='DRAFT' ? existing.status : f.elements.status.value,
      internal_notes:String(f.elements.internal_notes.value||'').trim() || null
    };

    if(row.status==='PUBLISHED' && (!row.registration_url || !row.trainer_profile_url || !row.final_course_content_url)) {
      if(!confirm('This session is being published without all three public links (trainer profile, final course content, registration). Publish anyway?'))return;
    }

    const button=document.getElementById('saveScheduledTraining');
    button.disabled=true; message('Saving scheduled training…','info');
    try{
      const result=editingId
        ? await client.from('scheduled_trainings').update(row).eq('id',editingId)
        : await client.from('scheduled_trainings').insert(row);
      if(result.error)throw result.error;
      message(editingId?'Scheduled training updated.':'Scheduled training created.','success');
      await loadAll();
      setTimeout(resetForm,500);
    }catch(error){
      message(error.message || 'Unable to save scheduled training.','danger');
    }finally{button.disabled=false;}
  }

  function statusBadge(status) {
    const map={DRAFT:'amber',PUBLISHED:'green',FULL:'amber',POSTPONED:'amber',CANCELLED:'red',COMPLETED:'green'};
    return `<span class="badge ${map[status]||''}">${esc(status)}</span>`;
  }

  function renderSessions() {
    const holder=document.getElementById('adminScheduledTrainingList'); if(!holder)return;
    if(!sessions.length){holder.innerHTML='<div class="empty">No scheduled training yet.</div>';return;}
    holder.innerHTML=sessions.map(row=>{
      const dateRange=row.end_date && row.end_date!==row.start_date ? `${fmtDate(row.start_date)} – ${fmtDate(row.end_date)}` : fmtDate(row.start_date);
      const time=[fmtTime(row.start_time),fmtTime(row.end_time)].filter(Boolean).join(' – ');
      const links=[
        row.trainer_profile_url?`<a class="btn btn-outline" href="${esc(row.trainer_profile_url)}" target="_blank" rel="noopener">Trainer Profile</a>`:'',
        row.final_course_content_url?`<a class="btn btn-outline" href="${esc(row.final_course_content_url)}" target="_blank" rel="noopener">Final Course Content</a>`:'',
        row.registration_url?`<a class="btn btn-outline" href="${esc(row.registration_url)}" target="_blank" rel="noopener">Registration</a>`:''
      ].join('');
      const actions=[];
      actions.push(`<button class="btn btn-soft" type="button" data-schedule-edit="${row.id}">Edit</button>`);
      if(row.status==='DRAFT')actions.push(`<button class="btn btn-primary" type="button" data-schedule-status="PUBLISHED" data-session-id="${row.id}">Publish</button>`);
      if(row.status==='PUBLISHED')actions.push(`<button class="btn btn-outline" type="button" data-schedule-status="FULL" data-session-id="${row.id}">Mark Full</button>`);
      if(row.status==='FULL')actions.push(`<button class="btn btn-outline" type="button" data-schedule-status="PUBLISHED" data-session-id="${row.id}">Reopen Registration</button>`);
      if(['PUBLISHED','FULL'].includes(row.status))actions.push(`<button class="btn btn-outline" type="button" data-schedule-status="POSTPONED" data-session-id="${row.id}">Postpone</button>`);
      if(!['CANCELLED','COMPLETED'].includes(row.status))actions.push(`<button class="btn btn-outline" type="button" data-schedule-status="COMPLETED" data-session-id="${row.id}">Complete</button>`);
      if(!['CANCELLED','COMPLETED'].includes(row.status))actions.push(`<button class="btn btn-danger" type="button" data-schedule-status="CANCELLED" data-session-id="${row.id}">Cancel</button>`);
      return `<div class="list-card">
        <div class="list-card-top"><div><h3>${esc(row.programme_title)}</h3><div class="meta"><span>${dateRange}</span>${time?`<span>${esc(time)}</span>`:''}<span>${esc(row.state||row.delivery_mode||'')}</span></div></div>${statusBadge(row.status)}</div>
        <div class="schedule-details"><div><strong>Assigned Trainer:</strong> ${esc(trainerName(row.assigned_trainer_id))}</div><div><strong>Fee:</strong> ${money(row.participant_fee)} / pax</div><div><strong>Venue:</strong> ${esc(row.venue||row.city||'-')}</div><div><strong>Capacity:</strong> ${esc(row.capacity||'-')}</div><div><strong>HRD Corp:</strong> ${row.hrd_claimable?'Claimable':'Not marked claimable'}</div><div><strong>Registration deadline:</strong> ${row.registration_deadline?new Date(row.registration_deadline).toLocaleString('en-MY'):'-'}</div></div>
        ${row.trainer_locked?'<div class="schedule-lock">🔒 Assigned trainer locked after publication.</div>':''}
        <div class="schedule-links">${links}</div>
        <div class="schedule-status-actions">${actions.join('')}</div>
      </div>`;
    }).join('');

    holder.querySelectorAll('[data-schedule-edit]').forEach(btn=>btn.addEventListener('click',()=>editSession(btn.dataset.scheduleEdit)));
    holder.querySelectorAll('[data-schedule-status]').forEach(btn=>btn.addEventListener('click',()=>changeStatus(btn.dataset.sessionId,btn.dataset.scheduleStatus)));
  }

  async function changeStatus(id,status) {
    const row=sessions.find(x=>x.id===id); if(!row)return;
    const labels={PUBLISHED:'publish/reopen',FULL:'mark as full',POSTPONED:'postpone',COMPLETED:'mark completed',CANCELLED:'cancel'};
    if(!confirm(`Confirm ${labels[status]||status.toLowerCase()} for “${row.programme_title}”?`))return;
    const {error}=await client.from('scheduled_trainings').update({status}).eq('id',id);
    if(error)return message(error.message || 'Unable to update session status.','danger');
    message(`Session status updated to ${status}.`,'success');
    await loadAll();
  }

  async function loadAll() {
    const [{data:p,error:pErr},{data:t,error:tErr},{data:s,error:sErr}] = await Promise.all([
      client.from('programmes').select('id,title,category,duration,trainer_id,publish_status,etris_status,course_outline_doc_url').eq('publish_status','PUBLISHED').order('title'),
      client.from('profiles').select('id,full_name,email,collaboration_status').eq('collaboration_status','ACTIVE').order('full_name'),
      client.from('scheduled_trainings').select('*').order('start_date',{ascending:true}).limit(500)
    ]);
    if(pErr||tErr||sErr){message((pErr||tErr||sErr)?.message || 'Unable to load scheduled training data.','danger');return;}
    programmes=p||[]; trainers=t||[]; sessions=s||[];
    populateSelects(); renderSessions();
    document.dispatchEvent(new CustomEvent('admin-scheduled-training-updated'));
  }

  async function init() {
    ensureSection();
    const {data}=await client.auth.getUser();
    if(data?.user?.app_metadata?.role!=='admin')return;
    const f=form(); if(!f)return;
    f.addEventListener('submit',saveSession);
    f.elements.programme_id.addEventListener('change',onProgrammeChange);
    document.getElementById('newScheduledTraining')?.addEventListener('click',resetForm);
    document.getElementById('cancelScheduledEdit')?.addEventListener('click',resetForm);
    document.getElementById('refreshScheduledTraining')?.addEventListener('click',loadAll);
    await loadAll();
  }

  ensureSection();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
