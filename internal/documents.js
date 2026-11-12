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
    if (t === 'jd14') loadJd();
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
      if (d && d.approvalNo) $('j-approvalNo').value = d.approvalNo;
      note('jd14Result', 'Details loaded. Add the employer code' + (d && d.approvalNo ? '' : ' and approval number') + ', check the number of participants, then generate.');
    } catch (e) { note('jd14Result', esc(e.message), 'danger'); }
  }
  async function jd14Generate(ev) {
    ev.preventDefault();
    if (!val('j-companyName') || !val('j-courseTitle')) return note('jd14Result', 'Company name and course title are required.', 'danger');
    const data = {}; J.concat(['employerCode','approvalNo']).forEach(k => { data[k] = val('j-'+k); }); data.noOfParticipants = data.totalPax; data.sourceRef = val('j-company');
    note('jd14Result', 'Making the JD14 draft…');
    try {
      const r = await busy(ev.submitter || $('jd14Form').querySelector('button'), 'Working…', () => call('jd14Generate', data));
      openJd = r.jd14Id; jdDocs = [r].concat(jdDocs.filter(x => x.jd14Id !== r.jd14Id)); renderJd();
      note('jd14Result', 'Draft ready for '+esc(r.companyName)+'. Open it to check or edit, then press <b>Finalise PDF</b> below.', 'success');
      $('j-list').scrollIntoView({behavior:'smooth', block:'start'});
    } catch (e) { note('jd14Result', esc(e.message), 'danger'); }
  }

  // JD14 documents: draft -> final PDF -> emailed to PIC
  let jdDocs = [], jdLoaded = false, openJd = '', emailJd = '', jdArchived = false, jdForm = '', jdQuery = '';
  const rm = v => v === '' || v == null || isNaN(Number(v)) ? '' : Number(v).toFixed(2);
  const today = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const fmtDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4) : (d || '');
  // WhatsApp reminder to the PIC: which email the JD14 went to, when, and please return it signed.
  const waIntl = p => { const d = String(p || '').replace(/\D/g, ''); if (!d) return ''; if (d.startsWith('0')) return '6' + d; if (/^1\d{8,9}$/.test(d)) return '60' + d; return d; };
  function jdWaText(x) {
    const email = String(x.sentTo || x.picEmail || '').replace(/\s*\(cc.*$/, '').trim();
    const sent = fmtDate(x.sentDate), course = x.courseTitle || '', dates = fmtDate(x.trainingStartDate);
    const ms = ['Assalamualaikum dan salam sejahtera Tuan/Puan' + (x.picName ? ' ' + x.picName : '') + ',', '',
      'Ini peringatan mesra daripada Easy Latih Consultancy berkenaan *Borang JD14* untuk tuntutan HRD Corp.', '',
      '*Program:* ' + course, dates ? '*Tarikh latihan:* ' + dates : null, '*Syarikat:* ' + (x.companyName || ''), '',
      'Borang JD14 telah kami emelkan ke *' + email + '* pada *' + sent + '*.', '',
      'Mohon pihak tuan/puan lengkapkan Tandatangan, Nama, No. MyKad, Jawatan, Cop syarikat dan Tarikh, kemudian kembalikan borang yang telah diimbas (scan) dengan *membalas emel tersebut*.', '',
      'Jika emel tidak ditemui, sila semak folder Spam/Junk atau maklumkan kepada kami untuk dihantar semula.'];
    const en = ['Dear ' + (x.picName || 'Sir/Madam') + ',', '',
      'This is a friendly reminder from Easy Latih Consultancy about the *JD14 form* for the HRD Corp claim.', '',
      '*Programme:* ' + course, dates ? '*Training date:* ' + dates : null, '*Company:* ' + (x.companyName || ''), '',
      'We emailed the JD14 form to *' + email + '* on *' + sent + '*.', '',
      'Please complete the Signature, Name, MyKad no., Designation, Company stamp and Date, then return the scanned form by *replying to that email*.', '',
      'If you cannot find the email, please check your Spam/Junk folder or let us know and we will resend it.'];
    const keep = l => l !== null;
    return ms.filter(keep).concat(['', '---', ''], en.filter(keep), ['', 'Terima kasih / Thank you.', 'Easy Latih Consultancy']).join('\n');
  }
  async function jdWhatsApp(id, btn) {
    let x = jdDocs.find(d => d.jd14Id === id); if (!x) return;
    // Open the tab now so the browser does not block it after the save below.
    let n = waIntl(x.picPhone), win = null;
    if (!n) {
      const input = prompt('PIC WhatsApp number for ' + x.companyName + ' (e.g. 0123456789):', '');
      if (!input) return;
      win = window.open('', '_blank');
      try {
        x = await busy(btn, 'Saving…', () => call('jd14SetPhone', {jd14Id:id, picPhone:input}));
        jdDocs = jdDocs.map(d => d.jd14Id === id ? x : d); renderJd();
        n = waIntl(x.picPhone);
      } catch (e) { if (win) win.close(); return note('jd14Result', esc(e.message), 'danger'); }
    }
    const url = 'https://wa.me/' + n + '?text=' + encodeURIComponent(jdWaText(x));
    if (win) win.location.href = url; else window.open(url, '_blank', 'noopener');
  }
  function jdLink(url, label) { const u = safeUrl(url); return u ? '<a href="'+esc(u)+'" target="_blank" rel="noopener">'+label+' ↗</a>' : ''; }
  function jdItem(x) {
    const st = x.status || 'DRAFT';
    const meta = [fmtDate(x.trainingStartDate), x.picName || x.picEmail ? 'PIC: '+(x.picName || '')+(x.picEmail ? ' · '+x.picEmail : '') : 'No PIC on record', x.sentDate ? 'Sent '+fmtDate(x.sentDate)+(x.sentTo ? ' to '+x.sentTo : '') : '', x.signedDate ? 'Signed copy received '+fmtDate(x.signedDate) : ''].filter(Boolean).map(esc).join(' · ');
    const acts = [jdLink(x.slidesUrl, 'Edit draft')];
    acts.push('<button type="button" class="small'+(st === 'DRAFT' ? ' primary' : '')+'" data-jfin="'+esc(x.jd14Id)+'">'+(st === 'DRAFT' ? 'Finalise PDF' : 'Re-finalise')+'</button>');
    if (x.pdfUrl) acts.push(jdLink(x.pdfUrl, 'Open PDF'));
    if (x.pdfUrl) acts.push('<button type="button" class="small'+(st === 'FINAL' ? ' primary' : '')+'" data-jmail="'+esc(x.jd14Id)+'">'+(st === 'SENT' || st === 'SIGNED' ? 'Resend to PIC' : 'Email PIC')+'</button>');
    if (st === 'SENT') acts.push('<button type="button" class="small" style="background:#25D366;border-color:#25D366;color:#fff" data-jwa="'+esc(x.jd14Id)+'" title="'+esc(x.picPhone ? 'WhatsApp '+x.picPhone : 'No PIC number yet: you will be asked for it')+'">WhatsApp reminder</button>');
    if (st === 'SENT') acts.push('<button type="button" class="small primary" data-jsigned="'+esc(x.jd14Id)+'">Signed JD14 received</button>');
    // HRD Corp invoice, once the signed JD14 is back
    const inv = [];
    if (st === 'SIGNED' && !x.invoiceNo) inv.push('<button type="button" class="small primary" data-idraft="'+esc(x.jd14Id)+'">Create HRD Corp invoice draft</button>');
    if (x.invoiceNo) {
      inv.push(jdLink(x.invoiceDocUrl, 'Edit invoice draft'));
      inv.push('<button type="button" class="small'+(x.invoiceStatus === 'DRAFT' ? ' primary' : '')+'" data-ifin="'+esc(x.jd14Id)+'">'+(x.invoiceStatus === 'FINAL' ? 'Re-finalise invoice' : 'Finalise invoice PDF')+'</button>');
      if (x.invoicePdfUrl) inv.push(jdLink(x.invoicePdfUrl, 'Open invoice PDF'));
      if (x.invoicePdfUrl) inv.push('<button type="button" class="small" data-idl="'+esc(x.jd14Id)+'">⬇ Download PDF</button>');
    }
    // Claim reference, then HRD Corp payment (which settles and archives the case)
    if (x.invoiceStatus === 'FINAL' && !x.claimRefNo && !x.archived) inv.push('<button type="button" class="small primary" data-cform="'+esc(x.jd14Id)+'">Claim submitted (enter claim ref.)</button>');
    if (x.claimRefNo && !x.archived) inv.push('<button type="button" class="small primary" data-pform="'+esc(x.jd14Id)+'">HRD Corp payment received</button>');
    if (x.archived) inv.push('<button type="button" class="small" data-unarch="'+esc(x.jd14Id)+'">Restore to open list</button>');
    const claimLine = [x.claimRefNo ? 'Claim '+x.claimRefNo+(x.claimSubmittedDate ? ' · submitted '+fmtDate(x.claimSubmittedDate) : '')+(rm(x.claimAmount) ? ' · RM '+rm(x.claimAmount) : '') : '',
      x.paymentDate ? 'HRD Corp paid '+fmtDate(x.paymentDate)+(rm(x.paymentAmount) ? ' · RM '+rm(x.paymentAmount) : '')+(x.paymentRef ? ' · ref '+x.paymentRef : '') : ''].filter(Boolean).map(esc).join('<br>');
    let stepForm = '';
    if (jdForm === 'C:'+x.jd14Id) stepForm = '<form class="form-grid" data-cstep="'+esc(x.jd14Id)+'"><label>Claim reference no.<input name="claimRef" required placeholder="HRD Corp claim ID"></label>'+
      '<label>Date submitted<input name="date" type="date" value="'+today()+'" required></label>'+
      '<label>Claim amount (RM)<input name="amount" type="number" min="0" step="0.01" value="'+esc(rm(x.totalFee))+'"></label>'+
      '<div class="actions wide"><button type="submit" class="primary">Save claim reference</button><button type="button" data-fcancel="1">Cancel</button></div></form>';
    if (jdForm === 'P:'+x.jd14Id) stepForm = '<form class="form-grid" data-pstep="'+esc(x.jd14Id)+'"><label>Date received<input name="date" type="date" value="'+today()+'" required></label>'+
      '<label>Amount received (RM)<input name="amount" type="number" min="0" step="0.01" value="'+esc(rm(x.claimAmount || x.totalFee))+'"></label>'+
      '<label>Payment reference (optional)<input name="paymentRef" placeholder="e.g. HRD Corp payment advice no."></label>'+
      '<p class="hint wide">Saving this settles the case: the JD14, invoice and claim move to the archive (Show settled).</p>'+
      '<div class="actions wide"><button type="submit" class="primary">Record payment and archive</button><button type="button" data-fcancel="1">Cancel</button></div></form>';
    const invBlock = inv.length ? '<div class="jd-inv"><div class="jd-meta"><b>HRD Corp invoice</b>'+(x.invoiceNo ? ' · '+esc(x.invoiceNo)+' · <span class="chip '+esc(x.invoiceStatus || 'DRAFT')+'">'+esc(x.invoiceStatus || 'DRAFT')+'</span>' : '')+'</div>'+(claimLine ? '<div class="jd-meta">'+claimLine+'</div>' : '')+'<div class="actions">'+inv.filter(Boolean).join('')+'</div>'+stepForm+'</div>' : '';
    const form = emailJd === x.jd14Id ? '<form class="form-grid" data-jsend="'+esc(x.jd14Id)+'">'+
      '<label>PIC name<input name="picName" value="'+esc(x.picName || '')+'"></label>'+
      '<label>PIC email<input name="to" type="email" required value="'+esc(x.picEmail || '')+'"></label>'+
      '<label>PIC WhatsApp no. (for reminders)<input name="picPhone" inputmode="tel" placeholder="0123456789" value="'+esc(x.picPhone || '')+'"></label>'+
      '<label class="wide">CC (optional)<input name="cc" placeholder="Separate several with commas"></label>'+
      '<p class="hint wide">The email is in Bahasa Malaysia then English, with the JD14 PDF attached. It asks the PIC to fill in signature, name, MyKad no., designation, company stamp and date, then reply to the email with the signed form.</p>'+
      '<div class="actions wide"><button type="submit" class="primary">Send email</button><button type="button" data-jcancel="1">Cancel</button></div></form>' : '';
    return '<div class="jd'+(openJd === x.jd14Id ? ' focus' : '')+'"><div class="jd-head"><div><div class="jd-title">'+esc(x.companyName)+'</div><div class="jd-meta">'+esc(x.courseTitle)+'</div><div class="jd-meta">'+meta+'</div></div><span class="chip '+esc(x.archived ? 'PAID' : x.claimRefNo ? 'CLAIMED' : st)+'">'+esc(x.archived ? 'SETTLED' : x.claimRefNo ? 'CLAIM SUBMITTED' : st)+'</span></div>'+
      '<div class="actions">'+acts.filter(Boolean).join('')+'</div>'+form+invBlock+'</div>';
  }
  function renderJd() {
    const q = jdQuery.toLowerCase();
    const list = jdDocs.filter(x => !!x.archived === jdArchived).filter(x => !q || [x.companyName, x.courseTitle, x.invoiceNo, x.claimRefNo, x.picName].join(' ').toLowerCase().includes(q));
    $('j-listTitle').textContent = jdArchived ? 'JD14 documents · settled (archived)' : 'JD14 documents · open';
    $('j-toggleArchived').textContent = jdArchived ? '← Back to open' : 'Show settled (archived)';
    $('j-search').hidden = !jdArchived;
    $('j-list').innerHTML = list.length ? list.map(jdItem).join('') : '<p class="hint">'+(jdArchived ? (q ? 'Nothing matches.' : 'No settled cases yet.') : 'Nothing open. Settled cases are under Show settled.')+'</p>';
  }
  async function loadJd(force) {
    if (jdLoaded && !force) return; jdLoaded = true;
    $('j-list').innerHTML = '<p class="hint">Loading…</p>';
    try { jdDocs = await call('jd14List', {archived: jdArchived}) || []; renderJd(); }
    catch (e) { $('j-list').innerHTML = '<p class="hint">JD14 list could not be loaded: '+esc(e.message)+'</p>'; }
  }
  async function jdDownload(id, btn) {
    try {
      const r = await busy(btn, 'Preparing…', () => call('hrdInvoiceDownload', {jd14Id:id}));
      const bin = atob(r.base64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], {type: r.mimeType || 'application/pdf'}));
      a.download = (r.fileName || 'invoice').replace(/[\\/:*?"<>|]/g, '-').replace(/(\.pdf)?$/i, '.pdf');
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) { note('jd14Result', esc(e.message), 'danger'); }
  }
  async function jdStep(form, kind) {
    const id = form.dataset[kind === 'C' ? 'cstep' : 'pstep'], f = Object.fromEntries(new FormData(form).entries()), x = jdDocs.find(d => d.jd14Id === id) || {};
    if (kind === 'P' && !confirm('Record HRD Corp payment for '+(x.companyName || '')+' and archive this case?')) return;
    try {
      const r = await busy(form.querySelector('button[type=submit]'), 'Saving…', () => call(kind === 'C' ? 'hrdClaimSubmitted' : 'hrdPaymentReceived', Object.assign({jd14Id:id}, f)));
      jdForm = '';
      if (kind === 'P') { jdDocs = jdDocs.filter(d => d.jd14Id !== id); renderJd(); note('jd14Result', 'Payment recorded. '+esc(r.companyName)+' is settled and archived.', 'success'); }
      else { jdDocs = jdDocs.map(d => d.jd14Id === id ? r : d); renderJd(); note('jd14Result', 'Claim '+esc(r.claimRefNo)+' saved for '+esc(r.companyName)+'. When HRD Corp pays, press <b>HRD Corp payment received</b>.', 'success'); }
    } catch (e) { note('jd14Result', esc(e.message), 'danger'); }
  }
  async function jdFinalise(id, btn) {
    try {
      const r = await busy(btn, 'Finalising…', () => call('jd14Finalise', {jd14Id:id}));
      jdDocs = jdDocs.map(x => x.jd14Id === id ? r : x); emailJd = id; renderJd();
      note('jd14Result', 'PDF ready for '+esc(r.companyName)+'. '+jdLink(r.pdfUrl, 'Open PDF')+' Check it, then send it to the PIC.', 'success');
      addSessionDoc('JD14 · '+r.companyName, safeUrl(r.pdfUrl));
    } catch (e) { note('jd14Result', esc(e.message), 'danger'); }
  }
  async function jdAct(action, id, btn, label, done) {
    try {
      const r = await busy(btn, label, () => call(action, {jd14Id:id}));
      jdDocs = jdDocs.map(x => x.jd14Id === id ? r : x); renderJd(); note('jd14Result', done(r), 'success');
    } catch (e) { note('jd14Result', esc(e.message), 'danger'); }
  }
  async function jdSend(form) {
    const id = form.dataset.jsend, fd = new FormData(form), x = jdDocs.find(d => d.jd14Id === id);
    const to = String(fd.get('to') || '').trim();
    if (!confirm('Email the JD14 for '+(x ? x.companyName : '')+' to '+to+'?')) return;
    try {
      const r = await busy(form.querySelector('button[type=submit]'), 'Sending…', () => call('jd14Email', {jd14Id:id, to, cc:String(fd.get('cc') || ''), picName:String(fd.get('picName') || ''), picPhone:String(fd.get('picPhone') || '')}));
      jdDocs = jdDocs.map(d => d.jd14Id === id ? r : d); emailJd = ''; renderJd();
      note('jd14Result', 'JD14 emailed to '+esc(r.sentTo || to)+'. If it does not come back, use <b>WhatsApp reminder</b> to nudge the PIC. When the signed form comes back, press <b>Signed JD14 received</b>.', 'success');
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
  let editing = -1;
  function personRow(p, i) {
    const tags = [];
    if (p.originalName && p.originalName !== p.participantName) tags.push('<span class="tag">Replaces '+esc(p.originalName)+'</span>');
    if (p.certificateStatus === 'GENERATED') tags.push('<span class="tag ok">Certificate made</span>');
    if (p.emailStatus === 'SENT') tags.push('<span class="tag ok">Emailed</span>');
    const head = '<div class="person-head"><label><input type="checkbox" data-i="'+i+'"'+(p.on?' checked':'')+'> <span>'+esc(p.participantName)+' <small>'+esc(p.icNo || '')+(p.email ? ' · '+esc(p.email) : '')+'</small>'+(tags.length ? '<span class="tags">'+tags.join('')+'</span>' : '')+'</span></label>'+
      (canAmend ? '<button type="button" class="small" data-edit="'+i+'">'+(editing === i ? 'Close' : 'Edit')+'</button>' : '')+'</div>';
    if (editing !== i) return '<div class="person">'+head+'</div>';
    return '<div class="person editing">'+head+
      '<form class="amend form-grid" data-amend="'+i+'">'+
      '<p class="hint wide">Someone else attended? Enter their details. The certificate will be issued in this name.</p>'+
      '<label class="wide">Full name (as on certificate)<input name="participantName" required value="'+esc(p.participantName)+'"></label>'+
      '<label>IC / passport no.<input name="icNo" value="'+esc(p.icNo || '')+'" placeholder="e.g. 900101065555"></label>'+
      '<label>Phone<input name="phone" value="'+esc(p.phone || '')+'" placeholder="e.g. 0123456789"></label>'+
      '<label class="wide">Email (certificate is sent here)<input name="email" type="email" value="'+esc(p.email || '')+'"></label>'+
      (p.certificateStatus === 'GENERATED' ? '<p class="hint wide warn">A certificate was already made for '+esc(p.participantName)+'. Changing the name or IC lets you generate it again in the new name, with the same certificate number.</p>' : '')+
      '<div class="actions wide"><button type="submit" class="primary">Save details</button><button type="button" data-cancel="1">Cancel</button></div>'+
      '</form></div>';
  }
  function renderPeople() {
    $('c-people').hidden = false;
    const att = people.filter(p => p.on).length;
    const swapped = people.filter(p => p.originalName && p.originalName !== p.participantName).length;
    $('c-peopleCount').textContent = people.length + ' participants · ' + att + ' marked attended' + (swapped ? ' · ' + swapped + ' replaced' : '');
    $('c-peopleList').innerHTML = people.length ? people.map(personRow).join('') : '<p class="empty">No participants registered for this programme.</p>';
    const f = $('c-peopleList').querySelector('form.amend input[name=participantName]'); if (f) f.focus();
  }
  let canAmend = false;
  async function loadPeople(btn) {
    const c = val('c-program'); if (!c) return note('c-result', 'Choose a programme first.', 'danger');
    try {
      const [list, details] = await busy(btn, 'Loading…', () => Promise.all([
        call('attendanceParticipants', {courseId:c}),
        call('attendanceDetails', {courseId:c}).catch(() => null)
      ]));
      canAmend = Array.isArray(details);
      const byRow = {}; (details || []).forEach(d => { byRow[Number(d.rowNumber)] = d; });
      editing = -1;
      people = (list || []).map(p => ({...(byRow[Number(p.rowNumber)] || {}), ...p, on: p.attendanceStatus === 'ATTENDED'}));
      note('c-result', canAmend ? '' : 'Editing participant details needs the latest Apps Script update. Attendance still works.', canAmend ? '' : 'info'); renderPeople();
    } catch (e) { note('c-result', esc(e.message), 'danger'); }
  }
  async function amendPerson(form) {
    const i = Number(form.dataset.amend), p = people[i], c = val('c-program');
    const fd = new FormData(form), get = k => String(fd.get(k) || '').trim();
    const btn = form.querySelector('button[type=submit]');
    try {
      const r = await busy(btn, 'Saving…', () => call('attendanceAmend', {courseId:c, rowNumber:Number(p.rowNumber), expectedName:p.participantName, participantName:get('participantName'), icNo:get('icNo'), email:get('email'), phone:get('phone')}));
      Object.assign(p, {participantName:r.participantName, icNo:r.icNo, email:r.email, phone:r.phone, originalName:r.originalName});
      if (r.resetCertificate) Object.assign(p, {certificateStatus:'', certificateUrl:'', emailStatus:''});
      p.on = true; editing = -1; renderPeople();
      note('c-result', 'Saved '+esc(r.participantName)+' and ticked as attended. Press <b>Save attendance</b> when you finish ticking'+(r.resetCertificate ? ', then generate certificates again for this person' : '')+'.', 'success');
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
    $('j-refreshList').onclick = () => loadJd(true);
    $('j-toggleArchived').onclick = () => { jdArchived = !jdArchived; jdForm = ''; jdQuery = ''; $('j-search').value = ''; loadJd(true); };
    $('j-search').addEventListener('input', e => { jdQuery = e.target.value.trim(); renderJd(); });
    $('j-list').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.idl) jdDownload(b.dataset.idl, b);
      else if (b.dataset.cform) { jdForm = jdForm === 'C:'+b.dataset.cform ? '' : 'C:'+b.dataset.cform; renderJd(); }
      else if (b.dataset.pform) { jdForm = jdForm === 'P:'+b.dataset.pform ? '' : 'P:'+b.dataset.pform; renderJd(); }
      else if (b.dataset.fcancel) { jdForm = ''; renderJd(); }
      else if (b.dataset.unarch) { if (confirm('Move this case back to the open list? The recorded payment will be cleared.')) jdAct('jd14Unarchive', b.dataset.unarch, b, 'Restoring…', r => { jdDocs = jdDocs.filter(d => d.jd14Id !== r.jd14Id); setTimeout(renderJd); return esc(r.companyName)+' is back in the open list.'; }); }
      else if (b.dataset.jfin) jdFinalise(b.dataset.jfin, b);
      else if (b.dataset.jmail) { emailJd = emailJd === b.dataset.jmail ? '' : b.dataset.jmail; renderJd(); }
      else if (b.dataset.jcancel) { emailJd = ''; renderJd(); }
      else if (b.dataset.jwa) jdWhatsApp(b.dataset.jwa, b);
      else if (b.dataset.jsigned) { if (confirm('Record that the signed JD14 has come back from the PIC?')) jdAct('jd14Signed', b.dataset.jsigned, b, 'Saving…', r => 'Signed JD14 recorded for '+esc(r.companyName)+'. Next: create the HRD Corp invoice draft.'); }
      else if (b.dataset.idraft) jdAct('hrdInvoiceDraft', b.dataset.idraft, b, 'Creating…', r => 'Invoice '+esc(r.invoiceNo)+' drafted. '+jdLink(r.invoiceDocUrl, 'Open the draft')+' to check it, then press <b>Finalise invoice PDF</b>.');
      else if (b.dataset.ifin) jdAct('hrdInvoiceFinalise', b.dataset.ifin, b, 'Finalising…', r => 'Invoice '+esc(r.invoiceNo)+' saved as PDF in Google Drive. '+'Press <b>⬇ Download PDF</b> to save it for the HRD Corp system, then <b>Claim submitted</b> once the claim is in.');
    });
    $('j-list').addEventListener('submit', e => { e.preventDefault(); const f = e.target; if (f.dataset.cstep) jdStep(f, 'C'); else if (f.dataset.pstep) jdStep(f, 'P'); else jdSend(f); });
    $('c-reloadPrograms').onclick = () => loadPrograms();
    $('c-loadPeople').onclick = e => loadPeople(e.currentTarget);
    $('c-peopleList').addEventListener('change', e => { const i = e.target.dataset.i; if (i != null) { people[i].on = e.target.checked; const n = people.filter(p => p.on).length; $('c-peopleCount').textContent = $('c-peopleCount').textContent.replace(/\d+ marked attended/, n + ' marked attended'); } });
    $('c-peopleList').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.edit != null) { const i = Number(b.dataset.edit); editing = editing === i ? -1 : i; renderPeople(); }
      else if (b.dataset.cancel) { editing = -1; renderPeople(); }
    });
    $('c-peopleList').addEventListener('submit', e => { e.preventDefault(); amendPerson(e.target); });
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
