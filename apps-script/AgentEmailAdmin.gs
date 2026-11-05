/** Public Registrations marketing editor. Install in the AGENT PORTAL project.
 * Uses existing admin sessions and Email Templates, so agents see the same saved
 * template. Posters stay private in Drive; Gmail embeds them using inlineImages.
 */
const ADMIN_EMAIL_TEMPLATE_WIDTH = 8;

function routeAgentEmailAdmin_(body) {
  const actions = ['adminEmailTemplates', 'adminEmailPreview', 'adminEmailSave'];
  if (actions.indexOf(body.action) === -1) return null;
  const session = getSession_({ parameter: { sessionToken: String(body.sessionToken || '') } });
  if (!session) return unauthorized_();
  if (!isAdmin_(session)) return forbidden_();
  try {
    if (body.action === 'adminEmailTemplates') {
      return jsonOutput({ success: true, templates: adminEmailRows_(), signature: emailSignatureInfo_() });
    }
    if (body.action === 'adminEmailPreview') {
      const template = adminEmailRows_().find(t => t.id === String(body.templateId || ''));
      if (!template) throw new Error('Templat tidak dijumpai.');
      const poster = emailPosterBlob_(template.poster);
      return jsonOutput({ success: true, poster: poster
        ? 'data:' + poster.getContentType() + ';base64,' + Utilities.base64Encode(poster.getBytes()) : '' });
    }
    return adminEmailSave_(body);
  } catch (error) {
    return jsonOutput({ success: false, message: error.message });
  }
}

function adminEmailSheet_() {
  const sheet = emailSheet_(EMAIL_TEMPLATE_SHEET, EMAIL_TEMPLATE_HEADERS);
  ensureTemplateHeaders_(sheet);
  if (sheet.getMaxColumns() < ADMIN_EMAIL_TEMPLATE_WIDTH) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), ADMIN_EMAIL_TEMPLATE_WIDTH - sheet.getMaxColumns());
  }
  const courseHeader = String(sheet.getRange(1, 8).getValues()[0][0]).trim();
  if (courseHeader && courseHeader !== 'Course ID') throw new Error('Lajur H Email Templates sudah digunakan. Semak sebelum tambah Course ID.');
  if (!courseHeader) sheet.getRange(1, 8).setValue('Course ID').setFontWeight('bold');
  return sheet;
}

function adminEmailRevision_(row) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(row))
    .map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function adminEmailRows_() {
  const sheet = adminEmailSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, ADMIN_EMAIL_TEMPLATE_WIDTH).getValues()
    .map((r, i) => ({ row: i + 2, id: String(r[0] || '').trim(), name: String(r[1] || ''),
      subject: String(r[2] || ''), body: String(r[3] || ''),
      active: ['', 'YA', 'YES', 'Y', 'TRUE', 'AKTIF'].indexOf(String(r[4]).trim().toUpperCase()) !== -1,
      poster: String(r[5] || '').trim(), specialCode: String(r[6] || ''), courseId: String(r[7] || '').trim(),
      revision: adminEmailRevision_(r) })).filter(t => t.id);
}

function adminEmailImage_(image) {
  if (!image || typeof image.base64 !== 'string' || !image.base64.length ||
      image.base64.length > 4 * Math.ceil(EMAIL_POSTER_MAX_BYTES / 3) ||
      image.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.base64)) {
    throw new Error('Fail gambar tidak sah atau melebihi 5 MB.');
  }
  const bytes = Utilities.base64Decode(image.base64);
  const at = i => (bytes[i] + 256) % 256;
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((v, i) => at(i) === v);
  const jpg = bytes.length >= 4 && at(0) === 255 && at(1) === 216 && at(2) === 255;
  const mime = png ? 'image/png' : jpg ? 'image/jpeg' : '';
  if (!mime || mime !== image.type || bytes.length > EMAIL_POSTER_MAX_BYTES) {
    throw new Error('Poster mesti JPG atau PNG yang sah, maksimum 5 MB.');
  }
  return Utilities.newBlob(bytes, mime, 'poster.' + (png ? 'png' : 'jpg'));
}

function adminEmailSave_(d) {
  const courseId = String(d.courseId || '').trim();
  const id = String(d.templateId || '').trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(courseId) || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) {
    throw new Error('ID program atau templat tidak sah.');
  }
  const name = String(d.name || '').trim(), subject = String(d.subject || '').trim(), text = String(d.body || '');
  if (!name || name.length > 150 || subject.length > 200 || text.length > 40000 || /[\r\n]/.test(subject)) {
    throw new Error('Semak nama templat, subjek (maksimum 200 aksara) dan isi email (maksimum 40,000 aksara).');
  }
  if (d.active === true && (!subject || !text.trim())) throw new Error('Isi subjek dan draf sebelum aktifkan templat.');
  // Validate before creating a Drive file or changing Sheets.
  const blob = d.image ? adminEmailImage_(d.image) : null;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error('Sistem sibuk. Cuba lagi sebentar.');
  let file = null;
  try {
    const templates = adminEmailRows_();
    const matches = templates.filter(t => t.id === id);
    if (matches.length > 1) throw new Error('Template ID berganda. Betulkan dalam Sheet dahulu.');
    const existing = matches[0];
    if ((existing ? existing.revision : '') !== String(d.revision || '')) {
      throw new Error('Templat telah berubah. Muat semula draf sebelum simpan.');
    }
    // A programme may have several templates (e.g. Jemputan and Early Bird), but a
    // template stays with the programme it was first linked to.
    if (existing && existing.courseId && existing.courseId !== courseId) {
      throw new Error('Templat ini sudah dipautkan kepada program lain. Muat semula dan pilih templat program yang betul.');
    }
    let poster = existing ? existing.poster : '';
    if (blob) {
      const props = PropertiesService.getScriptProperties();
      let folderId = props.getProperty('AGENT_EMAIL_POSTER_FOLDER_ID');
      if (!folderId) {
        folderId = DriveApp.createFolder('EasyLatih Email Posters').getId();
        props.setProperty('AGENT_EMAIL_POSTER_FOLDER_ID', folderId);
      }
      blob.setName(courseId + '-' + Utilities.getUuid() + (blob.getContentType() === 'image/png' ? '.png' : '.jpg'));
      file = DriveApp.getFolderById(folderId).createFile(blob);
      poster = file.getUrl();
    }
    // Literal text: prevent names/subjects/drafts being interpreted as Sheet formulas.
    const literal = value => /^[=+\-@]/.test(value) ? "'" + value : value;
    const row = [id, literal(name), literal(subject), literal(text), d.active === true ? 'YA' : 'TIDAK',
      poster, cleanDiscountCode_(d.specialCode), courseId];
    const sheet = adminEmailSheet_();
    sheet.getRange(existing ? existing.row : sheet.getLastRow() + 1, 1, 1, row.length).setValues([row]);
    SpreadsheetApp.flush();
    return jsonOutput({ success: true, template: adminEmailRows_().find(t => t.id === id),
      message: d.active === true ? 'Templat disimpan dan tersedia untuk ejen.' : 'Draf disimpan. Belum dipaparkan kepada ejen.' });
  } finally {
    // Keep uploaded files if Sheets returns an uncertain write failure. Removing
    // one here could break a row whose write actually succeeded before timeout.
    lock.releaseLock();
  }
}
