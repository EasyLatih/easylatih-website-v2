(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  const API = cfg.publicTrainingAppsScriptUrl;
  const db = window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val = id => ($(id).value || '').trim();
  const safeUrl = u => /^https:\/\/(docs|drive)\.google\.com\//.test(String(u || '')) ? String(u) : '';

  function banner(msg, type) { const el = $('message'); el.textContent = msg || ''; el.dataset.type = type || 'info'; el.hidden = !msg; if (msg) window.scrollTo({top:0, behavior:'smooth'}); }
  function note(id, html, type) { $(id).innerHTML = html ? '<div class="notice"'+(type?' data-type="'+type+'"':'')+'>'+html+'</div>' : ''; }

  // Calls an action in the Apps Script bridge with the admin's Supabase sign-in.
  async function call(action, payload) {
    const { data } = await db.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) { location.replace('login.html?next=documents.html'); throw new Error('Signed out'); }
    const body = new URLSearchParams({ action: 'adminTools.' + action, accessToken: token, payload: JSON.stringify(payload || {}) });
    let res;
    try { res = await fetch(API, { method: 'POST', body }); }
    catch (_) { throw new Error('Could not reach the document service. Check your connection, or the Apps Script bridge may not be set up yet.'); }
    let out;
    try { out = await res.json(); } catch (_) { throw new Error('The document service replied with something unexpected. The Apps Script bridge may not be set up yet.'); }
    if (!out || !out.success) throw new Error((out && out.message) || 'The request failed.');
    return out.data;
  }
  async function busy(el, label, fn) {
    const btn = el, old = btn.textContent; btn.disabled = true; btn.textContent = label;
    try { return await fn(); } finally { btn.disabled = false; btn.textContent = old; }
  }

  // ---------- tabs ----------
  const tabs = ['docs', 'jd14', 'certs'];
  function setTab(t) {
    tabs.forEach(x => { $('tab-'+x).setAttribute('aria-selected', String(x === t)); $('view-'+x).hidden = x !== t; });
    if (location.hash !== '#'+t) history.replaceState(null, '', '#'+t);
    if (t === 'certs') loadCertsOnce();
  }

  // ---------- quotation and invoice ----------
  let ptype = 'PUBLIC';
  const sessionDocs = [];
  function setPtype(t) {
    ptype = t;
    document.querySelectorAll('[data-ptype]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ptype === t)));
    $('publicFields').hidden = t !== 'PUBLIC'; $('inhouseFields').hidden = t !== 'INHOUSE';
  }
  async function loadCourses() {
    try {
      const list = await call('activeCourses');
      $('d-courseId').innerHTML = '<option value="">Select course</option>' + (list || []).map(c => '<option value="'+esc(c.courseId)+'">'+esc(c.courseId)+' – '+esc(c.programName)+'</option>').join('');
    } catch (e) { $('d-courseId').innerHTML = '<option value="">Courses could not be loaded</option>'; banner(e.message, 'danger'); }
  }
  function addSessionDoc(label, url) {
    sessionDocs.unshift({label, url});
    $('sessionDocs').innerHTML = sessionDocs.map(d => '<div class="item"><strong>'+esc(d.label)+'</strong>'+(safeUrl(d.url)?'<a href="'+esc(d.url)+'" target="_blank" rel="noopener">Open PDF ↗</a>':'')+'</div>').join('');
  }
  async function generateDoc(type, btn) {
    const labels = {QUOTATION:'Quotation', INVOICE:'Invoice', HRD_INVOICE:'HRD invoice'};
    if (!val('d-companyName')) return note('docResult', 'Enter the company name first.', 'danger');
    if (ptype === 'PUBLIC' && !val('d-courseId')) return note('docResult', 'Choose a course first.', 'danger');
    if (ptype === 'INHOUSE' && !val('d-customProgramName')) return note('docResult', 'Enter the programme name first.', 'danger');
    const pub = ptype === 'PUBLIC', inh = ptype === 'INHOUSE';
    const data = {
      documentType: type, companyName: val('d-companyName'), companyAddress: val('d-companyAddress'),
      picName: val('d-picName'), picEmail: val('d-picEmail'), picPhone: val('d-picPhone'), programType: ptype,
      courseId: pub ? val('d-courseId') : '', customProgramName: inh ? val('d-customProgramName') : '',
      startDate: inh ? val('d-startDate') : '', endDate: inh ? val('d-endDate') : '',
      programDuration: inh ? val('d-programDuration') : '', totalTime: inh ? val('d-totalTime') : '', venue: inh ? val('d-venue') : '',
      paymentMethod: pub ? val('d-paymentMethod') : 'HRD', requestedPax: val('d-requestedPax'),
      numberOfGroup: inh ? val('d-numberOfGroup') : '', maxPaxPerGroup: inh ? val('d-maxPaxPerGroup') : '', feePerGroup: inh ? val('d-feePerGroup') : '',
      amount: val('d-amount'), discount: val('d-discount')
    };
    note('docResult', 'Creating the '+labels[type].toLowerCase()+'… this usually takes 10 to 30 seconds.');
    try {
      const res = await busy(btn, 'Working…', () => call('createDocument', data));
      const url = safeUrl(res && res.pdfUrl);
      note('docResult', labels[type]+' <strong>'+esc(res && res.documentNo || '')+'</strong> is ready. '+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener">Open PDF ↗</a>':''), 'success');
      addSessionDoc(labels[type]+' '+(res && res.documentNo || '')+' · '+data.companyName, url);
    } catch (e) { note('docResult', esc(e.message), 'danger'); }
  }
  async function finalise(ev) {
    ev.preventDefault();
    const no = val('f-documentNo'); if (!no) return note('finaliseResult', 'Enter the quotation number.', 'danger');
    if (!confirm('Finalise '+no+' as the final PDF?')) return;
    note('finaliseResult', 'Finalising…');
    try {
      const res = await busy(ev.submitter || $('finaliseForm').querySelector('button'), 'Working…', () => call('finaliseQuotation', {documentNo:no}));
      const url = safeUrl(res && res.finalPdfUrl);
      note('finaliseResult', (res && res.alreadyFinalised ? 'Already finalised. ' : 'Finalised. ')+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener">Open final PDF ↗</a>':''), 'success');
      addSessionDoc('Final quotation '+no, url);
    } catch (e) { note('finaliseResult', esc(e.message), 'danger'); }
  }

  // ---------- JD14 ----------
  const J = ['companyName','companyAddress','trainingStartDate','trainingEndDate','venue','courseTitle','totalPax','totalFee','dateSubmission'];
  async function jd14Companies(btn) {
    const d = val('j-searchDate'); if (!d) return note('jd14Result', 'Choose the training start date first.', 'danger');
    try {
      const list = await busy(btn, 'Searching…', () => call('jd14Companies', {startDate:d}));
      $('j-company').innerHTML = (list && list.length) ? '<option value="">Select company</option>' + list.map(x => '<option value="'+esc(x.requestId)+'">'+esc(x.companyName)+' · '+esc(x.programName || x.courseId || '')+'</option>').join('') : '<option value="">No companies on that date</option>';
      note('jd14Result', list && list.length ? '' : 'No quotation requests start on that date.');
    } catch (e) { note('jd14Result', esc(e.message), 'danger'); }
  }
  async function jd14Details(btn) {
    const id = val('j-company'); if (!id) return note('jd14Result', 'Choose a company first.', 'danger');
    try {
      const d = await busy(btn, 'Loading…', () => call('jd14Details', {requestId:id}));
      J.forEach(k => { $('j-'+k).value = d && d[k] != null ? d[k] : ''; });
      note('jd14Result', 'Details loaded. Add the employer code and approval number, then generate.');
    } catch (e) { note('jd14Result', esc(e.message), 'danger'); }
  }
  async function jd14Generate(ev) {
    ev.preventDefault();
    if (!val('j-companyName') || !val('j-courseTitle')) return note('jd14Result', 'Company name and course title are required.', 'danger');
    const data = {}; J.concat(['employerCode','approvalNo']).forEach(k => { data[k] = val('j-'+k); }); data.noOfParticipants = data.totalPax;
    note('jd14Result', 'Generating JD14…');
    try {
      const res = await busy(ev.submitter || $('jd14Form').querySelector('button'), 'Working…', () => call('jd14Generate', data));
      const url = safeUrl(res && res.pdfUrl);
      note('jd14Result', 'JD14 is ready. '+(url?'<a href="'+esc(url)+'" target="_blank" rel="noopener">Open JD14 PDF ↗</a>':''), 'success');
      addSessionDoc('JD14 · '+data.companyName, url);
    } catch (e) { note('jd14Result', esc(e.message), 'danger'); }
  }

  // ---------- certificates ----------
  let certsLoaded = false, people = [];
  function loadCertsOnce() { if (certsLoaded) return; certsLoaded = true; loadPrograms(); loadTemplate(); loadBatches(); }
  async function loadPrograms() {
    try {
      const list = await call('attendancePrograms');
      $('c-program').innerHTML = (list && list.length) ? '<option value="">Select programme</option>' + list.map(p => '<option value="'+esc(p.courseId)+'">'+esc(p.programName)+' ('+esc(p.programDate)+')</option>').join('') : '<option value="">No active programmes</option>';
    } catch (e) { $('c-program').innerHTML = '<option value="">Programmes could not be loaded</option>'; note('c-result', esc(e.message), 'danger'); }
  }
  function renderPeople() {
    $('c-people').hidden = false;
    const att = people.filter(p => p.on).length;
    $('c-peopleCount').textContent = people.length + ' participants · ' + att + ' marked attended';
    $('c-peopleList').innerHTML = people.length ? people.map((p, i) => '<label><input type="checkbox" data-i="'+i+'"'+(p.on?' checked':'')+'> <span>'+esc(p.participantName)+' <small>'+esc(p.icNo || '')+'</small></span></label>').join('') : '<p class="empty">No participants registered for this programme.</p>';
  }
  async function loadPeople(btn) {
    const c = val('c-program'); if (!c) return note('c-result', 'Choose a programme first.', 'danger');
    try {
      const list = await busy(btn, 'Loading…', () => call('attendanceParticipants', {courseId:c}));
      people = (list || []).map(p => ({...p, on: p.attendanceStatus === 'ATTENDED'})); note('c-result', ''); renderPeople();
    } catch (e) { note('c-result', esc(e.message), 'danger'); }
  }
  async function saveAttendance(btn) {
    const c = val('c-program'); if (!c || !people.length) return note('c-result', 'Load participants first.', 'danger');
    try {
      const res = await busy(btn, 'Saving…', () => call('attendanceUpdate', {courseId:c, attendanceList: people.map(p => ({rowNumber:Number(p.rowNumber), status: p.on ? 'ATTENDED' : 'ABSENT'}))}));
      note('c-result', 'Attendance saved for '+Number(res && res.updated || 0)+' participants.', 'success');
    } catch (e) { note('c-result', esc(e.message), 'danger'); }
  }
  async function certRun(kind, btn) {
    const c = val('c-program'); if (!c) return note('c-result', 'Choose a programme first.', 'danger');
    const name = $('c-program').selectedOptions[0].textContent;
    if (!confirm((kind === 'gen' ? 'Generate certificates for ' : 'Email certificates to participants of ') + name + '?')) return;
    note('c-result', kind === 'gen' ? 'Generating certificates… keep this page open.' : 'Sending emails… keep this page open.');
    try {
      const r = await busy(btn, 'Working…', () => call(kind === 'gen' ? 'certGenerateAll' : 'certSendAll', {courseId:c}));
      note('c-result', kind === 'gen' ? 'Generated '+Number(r.generated||0)+', skipped '+Number(r.skipped||0)+', failed '+Number(r.failed||0)+'.' : 'Sent '+Number(r.sent||0)+', skipped '+Number(r.skipped||0)+', failed '+Number(r.failed||0)+'.', Number(r.failed||0) ? 'danger' : 'success');
    } catch (e) { note('c-result', esc(e.message), 'danger'); }
  }

  // template
  function showTemplate(s) {
    s = s || {};
    $('t-url').value = s.templateUrl || s.templateId || '';
    const url = safeUrl(s.templateUrl);
    $('t-open').hidden = !url; if (url) $('t-open').href = url;
    $('t-current').textContent = 'Current template: ' + (s.templateName || s.templateId || 'Default template');
  }
  async function loadTemplate() { try { showTemplate(await call('certSettings')); } catch (e) { $('t-current').textContent = 'Template settings could not be loaded: ' + e.message; } }
  async function saveTemplate(ev) {
    ev.preventDefault(); const u = val('t-url'); if (!u) return ($('t-current').textContent = 'Paste the Google Slides URL or file ID first.');
    try { showTemplate(await busy(ev.submitter || $('t-form').querySelector('button'), 'Saving…', () => call('certSettingsSave', {templateUrl:u}))); $('t-current').textContent += ' · Saved'; }
    catch (e) { $('t-current').textContent = 'Not saved: ' + e.message; }
  }
  async function resetTemplate(btn) {
    if (!confirm('Go back to the default certificate template?')) return;
    try { showTemplate(await busy(btn, 'Resetting…', () => call('certSettingsReset'))); $('t-current').textContent += ' · Reset'; }
    catch (e) { $('t-current').textContent = 'Not reset: ' + e.message; }
  }

  // manual batch
  const BATCH_KEY = 'easylatihManualCertBatches';
  const readBatches = () => { try { return JSON.parse(localStorage.getItem(BATCH_KEY) || '[]'); } catch (_) { return []; } };
  function saveBatch(id, label) { const list = readBatches().filter(b => b.id !== id); list.unshift({id, label}); try { localStorage.setItem(BATCH_KEY, JSON.stringify(list.slice(0, 20))); } catch (_) {} loadBatches(id); }
  function loadBatches(select) {
    const list = readBatches();
    $('m-batch').innerHTML = list.length ? list.map(b => '<option value="'+esc(b.id)+'">'+esc(b.label)+'</option>').join('') : '<option value="">No batch yet</option>';
    if (select) $('m-batch').value = select;
  }
  function parsePaste() {
    return $('m-paste').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      .map(l => l.split(/\t|,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(s => s.replace(/^"|"$/g, '').trim()))
      .filter(c => c[0] && !/^(participant\s*)?name$/i.test(c[0]))
      .map(c => ({participantName:c[0], email:c[1]||'', hrEmail:c[2] || val('m-defaultHr'), icNo:c[3]||''}));
  }
  function previewPaste() { const n = parsePaste().length; $('m-preview').textContent = n ? n+' participant'+(n===1?'':'s')+' ready to import.' : 'Paste one participant per line.'; }
  function showStatus(s) {
    if (!s) return;
    const c = s.counts || {};
    $('m-counts').innerHTML = [['Participants',c.total],['Certificates made',c.generated],['Waiting for certificate',c.pendingCertificate],['Emails sent',c.sent],['Waiting to email',c.pendingEmail],['No email',c.missingEmail]].map(([l,n]) => '<div><b>'+Number(n||0)+'</b>'+l+'</div>').join('');
    const rows = s.rows || [];
    $('m-tableWrap').hidden = !rows.length;
    $('m-rows').innerHTML = rows.slice(0, 500).map(r => { const u = safeUrl(r.certificateUrl); return '<tr><td>'+esc(r.participantName)+'</td><td>'+esc(r.email||r.hrEmail||'—')+'</td><td>'+(u?'<a href="'+esc(u)+'" target="_blank" rel="noopener">'+esc(r.certificateNo||'Open')+'</a>':esc(r.certificateStatus||'Pending'))+'</td><td>'+esc(r.emailStatus||'—')+'</td></tr>'; }).join('');
  }
  async function importBatch(ev) {
    ev.preventDefault();
    const participants = parsePaste();
    if (!val('m-programName') || !val('m-start')) return note('m-result', 'Programme name and start date are required.', 'danger');
    if (!participants.length) return note('m-result', 'Paste at least one participant.', 'danger');
    try {
      const r = await busy(ev.submitter || $('m-form').querySelector('button'), 'Importing…', () => call('manualImport', {programName:val('m-programName'), venue:val('m-venue'), programStartDate:val('m-start'), programEndDate:val('m-end') || val('m-start'), participants}));
      saveBatch(r.batchId, val('m-programName')+' · '+val('m-start')+' ('+r.imported+')');
      showStatus(r.status);
      note('m-result', 'Imported '+Number(r.imported||0)+' participants'+((r.rejected||[]).length?', '+r.rejected.length+' rows skipped':'')+'. Next: generate certificates.', 'success');
      $('m-paste').value = ''; previewPaste();
    } catch (e) { note('m-result', esc(e.message), 'danger'); }
  }
  async function batchStatus(btn) {
    const id = val('m-batch'); if (!id) return note('m-result', 'Import a batch first.', 'danger');
    try { showStatus(await busy(btn, 'Checking…', () => call('manualStatus', {batchId:id}))); note('m-result', ''); } catch (e) { note('m-result', esc(e.message), 'danger'); }
  }
  // Works through the batch in chunks until nothing is left, like the old page.
  async function batchRun(kind, btn) {
    const id = val('m-batch'); if (!id) return note('m-result', 'Import a batch first.', 'danger');
    if (kind === 'send' && !confirm('Email certificates for this batch now?')) return;
    let done = 0, failed = 0, rounds = 0;
    await busy(btn, 'Working…', async () => {
      try {
        while (rounds++ < 40) {
          const r = await call(kind === 'gen' ? 'manualGenerate' : 'manualSend', {batchId:id});
          done += Number((kind === 'gen' ? r.generated : r.sent) || 0); failed += Number(r.failed || 0);
          showStatus(r.status);
          note('m-result', (kind === 'gen' ? 'Generated ' : 'Sent ') + done + ' so far' + (r.remaining ? ', ' + r.remaining + ' to go…' : '.'));
          if (!Number(r.remaining) || !Number((kind === 'gen' ? r.generated : r.sent) || 0)) break;
        }
        note('m-result', (kind === 'gen' ? 'Generated ' : 'Sent ') + done + (failed ? ', ' + failed + ' failed. Check the list below.' : '. All done.'), failed ? 'danger' : 'success');
      } catch (e) { note('m-result', esc(e.message), 'danger'); }
    });
  }

  // ---------- start ----------
  function bind() {
    tabs.forEach(t => { $('tab-'+t).onclick = () => setTab(t); });
    document.querySelectorAll('[data-ptype]').forEach(b => b.onclick = () => setPtype(b.dataset.ptype));
    document.querySelectorAll('[data-doc]').forEach(b => b.onclick = () => generateDoc(b.dataset.doc, b));
    $('finaliseForm').addEventListener('submit', finalise);
    $('j-loadCompanies').onclick = e => jd14Companies(e.currentTarget);
    $('j-loadDetails').onclick = e => jd14Details(e.currentTarget);
    $('jd14Form').addEventListener('submit', jd14Generate);
    $('c-reloadPrograms').onclick = () => loadPrograms();
    $('c-loadPeople').onclick = e => loadPeople(e.currentTarget);
    $('c-peopleList').addEventListener('change', e => { const i = e.target.dataset.i; if (i != null) { people[i].on = e.target.checked; renderPeople(); } });
    $('c-all').onclick = () => { people.forEach(p => p.on = true); renderPeople(); };
    $('c-none').onclick = () => { people.forEach(p => p.on = false); renderPeople(); };
    $('c-saveAttendance').onclick = e => saveAttendance(e.currentTarget);
    $('c-generate').onclick = e => certRun('gen', e.currentTarget);
    $('c-send').onclick = e => certRun('send', e.currentTarget);
    $('t-form').addEventListener('submit', saveTemplate);
    $('t-reset').onclick = e => resetTemplate(e.currentTarget);
    $('m-paste').addEventListener('input', previewPaste);
    $('m-defaultHr').addEventListener('input', previewPaste);
    $('m-form').addEventListener('submit', importBatch);
    $('m-status').onclick = e => batchStatus(e.currentTarget);
    $('m-generate').onclick = e => batchRun('gen', e.currentTarget);
    $('m-send').onclick = e => batchRun('send', e.currentTarget);
  }
  async function setup() {
    if (!db || !cfg.supabaseUrl) { $('loginState').textContent = 'Supabase configuration is missing.'; return; }
    if (!API) { $('loginState').textContent = 'The document service address is missing from config.js.'; return; }
    const { data, error } = await db.auth.getUser();
    if (error || !data || !data.user || (data.user.app_metadata || {}).role !== 'admin') {
      location.replace('login.html?next=' + encodeURIComponent('documents.html' + location.hash)); return;
    }
    $('loginState').hidden = true; $('adminApp').hidden = false;
    bind(); setPtype('PUBLIC');
    const start = location.hash.slice(1);
    setTab(tabs.includes(start) ? start : 'docs');
    loadCourses();
  }
  setup();
})();
