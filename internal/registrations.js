(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  const API = cfg.publicTrainingAppsScriptUrl;
  const db = window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const httpsUrl = u => /^https:\/\//i.test(String(u || '')) ? String(u) : '';
  const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kuala_Lumpur'});
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const nice = k => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(k || '')); return m ? Number(m[3])+' '+MON[Number(m[2])-1]+' '+m[1] : (k || ''); };
  const days = (a, b) => Math.round((Date.parse(b+'T00:00:00Z') - Date.parse(a+'T00:00:00Z')) / 86400000);
  const money = n => 'RM' + Number(n || 0).toLocaleString('en-MY', {minimumFractionDigits:2, maximumFractionDigits:2});
  const phoneLink = p => { const d = String(p || '').replace(/\D/g, ''); if (!d) return ''; const intl = d.startsWith('0') ? '6'+d : d; return '<a href="https://wa.me/'+intl+'" target="_blank" rel="noopener">WhatsApp</a>'; };

  function banner(msg, type) { const el = $('message'); el.textContent = msg || ''; el.dataset.type = type || 'info'; el.hidden = !msg; if (msg) window.scrollTo({top:0, behavior:'smooth'}); }

  async function call(action, payload) {
    const { data } = await db.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) { location.replace('login.html?next=registrations.html'); throw new Error('Signed out'); }
    let res;
    try { res = await fetch(API, { method:'POST', body: new URLSearchParams({ action:'adminTools.'+action, accessToken:token, payload: JSON.stringify(payload || {}) }) }); }
    catch (_) { throw new Error('Could not reach the registration service. Check your connection and try again.'); }
    let out; try { out = await res.json(); } catch (_) { throw new Error('The registration service replied with something unexpected.'); }
    if (!out || !out.success) throw new Error((out && out.message) || 'The request failed.');
    return out.data;
  }

  // ---------- tabs ----------
  const tabs = ['upcoming', 'previous', 'clients', 'archived'];
  const viewOf = t => (t === 'upcoming' || t === 'previous') ? 'programmes' : t;
  let listMode = 'upcoming';
  function setTab(t) {
    tabs.forEach(x => $('tab-'+x).setAttribute('aria-selected', String(x === t)));
    ['programmes', 'clients', 'archived'].forEach(v => { $('view-'+v).hidden = v !== viewOf(t); });
    if (viewOf(t) === 'programmes') {
      listMode = t;
      $('view-programmes').setAttribute('aria-labelledby', 'tab-'+t);
      if (detail) backToList(); else renderCards();
    }
    if (t === 'archived') loadArchived();
    if (t === 'clients' && !clientsLoaded) searchClients('');
  }

  // ---------- programme cards ----------
  let programmes = [];
  const STATUS = {CONFIRMED:'good', TENTATIVE:'warn', DRAFT:'grey', CANCELLED:'bad', COMPLETED:'grey', DECLINED:'bad'};
  function paxBar(p) {
    const max = p.maxPax || Math.max(p.counts.pax, p.minPax, 1);
    const pct = Math.min(100, Math.round(p.counts.pax / max * 100));
    const minPct = p.minPax ? Math.min(100, Math.round(p.minPax / max * 100)) : null;
    return '<div class="paxbar" aria-hidden="true"><i class="'+(p.minPax && p.counts.pax < p.minPax ? 'low' : '')+'" style="width:'+pct+'%"></i>'+(minPct!=null?'<b style="left:calc('+minPct+'% - 1px)" title="Minimum pax"></b>':'')+'</div>' +
      '<div class="paxline"><span>'+p.counts.pax+' pax registered</span><span>'+(p.minPax?'min '+p.minPax:'no min')+' · '+(p.maxPax?'max '+p.maxPax:'no max')+'</span></div>';
  }
  function closeInfo(p) {
    if (!p.closeDate) return 'No registration close date set';
    const d = days(today(), p.closeDate);
    return d > 1 ? 'Registration closes in '+d+' days ('+nice(p.closeDate)+')' : d === 1 ? 'Registration closes tomorrow' : d === 0 ? 'Registration closes today' : 'Registration closed '+nice(p.closeDate);
  }
  function renderCards() {
    const today = new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kuala_Lumpur'});
    const ended = p => { const e = p.endDate || p.startDate; return !!e && e < today; };
    const up = [], prev = [];
    programmes.forEach((p, i) => (ended(p) ? prev : up).push([p, i]));
    prev.sort((a, b) => String(b[0].startDate).localeCompare(String(a[0].startDate)));
    $('count-upcoming').textContent = programmes.length ? '('+up.length+')' : '';
    $('count-previous').textContent = programmes.length ? '('+prev.length+')' : '';
    $('listHint').textContent = listMode === 'previous' ? 'Programmes that have ended and are not archived yet, latest first. Finish HRD claims here, then archive.' : 'Programmes that have not ended yet, earliest first.';
    const shown = listMode === 'previous' ? prev : up;
    $('cards').innerHTML = shown.length ? shown.map(([p, i]) => {
      const c = p.counts;
      const chips = [
        c.awaitingPayment ? '<span class="chip warn">'+c.awaitingPayment+' awaiting payment</span>' : '',
        c.awaitingGrant ? '<span class="chip warn">'+c.awaitingGrant+' awaiting grant</span>' : '',
        c.confirmed ? '<span class="chip good">'+c.confirmed+' confirmed</span>' : '',
        c.inClaim ? '<span class="chip">'+c.inClaim+' in HRD claim</span>' : '',
        c.completed ? '<span class="chip grey">'+c.completed+' completed</span>' : ''
      ].join('');
      return '<article class="pcard"><div class="chips"><span class="chip '+(STATUS[p.status]||'')+'">'+esc(p.status)+'</span>'+(p.isActive === false ? '<span class="chip bad">Not active</span>' : p.isPublished === false ? '<span class="chip grey">Not on website</span>' : '')+(p.archivable && c.total ? '<span class="chip good">Ready to archive</span>' : '')+'</div>' +
        '<h3>'+esc(p.programName)+'</h3><p class="meta">'+esc(p.programDate)+' · '+esc(p.venue)+(p.deliveryMode?' · '+esc(p.deliveryMode):'')+'<br>'+esc(closeInfo(p))+'</p>' +
        paxBar(p) + '<div class="chips">'+(chips || '<span class="hint">No registrations yet</span>')+'</div>' +
        '<div><button type="button" class="primary small" data-open="'+i+'">Open programme</button></div></article>';
    }).join('') : '<p class="empty">'+(listMode === 'previous' ? 'No previous programmes waiting to be archived.' : 'No upcoming public programmes.')+'</p>';
  }
  async function loadProgrammes() {
    $('cards').innerHTML = '<p class="empty">Loading programmes…</p>';
    try { programmes = await call('regPrograms') || []; renderCards(); }
    catch (e) { $('cards').innerHTML = '<p class="empty">Programmes could not be loaded.</p>'; banner(e.message, 'danger'); }
  }

  // ---------- programme detail ----------
  let detail = null;
  const STAGE_CLASS = {AWAITING_PAYMENT:'warn', AWAITING_GRANT:'warn', CONFIRMED:'good', ATTENDED:'good', CERT_SENT:'', JD14_SENT:'', JD14_SIGNED:'', CLAIM_SUBMITTED:'', COMPLETED:'grey', CANCELLED:'bad'};
  const HRD_STEP = {JD14_SENT:'JD14 sent to PIC', JD14_SIGNED:'JD14 signed', CLAIM_SUBMITTED:'Claim submitted', CLAIM_PAID:'Claim paid'};

  function stepsLine(r) {
    const s = (on, label) => '<span class="'+(on?'on':'')+'">'+(on?'✓ ':'○ ')+label+'</span>';
    const attended = r.participants.some(p => p.attendance === 'ATTENDED');
    const cert = attended && r.participants.filter(p => p.attendance === 'ATTENDED').every(p => p.certificateStatus === 'SENT');
    const parts = [s(true, 'Registered')];
    if (r.paymentMethod === 'SELF') parts.push(s(!!r.paymentDate || r.stage.key !== 'AWAITING_PAYMENT', 'Paid'+(r.paymentDate?' '+nice(r.paymentDate):'')));
    else parts.push(s(!!r.grantDate || r.stage.key !== 'AWAITING_GRANT', 'Grant approved'+(r.grantDate?' '+nice(r.grantDate):'')));
    parts.push(s(!!r.confirmationSentDate, 'Confirmation sent'), s(attended, 'Attended'), s(cert, 'Certificate sent'));
    if (r.paymentMethod === 'HRD') parts.push(s(!!r.jd14SentDate, 'JD14 sent'), s(!!r.jd14SignedDate, 'JD14 signed'), s(!!r.claimSubmittedDate, 'Claim submitted'), s(!!r.claimPaidDate, 'Claim paid'));
    return '<div class="steps">'+parts.join('')+'</div>';
  }
  function actionForm(r, kind) {
    const id = esc(r.registrationId), t = today();
    if (kind === 'PAYMENT') {
      const p = detail.program, suggested = Math.max(0, p.selfFee * r.requestedPax - (r.discountAmount || 0));
      return '<form class="form-grid" data-form="PAYMENT" data-id="'+id+'"><label>Payment date<input name="paymentDate" type="date" value="'+t+'" required></label>' +
        '<label>Amount received (RM)<input name="amount" type="number" min="0" step="0.01" value="'+(suggested?suggested.toFixed(2):'')+'" required></label>' +
        '<label>Method<select name="method"><option>Bank transfer</option><option>Online banking (FPX)</option><option>Cheque</option><option>Cash</option></select></label>' +
        '<label>Reference no.<input name="paymentRef" placeholder="Bank transaction reference"></label>' +
        '<label class="wide">Remarks<input name="remarks" placeholder="Optional"></label>' +
        '<div class="act wide"><button type="submit" class="primary">Confirm payment and email receipt</button><button type="button" data-close>Cancel</button></div></form>';
    }
    if (kind === 'GRANT') {
      return '<form class="form-grid" data-form="GRANT" data-id="'+id+'"><label>Grant reference<input name="grantRef" required placeholder="HRD Corp grant ID"></label>' +
        '<label>Approval date<input name="approvalDate" type="date" value="'+t+'" required></label>' +
        '<label>Remarks<input name="remarks" placeholder="Optional"></label>' +
        '<div class="act wide"><button type="submit" class="primary">Confirm grant and email PIC</button><button type="button" data-close>Cancel</button></div></form>';
    }
    if (HRD_STEP[kind]) {
      // Original amount: HRD fee × pax, less any discount (same basis as the quotation).
      const claim = Math.max(0, detail.program.hrdFee * r.requestedPax - (r.discountAmount || 0));
      return '<form class="form-grid" data-form="STEP" data-step="'+kind+'" data-id="'+id+'"><label>Date<input name="date" type="date" value="'+t+'" required></label>' +
        (kind === 'CLAIM_SUBMITTED' ? '<label>Claim reference<input name="ref" placeholder="HRD Corp claim ID"></label><label>Claim amount (RM)<input name="amount" type="number" min="0" step="0.01" value="'+(claim?claim.toFixed(2):'')+'"></label>' : '') +
        '<div class="act wide"><button type="submit" class="primary">Mark '+esc(HRD_STEP[kind].toLowerCase())+'</button><button type="button" data-close>Cancel</button></div></form>';
    }
    if (kind === 'CANCEL') {
      return '<form class="form-grid" data-form="CANCEL" data-id="'+id+'"><label class="wide">Reason<input name="remarks" placeholder="Client withdrew, moved to next intake…"></label>' +
        '<div class="act wide"><button type="submit" class="primary">Cancel this registration</button><button type="button" data-close>Keep it</button></div></form>';
    }
    return '';
  }
  function regCard(r) {
    const st = r.stage, id = esc(r.registrationId);
    const next = st.next === 'PAYMENT' ? '<button type="button" class="primary small" data-open-form="PAYMENT" data-id="'+id+'">Payment received</button>'
      : st.next === 'GRANT' ? '<button type="button" class="primary small" data-open-form="GRANT" data-id="'+id+'">Grant approved</button>'
      : HRD_STEP[st.next] ? '<button type="button" class="primary small" data-open-form="'+st.next+'" data-id="'+id+'">'+esc(HRD_STEP[st.next])+'</button>' : '';
    const resend = r.confirmationSentDate || ['CONFIRMED','ATTENDED'].includes(st.key) ? '<button type="button" class="small" data-resend="'+id+'">Resend confirmation</button>' : '';
    const cancel = !st.done ? '<button type="button" class="small" data-open-form="CANCEL" data-id="'+id+'">Cancel</button>' : '';
    const receipt = httpsUrl(r.receiptUrl) ? '<a href="'+esc(r.receiptUrl)+'" target="_blank" rel="noopener">Receipt '+esc(r.receiptNo)+' ↗</a>' : '';
    const people = r.participants.length ? '<details><summary>'+r.participants.length+' participant'+(r.participants.length===1?'':'s')+'</summary><ul class="people">'+r.participants.map(p => '<li><span>'+esc(p.name)+'</span><small>'+esc(p.icNo)+' · '+esc(p.email)+'</small><span class="chip '+(p.attendance==='ATTENDED'?'good':p.attendance==='ABSENT'?'bad':'grey')+'">'+esc(p.attendance)+'</span>'+(p.certificateStatus==='SENT'?'<span class="chip good">Certificate sent</span>':'')+'</li>').join('')+'</ul></details>' : '';
    const extra = [r.grantRef?'Grant '+esc(r.grantRef):'', r.paymentRef?'Payment ref '+esc(r.paymentRef):'', r.claimRefNo?'Claim '+esc(r.claimRefNo)+(r.claimAmount?' · '+money(r.claimAmount):''):'', r.remarks?esc(r.remarks):''].filter(Boolean).join(' · ');
    return '<article class="reg" id="reg-'+id+'"><div class="reg-top"><div><h4>'+esc(r.companyName || 'Company')+'</h4>' +
      '<p class="who">'+esc(r.picName)+' · <a href="mailto:'+esc(r.picEmail)+'">'+esc(r.picEmail)+'</a>'+(r.picPhone?' · '+esc(r.picPhone)+' '+phoneLink(r.picPhone):'')+'<br>'+esc(r.registrationId)+' · '+r.requestedPax+' pax'+(extra?' · '+extra:'')+'</p></div>' +
      '<div class="chips" style="align-content:flex-start;justify-content:flex-end"><span class="chip">'+(r.paymentMethod==='HRD'?'HRD Corp':'Self payment')+'</span><span class="chip '+(STAGE_CLASS[st.key]||'')+'">'+esc(st.label)+'</span></div></div>' +
      stepsLine(r) + people +
      '<div class="act">'+next+resend+cancel+receipt+'</div><div class="inline-form" data-slot="'+id+'"></div></article>';
  }
  function statusPanel(p) {
    const opts = ['DRAFT','TENTATIVE'].concat(p.status === 'CONFIRMED' ? ['CONFIRMED'] : []).concat(['CANCELLED','COMPLETED']);
    if (opts.indexOf(p.status) === -1) opts.unshift(p.status);
    const label = {DRAFT:'Draft (hidden, not open)', TENTATIVE:'Tentative (open for registration)', CONFIRMED:'Confirmed', CANCELLED:'Cancelled', COMPLETED:'Completed'};
    return '<section class="panel"><div class="panel-head"><div><h2>Programme status</h2><p>Same rules as Programme Management.</p></div></div>' +
      '<form class="stack" id="statusForm"><label>Status<select id="st-status" style="font:inherit;font-size:.84rem;border:1px solid var(--line);border-radius:9px;padding:8px 10px;background:#fff">' +
      opts.map(o => '<option value="'+o+'"'+(o===p.status?' selected':'')+'>'+esc(label[o]||o)+'</option>').join('') + '</select></label>' +
      '<label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="st-active" style="width:auto"'+(p.isActive?' checked':'')+'> Active</label>' +
      '<label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="st-published" style="width:auto"'+(p.isPublished?' checked':'')+'> Published on the website schedule</label>' +
      '<button type="submit">Save status</button></form>' +
      '<p class="hint" id="statusNote" style="margin-top:8px">To confirm, use Confirm programme below so PICs get the email. Draft, Cancelled, Completed or inactive programmes are taken off the website automatically.</p></section>';
  }
  function confirmPanel(p) {
    const c = p.confirm;
    if (!c) return '';
    if (c.status === 'CONFIRMED' || c.status === 'COMPLETED') {
      return '<section class="panel"><div class="panel-head"><div><h2>Programme '+(c.status === 'CONFIRMED' ? 'confirmed' : 'completed')+'</h2><p>PICs received the "Programme Confirmed" email when it was confirmed.</p></div></div></section>';
    }
    const list = c.checks.map(x => '<li style="display:flex;gap:8px;align-items:baseline;margin:4px 0"><span aria-hidden="true" style="font-weight:700;color:'+(x.ok?'#1f8a4c':'#c0392b')+'">'+(x.ok?'✓':'✗')+'</span><span>'+esc(x.label)+(x.fix === 'TRAINER' ? ' <button type="button" class="small" id="trainerConfirmedBtn">Trainer has confirmed</button>' : '')+'</span></li>').join('');
    return '<section class="panel"><div class="panel-head"><div><h2>Confirm programme</h2><p>Sets the status to CONFIRMED and emails every PIC (Program Disahkan / Programme Confirmed).</p></div></div>' +
      '<ul style="list-style:none;padding:0;margin:0 0 12px;font-size:.84rem">'+list+'</ul>' +
      '<button type="button" id="confirmProgrammeBtn"'+(c.ready?' class="primary"':' disabled')+'>Confirm programme and email PICs</button>' +
      '<p class="hint" style="margin-top:8px">'+(c.ready?'All checks passed.':'Confirmed pax counts paid and grant-approved registrations only. Change Status and Active in the panel above.')+'</p></section>';
  }
  function renderDetail() {
    const d = detail, p = d.program, s = d.settings;
    const active = d.registrations.filter(r => r.stage.key !== 'CANCELLED');
    const pax = active.reduce((n, r) => n + r.requestedPax, 0);
    const confirmedPax = active.filter(r => !['AWAITING_PAYMENT','AWAITING_GRANT'].includes(r.stage.key)).reduce((n, r) => n + r.requestedPax, 0);
    const completed = active.filter(r => r.stage.done).length;
    const archivable = active.length ? completed === active.length : d.registrations.length > 0;
    $('programmeDetail').innerHTML =
      '<div class="toolbar"><button type="button" id="backToList">← All programmes</button><button type="button" class="small" id="refreshDetail">↻ Refresh</button><a class="small" style="display:inline-flex;align-items:center;padding:6px 11px;border:1px solid var(--line);border-radius:8px;font-size:.74rem;font-weight:600;color:var(--navy);text-decoration:none;background:#fff" href="appendices.html?course='+encodeURIComponent(p.courseId)+'">🧩 eTRiS Appendices</a></div>' +
      '<section class="panel"><div class="panel-head"><div><p class="eyebrow">'+esc(p.courseId)+' · '+esc(p.status)+'</p><h2 style="font-size:1.3rem">'+esc(p.programName)+'</h2><p>'+esc(p.programDate)+' · '+esc(p.venue)+(p.deliveryMode?' · '+esc(p.deliveryMode):'')+'</p></div></div>' +
      '<div class="summary"><div><b>'+pax+'</b>pax registered</div><div><b>'+confirmedPax+'</b>pax confirmed</div><div><b>'+(p.minPax||'—')+'</b>minimum pax</div><div><b>'+(p.maxPax||'—')+'</b>maximum pax</div><div><b>'+active.length+'</b>companies</div><div><b>'+(p.closeDate?nice(p.closeDate):'—')+'</b>registration closes</div></div>' +
      (p.minPax && pax < p.minPax ? '<p class="notice" data-type="danger" style="margin-top:12px">Below minimum: '+pax+' of '+p.minPax+' pax registered.</p>' : '') +
      '</section>' +
      '<div class="layout" style="margin-top:18px"><div class="col-main"><section class="panel"><div class="panel-head"><div><h2>Registrations</h2><p>Mark attendance and send certificates in <a href="documents.html#certs" style="color:var(--orange);font-weight:600">Documents → Certificates</a>.</p></div></div><div class="list">' +
      (d.registrations.length ? d.registrations.map(regCard).join('') : '<p class="empty">No registrations yet.</p>') + '</div>' +
      '<div class="danger-zone"><button type="button" id="archiveBtn"'+(archivable?' class="primary"':'')+'>Archive programme</button>' +
      (archivable ? '<span class="hint">All registrations are completed or cancelled.</span>' : '<label class="hint" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="archiveForce"> Archive anyway (some registrations are not completed)</label>') + '</div></section></div>' +
      '<aside class="col-side">' + statusPanel(p) + confirmPanel(p) + '<section class="panel"><div class="panel-head"><div><h2>Pax and deadline</h2><p>Changes apply to the website and the registration-close check straight away.</p></div></div>' +
      '<form class="stack" id="limitsForm"><div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px">' +
      '<label>Minimum pax<input id="l-min" type="number" min="1" step="1" required value="'+(p.minPax||'')+'"></label>' +
      '<label>Maximum pax<input id="l-max" type="number" min="1" step="1" required value="'+(p.maxPax||'')+'"></label></div>' +
      '<label>Registration close date<input id="l-close" type="date" value="'+esc(p.closeDate)+'"'+(p.startDate?' max="'+esc(p.startDate)+'"':'')+'></label>' +
      '<button type="submit" class="primary">Save pax and deadline</button></form><p class="hint" id="limitsNote" style="margin-top:8px">'+(p.minPax?'':'No minimum set yet, so the participant list email can\'t say whether this programme runs.')+'</p></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>Programme settings</h2><p>Used in the emails sent to PICs.</p></div></div>' +
      '<form class="stack" id="settingsForm"><label>HRD Corp grant guideline (Google Drive link)<input id="s-guide" value="'+esc(s.guidelineUrl)+'" placeholder="https://drive.google.com/…"></label>' +
      '<label>WhatsApp group link<input id="s-wa" value="'+esc(s.whatsAppLink)+'" placeholder="https://chat.whatsapp.com/…"></label>' +
      '<label>Joining instructions<textarea id="s-join" placeholder="Arrive 8:30am for registration. Parking at… Bring laptop…">'+esc(s.joiningInstructions)+'</textarea></label>' +
      '<button type="submit" class="primary">Save settings</button></form><p class="hint" id="settingsNote" style="margin-top:8px">The guideline goes out automatically with every new HRD registration. Joining instructions and the WhatsApp link go out with the confirmation email.</p></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>Participant list</h2><p>'+(s.participantListSentDate?'Emailed to you on '+nice(s.participantListSentDate)+'.':'Emailed to you automatically when registration closes.')+'</p></div></div>' +
      '<div class="act"><button type="button" id="downloadList">Download CSV</button><button type="button" id="emailList">Email list to me</button></div><p class="hint" id="listNote" style="margin-top:8px"></p></section></aside></div>';
  }
  async function openProgramme(courseId) {
    $('programmeList').hidden = true; $('programmeDetail').hidden = false;
    $('programmeDetail').innerHTML = '<p class="empty">Loading programme…</p>';
    try { detail = await call('regProgramDetail', {courseId}); renderDetail(); window.scrollTo({top:0}); }
    catch (e) { $('programmeDetail').innerHTML = '<div class="toolbar"><button type="button" id="backToList">← All programmes</button></div>'; banner(e.message, 'danger'); }
  }
  function backToList() { detail = null; $('programmeDetail').hidden = true; $('programmeList').hidden = false; loadProgrammes(); }

  function participantCsv() {
    const rows = [['Participant','IC / Passport','Email','Phone','Company','PIC','PIC email','PIC phone','Payment','Stage','Attendance','Registration']];
    detail.registrations.filter(r => r.stage.key !== 'CANCELLED').forEach(r => r.participants.forEach(p => rows.push([p.name, p.icNo, p.email, p.phone, r.companyName, r.picName, r.picEmail, r.picPhone, r.paymentMethod, r.stage.label, p.attendance, r.registrationId])));
    return rows;
  }
  function downloadCsv(rows, name) {
    const csv = rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'}));
    a.download = name.replace(/[\\/:*?"<>|]/g, '-') + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  async function submitForm(form) {
    const btn = form.querySelector('button[type=submit]'), old = btn.textContent;
    const f = Object.fromEntries(new FormData(form).entries());
    const id = form.dataset.id, kind = form.dataset.form;
    btn.disabled = true; btn.textContent = 'Working…';
    try {
      let res;
      if (kind === 'PAYMENT') res = await call('regPaymentReceived', {registrationId:id, paymentDate:f.paymentDate, amount:f.amount, method:f.method, paymentRef:f.paymentRef, remarks:f.remarks});
      else if (kind === 'GRANT') res = await call('regGrantApproved', {registrationId:id, grantRef:f.grantRef, approvalDate:f.approvalDate, remarks:f.remarks});
      else if (kind === 'STEP') res = await call('regHrdStep', {registrationId:id, step:form.dataset.step, date:f.date, ref:f.ref, amount:f.amount});
      else if (kind === 'CANCEL') res = await call('regCancel', {registrationId:id, remarks:f.remarks});
      const warn = res && res.warnings && res.warnings.length ? res.warnings.join(' ') : '';
      banner(warn ? 'Saved, but: '+warn : kind === 'PAYMENT' ? 'Payment recorded. Receipt and confirmation emailed to the PIC.' : kind === 'GRANT' ? 'Grant recorded. Confirmation emailed to the PIC.' : kind === 'CANCEL' ? 'Registration cancelled.' : 'Step recorded.', warn ? 'danger' : 'success');
      detail = await call('regProgramDetail', {courseId: detail.program.courseId}); renderDetail();
    } catch (e) { btn.disabled = false; btn.textContent = old; banner(e.message, 'danger'); }
  }

  // ---------- former clients ----------
  let clientsLoaded = false, clients = [];
  async function searchClients(q) {
    clientsLoaded = true;
    $('clientList').innerHTML = '<p class="empty">Searching…</p>';
    try {
      const res = await call('regFormerClients', {query:q});
      clients = res.clients || [];
      $('clientCount').textContent = res.total + ' compan' + (res.total === 1 ? 'y' : 'ies') + (q ? ' match "'+q+'"' : '') + (res.total > clients.length ? ' · showing the latest '+clients.length : '');
      $('clientList').innerHTML = clients.length ? clients.map(c => '<article class="client"><div><h4>'+esc(c.companyName)+'</h4><p class="who">'+(c.address?esc(c.address)+'<br>':'')+c.programmes.length+' registration'+(c.programmes.length===1?'':'s')+' · '+c.pax+' pax · '+c.hrd+' HRD, '+c.self+' self-paid<br>Last programme '+esc(nice(c.lastDate)||'—')+'</p>' +
        c.contacts.map(x => '<p class="who">'+esc(x.name)+(x.position?', '+esc(x.position):'')+'<br>'+(x.email?'<a href="mailto:'+esc(x.email)+'">'+esc(x.email)+'</a>':'')+(x.phone?' · '+esc(x.phone)+' '+phoneLink(x.phone):'')+'</p>').join('') + '</div>' +
        '<div><p class="hint">Programmes attended</p><ul>'+c.programmes.slice(0, 12).map(x => '<li>'+esc(x.programName)+' · '+esc(nice(x.date))+' · '+x.pax+' pax · '+(x.payment==='HRD'?'HRD':'Self')+'</li>').join('')+'</ul></div></article>').join('')
        : '<p class="empty">No clients match that search.</p>';
    } catch (e) { $('clientList').innerHTML = ''; banner(e.message, 'danger'); }
  }
  function exportClients() {
    if (!clients.length) return banner('Search first, then export.', 'danger');
    const rows = [['Company','Address','Contact','Position','Email','Phone','Registrations','Total pax','HRD','Self-paid','Last programme date','Programmes']];
    clients.forEach(c => (c.contacts.length ? c.contacts : [{}]).forEach(x => rows.push([c.companyName, c.address, x.name||'', x.position||'', x.email||'', x.phone||'', c.programmes.length, c.pax, c.hrd, c.self, c.lastDate, c.programmes.map(p => p.programName).join('; ')])));
    downloadCsv(rows, 'EasyLatih former clients ' + today());
  }

  // ---------- archived ----------
  async function loadArchived() {
    $('archivedList').innerHTML = '<p class="empty">Loading…</p>';
    try {
      const list = await call('regArchivedPrograms') || [];
      $('archivedList').innerHTML = list.length ? list.map(a => '<div class="item"><strong>'+esc(a.programName)+'</strong><small>'+esc(a.programDate)+' · '+a.companies+' companies · '+a.pax+' pax · archived '+esc(nice(a.archivedDate))+'</small></div>').join('') + '<p class="hint">Archived registrations stay searchable in Former clients. The full records are in the Registrations_Archive and Participants_Archive tabs of your master sheet.</p>'
        : '<p class="empty">No archived programmes yet.</p>';
    } catch (e) { $('archivedList').innerHTML = ''; banner(e.message, 'danger'); }
  }

  // ---------- events ----------
  function bind() {
    tabs.forEach(t => { $('tab-'+t).onclick = () => setTab(t); });
    $('refreshList').onclick = loadProgrammes;
    $('cards').addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) openProgramme(programmes[Number(b.dataset.open)].courseId); });
    $('programmeDetail').addEventListener('click', async e => {
      const t = e.target;
      if (t.closest('#backToList')) return backToList();
      if (t.closest('#refreshDetail')) return openProgramme(detail.program.courseId);
      const of = t.closest('[data-open-form]');
      if (of) {
        document.querySelectorAll('.inline-form.open').forEach(x => { x.classList.remove('open'); x.innerHTML = ''; });
        const slot = document.querySelector('[data-slot="'+CSS.escape(of.dataset.id)+'"]');
        const r = detail.registrations.find(x => x.registrationId === of.dataset.id);
        slot.innerHTML = actionForm(r, of.dataset.openForm); slot.classList.add('open');
        const first = slot.querySelector('input'); if (first) first.focus();
        return;
      }
      if (t.closest('[data-close]')) { const slot = t.closest('.inline-form'); slot.classList.remove('open'); slot.innerHTML = ''; return; }
      const rs = t.closest('[data-resend]');
      if (rs) { if (!confirm('Send the confirmation email to this PIC again?')) return; rs.disabled = true; try { await call('regResendConfirmation', {registrationId: rs.dataset.resend}); banner('Confirmation email sent again.', 'success'); } catch (er) { banner(er.message, 'danger'); } rs.disabled = false; return; }
      if (t.closest('#trainerConfirmedBtn')) {
        if (!confirm('Mark the trainer as CONFIRMED for ' + detail.program.programName + '?')) return;
        const b = t.closest('#trainerConfirmedBtn'); b.disabled = true;
        try { detail.program = await call('regTrainerConfirmed', {courseId: detail.program.courseId}); renderDetail(); banner('Trainer marked as confirmed.', 'success'); }
        catch (er) { b.disabled = false; banner(er.message, 'danger'); }
        return;
      }
      if (t.closest('#confirmProgrammeBtn')) {
        const p = detail.program;
        if (!confirm('Confirm ' + p.programName + '? The status becomes CONFIRMED and every PIC gets the "Programme Confirmed" email now.')) return;
        const b = t.closest('#confirmProgrammeBtn'); b.disabled = true; b.textContent = 'Confirming…';
        try {
          const r = await call('regConfirmProgramme', {courseId: p.courseId});
          detail.program = r.program; renderDetail();
          banner('Programme confirmed. Emails sent: ' + r.emailsSent + (r.emailsSkipped ? ', skipped: ' + r.emailsSkipped : '') + (r.emailsFailed ? ', failed: ' + r.emailsFailed : '') + '.', r.emailsFailed ? 'danger' : 'success');
        } catch (er) { b.disabled = false; b.textContent = 'Confirm programme and email PICs'; banner(er.message, 'danger'); }
        return;
      }
      if (t.closest('#downloadList')) return downloadCsv(participantCsv(), 'Participants ' + detail.program.programName + ' ' + today());
      if (t.closest('#emailList')) { const b = t.closest('#emailList'); b.disabled = true; try { const r = await call('regEmailParticipantList', {courseId: detail.program.courseId}); $('listNote').textContent = 'Emailed to you: ' + r.participants + ' participants. ' + r.verdict; } catch (er) { banner(er.message, 'danger'); } b.disabled = false; return; }
      if (t.closest('#archiveBtn')) {
        const force = !!($('archiveForce') && $('archiveForce').checked);
        const active = detail.registrations.filter(r => r.stage.key !== 'CANCELLED');
        const done = active.length ? active.every(r => r.stage.done) : true;
        if (!done && !force) return banner('Some registrations are not completed. Tick "Archive anyway" to archive regardless.', 'danger');
        if (!confirm('Archive ' + detail.program.programName + '? Its registrations and participants move to the archive tabs of your master sheet and leave this list. They stay searchable in Former clients.')) return;
        const b = t.closest('#archiveBtn'); b.disabled = true; b.textContent = 'Archiving…';
        try { const r = await call('regArchive', {courseId: detail.program.courseId, force}); banner('Archived: ' + r.registrations + ' registrations and ' + r.participants + ' participants moved.', 'success'); backToList(); }
        catch (er) { b.disabled = false; b.textContent = 'Archive programme'; banner(er.message, 'danger'); }
      }
    });
    $('programmeDetail').addEventListener('submit', async e => {
      e.preventDefault();
      if (e.target.id === 'settingsForm') {
        const b = e.target.querySelector('button'); b.disabled = true;
        try { detail.settings = await call('regSaveSettings', {courseId: detail.program.courseId, guidelineUrl: $('s-guide').value.trim(), whatsAppLink: $('s-wa').value.trim(), joiningInstructions: $('s-join').value}); $('settingsNote').textContent = 'Saved. New emails will use these settings.'; }
        catch (er) { $('settingsNote').textContent = er.message; }
        b.disabled = false; return;
      }
      if (e.target.id === 'statusForm') {
        const p = detail.program, status = $('st-status').value, isActive = $('st-active').checked, isPublished = $('st-published').checked;
        const companies = detail.registrations.filter(r => r.stage.key !== 'CANCELLED').length;
        if (status === 'CANCELLED' && p.status !== 'CANCELLED' && !confirm('Cancel ' + p.programName + '? ' + (companies ? 'All ' + companies + ' PICs get the "Pembatalan Program / Programme Cancellation" email now.' : 'No PICs are registered, so no emails go out.'))) return;
        if (status === 'COMPLETED' && p.status !== 'COMPLETED' && !confirm('Mark ' + p.programName + ' as completed? It leaves the website schedule.')) return;
        const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Saving…';
        try {
          const r = await call('regSaveStatus', {courseId: p.courseId, status, isActive, isPublished});
          detail.program = r.program; renderDetail();
          const pub = isPublished && !detail.program.isPublished ? ' Published was switched off because the programme is ' + (detail.program.isActive ? detail.program.status.toLowerCase() : 'not active') + '.' : '';
          banner('Saved: ' + detail.program.status + (detail.program.isActive ? ', active' : ', not active') + (detail.program.isPublished ? ', on the website.' : ', not on the website.') + pub + (r.cancellationEmailsSent ? ' Cancellation emails sent: ' + r.cancellationEmailsSent + '.' : '') + (r.cancellationEmailsFailed ? ' Failed: ' + r.cancellationEmailsFailed + '.' : ''), r.cancellationEmailsFailed ? 'danger' : 'success');
        } catch (er) { b.disabled = false; b.textContent = 'Save status'; $('statusNote').textContent = er.message; }
        return;
      }
      if (e.target.id === 'limitsForm') {
        const minPax = Number($('l-min').value), maxPax = Number($('l-max').value);
        if (maxPax < minPax) { $('limitsNote').textContent = 'Maximum pax cannot be lower than minimum pax.'; return; }
        const pax = detail.registrations.filter(r => r.stage.key !== 'CANCELLED').reduce((n, r) => n + r.requestedPax, 0);
        if (maxPax < pax && !confirm(pax + ' pax are already registered, more than the new maximum of ' + maxPax + '. Existing registrations stay, but the website will show this programme as full. Save anyway?')) return;
        const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Saving…';
        try {
          detail.program = await call('regSaveLimits', {courseId: detail.program.courseId, minPax, maxPax, closeDate: $('l-close').value});
          renderDetail();
          banner('Saved: minimum ' + detail.program.minPax + ', maximum ' + detail.program.maxPax + (detail.program.closeDate ? ', registration closes ' + nice(detail.program.closeDate) : ', no close date') + '.', 'success');
        } catch (er) { b.disabled = false; b.textContent = 'Save pax and deadline'; $('limitsNote').textContent = er.message; }
        return;
      }
      if (e.target.dataset.form) submitForm(e.target);
    });
    $('clientSearch').addEventListener('submit', e => { e.preventDefault(); searchClients($('clientQuery').value.trim()); });
    $('clientExport').onclick = exportClients;
  }

  async function setup() {
    if (!db || !cfg.supabaseUrl || !API) { $('loginState').textContent = 'Configuration is missing.'; return; }
    const { data, error } = await db.auth.getUser();
    if (error || !data || !data.user || (data.user.app_metadata || {}).role !== 'admin') { location.replace('login.html?next=registrations.html'); return; }
    $('loginState').hidden = true; $('adminApp').hidden = false;
    bind(); loadProgrammes();
  }
  setup();
})();
