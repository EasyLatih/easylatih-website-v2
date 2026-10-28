(() => {
  'use strict';
  // ---------- setup ----------
  const $ = id => document.getElementById(id);
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  const SALES_API = 'https://script.google.com/macros/s/AKfycby5Tl6A7Vip6GdkNsMstjl6026EvH6boWU9de-11DO6EaSR4XJTogXdY7ZDIxyJS6Go/exec';
  const PRAYER_URL = 'https://www.e-solat.gov.my/index.php?r=esolatApi/takwimsolat&period=week&zone=PHG02';
  const db = window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TICK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>';
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const BIZ = {EL:'Easy Latih',SNS:'S&S',RAPAT:'RAPAT',GPPT:'GPPT FC',ASALIHIN:'As-Salihin',SITE:'syamsulizzat.my',AQUA:'SA Aqua Agro',OTHER:'Other'};
  const PREP = [['participants','Participant list'],['menu','Menu'],['goodies','Goodies'],['materials','Materials']];

  // dates as YYYY-MM-DD in Kuala Lumpur time
  const todayKey = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kuala_Lumpur'});
  const fromKey = k => { const [y,m,d] = k.split('-').map(Number); return new Date(Date.UTC(y, m-1, d, 12)); };
  const toKey = d => d.toISOString().slice(0,10);
  const addDays = (k, n) => { const d = fromKey(k); d.setUTCDate(d.getUTCDate()+n); return toKey(d); };
  const dow = k => fromKey(k).getUTCDay();
  const nice = k => { const d = fromKey(k); return d.getUTCDate()+' '+MONTHS[d.getUTCMonth()].slice(0,3); };
  const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
  const money = n => 'RM' + Number(n || 0).toLocaleString('en-MY', {minimumFractionDigits:0, maximumFractionDigits:2});
  const hhmm = t => t ? String(t).slice(0,5) : '';

  // ---------- routine definition ----------
  const FOCUS = {
    1:{title:'GPPT FC – weekly focus', sub:'Match registration, fees, fund, jersey orders', key:'GPPT FC'},
    2:{title:'Wrap up and plan tomorrow', sub:'Clear loose ends, set tomorrow\'s top 3', key:null},
    3:{title:'As-Salihin – weekly focus', sub:'Estate planning follow-ups and appointments', key:'As-Salihin'},
    4:{title:'syamsulizzat.my – weekly focus', sub:'Personal website and listings', key:'syamsulizzat.my'},
    5:{title:'Wrap up and plan tomorrow', sub:'Clear loose ends, set tomorrow\'s top 3', key:null},
    6:{title:'SA Aqua Agro + weekly review', sub:'Check-in, then review the week on the Week tab', key:'SA Aqua Agro'}
  };
  function blocksFor(k, training) {
    const w = dow(k); if (w === 0) return [];
    const f = FOCUS[w];
    if (training) return [
      {id:'brief', time:'8:30 – 9:00', start:'08:30', title:'Morning brief and WhatsApp', sub:'Client enquiries first', biz:''},
      {id:'el', time:'Training', start:'09:00', title:'Run the training – Easy Latih', sub:'Attendance, materials, participant meals', biz:'EL'},
      {id:'sns', time:'After session', start:'17:00', title:'S&S takaful – 30 min', sub:'Reply to prospects, urgent quotations only', biz:'SNS'},
      {id:'rapat', time:'After session', start:'17:30', title:'RAPAT.my – 30 min', sub:'Post or schedule today\'s content', biz:'RAPAT'},
      {id:'focus', time:'End of day', start:'18:00', title:f.title, sub:f.sub, biz:'FOCUS'}
    ];
    return [
      {id:'brief', time:'8:30 – 9:00', start:'08:30', title:'Morning brief and WhatsApp', sub:'Client enquiries first: Easy Latih, S&S, RAPAT', biz:''},
      {id:'el', time:'9:00 – 12:00', start:'09:00', title:'Easy Latih – deep work', sub:'Sales follow-ups, quotations, course outlines, ops system', biz:'EL'},
      {id:'lunch', time:'12:00 – 2:00', start:'12:00', title:'Lunch and Zohor', brk:true},
      {id:'sns', time:'2:00 – 3:30', start:'14:00', title:'S&S takaful – quotations and follow-ups', sub:'Etiqa and Zurich quotes, renewals, claims', biz:'SNS'},
      {id:'rapat', time:'3:30 – 4:30', start:'15:30', title:'RAPAT.my – content and podcast', sub:'Directory enquiries, Sembang RAPAT, social posts', biz:'RAPAT'},
      {id:'focus', time:'4:30 – 5:00', start:'16:30', title:f.title, sub:f.sub, biz:'FOCUS'}
    ];
  }
  function fieldsFor(k) {
    const w = dow(k);
    if (w === 0) return [{id:'general', label:'Notes', ph:'Anything worth remembering from today', biz:'', wide:true}];
    const list = [
      {id:'el', label:'Easy Latih', ph:'Enquiries, quotations sent, trainings confirmed, invoices…', biz:'EL'},
      {id:'sns', label:'S&S takaful', ph:'Prospects quoted, renewals, claims…', biz:'SNS'},
      {id:'rapat', label:'RAPAT.my', ph:'Posts published, guests contacted, listings added…', biz:'RAPAT'}
    ];
    if (FOCUS[w].key) list.push({id:'focus', label:FOCUS[w].key, ph:'What moved forward this week', biz:'FOCUS'});
    list.push({id:'general', label:'Wins and other notes', ph:'Good news, lessons, anything else', biz:''});
    list.push({id:'tomorrow', label:'Plan for tomorrow', ph:'Top 3 for tomorrow', biz:'', wide:true});
    return list;
  }

  // ---------- state ----------
  let user = null, current = todayKey(), view = 'today';
  const days = {};            // day -> {training_day, done, notes}
  let tasks = [], prep = {}, trainingDates = new Set(), prayer = null;
  const live = {trainings:[], rooms:[], invoices:[], stock:[], trainer:null, sales:null, loaded:false};

  function banner(msg, type) { const el = $('message'); el.textContent = msg || ''; el.dataset.type = type || 'info'; el.hidden = !msg; }
  function setSave(t) { $('saveState').textContent = t; }
  const entry = k => days[k] || {training_day:false, done:{}, notes:{}};
  function isTraining(k) {
    const e = days[k];
    if (e && e.done && typeof e.done._mode === 'string') return e.done._mode === 'training';
    return trainingDates.has(k);
  }
  function progress(k) {
    const e = entry(k), items = blocksFor(k, isTraining(k)).filter(b => !b.brk);
    return {n: items.filter(b => e.done && e.done[b.id]).length, total: items.length};
  }

  // ---------- saving (one write at a time per day, coalesced) ----------
  const timers = {}, saving = {}, again = {}, dirty = {};
  function queueDay(k, delay) {
    dirty[k] = true; clearTimeout(timers[k]); setSave('Saving…');
    timers[k] = setTimeout(() => { delete timers[k]; flushDay(k); }, delay);
  }
  async function flushDay(k) {
    if (saving[k]) { again[k] = true; return; }
    saving[k] = true;
    const e = entry(k);
    const {error} = await db.from('workspace_days').upsert({owner_id:user.id, day:k, training_day:isTraining(k), done:e.done||{}, notes:e.notes||{}, updated_at:new Date().toISOString()}, {onConflict:'owner_id,day'});
    saving[k] = false;
    if (error) { setSave('Not saved'); banner('Your changes could not be saved: '+error.message+'. Check your connection and try again.', 'danger'); }
    else setSave('Saved');
    if (again[k]) { again[k] = false; flushDay(k); } else if (!timers[k]) dirty[k] = false;
  }
  window.addEventListener('beforeunload', ev => { if (Object.values(dirty).some(Boolean)) { ev.preventDefault(); ev.returnValue = ''; } });

  // ---------- rendering: header ----------
  function renderHeader() {
    const t = todayKey(), w = dow(current);
    const rel = current === t ? 'Today' : current === addDays(t,-1) ? 'Yesterday' : current === addDays(t,1) ? 'Tomorrow' : '';
    $('dayEyebrow').textContent = (rel ? rel+' · ' : '') + DAYS[w];
    const d = fromKey(current);
    $('dayTitle').textContent = d.getUTCDate()+' '+MONTHS[d.getUTCMonth()]+' '+d.getUTCFullYear();
    const p = progress(current);
    $('progressText').textContent = w === 0 ? 'Rest day' : p.n+' of '+p.total+' done';
    $('progressFill').style.width = (p.total ? Math.round(p.n/p.total*100) : 0)+'%';
    $('trainingToggle').checked = isTraining(current);
    $('trainingToggle').parentElement.hidden = w === 0;
    const e = days[current], manual = e && e.done && typeof e.done._mode === 'string';
    $('trainingAuto').textContent = trainingDates.has(current) && !manual ? '(from your schedule)' : manual ? '(set by you)' : '';
  }

  // ---------- routine with prayer times ----------
  function prayerFor(k) { return prayer && prayer.find(p => p.date === k); }
  function renderRoutine() {
    const host = $('routineList'), w = dow(current), e = entry(current);
    if (w === 0) { host.innerHTML = '<li class="rest">Sunday is your rest day. Nothing scheduled.</li>'; $('routineHint').textContent = ''; return; }
    const training = isTraining(current);
    $('routineHint').textContent = training ? 'Training day: Easy Latih takes the day, S&S and RAPAT get 30 minutes after the session.' : 'Tick each block when it\'s done.';
    const rows = blocksFor(current, training).map(b => ({...b, sort:b.start}));
    const p = prayerFor(current);
    if (p) [['Zohor', p.zohor], ['Asar', p.asar]].forEach(([n, t]) => { if (t) rows.push({prayerRow:true, time:t, sort:t, title:n}); });
    rows.sort((a, b) => a.sort.localeCompare(b.sort) || (a.prayerRow ? -1 : 1));
    host.innerHTML = rows.map(b => {
      if (b.prayerRow) return '<li class="prayer-row"><span class="time">'+esc(b.time)+'</span><div class="what"><strong>'+esc(b.title)+'</strong></div><span></span></li>';
      if (b.brk) return '<li class="break"><span class="time">'+esc(b.time)+'</span><div class="what"><strong>'+esc(b.title)+'</strong></div><span></span></li>';
      const on = !!(e.done && e.done[b.id]);
      return '<li class="'+(on?'done':'')+'"><span class="time">'+esc(b.time)+'</span><div class="what"><strong><i class="dot '+esc(b.biz)+'"></i>'+esc(b.title)+'</strong><small>'+esc(b.sub||'')+'</small></div><button type="button" class="check" role="checkbox" aria-checked="'+on+'" aria-label="Mark '+esc(b.title)+' done" data-block="'+esc(b.id)+'">'+TICK+'</button></li>';
    }).join('');
  }

  function renderPrayerStrip() {
    const host = $('prayerStrip'), p = prayerFor(current);
    if (!p) { host.innerHTML = prayer === false ? '<span class="muted">Prayer times could not be loaded here.</span> <a href="https://www.e-solat.gov.my/" target="_blank" rel="noopener">Open e-Solat (Kuantan, PHG02)</a>' : '<span class="muted">Loading prayer times…</span>'; return; }
    const list = [['Subuh',p.subuh],['Syuruk',p.syuruk],['Zohor',p.zohor],['Asar',p.asar],['Maghrib',p.maghrib],['Isyak',p.isyak]];
    let next = '';
    if (current === todayKey()) { const now = new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Kuala_Lumpur',hour:'2-digit',minute:'2-digit'}); const n = list.find(([, t]) => t > now); next = n ? n[0] : ''; }
    host.innerHTML = list.map(([n, t]) => '<span class="pt'+(n===next?' next':'')+'"><b>'+n+'</b>'+esc(t)+'</span>').join('') + '<span class="muted" style="align-self:center">Kuantan · JAKIM</span>';
  }

  // ---------- journal ----------
  let journalFor = null;
  function renderJournal() {
    const host = $('journalFields'), e = entry(current);
    if (journalFor !== current) {
      host.innerHTML = fieldsFor(current).map(f => '<div class="field'+(f.wide?' wide':'')+'"><label for="j-'+f.id+'"><i class="dot '+esc(f.biz)+'"></i>'+esc(f.label)+'</label><textarea id="j-'+f.id+'" data-note="'+f.id+'" placeholder="'+esc(f.ph)+'"></textarea></div>').join('');
      journalFor = current;
    }
    host.querySelectorAll('textarea').forEach(t => { const v = (e.notes && e.notes[t.dataset.note]) || ''; if (document.activeElement !== t && t.value !== v) t.value = v; });
  }

  // ---------- tasks ----------
  function renderTasks() {
    const t = todayKey(), host = $('taskList');
    const open = tasks.filter(x => !x.done_at).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.created_at.localeCompare(b.created_at));
    const doneToday = tasks.filter(x => x.done_at && new Date(x.done_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'}) === t);
    const row = x => {
      let due = '';
      if (x.due_date) { const diff = daysBetween(t, x.due_date); due = diff < 0 ? '<span class="due-bad">'+(-diff)+' day'+(diff===-1?'':'s')+' late</span>' : diff === 0 ? '<span class="due-today">Today</span>' : diff === 1 ? 'Tomorrow' : nice(x.due_date); }
      return '<li class="'+(x.done_at?'done':'')+'"><button type="button" class="check" role="checkbox" aria-checked="'+(!!x.done_at)+'" aria-label="Mark task done" data-task="'+esc(x.id)+'">'+TICK+'</button><div class="t"><strong>'+esc(x.title)+'</strong><small><i class="dot '+(x.business==='EL'||x.business==='SNS'||x.business==='RAPAT'?x.business:'FOCUS')+'"></i>'+esc(BIZ[x.business]||'Other')+(due?' · '+due:'')+'</small></div><button type="button" class="del" aria-label="Delete task" data-del="'+esc(x.id)+'">×</button></li>';
    };
    host.innerHTML = (open.length ? open.map(row).join('') : '<li class="empty">No open tasks. Add one above.</li>') + (doneToday.length ? '<li class="section-label">Done today</li>' + doneToday.map(row).join('') : '');
  }
  async function addTask(ev) {
    ev.preventDefault();
    const title = $('taskTitle').value.trim(); if (!title) return;
    const row = {owner_id:user.id, title, business:$('taskBiz').value, due_date:$('taskDue').value || null};
    const btn = ev.submitter || $('taskForm').querySelector('button'); btn.disabled = true;
    const {data, error} = await db.from('workspace_tasks').insert(row).select().single();
    btn.disabled = false;
    if (error) return banner('The task could not be added: '+error.message, 'danger');
    tasks.push(data); $('taskTitle').value = ''; $('taskDue').value = ''; renderTasks(); renderWeek();
  }
  async function toggleTask(id) {
    const x = tasks.find(t => t.id === id); if (!x) return;
    const done_at = x.done_at ? null : new Date().toISOString(); const prev = x.done_at;
    x.done_at = done_at; renderTasks();
    const {error} = await db.from('workspace_tasks').update({done_at, updated_at:new Date().toISOString()}).eq('id', id);
    if (error) { x.done_at = prev; renderTasks(); banner('The task could not be updated: '+error.message, 'danger'); }
    renderWeek();
  }
  let pendingDelete = null;
  async function deleteTask(id, btn) {
    if (pendingDelete !== id) { pendingDelete = id; btn.textContent = 'Delete?'; btn.style.color = 'var(--red)'; setTimeout(() => { if (pendingDelete === id) { pendingDelete = null; renderTasks(); } }, 3000); return; }
    pendingDelete = null;
    const {error} = await db.from('workspace_tasks').delete().eq('id', id);
    if (error) return banner('The task could not be deleted: '+error.message, 'danger');
    tasks = tasks.filter(t => t.id !== id); renderTasks(); renderWeek();
  }

  // ---------- live data ----------
  function tile(label, value, cls, href) { return '<a class="tile '+(cls||'')+'" href="'+href+'"><strong>'+value+'</strong><span>'+label+'</span></a>'; }
  function renderLive() {
    const t = todayKey();
    const overdue = live.sales ? Number(live.sales.overdueCount || 0) : null, quotes = live.sales ? Number(live.sales.quotationFollowUpCount || 0) : null;
    const trainerTotal = live.trainer ? live.trainer.proposals + live.trainer.docs + live.trainer.catreq : null;
    $('liveTiles').innerHTML =
      tile('Trainings, next 7 days', live.trainings.length, '', 'inventory-goodies.html') +
      tile('Room bookings this week', live.rooms.length, '', 'venue-bookings.html') +
      tile('Overdue follow-ups', overdue == null ? '—' : overdue, overdue ? 'bad' : '', 'agent-dashboard.html') +
      tile('Quotes over 3 days', quotes == null ? '—' : quotes, quotes ? 'warn' : '', 'agent-dashboard.html') +
      tile('Unpaid invoices', live.invoices.length, live.invoices.length ? 'warn' : '', 'venue-bookings.html#documents') +
      tile('Trainer actions', trainerTotal == null ? '—' : trainerTotal, trainerTotal ? 'warn' : '', 'trainer-admin.html');

    $('trainingList').innerHTML = live.trainings.length ? live.trainings.map(tr => {
      const p = prep[tr.key] || {}, when = tr.start === tr.end ? nice(tr.start) : nice(tr.start)+' – '+nice(tr.end);
      const soon = daysBetween(t, tr.start); const tag = soon <= 0 ? '<span class="tag bad">Today</span>' : soon === 1 ? '<span class="tag warn">Tomorrow</span>' : '<span class="tag">In '+soon+' days</span>';
      return '<div class="item">'+tag+'<strong>'+esc(tr.title)+'</strong><small>'+when+(tr.time?' · '+esc(tr.time):'')+' · '+esc(tr.venue)+(tr.pax?' · '+tr.pax+' pax':'')+'</small><div class="prep">'+PREP.map(([id, label]) => '<label><input type="checkbox" data-prep="'+esc(tr.key)+'" data-item="'+id+'"'+(p[id]?' checked':'')+'> '+label+'</label>').join('')+'</div></div>';
    }).join('') : '<p class="empty">No trainings in the next 7 days.</p>';

    if (!live.sales) $('salesList').innerHTML = '<p class="empty">Sales data uses your Agent Portal session. <a href="agent-dashboard.html">Sign in to Agent Portal</a>, then come back and refresh.</p>';
    else {
      const items = [...(live.sales.overdueFollowUps || []).slice(0,4).map(x => ({...x, kind:'overdue'})), ...(live.sales.quotationFollowUps || []).slice(0,3).map(x => ({...x, kind:'quote'}))];
      $('salesList').innerHTML = items.length ? items.map(x => {
        const mobile = String(x.phone || '').replace(/\D/g, '');
        const tag = x.kind === 'overdue' ? '<span class="tag bad">Overdue '+Number(x.daysOverdue||0)+' days</span>' : '<span class="tag warn">Quote '+Number(x.daysOutstanding||0)+' days</span>';
        return '<div class="item">'+tag+'<strong>'+esc(x.company||'—')+'</strong><small>'+esc(x.contact||'')+(x.agentName?' · Agent: '+esc(x.agentName):'')+(x.kind==='quote'&&x.quotationAmount?' · '+money(x.quotationAmount):'')+'</small>'+(mobile?'<a href="https://wa.me/'+mobile+'" target="_blank" rel="noopener">WhatsApp ↗</a>':'')+'</div>';
      }).join('') : '<p class="empty">No follow-ups need action.</p>';
    }

    $('invoiceList').innerHTML = live.invoices.length ? live.invoices.map(x => {
      const age = x.finalized ? daysBetween(x.finalized, t) : null;
      return '<div class="item"><span class="tag'+(age!=null&&age>14?' bad':age!=null&&age>7?' warn':'')+'">'+esc(x.kind)+(age!=null?' · '+age+' days':'')+'</span><strong>'+esc(x.client||'Client')+'</strong><small>'+esc(x.number||'Invoice')+' · '+money(x.total)+'</small></div>';
    }).join('') : '<p class="empty">All finalised invoices are paid.</p>';

    $('roomList').innerHTML = live.rooms.length ? live.rooms.map(r => '<div class="item">'+(r.status==='PENDING'?'<span class="tag warn">Pending</span>':'')+'<strong>'+esc(r.company_name||r.applicant_name||'Booking')+'</strong><small>'+nice(r.booking_date)+' · '+hhmm(r.start_time)+'–'+hhmm(r.end_time)+(r.room?' · '+esc(r.room):'')+(r.participants?' · '+r.participants+' pax':'')+'</small></div>').join('') : '<p class="empty">No room bookings this week.</p>';

    $('stockList').innerHTML = live.stock.length ? live.stock.map(i => '<div class="item"><span class="tag bad">Low</span><strong>'+esc(i.name)+'</strong><small>'+Number(i.current_stock)+' '+esc(i.unit)+' left · minimum '+Number(i.reorder_level)+'</small></div>').join('') : '<p class="empty">All goodies above minimum stock.</p>';

    const tr = live.trainer;
    $('trainerList').innerHTML = !live.loaded ? '<p class="empty">Loading…</p>' : !tr ? '<p class="empty">Trainer data could not be loaded.</p>' :
      [['New programme proposals', tr.proposals], ['Documents to verify', tr.docs], ['Category change requests', tr.catreq], ['Applicants waiting', tr.applicants]]
        .map(([l, n]) => '<div class="item" style="display:flex;justify-content:space-between;gap:10px"><span>'+l+'</span><strong style="display:inline">'+n+'</strong></div>').join('');
  }

  function groupRoomTrainings(rows) {
    const g = new Map();
    rows.forEach(r => { const k = r.internal_training_group_id || r.id, p = g.get(k);
      if (!p) g.set(k, {key:'ROOM:'+k, title:r.programme_title||'Training', start:r.booking_date, end:r.booking_date, time:hhmm(r.start_time)+'–'+hhmm(r.end_time), venue:(r.venue_rooms&&r.venue_rooms.name)||'Training room', pax:Number(r.actual_participants??r.participants??0)});
      else { if (r.booking_date < p.start) p.start = r.booking_date; if (r.booking_date > p.end) p.end = r.booking_date; } });
    return [...g.values()];
  }
  async function loadLive() {
    const t = todayKey(), wk = addDays(t, 7), from = addDays(t, -60);
    const [inBook, ext, sched, rooms, bill, venueDocs, stock, props, docs, cats, apps] = await Promise.all([
      db.from('venue_bookings').select('id,internal_training_group_id,booking_date,start_time,end_time,programme_title,participants,actual_participants,venue_rooms(name)').eq('booking_source','INTERNAL').eq('status','CONFIRMED').gte('booking_date', addDays(t,-14)).lte('booking_date', addDays(t, 30)).order('booking_date'),
      db.from('training_schedules').select('id,programme_title,venue_name,start_date,end_date,start_time,end_time,participants,actual_participants').eq('status','CONFIRMED').lte('start_date', addDays(t, 30)).gte('end_date', addDays(t,-14)),
      db.from('scheduled_trainings').select('id,programme_title,start_date,end_date,start_time,end_time,venue,city,capacity,status').lte('start_date', addDays(t, 30)).gte('end_date', addDays(t,-14)),
      db.from('venue_bookings').select('id,booking_date,start_time,end_time,company_name,applicant_name,participants,status,venue_rooms(name)').eq('booking_source','CUSTOMER').in('status',['CONFIRMED','PENDING']).gte('booking_date', t).lte('booking_date', addDays(t, 6)).order('booking_date').order('start_time'),
      db.from('billing_documents').select('id,service_category,document_number,payload,finalized_at').eq('document_type','INVOICE').eq('status','FINAL').is('payment_verified_at', null).is('voided_at', null),
      db.from('venue_documents').select('id,document_number,payload,finalized_at').eq('document_type','INVOICE').eq('status','FINAL').is('payment_verified_at', null).is('voided_at', null),
      db.from('inventory_items').select('name,unit,current_stock,reorder_level').eq('is_active', true),
      db.from('programme_proposals').select('id', {count:'exact', head:true}).in('status',['SUBMITTED','FULL_DETAILS_SUBMITTED']),
      db.from('trainer_documents').select('id', {count:'exact', head:true}).eq('verification_status','PENDING'),
      db.from('trainer_category_change_requests').select('id', {count:'exact', head:true}).eq('status','PENDING'),
      db.from('profiles').select('id', {count:'exact', head:true}).eq('collaboration_status','APPLICANT')
    ]);
    const errs = [inBook, ext, sched, rooms, bill, venueDocs, stock].filter(r => r.error);
    if (errs.length) banner('Some live data could not be loaded: '+errs[0].error.message, 'danger');

    const all = [
      ...groupRoomTrainings(inBook.data || []),
      ...(ext.data || []).map(r => ({key:'EXTERNAL:'+r.id, title:r.programme_title, start:r.start_date, end:r.end_date, time:r.start_time?hhmm(r.start_time)+'–'+hhmm(r.end_time):'', venue:r.venue_name||'External venue', pax:Number(r.actual_participants??r.participants??0)})),
      ...(sched.data || []).filter(r => !/CANCEL|DRAFT/i.test(r.status||'')).map(r => ({key:'PUBLIC:'+r.id, title:r.programme_title, start:r.start_date, end:r.end_date, time:r.start_time?hhmm(r.start_time)+'–'+hhmm(r.end_time):'', venue:[r.venue, r.city].filter(Boolean).join(', ')||'Public training', pax:Number(r.capacity||0)}))
    ];
    trainingDates = new Set();
    all.forEach(tr => { for (let k = tr.start; k <= tr.end; k = addDays(k, 1)) trainingDates.add(k); });
    live.trainings = all.filter(tr => tr.end >= t && tr.start <= wk).sort((a, b) => a.start.localeCompare(b.start));
    live.rooms = (rooms.data || []).map(r => ({...r, room:r.venue_rooms && r.venue_rooms.name}));
    live.invoices = [
      ...(bill.data || []).map(x => ({kind:'Consultancy', number:x.document_number, client:x.payload&&x.payload.client_name, total:x.payload&&x.payload.total, finalized:x.finalized_at&&new Date(x.finalized_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})})),
      ...(venueDocs.data || []).map(x => ({kind:'Room', number:x.document_number, client:x.payload&&x.payload.client_name, total:x.payload&&x.payload.total, finalized:x.finalized_at&&new Date(x.finalized_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})}))
    ].sort((a, b) => (a.finalized||'').localeCompare(b.finalized||''));
    live.stock = (stock.data || []).filter(i => Number(i.current_stock) <= Number(i.reorder_level));
    live.trainer = [props, docs, cats, apps].some(r => r.error) ? null : {proposals:props.count||0, docs:docs.count||0, catreq:cats.count||0, applicants:apps.count||0};

    live.loaded = true;
    const keys = live.trainings.map(tr => tr.key);
    if (keys.length) {
      const {data} = await db.from('workspace_training_prep').select('training_key,items').in('training_key', keys);
      prep = {}; (data || []).forEach(r => { prep[r.training_key] = r.items || {}; });
    }
    renderLive(); renderHeader(); renderRoutine(); renderWeek();
  }
  async function loadSales() {
    let token = ''; try { token = localStorage.getItem('agentSessionToken') || ''; } catch (_) {}
    if (!token) { live.sales = null; return; }
    try {
      const res = await fetch(SALES_API+'?'+new URLSearchParams({action:'adminDashboard', sessionToken:token}));
      const data = await res.json();
      live.sales = data && data.success ? data : null;
    } catch (_) { live.sales = null; }
  }
  async function savePrep(key, item, on) {
    const items = {...(prep[key] || {}), [item]:on}; prep[key] = items;
    const {error} = await db.from('workspace_training_prep').upsert({owner_id:user.id, training_key:key, items, updated_at:new Date().toISOString()}, {onConflict:'owner_id,training_key'});
    if (error) banner('Prep tick could not be saved: '+error.message, 'danger');
  }

  // ---------- prayer times ----------
  async function loadPrayer() {
    try {
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(PRAYER_URL, {signal:ctrl.signal}); clearTimeout(timer);
      const raw = await res.json();
      const mon = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
      prayer = (raw.prayerTime || []).map(d => {
        const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(d.date || ''); if (!m) return null;
        const k = toKey(new Date(Date.UTC(+m[3], mon[m[2]], +m[1], 12)));
        const h = v => String(v || '').slice(0, 5);
        return {date:k, subuh:h(d.fajr), syuruk:h(d.syuruk), zohor:h(d.dhuhr), asar:h(d.asr), maghrib:h(d.maghrib), isyak:h(d.isha)};
      }).filter(Boolean);
      if (!prayer.length) prayer = false;
    } catch (_) { prayer = false; }
    renderPrayerStrip(); renderRoutine();
  }

  // ---------- week view ----------
  function renderWeek() {
    const monday = addDays(current, -((dow(current) + 6) % 7)), sat = addDays(monday, 5), t = todayKey();
    $('weekTitle').textContent = 'Week of '+nice(monday)+' – '+nice(addDays(monday, 6));
    let strip = '';
    for (let i = 0; i < 7; i++) {
      const k = addDays(monday, i), p = progress(k), sun = dow(k) === 0, pct = p.total ? Math.round(p.n/p.total*100) : 0;
      strip += '<button type="button" class="wd'+(k===current?' sel':'')+(sun?' sun':'')+'" data-day="'+k+'" aria-label="'+DAYS[dow(k)]+' '+nice(k)+'"><span>'+DAYS[dow(k)].slice(0,3)+'</span><strong>'+fromKey(k).getUTCDate()+'</strong><div class="mini"><i style="width:'+pct+'%"></i></div><small>'+(sun?'Rest':p.n+'/'+p.total)+(trainingDates.has(k)?' · T':'')+'</small></button>';
    }
    $('weekStrip').innerHTML = strip;

    const inWeek = d => d >= monday && d <= addDays(monday, 6);
    const doneTasks = tasks.filter(x => x.done_at && inWeek(new Date(x.done_at).toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})));
    const carried = tasks.filter(x => !x.done_at && x.due_date && x.due_date <= (sat < t ? sat : t));
    let blocksDone = 0, blocksTotal = 0;
    const notes = {el:[], sns:[], rapat:[], focus:[], general:[]};
    for (let i = 0; i < 6; i++) {
      const k = addDays(monday, i); if (k > t) break;
      const p = progress(k); blocksDone += p.n; blocksTotal += p.total;
      const n = entry(k).notes || {};
      Object.keys(notes).forEach(f => { if (n[f] && String(n[f]).trim()) notes[f].push('<li><b>'+DAYS[dow(k)].slice(0,3)+':</b> '+esc(String(n[f]).trim()).replace(/\n/g, '<br>')+'</li>'); });
    }
    const box = (title, arr, wide) => '<div class="box'+(wide?' wide':'')+'"><h3>'+title+'</h3>'+(arr.length ? '<ul>'+arr.join('')+'</ul>' : '<p class="empty">Nothing written yet.</p>')+'</div>';
    $('weekReview').innerHTML =
      '<div class="box wide"><div class="stat"><div><b>'+blocksDone+'/'+blocksTotal+'</b>routine blocks ticked</div><div><b>'+doneTasks.length+'</b>tasks done</div><div><b>'+carried.length+'</b>tasks carried over</div><div><b>'+[...trainingDates].filter(inWeek).length+'</b>training days</div></div></div>' +
      box('Easy Latih', notes.el) + box('S&amp;S takaful', notes.sns) + box('RAPAT.my', notes.rapat) + box('Weekly-focus projects', notes.focus) +
      box('Carried over', carried.map(x => '<li>'+esc(x.title)+' <span class="muted">('+esc(BIZ[x.business]||'Other')+', due '+nice(x.due_date)+')</span></li>')) +
      box('Wins and other notes', notes.general);
  }

  // ---------- full render ----------
  function renderDay() { renderHeader(); renderPrayerStrip(); renderRoutine(); renderJournal(); renderWeek(); }
  function go(k) { current = k; renderDay(); }
  function setView(v) {
    view = v;
    ['today','week'].forEach(x => { $('tab-'+x).setAttribute('aria-selected', String(x === v)); $('view-'+x).hidden = x !== v; });
  }

  // ---------- loading ----------
  async function loadMine() {
    const t = todayKey();
    const [d, tk] = await Promise.all([
      db.from('workspace_days').select('day,training_day,done,notes').gte('day', addDays(t, -60)).lte('day', addDays(t, 30)),
      db.from('workspace_tasks').select('*').or('done_at.is.null,done_at.gte.'+new Date(Date.now() - 30*86400000).toISOString())
    ]);
    if (d.error || tk.error) throw (d.error || tk.error);
    (d.data || []).forEach(r => { if (!dirty[r.day]) days[r.day] = {training_day:r.training_day, done:r.done || {}, notes:r.notes || {}}; });
    tasks = tk.data || [];
  }

  // ---------- events ----------
  function bind() {
    $('prevDay').onclick = () => go(addDays(current, -1));
    $('nextDay').onclick = () => go(addDays(current, 1));
    $('todayBtn').onclick = () => go(todayKey());
    $('tab-today').onclick = () => setView('today');
    $('tab-week').onclick = () => setView('week');
    $('refreshLive').onclick = async () => { $('refreshLive').disabled = true; await loadSales(); await loadLive().catch(e => banner('Live data could not be refreshed: '+e.message, 'danger')); $('refreshLive').disabled = false; };
    $('routineList').addEventListener('click', ev => {
      const b = ev.target.closest('[data-block]'); if (!b) return;
      const e = days[current] = JSON.parse(JSON.stringify(entry(current)));
      e.done = e.done || {}; e.done[b.dataset.block] = !e.done[b.dataset.block];
      renderHeader(); renderRoutine(); renderWeek(); queueDay(current, 300);
    });
    $('trainingToggle').addEventListener('change', ev => {
      const e = days[current] = JSON.parse(JSON.stringify(entry(current)));
      e.done = e.done || {}; e.done._mode = ev.target.checked ? 'training' : 'normal';
      renderDay(); queueDay(current, 300);
    });
    $('journalFields').addEventListener('input', ev => {
      const t = ev.target; if (!t.dataset.note) return;
      const e = days[current] = JSON.parse(JSON.stringify(entry(current)));
      e.notes = e.notes || {}; e.notes[t.dataset.note] = t.value;
      queueDay(current, 900);
    });
    $('taskForm').addEventListener('submit', addTask);
    $('taskList').addEventListener('click', ev => {
      const c = ev.target.closest('[data-task]'); if (c) return toggleTask(c.dataset.task);
      const d = ev.target.closest('[data-del]'); if (d) return deleteTask(d.dataset.del, d);
    });
    $('trainingList').addEventListener('change', ev => { const c = ev.target.closest('[data-prep]'); if (c) savePrep(c.dataset.prep, c.dataset.item, c.checked); });
    $('weekStrip').addEventListener('click', ev => { const b = ev.target.closest('[data-day]'); if (b) { go(b.dataset.day); setView('today'); window.scrollTo({top:0, behavior:'smooth'}); } });
    document.addEventListener('keydown', ev => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
      if (ev.key === 'ArrowLeft') go(addDays(current, -1));
      if (ev.key === 'ArrowRight') go(addDays(current, 1));
    });
  }

  async function setup() {
    if (!db || !cfg.supabaseUrl) { $('loginState').textContent = 'Supabase configuration is missing.'; return; }
    const {data, error} = await db.auth.getUser();
    if (error || !data || !data.user || (data.user.app_metadata || {}).role !== 'admin') {
      $('loginState').innerHTML = 'Admin access required. <a href="../trainer/index.html">Sign in with your EasyLatih admin account</a>.'; return;
    }
    user = data.user; $('loginState').hidden = true; $('adminApp').hidden = false;
    bind(); renderDay(); renderTasks(); renderLive();
    try { await loadMine(); } catch (e) { banner('Your workspace could not be loaded: '+e.message, 'danger'); }
    renderDay(); renderTasks();
    loadPrayer();
    await loadSales();
    loadLive().catch(e => banner('Live data could not be loaded: '+e.message, 'danger'));
  }
  setup();
})();
