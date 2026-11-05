(() => {
  'use strict';
  const MAX = 5 * 1024 * 1024;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let current = null;
  window.addEventListener('beforeunload', event => {
    if (current?.dirty) { event.preventDefault(); event.returnValue = ''; }
  });
  const canLeave = () => !current?.busy && (!current?.dirty || confirm('Draf email belum disimpan. Tinggalkan perubahan ini?'));
  const readFile = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca gambar. Pilih fail semula.'));
    reader.readAsDataURL(file);
  });

  // ---- Default draft for a new template (Easy Latih house format) ----
  const BULAN = ['Januari','Februari','Mac','April','Mei','Jun','Julai','Ogos','September','Oktober','November','Disember'];
  const HARI = ['satu','dua','tiga','empat','lima'];
  const BULAN_EN = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  // Accepts 2026-12-13 and "13 Dec 2026" (the calendar mirror's format).
  const ymd = value => {
    const v = String(value || '').trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (m) return {y: +m[1], m: +m[2], d: +m[3]};
    m = /^(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\s+(\d{4})$/.exec(v);
    const mon = m ? BULAN_EN.indexOf(m[2].toLowerCase()) : -1;
    return mon >= 0 ? {y: +m[3], m: mon + 1, d: +m[1]} : null;
  };
  // Dates and the course outline / trainer profile links from the Programs sheet,
  // through the public calendar mirror in Supabase. Missing data falls back to markers.
  async function programInfo(db, courseId) {
    if (!db || !courseId) return {};
    try {
      const { data } = await db.from('public_training_calendar_mirror')
        .select('start_date,end_date,course_content_url,trainer_profile_url')
        .eq('course_id', courseId).limit(1);
      const row = (data && data[0]) || {};
      return { startDate: row.start_date || '', endDate: row.end_date || '',
        outlineUrl: row.course_content_url || '', trainerUrl: row.trainer_profile_url || '' };
    } catch (error) { return {}; }
  }
  function tarikhMelayu(program) {
    const a = ymd(program.startDate), b = ymd(program.endDate) || a;
    if (!a) return program.programDate || '[Tulis tarikh]';
    if (a.y === b.y && a.m === b.m) {
      if (a.d === b.d) return a.d + ' ' + BULAN[a.m - 1] + ' ' + a.y;
      return (b.d - a.d === 1 ? a.d + ' & ' + b.d : a.d + ' – ' + b.d) + ' ' + BULAN[b.m - 1] + ' ' + b.y;
    }
    return a.d + ' ' + BULAN[a.m - 1] + (a.y !== b.y ? ' ' + a.y : '') + ' – ' + b.d + ' ' + BULAN[b.m - 1] + ' ' + b.y;
  }
  function tempoh(program) {
    const a = ymd(program.startDate), b = ymd(program.endDate) || a;
    if (!a) return '';
    const days = Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000) + 1;
    return ' selama ' + (days >= 1 && days <= HARI.length ? HARI[days - 1] : days) + ' hari';
  }
  const PLACEHOLDER = /\[Tulis |TAMPAL-PAUTAN/;
  function defaultDraft(program, info = {}) {
    const link = 'https://TAMPAL-PAUTAN-DI-SINI';
    const okUrl = u => /^https:\/\/\S+$/.test(String(u || '')) ? u : link;
    program = Object.assign({}, program, {
      startDate: program.startDate || info.startDate,
      endDate: program.endDate || info.endDate || program.startDate || info.startDate
    });
    return [
      'Assalamualaikum dan Salam Sejahtera {{nama_pic}},', '',
      '[Tulis 1 ayat pembuka yang menarik tentang topik kursus ini.]', '',
      '[Tulis 1–2 ayat tentang masalah atau risiko yang dihadapi syarikat, dan kenapa kemahiran ini penting.]', '',
      'Bagi membantu organisasi anda [Tulis matlamat, contoh: meningkatkan mutu perkhidmatan], **EasyLatih** menganjurkan kursus interaktif' + tempoh(program) + ':', '',
      '[[KOTAK]]',
      '**' + String(program.programName || '').toUpperCase() + '**', '',
      '📅 **Tarikh:** ' + tarikhMelayu(program),
      '⏰ **Masa:** 9.00 pagi – 5.00 petang',
      '📍 **Lokasi:** ' + (program.venue || '[Tulis lokasi]'),
      '💳 **Pembiayaan:** 100% HRD Corp Claimable (Skim SBL Khas) @ Tunai',
      '[[/KOTAK]]', '',
      '[[POSTER]]', '',
      '## Tanpa Bayaran Awal untuk Syarikat Pembayar Levi HRD Corp',
      'Yuran kursus tidak perlu dibayar terlebih dahulu. EasyLatih akan membuat tuntutan yuran kepada HRD Corp (bergantung pada baki levi syarikat), manakala syarikat hanya perlu memohon geran. Kami juga akan membimbing syarikat dalam proses permohonan geran secara **percuma**.', '',
      'Syarikat juga boleh menuntut **elaun peserta** berdasarkan jarak sehala dari syarikat ke tempat latihan:',
      '- **Kurang daripada 100 km:** RM250 seorang sehari',
      '- **Lebih daripada 100 km:** RM500 seorang sehari',
      '- **Perjalanan melebihi 100 km:** Tambahan elaun untuk 1 hari perjalanan (travelling day)',
      '*Tuntutan elaun tertakluk kepada baki levi syarikat dan kelulusan HRD Corp.*', '',
      '## Apa Yang Akan Dipelajari',
      '- **[Tulis topik 1]:** [Tulis penerangan ringkas]',
      '- **[Tulis topik 2]:** [Tulis penerangan ringkas]',
      '- **[Tulis topik 3]:** [Tulis penerangan ringkas]',
      '- **[Tulis topik 4]:** [Tulis penerangan ringkas]',
      '- **[Tulis topik 5]:** [Tulis penerangan ringkas]', '',
      '**Sesuai untuk:** [Tulis kumpulan sasaran]', '',
      'Lihat [rangka kursus](' + okUrl(info.outlineUrl) + ') dan [profil pengajar](' + okUrl(info.trainerUrl) + ').', '',
      '[[KOTAK]]',
      '🎁 **Khas untuk anda:** gunakan kod diskaun **{{kod_diskaun}}** semasa pendaftaran.',
      'Tempat adalah **TERHAD** bagi memastikan sesi praktikal dan kajian kes berjalan secara optimal.',
      '[[/KOTAK]]', '',
      '[[BUTANG: LIHAT HARGA & DAFTAR | https://www.easylatih.my/registration/?course=' + encodeURIComponent(program.courseId || '') + ']]', '',
      'Perlukan bantuan permohonan geran HRD Corp? Hubungi saya di {{telefon_ejen}} atau admin kami di **010-920 2811 / 09-560 4273**.', '',
      '*Nota: Majikan yang mempunyai 10 atau lebih pekerja warganegara Malaysia dan tertakluk di bawah Akta PSMB 2001 diwajibkan berdaftar serta membayar levi HRD Corp. Levi tersebut boleh digunakan untuk membiayai latihan kakitangan. Rujukan: https://hrdcorp.gov.my/ms/employer-bm*', '',
      'Terima kasih dan kami berharap dapat menerima penyertaan daripada organisasi tuan/puan.', '',
      'Salam hormat,'
    ].join('\n');
  }

  function mount(host, program, db) {
    if (current?.courseId === program.courseId) { host.append(current.section); return; }
    const section = document.createElement('section');
    section.className = 'panel marketing-editor';
    section.innerHTML = `
      <div class="panel-head"><div><h2>Poster &amp; Draf Email</h2><p>Urus bahan promosi program ini. Email dihantar oleh ejen melalui Agent Portal.</p></div></div>
      <p class="notice" data-message role="status" aria-live="polite">Memuatkan templat…</p>
      <div class="marketing-grid"><form><fieldset disabled>
        <label>Templat email<select name="template"><option value="">+ Templat baharu untuk program ini</option></select></label>
        <span class="hint">Satu program boleh ada beberapa templat, contohnya Jemputan dan Early Bird.</span>
        <label>Nama templat<input name="templateName" maxlength="150" required></label>
        <label>Subjek email<input name="subject" maxlength="200"></label>
        <label>Upload poster (JPG / PNG, maksimum 5 MB)<input name="poster" type="file" accept="image/jpeg,image/png"></label>
        <span class="hint" data-poster-note>Belum ada poster.</span>
        <label>Isi draf email<textarea name="body" maxlength="40000" spellcheck="true"></textarea></label>
        <details><summary>Panduan format &amp; maklumat ejen</summary><p class="hint">Letakkan <code>[[POSTER]]</code> pada baris sendiri untuk kedudukan gambar. Guna <code>**teks tebal**</code>, <code>## Tajuk</code>, atau <code>- senarai</code>.<br>Maklumat automatik: <code>{{nama_pic}}</code>, <code>{{syarikat}}</code>, <code>{{kod_diskaun}}</code>, <code>{{nama_ejen}}</code>, <code>{{telefon_ejen}}</code>.<br>Logo, nama ejen, telefon dan WhatsApp ditambah automatik.</p></details>
        <label>Kod khas program (pilihan)<input name="specialCode" maxlength="30" pattern="[A-Za-z0-9_-]*" placeholder="Kosongkan untuk guna kod ejen"></label>
        <label class="marketing-active"><input name="active" type="checkbox">Aktifkan templat untuk ejen</label>
        <p class="hint">Biarkan tidak bertanda untuk simpan sebagai draf. Menyimpan templat tidak menghantar email.</p>
        <div class="act"><button type="submit" class="primary">Simpan Draf &amp; Poster</button><button type="button" data-reload>Muat semula</button></div>
      </fieldset></form><div><h3 style="margin:0 0 6px">Pratonton email</h3><p class="hint" data-subject></p><p class="hint">Contoh maklumat penerima dan ejen digunakan di sini.</p><iframe class="marketing-preview" title="Pratonton draf email program" sandbox="" referrerpolicy="no-referrer"></iframe></div></div>`;
    host.append(section);
    const state = current = { section, courseId: program.courseId, dirty: false, busy: false,
      templates: [], selected: null, poster: '', image: null, imagePreview: '', sequence: 0, signature: {}, info: {} };
    const form = section.querySelector('form'), f = form.elements;
    const fieldset = section.querySelector('fieldset');
    const notice = (message, type = 'info') => {
      const el = section.querySelector('[data-message]'); el.textContent = message; el.dataset.type = type; el.hidden = !message;
    };
    async function request(action, payload = {}) {
      let token = await window.EasyLatihSalesSession.ensure(db);
      if (!token) throw new Error('Sesi email tidak tersedia. Log masuk semula.');
      const send = async () => {
        const response = await fetch(window.EasyLatihSalesSession.API_URL, {
          method: 'POST', body: JSON.stringify({ ...payload, action, sessionToken: token })
        });
        return response.json();
      };
      let out = await send();
      // SESSION_REQUIRED guarantees no write occurred; network errors are never retried.
      if (out.code === 'SESSION_REQUIRED') {
        token = await window.EasyLatihSalesSession.ensure(db, {force: true});
        if (!token) throw new Error('Sesi tamat. Log masuk semula.');
        out = await send();
      }
      if (!out.success) throw new Error(out.message || 'Fungsi email belum tersedia. Sila kemas kini Apps Script Agent Portal.');
      return out;
    }
    function preview() {
      const r = window.EasyLatihEmailRenderer;
      const data = {nama_pic: 'Tuan/Puan', syarikat: 'Syarikat Contoh', kod_diskaun: f.specialCode.value || 'KOD_EJEN',
        nama_ejen: 'Nama Ejen', telefon_ejen: 'Nombor telefon ejen'};
      section.querySelector('[data-subject]').textContent = 'Subjek: ' + r.fill(f.subject.value, data);
      const html = r.layout(r.fill(f.body.value, data), data,
        {logo: state.signature.logo || '', poster: state.imagePreview || state.poster, badges: state.signature.badges || []}, state.signature);
      section.querySelector('iframe').srcdoc = '<!doctype html><html lang="ms" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data: blob: https:; style-src &#39;unsafe-inline&#39;"><title>Pratonton email</title></head><body style="margin:0">' + html + '</body></html>';
    }
    function releaseImage() {
      state.imagePreview = ''; state.image = null; f.poster.value = '';
    }
    async function select(id) {
      const sequence = ++state.sequence;
      state.selected = state.templates.find(t => t.id === id) || null;
      const t = state.selected;
      releaseImage(); state.poster = '';
      f.template.value = t?.id || '';
      f.templateName.value = t?.name || program.programName;
      f.subject.value = t?.subject || 'Jemputan: ' + program.programName;
      f.body.value = t ? t.body : defaultDraft(program, state.info);
      f.specialCode.value = t?.specialCode || ''; f.active.checked = t?.active || false;
      state.dirty = false;
      section.querySelector('[data-poster-note]').textContent = t?.poster ? 'Memuatkan poster tersimpan…' : 'Belum ada poster.';
      preview();
      if (t?.poster) {
        try {
          const result = await request('adminEmailPreview', {templateId: t.id});
          if (sequence !== state.sequence || state.image) return;
          state.poster = result.poster;
          section.querySelector('[data-poster-note]').textContent = 'Poster tersimpan. Pilih gambar baharu untuk menggantikannya.';
          preview();
        } catch (error) {
          if (sequence !== state.sequence || state.image) return;
          section.querySelector('[data-poster-note]').textContent = 'Poster masih tersimpan, tetapi pratonton gagal dimuatkan: ' + error.message;
        }
      }
    }
    // Templates linked to this programme first, then unlinked ones that can be reused.
    function renderOptions(selectedId) {
      const mine = state.templates.filter(t => t.courseId === state.courseId);
      const free = state.templates.filter(t => !t.courseId);
      const option = t => '<option value="' + esc(t.id) + '">' + esc(t.name || t.id) + (t.active ? '' : ' (draf)') + '</option>';
      f.template.innerHTML = '<option value="">+ Templat baharu untuk program ini</option>' +
        (mine.length ? '<optgroup label="Templat program ini">' + mine.map(option).join('') + '</optgroup>' : '') +
        (free.length ? '<optgroup label="Templat lain (belum dipautkan)">' + free.map(option).join('') + '</optgroup>' : '');
      f.template.value = selectedId || '';
    }
    async function load() {
      fieldset.disabled = true;
      notice('Memuatkan templat…');
      try {
        const [result, info] = await Promise.all([request('adminEmailTemplates'), programInfo(db, state.courseId)]);
        state.info = info;
        state.templates = result.templates || []; state.signature = result.signature || {};
        const linked = state.templates.find(t => t.courseId === state.courseId);
        renderOptions(linked?.id || '');
        await select(linked?.id || '');
        fieldset.disabled = false;
        notice('');
      } catch (error) {
        notice(error.message, 'danger');
        // Keep a working reload button even when the backend is not installed.
        fieldset.disabled = false;
        Array.from(f).forEach(el => { el.disabled = !el.matches('[data-reload]'); });
      }
    }
    f.template.addEventListener('change', () => {
      if (state.dirty && !confirm('Tukar templat dan tinggalkan perubahan yang belum disimpan?')) {
        f.template.value = state.selected?.id || ''; return;
      }
      select(f.template.value);
    });
    f.poster.addEventListener('change', async () => {
      const image = f.poster.files[0];
      if (!image) return;
      if (!['image/jpeg', 'image/png'].includes(image.type) || !image.size || image.size > MAX) {
        releaseImage(); notice('Pilih JPG atau PNG, maksimum 5 MB.', 'danger'); preview(); return;
      }
      state.image = image; state.dirty = true;
      const sequence = ++state.sequence;
      try {
        const dataUrl = await readFile(image);
        if (sequence !== state.sequence) return;
        state.imagePreview = dataUrl;
      } catch (error) { notice(error.message, 'danger'); return; }
      section.querySelector('[data-poster-note]').textContent = image.name + ' — belum disimpan';
      notice(''); preview();
    });
    form.addEventListener('input', event => {
      if (event.target === f.poster || event.target === f.template) return;
      state.dirty = true; preview();
    });
    section.querySelector('[data-reload]').addEventListener('click', () => {
      if (canLeave()) { Array.from(f).forEach(el => { el.disabled = false; }); load(); }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (state.busy) return;
      // A draft may keep [Tulis …] markers; an active template must not reach agents with them.
      if (f.active.checked && PLACEHOLDER.test(f.subject.value + '\n' + f.body.value)) {
        notice('Masih ada bahagian [Tulis …] atau TAMPAL-PAUTAN dalam draf. Lengkapkan dahulu, atau simpan sebagai draf (jangan tanda Aktifkan).', 'danger');
        return;
      }
      state.busy = true; fieldset.disabled = true;
      notice('Menyimpan draf dan poster…');
      try {
        const image = state.image ? {type: state.image.type, base64: (await readFile(state.image)).split(',')[1]} : null;
        const result = await request('adminEmailSave', {courseId: state.courseId,
          templateId: state.selected?.id || 'PUBLIC-' + state.courseId + '-' + Date.now().toString(36).toUpperCase(),
          revision: state.selected?.revision || '',
          name: f.templateName.value, subject: f.subject.value, body: f.body.value, specialCode: f.specialCode.value,
          active: f.active.checked, image});
        state.selected = result.template; state.dirty = false;
        state.image = null;
        state.templates = state.templates.filter(t => t.id !== result.template.id).concat([result.template]);
        renderOptions(result.template.id);
        section.querySelector('[data-poster-note]').textContent = result.template.poster ? 'Poster telah disimpan.' : 'Belum ada poster.';
        notice(result.message, 'success');
      } catch (error) {
        notice('Belum dapat sahkan simpanan: ' + error.message + ' Jika sambungan terputus, muat semula untuk semak sebelum simpan lagi.', 'danger');
      } finally { state.busy = false; fieldset.disabled = false; }
    });
    load();
  }
  window.PublicProgramEmail = { mount, canLeave, reset() {
    current = null;
  } };
})();
