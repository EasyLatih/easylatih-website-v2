(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  const API = cfg.publicTrainingAppsScriptUrl;
  const db = window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const val = id => ($(id).value || '').trim();
  const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kuala_Lumpur'});
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const nice = k => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(k || '')); return m ? Number(m[3])+' '+MON[Number(m[2])-1]+' '+m[1] : (k || ''); };
  const dmy = k => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(k || '')); return m ? m[3]+'/'+m[2]+'/'+m[1] : ''; };
  const num = v => { const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, '')); return isFinite(n) ? n : 0; };
  const fix2 = n => (Math.round(n * 100) / 100).toFixed(2);
  const rm = n => 'RM' + Number(n || 0).toLocaleString('en-MY', {minimumFractionDigits:2, maximumFractionDigits:2});
  const courseKey = t => String(t || '').replace(/\[TEST\]/i, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const noDash = v => String(v || '').replace(/[\s-]/g, '');

  function banner(msg, type) { const el = $('message'); el.textContent = msg || ''; el.dataset.type = type || 'info'; el.hidden = !msg; if (msg) window.scrollTo({top:0, behavior:'smooth'}); }

  // Apps Script bridge, signed in with the admin's Supabase session (same as Registrations).
  async function call(action, payload) {
    const { data } = await db.auth.getSession();
    const token = data && data.session && data.session.access_token;
    if (!token) { location.replace('login.html?next=appendices.html'); throw new Error('Signed out'); }
    let res;
    try { res = await fetch(API, { method:'POST', body: new URLSearchParams({ action:'adminTools.'+action, accessToken:token, payload: JSON.stringify(payload || {}) }) }); }
    catch (_) { throw new Error('Could not reach the programme service. Check your connection and try again.'); }
    let out; try { out = await res.json(); } catch (_) { throw new Error('The programme service replied with something unexpected.'); }
    if (!out || !out.success) throw new Error((out && out.message) || 'The request failed.');
    return out.data;
  }

  // ---------- state ----------
  let programmes = [];
  let trainers = [];
  let src = null;          // programme record from the Programs sheet
  let auto = {};           // calculated values
  let course = null;       // saved appendix_course_profiles row
  let session = null;      // saved appendix_session_details row
  const OVERRIDE_KEYS = ['price','start','end','hours','days','full','half','less','months'];

  // ---------- calculations ----------
  function dayCount(a, b) {
    if (!a) return 0;
    const d = Math.round((Date.parse((b || a)+'T00:00:00Z') - Date.parse(a+'T00:00:00Z')) / 86400000) + 1;
    return d > 0 ? d : 0;
  }
  function calcAuto(p) {
    const days = dayCount(p.startDate, p.endDate) || num(p.duration) || 1;
    let hours = num(p.totalTime);
    if (!hours) hours = days * 7;
    const perDay = hours / days;
    const full = perDay >= 7 ? days : 0;
    const half = perDay >= 4 && perDay < 7 ? days : 0;
    const less = perDay < 4 ? hours : 0;
    return {
      type: (p.programType || 'PUBLIC') === 'INHOUSE' ? 'In-House' : 'Public',
      price: p.hrdFee ? fix2(p.hrdFee) : '',
      start: p.startDate || '', end: p.endDate || p.startDate || '',
      hours: fix2(hours), days: String(days),
      full: String(full), half: String(half), less: String(less), months: '0'
    };
  }
  // Re-derive days and full/half/less-than-half days from the dates and hours on the form.
  // Fields the admin has changed by hand are left alone.
  function rederive() {
    const days = dayCount(cur('start'), cur('end'));
    const hours = num(cur('hours'));
    const next = Object.assign({}, auto);
    if (days) next.days = String(days);
    if (days && hours) {
      const perDay = hours / days;
      next.full = String(perDay >= 7 ? days : 0);
      next.half = String(perDay >= 4 && perDay < 7 ? days : 0);
      next.less = String(perDay < 4 ? hours : 0);
    }
    ['days','full','half','less'].forEach(k => {
      const input = $('o-'+k);
      if (input.value.trim() === '' || input.value.trim() === String(auto[k] ?? '')) input.value = next[k] ?? '';
    });
    auto = next;
  }
  // Current value of a calculated field: the typed override, else the auto value.
  const cur = k => { const v = val('o-'+k); return v !== '' ? v : (auto[k] ?? ''); };

  // ---------- appendices model ----------
  function build() {
    const title = val('f-title') || (src && src.programName) || '';
    const days = num(cur('days')) || 1;
    const price = num(cur('price'));
    const fee = price ? fix2(price / days) : '';
    const start = cur('start'), end = cur('end') || start;
    const L = (label, value, opts) => Object.assign({ label, value: String(value ?? '') }, opts || {});
    return [
      { k:'A', t:'Course Titles', lines:[ L('', title) ] },
      { k:'B', t:'Descriptions', lines:[ L('', val('f-description')) ] },
      { k:'C', t:'Relevance of Training', lines:[ L('', val('f-relevance')) ] },
      { k:'D', t:'Type of Retraining & Skills Upgrading', lines:[ L('', val('f-retraining')) ] },
      { k:'E', t:'HRD Corp Focus Area', lines:[ L('', 'Not Applicable') ] },
      { k:'F', t:'Type of Training', lines:[ L('', 'Public') ] },
      { k:'G', t:'Commencement of Programme', lines:[ L('Start Date', dmy(start)), L('End Date', dmy(end)) ] },
      { k:'H', t:'Total Hours per Training', lines:[ L('', cur('hours')) ] },
      { k:'I', t:'Number of Full Days', lines:[ L('', cur('full')) ] },
      { k:'J', t:'Number of Half Days', lines:[ L('', cur('half')) ] },
      { k:'K', t:'Number of Less-than-Half Days / Hours (Based on less than 4 hours per day)', lines:[ L('', cur('less')) ] },
      { k:'L', t:'Number of Months', lines:[ L('', cur('months')) ] },
      { k:'M', t:'Approved Trainers', lines:[ L('Name', val('f-trainerName').toUpperCase()), L('IC/Passport No.', noDash(val('f-trainerIc'))) ] },
      { k:'N', t:'Training Location', lines:[ L('', val('f-location') || 'Local') ] },
      { k:'O', t:'Please Specify Full Address', lines:[ L('', val('f-address')) ] },
      { k:'P', t:'State', lines:[ L('', val('f-state')) ] },
      { k:'Q', t:'Training Schedule', lines:[ L('Start Date', dmy(start)), L('End Date', dmy(end)) ] },
      { k:'R', t:'Course Fee', lines:[ L('Cost (RM) (A)', fee) ],
        note: price ? rm(price) + ' per pax ÷ ' + days + (days === 1 ? ' day' : ' days') + ' = ' + rm(price / days) + '. Put ' + fee + ' in Cost (A).' : 'Enter the price per pax to calculate this.' }
    ];
  }

  function counters() {
    document.querySelectorAll('.count').forEach(c => { const n = $(c.dataset.for).value.length; c.textContent = '(' + n + '/400)'; c.classList.toggle('full', n >= 400); });
  }
  function render() {
    if (!src) return;
    counters();
    const list = build();
    $('appendices').innerHTML = list.map((a, ai) =>
      '<article><h4><span>'+a.k+'</span>'+esc(a.t)+'</h4>' +
      a.lines.map((l, li) => '<div class="line"><div class="v'+(l.value ? '' : ' missing')+'">'+(l.label ? '<em>'+esc(l.label)+'</em>' : '')+esc(l.value || 'Not filled in yet')+'</div>' +
        (l.value ? '<button type="button" class="copy small" data-a="'+ai+'" data-l="'+li+'">Copy</button>' : '') + '</div>').join('') +
      (a.note ? '<div class="note-r">'+esc(a.note)+'</div>' : '') + '</article>'
    ).join('');
    OVERRIDE_KEYS.forEach(k => {
      const input = $('o-'+k), a = auto[k] ?? '';
      document.querySelector('[data-auto="'+k+'"]').textContent = a !== '' ? '(auto: ' + (k === 'start' || k === 'end' ? dmy(a) : a) + ')' : '';
      input.classList.toggle('overridden', input.value.trim() !== '' && input.value.trim() !== String(a));
    });
  }

  async function copyText(text, btn) {
    try { await navigator.clipboard.writeText(text); }
    catch (_) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    if (btn) { const old = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('done'); setTimeout(() => { btn.textContent = old; btn.classList.remove('done'); }, 1400); }
  }

  function plainText() {
    return build().map(a => 'Appendix ' + a.k + ' – ' + a.t + '\n' + a.lines.map(l => (l.label ? l.label + ': ' : '') + l.value).join('\n') + (a.k === 'R' && a.note ? '\n' + a.note : '')).join('\n\n');
  }
  function docHtml() {
    const title = (val('f-title') || src.programName || 'Programme');
    const body = build().map(a => '<h2>Appendix ' + a.k + ' – ' + esc(a.t) + '</h2>' +
      a.lines.map(l => '<p>' + (l.label ? esc(l.label) + ': ' : '') + esc(l.value).replace(/\n/g, '<br>') + '</p>').join('') +
      (a.k === 'R' && a.note ? '<p><i>' + esc(a.note) + '</i></p>' : '')).join('');
    return '<html><head><meta charset="utf-8"><title>Appendices – ' + esc(title) + '</title>' +
      '<style>body{font-family:Arial,sans-serif;font-size:11pt;line-height:1.45;margin:2cm}h1{font-size:15pt;margin:0 0 4px}h2{font-size:12pt;margin:16px 0 4px;color:#003e6f}p{margin:0 0 4px}.sub{color:#555;margin-bottom:12px}</style></head><body>' +
      '<h1>Appendices : ' + esc(title.toUpperCase()) + '</h1><p class="sub">' + esc(nice(cur('start'))) + (cur('end') && cur('end') !== cur('start') ? ' – ' + esc(nice(cur('end'))) : '') + ' · ' + esc(src.venue || '') + '</p>' + body + '</body></html>';
  }
  function download() {
    const name = 'Appendices - ' + (val('f-title') || src.programName || 'Programme').replace(/[\\/:*?"<>|]/g, '').slice(0, 90) + '.doc';
    const blob = new Blob(['﻿', docHtml()], { type: 'application/msword' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function printDoc() {
    const w = window.open('', '_blank');
    if (!w) { banner('Allow pop-ups for this page to print.', 'danger'); return; }
    w.document.open(); w.document.write(docHtml()); w.document.close(); w.focus();
    setTimeout(() => w.print(), 300);
  }

  // ---------- loading ----------
  async function loadProgrammes() {
    $('programme').innerHTML = '<option value="">Loading programmes…</option>';
    try {
      programmes = (await call('regPrograms')) || [];
      const t = today();
      const up = programmes.filter(p => (p.endDate || p.startDate || '') >= t);
      const prev = programmes.filter(p => (p.endDate || p.startDate || '') < t).sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
      const opt = p => '<option value="'+esc(p.courseId)+'">'+esc(nice(p.startDate))+' · '+esc(p.programName)+(p.venue ? ' · '+esc(p.venue) : '')+'</option>';
      $('programme').innerHTML = '<option value="">Select a programme</option><option value="__manual">Fill in manually (no programme)</option>' +
        (up.length ? '<optgroup label="Upcoming">' + up.map(opt).join('') + '</optgroup>' : '') +
        (prev.length ? '<optgroup label="Previous">' + prev.map(opt).join('') + '</optgroup>' : '');
      const want = new URLSearchParams(location.search).get('course');
      if (want && programmes.some(p => p.courseId === want)) { $('programme').value = want; selectProgramme(want); }
    } catch (e) {
      $('programme').innerHTML = '<option value="">Could not load programmes</option>';
      banner(e.message, 'danger');
    }
  }

  async function loadTrainers() {
    try {
      const [{ data: ps, error: e1 }, { data: ids, error: e2 }] = await Promise.all([
        db.from('profiles').select('id,full_name,collaboration_status').in('collaboration_status', ['APPROVED_TO_COLLAB','ONBOARDING','ACTIVE']).order('full_name'),
        db.from('trainer_etris_profiles').select('trainer_id,identity_no')
      ]);
      if (e1) throw e1;
      const icBy = {}; (e2 ? [] : ids || []).forEach(r => { icBy[r.trainer_id] = r.identity_no; });
      trainers = (ps || []).map(p => ({ id: p.id, name: p.full_name, ic: noDash(icBy[p.id] || '') }));
      $('f-trainer').innerHTML = '<option value="">Type the name and IC below, or pick an approved trainer</option>' +
        trainers.map(t => '<option value="'+esc(t.id)+'">'+esc(t.name)+(t.ic ? '' : ' (no IC on file)')+'</option>').join('');
    } catch (e) { console.warn('Trainer list unavailable', e); }
  }

  // Programs-sheet record. Uses the dedicated action, or falls back to the
  // existing list/detail actions if the Apps Script has not been updated yet.
  async function loadSource(courseId) {
    try { return await call('regAppendixSource', { courseId }); }
    catch (e) {
      if (!/unknown|not (found|supported|available)|invalid action/i.test(e.message)) throw e;
      const base = programmes.find(p => p.courseId === courseId) || {};
      let hrdFee = 0;
      try { const d = await call('regProgramDetail', { courseId }); hrdFee = d && d.program ? d.program.hrdFee : 0; } catch (_) {}
      banner('Total hours and state are not coming through yet: update the Apps Script (PublicRegistrationAdmin.gs) and redeploy. Hours are assumed to be 7 a day for now.', 'info');
      return { courseId, programName: base.programName, startDate: base.startDate, endDate: base.endDate, venue: base.venue, programType: 'PUBLIC', hrdFee, totalTime: '', state: '' };
    }
  }

  async function selectProgramme(courseId) {
    banner('');
    if (!courseId) { $('work').hidden = true; $('summary').hidden = true; src = null; return; }
    $('programme').disabled = true;
    try {
      if (courseId === '__manual') return startManual();
      src = await loadSource(courseId);
      auto = calcAuto(src);
      const key = courseKey(src.programName);
      const [c, s] = await Promise.all([
        db.from('appendix_course_profiles').select('*').eq('course_key', key).maybeSingle(),
        db.from('appendix_session_details').select('*').eq('course_id', courseId).maybeSingle()
      ]);
      if (c.error || s.error) throw new Error('Could not read saved appendix details. Run supabase/programme-appendices.sql in Supabase first.');
      course = c.data; session = s.data;

      // Course (A–E): saved profile first; otherwise try the trainer-portal programme overview.
      let overview = '';
      if (!course) {
        try {
          const { data } = await db.from('programmes').select('title,programme_overview').ilike('title', src.programName.replace(/[%_]/g, ' ')).limit(1);
          overview = data && data[0] ? data[0].programme_overview || '' : '';
        } catch (_) {}
      }
      $('f-title').value = course && course.course_title ? course.course_title : '';
      $('f-description').value = (course ? course.description : overview).slice(0, 400);
      $('f-relevance').value = course ? course.relevance : '';
      $('f-retraining').value = course ? course.retraining_type : '';

      // Session (M–P)
      $('f-trainer').value = session && session.trainer_id ? session.trainer_id : '';
      $('f-trainerName').value = session ? session.trainer_name : '';
      $('f-trainerIc').value = session ? session.trainer_ic : '';
      $('f-location').value = session ? session.training_location || 'Local' : 'Local';
      $('f-address').value = session && session.full_address ? session.full_address : (src.venue || '');
      const ov = (session && session.overrides) || {};
      $('f-state').value = ov.state || src.state || '';
      OVERRIDE_KEYS.forEach(k => { $('o-'+k).value = ov[k] != null ? ov[k] : auto[k]; });

      $('summary').innerHTML = [
        ['Dates', nice(src.startDate) + (src.endDate && src.endDate !== src.startDate ? ' – ' + nice(src.endDate) : '')],
        ['Venue', src.venue || '—'],
        ['Price per pax (HRD)', src.hrdFee ? rm(src.hrdFee) : '—'],
        ['Hours', src.totalTime || (auto.hours + ' (assumed)')],
        ['Saved course details', course ? 'Yes, reused' : 'New course']
      ].map(([k, v]) => '<div>'+esc(k)+'<b>'+esc(v)+'</b></div>').join('');
      $('summary').hidden = false; $('work').hidden = false;
      $('saveState').textContent = session || course ? 'Loaded saved details.' : 'Not saved yet.';
      history.replaceState(null, '', '?course=' + encodeURIComponent(courseId));
      render();
    } catch (e) { banner(e.message, 'danger'); }
    finally { $('programme').disabled = false; }
  }

  // Manual mode: blank form, nothing pulled from the Programs sheet.
  function startManual() {
    src = { courseId: '', programName: '', startDate: '', endDate: '', venue: '', state: '', hrdFee: 0, totalTime: '' };
    auto = { price: '', start: '', end: '', hours: '', days: '', full: '', half: '', less: '', months: '0' };
    course = null; session = null;
    ['f-title','f-description','f-relevance','f-retraining','f-trainer','f-trainerName','f-trainerIc','f-address','f-state'].forEach(id => { $(id).value = ''; });
    $('f-location').value = 'Local';
    OVERRIDE_KEYS.forEach(k => { $('o-'+k).value = auto[k]; });
    $('summary').hidden = true; $('work').hidden = false;
    $('saveState').textContent = 'Manual mode: only the course details (A–D) are saved.';
    history.replaceState(null, '', location.pathname);
    render();
  }

  async function save(ev) {
    ev.preventDefault();
    if (!src) return;
    if (!src.courseId && !val('f-title')) { banner('Enter the course title before saving.', 'danger'); return; }
    const btn = $('save'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const key = courseKey(src.courseId ? src.programName : val('f-title'));
      const overrides = {};
      OVERRIDE_KEYS.forEach(k => { const v = val('o-'+k); if (v !== '' && v !== String(auto[k] ?? '')) overrides[k] = v; });
      if (val('f-state') && val('f-state') !== (src.state || '')) overrides.state = val('f-state');
      const c = await db.from('appendix_course_profiles').upsert({
        course_key: key, course_title: val('f-title'), hrd_programme_code: (/^(\d{6,})/.exec(val('f-title')) || [,''])[1],
        description: val('f-description'), relevance: val('f-relevance'),
        retraining_type: val('f-retraining'), focus_area: 'Not Applicable'
      }).select().single();
      if (c.error) throw c.error;
      course = c.data;
      if (!src.courseId) { $('saveState').textContent = 'Course details saved. Trainer, venue and dates are not saved in manual mode.'; return; }
      const s = await db.from('appendix_session_details').upsert({
        course_id: src.courseId, course_key: key, training_location: val('f-location') || 'Local',
        full_address: val('f-address'), trainer_id: val('f-trainer') || null,
        trainer_name: val('f-trainerName'), trainer_ic: noDash(val('f-trainerIc')), overrides
      }).select().single();
      if (s.error) throw s.error;
      course = c.data; session = s.data;
      $('saveState').textContent = 'Saved ' + new Date().toLocaleTimeString('en-MY', {hour:'2-digit', minute:'2-digit'}) + '.';
    } catch (e) { banner('Could not save: ' + (e.message || e), 'danger'); }
    finally { btn.disabled = false; btn.textContent = 'Save details'; }
  }

  // ---------- Gemini drafts for B and C ----------
  const LIMIT = 400;
  const fit = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); if (t.length <= LIMIT) return t; const c = t.slice(0, LIMIT), d = c.lastIndexOf('.'); return d > 200 ? c.slice(0, d + 1) : c.slice(0, c.lastIndexOf(' ')) + '.'; };
  function aiState(msg, bad) { const el = $('ai-state'); el.textContent = msg || ''; el.classList.toggle('bad', !!bad); }
  function fillBC(desc, rel) {
    if (desc) $('f-description').value = fit(desc);
    if (rel) $('f-relevance').value = fit(rel);
    $('saveState').textContent = 'Unsaved changes.'; render();
  }
  function geminiPrompt() {
    const title = val('f-title') || (src && src.programName) || '(course title)';
    return [
      'Anda membantu penyedia latihan berdaftar HRD Corp (Easy Latih Consultancy) mengisi permohonan geran dalam sistem eTRiS.',
      'Kursus: ' + title + (val('f-retraining') ? ' (kategori: ' + val('f-retraining') + ')' : ''),
      'Berdasarkan course content yang saya lampirkan, tulis dalam Bahasa Melayu yang formal:',
      '1. DESCRIPTION: ringkasan kursus – apa yang dipelajari dan hasil kepada peserta.',
      '2. RELEVANCE: sebab latihan ini relevan dan penting kepada majikan serta pekerja (risiko, pematuhan, prestasi, produktiviti).',
      'Syarat: setiap satu MAKSIMUM 400 aksara termasuk ruang; satu perenggan; tiada bullet, tajuk atau emoji; jangan reka fakta yang tiada dalam course content.',
      'Contoh gaya DESCRIPTION: "Memahami teras undang-undang perburuhan di Malaysia (termasuk Pindaan Akta Kerja 1955 terkini). Kursus ini memberikan kefahaman praktikal mengenai hak dan kewajipan majikan bagi memastikan operasi syarikat patuh undang-undang, mengelakkan risiko saman atau denda daripada Jabatan Tenaga Kerja (JTK), serta mewujudkan persekitaran kerja yang harmoni."',
      'Contoh gaya RELEVANCE: "Latihan ini sangat relevan kerana ia membekalkan majikan dan pihak HR dengan kefahaman kritikal mengenai Pindaan Akta Kerja 1955 terkini bagi mengelakkan risiko denda, kompaun, serta tindakan undang-undang daripada Jabatan Tenaga Kerja (JTK) atau Mahkamah Perusahaan."',
      'Jawab dalam format ini sahaja:',
      'DESCRIPTION: ...',
      'RELEVANCE: ...'
    ].join('\n');
  }
  function parsePasted() {
    const t = $('ai-paste').value;
    const d = /DESCRIPTION\s*:?\**\s*([\s\S]*?)(?=\n\s*\**\s*RELEVANCE\s*:|$)/i.exec(t);
    const r = /RELEVANCE\s*:?\**\s*([\s\S]*)$/i.exec(t);
    const clean = x => (x || '').replace(/\*\*/g, '').trim();
    if (!d && !r) { aiState('Could not find DESCRIPTION: and RELEVANCE: in the pasted text.', true); return; }
    fillBC(clean(d && d[1]), clean(r && r[1]));
    aiState('B and C filled from the Gemini app. Check them, then Save.');
  }
  // ---------- start ----------
  function bind() {
    $('programme').onchange = e => selectProgramme(e.target.value);
    $('reload').onclick = () => loadProgrammes();
    $('form').addEventListener('submit', save);
    $('form').addEventListener('input', e => { if (['o-start','o-end','o-hours'].includes(e.target.id)) rederive(); $('saveState').textContent = 'Unsaved changes.'; render(); });
    $('f-trainer').onchange = e => {
      const t = trainers.find(x => x.id === e.target.value);
      if (t) { $('f-trainerName').value = t.name; $('f-trainerIc').value = t.ic; }
      $('saveState').textContent = 'Unsaved changes.'; render();
    };
    $('resetAuto').onclick = () => { OVERRIDE_KEYS.forEach(k => { $('o-'+k).value = auto[k] ?? ''; }); $('f-state').value = src ? src.state || '' : ''; $('saveState').textContent = 'Unsaved changes.'; render(); };
    $('appendices').addEventListener('click', e => {
      const b = e.target.closest('.copy'); if (!b) return;
      const l = build()[b.dataset.a].lines[b.dataset.l];
      copyText(l.copy != null ? l.copy : l.value, b);
    });
    $('ai-prompt').onclick = e => { copyText(geminiPrompt(), e.currentTarget); $('ai-paste-box').open = true; aiState('Prompt copied. Attach the course content in Gemini, paste the prompt, then paste the answer below.'); };
    $('ai-fill').onclick = parsePasted;
    $('copyAll').onclick = e => copyText(plainText(), e.currentTarget);
    $('download').onclick = () => src && download();
    $('print').onclick = () => src && printDoc();
  }

  async function setup() {
    if (!db || !cfg.supabaseUrl) { $('loginState').textContent = 'Supabase configuration is missing.'; return; }
    if (!API) { $('loginState').textContent = 'The programme service address is missing from config.js.'; return; }
    const { data, error } = await db.auth.getUser();
    if (error || !data || !data.user || (data.user.app_metadata || {}).role !== 'admin') {
      location.replace('login.html?next=' + encodeURIComponent('appendices.html' + location.search)); return;
    }
    $('loginState').hidden = true; $('adminApp').hidden = false;
    bind();
    loadTrainers();
    loadProgrammes();
  }
  setup();
})();
