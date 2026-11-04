/**
 * EasyLatih Admin Centre bridge: Document Generator, JD14 Generator, Certificates.
 *
 * Add this as a NEW file in the "EasyLatih Management System V2 - STAGING"
 * Apps Script project. It reuses the existing functions in Code.gs,
 * FinaliseInhouseQuotationBackend.gs and CertificateBatchBackend.gs; it does not
 * change how documents, JD14 forms or certificates are produced.
 *
 * Every request must carry the Supabase access token of a signed-in
 * EasyLatih admin (app_metadata.role = "admin"). The token is checked with
 * Supabase before anything runs. Only the actions listed in
 * adminToolsActions_() can be called.
 *
 * Also add ONE line at the very top of doPost(e) in Code.gs:
 *   if (e && e.parameter && String(e.parameter.action || '').indexOf('adminTools.') === 0) return handleAdminTools_(e);
 */

const ADMIN_TOOLS_SUPABASE_URL_ = 'https://uxplxejkegommcandldj.supabase.co';
const ADMIN_TOOLS_SUPABASE_KEY_ = 'sb_publishable_1AW0hE-8BHIHnzmo2sGDNg_n2kvWkvP';

function handleAdminTools_(e) {
  try {
    const params = (e && e.parameter) || {};
    const admin = verifyAdminToolsUser_(String(params.accessToken || ''));

    // The existing admin functions check the signed-in Google user. Requests from
    // the Admin Centre have no Google session, so for THIS request only, treat the
    // Supabase admin verified above as the authorised admin.
    assertTrainerAdminAccess_ = function () { return admin.email; };

    const action = String(params.action || '').replace(/^adminTools\./, '');
    const actions = adminToolsActions_();
    // Public programme registrations (PublicRegistrationAdmin.gs), when installed.
    if (typeof publicRegistrationActions_ === 'function') {
      const extra = publicRegistrationActions_();
      Object.keys(extra).forEach(function (k) { actions[k] = extra[k]; });
    }
    if (!Object.prototype.hasOwnProperty.call(actions, action)) throw new Error('Unknown action: ' + action);

    let payload = {};
    if (params.payload) {
      try { payload = JSON.parse(params.payload); } catch (error) { throw new Error('Request data could not be read.'); }
    }
    payload = payload || {};
    if (action === 'attendanceAmend') payload.__adminEmail = admin.email;
    return adminToolsJson_({ success: true, data: actions[action](payload) });
  } catch (error) {
    return adminToolsJson_({ success: false, message: String((error && error.message) || error) });
  }
}

function verifyAdminToolsUser_(accessToken) {
  if (accessToken.length < 20) throw new Error('Sign in to the EasyLatih Admin Centre first.');
  const response = UrlFetchApp.fetch(ADMIN_TOOLS_SUPABASE_URL_ + '/auth/v1/user', {
    method: 'get',
    headers: { apikey: ADMIN_TOOLS_SUPABASE_KEY_, Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) throw new Error('Your admin sign-in has expired. Sign in again.');
  const user = JSON.parse(response.getContentText());
  if (!user || !user.app_metadata || user.app_metadata.role !== 'admin') throw new Error('This action needs the EasyLatih admin account.');
  return { id: user.id, email: String(user.email || '').toLowerCase() };
}

function adminToolsActions_() {
  return {
    // Document Generator
    activeCourses: function () { return getActiveCourses(); },
    createDocument: function (d) {
      const type = String(d.documentType || '');
      if (['QUOTATION', 'INVOICE', 'HRD_INVOICE'].indexOf(type) === -1) throw new Error('Choose quotation, invoice or HRD invoice.');
      if (!String(d.companyName || '').trim()) throw new Error('Company name is required.');
      return createDocumentFromDashboard(d);
    },
    finaliseQuotation: function (d) {
      const no = String(d.documentNo || '').trim();
      if (!no) throw new Error('Quotation number is required.');
      return finaliseInhouseQuotationDraft(no);
    },

    // JD14 Generator
    jd14Companies: function (d) { return adminJd14Companies_(String(d.startDate || '').trim()); },
    jd14Details: function (d) { return adminJd14Details_(String(d.requestId || '').trim()); },
    jd14Generate: function (d) { return generateJD14(d); },

    // Certificates: template
    certSettings: function () { return getCertificateTemplateSettings(); },
    certSettingsSave: function (d) { return saveCertificateTemplateSettings({ templateUrl: String(d.templateUrl || '') }); },
    certSettingsReset: function () { return resetCertificateTemplateSettings(); },

    // Certificates: attendance and per-programme certificates
    attendancePrograms: function () { return getProgramsForAttendance(); },
    attendanceParticipants: function (d) { return getParticipantsByCourse(String(d.courseId || '')); },
    attendanceUpdate: function (d) { return updateAttendance(String(d.courseId || ''), Array.isArray(d.attendanceList) ? d.attendanceList : []); },
    attendanceDetails: function (d) { return adminParticipantDetails_(String(d.courseId || '')); },
    attendanceAmend: function (d) { return adminAmendParticipant_(d || {}); },
    certGenerateAll: function (d) { return generateAllCertificates(String(d.courseId || '')); },
    certSendAll: function (d) { return sendAllCertificates(String(d.courseId || '')); },

    // Certificates: manual batch
    manualConfig: function () { return getManualCertificateConfig(); },
    manualImport: function (d) { return importManualCertificateBatch(d); },
    manualGenerate: function (d) { return generateManualCertificateBatch(String(d.batchId || ''), d.chunkSize); },
    manualSend: function (d) { return sendManualCertificateBatch(String(d.batchId || ''), d.chunkSize); },
    manualStatus: function (d) { return getManualCertificateBatchStatus(String(d.batchId || '')); }
  };
}

function adminToolsJson_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------------------
// Attendance: amend a participant when someone else attends in their place.
// Works on the Participants sheet by header name, so column order doesn't matter.
// ---------------------------------------------------------------------------
const ADMIN_AMEND_AUDIT_HEADERS_ = ['OriginalParticipantName', 'OriginalICNo', 'AmendedDate', 'AmendedBy'];

function adminParticipantsSheet_() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName('Participants');
  if (!sheet) throw new Error('The Participants sheet was not found.');
  return sheet;
}

function adminHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function (h, i) { const k = String(h || '').trim(); if (k) map[k] = i; });
  return map;
}

function adminCell_(row, map, key) {
  if (!(key in map)) return '';
  const v = row[map[key]];
  return String(v == null ? '' : v).trim();
}

// Name, IC, email, phone, certificate state and amendment trail for one programme.
function adminParticipantDetails_(courseId) {
  if (!courseId) throw new Error('Choose a programme first.');
  const sheet = adminParticipantsSheet_();
  const map = adminHeaderMap_(sheet);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const out = [];
  values.forEach(function (r, i) {
    if (adminCell_(r, map, 'CourseID') !== courseId) return;
    out.push({
      rowNumber: i + 2,
      participantName: adminCell_(r, map, 'ParticipantName'),
      icNo: typeof normalizeManualCertificateIc_ === 'function' ? normalizeManualCertificateIc_(adminCell_(r, map, 'ICNo')) : adminCell_(r, map, 'ICNo'),
      email: adminCell_(r, map, 'Email'),
      phone: adminCell_(r, map, 'Phone'),
      attendanceStatus: adminCell_(r, map, 'AttendanceStatus').toUpperCase(),
      certificateStatus: adminCell_(r, map, 'CertificateStatus').toUpperCase(),
      certificateUrl: adminCell_(r, map, 'CertificateURL'),
      emailStatus: adminCell_(r, map, 'EmailStatus').toUpperCase(),
      originalName: adminCell_(r, map, 'OriginalParticipantName')
    });
  });
  return out;
}

function adminAmendParticipant_(d) {
  const courseId = String(d.courseId || '').trim();
  const rowNumber = Number(d.rowNumber);
  const name = String(d.participantName || '').replace(/\s+/g, ' ').trim();
  const icRaw = String(d.icNo || '').replace(/[\s-]/g, '').toUpperCase();
  const ic = typeof normalizeManualCertificateIc_ === 'function' ? normalizeManualCertificateIc_(icRaw) : icRaw;
  const email = String(d.email || '').trim().toLowerCase();
  const phone = String(d.phone || '').replace(/[^\d+]/g, '');
  if (!courseId || !(rowNumber >= 2)) throw new Error('Load the participants again, then try once more.');
  if (!name) throw new Error('Participant name is required.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('That email address doesn\'t look right.');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = adminParticipantsSheet_();
    let map = adminHeaderMap_(sheet);
    ['ParticipantName', 'CourseID'].forEach(function (k) { if (!(k in map)) throw new Error('The Participants sheet has no ' + k + ' column.'); });

    // Add the audit columns at the end the first time this is used.
    const missing = ADMIN_AMEND_AUDIT_HEADERS_.filter(function (h) { return !(h in map); });
    if (missing.length) {
      sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
      map = adminHeaderMap_(sheet);
    }

    if (rowNumber > sheet.getLastRow()) throw new Error('This participant is no longer in the sheet. Load the participants again.');
    const range = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn());
    const row = range.getValues()[0];

    // Guard against the sheet having changed since the list was loaded.
    if (adminCell_(row, map, 'CourseID') !== courseId) throw new Error('The participant list has changed. Load the participants again.');
    const expected = String(d.expectedName || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const currentName = adminCell_(row, map, 'ParticipantName');
    if (expected && currentName.replace(/\s+/g, ' ').toLowerCase() !== expected) throw new Error('The participant list has changed. Load the participants again.');

    const set = function (key, value) { if (key in map) row[map[key]] = value; };
    const currentIc = adminCell_(row, map, 'ICNo').replace(/[\s-]/g, '').toUpperCase();
    const sameIc = (typeof normalizeManualCertificateIc_ === 'function' ? normalizeManualCertificateIc_(currentIc) : currentIc) === ic;
    const nameChanged = currentName !== name || !sameIc;

    // Keep the first registered person on record; later edits don't overwrite it.
    if (nameChanged && !adminCell_(row, map, 'OriginalParticipantName')) {
      set('OriginalParticipantName', currentName);
      set('OriginalICNo', adminCell_(row, map, 'ICNo'));
    }
    set('ParticipantName', name);
    set('ICNo', ic);
    set('Email', email);
    set('Phone', phone);
    set('AmendedDate', new Date());
    set('AmendedBy', (d.__adminEmail || '').toString());

    // A certificate made for the previous person must be made again.
    let resetCertificate = false;
    if (nameChanged && (adminCell_(row, map, 'CertificateURL') || adminCell_(row, map, 'CertificateStatus'))) {
      // CertificateNo and CertificateURL stay: regenerating reuses the number and trashes the old PDF.
      ['CertificateStatus', 'IssueDate', 'EmailStatus', 'EmailSentDate'].forEach(function (k) { set(k, ''); });
      resetCertificate = true;
    }

    // IC and phone as plain text so leading zeros stay.
    ['ICNo', 'Phone'].forEach(function (k) { if (k in map) sheet.getRange(rowNumber, map[k] + 1).setNumberFormat('@'); });
    range.setValues([row]);
    SpreadsheetApp.flush();

    return {
      rowNumber: rowNumber,
      participantName: name,
      icNo: ic,
      email: email,
      phone: phone,
      originalName: adminCell_(row, map, 'OriginalParticipantName'),
      resetCertificate: resetCertificate
    };
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------------------
// JD14: companies by training start date, for in-house AND public programmes.
// In-house dates live in QuotationRequests; public programme registrations live
// in Registrations, with the dates on the programme row in Programs.
// ---------------------------------------------------------------------------
function adminJd14Iso_(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
  const t = String(v == null ? '' : v).trim();
  if (!t) return '';
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  const d = new Date(t);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
}

function adminJd14Rows_(sheetName) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h || '').trim(); });
  return values.slice(1).map(function (r) {
    const o = {};
    headers.forEach(function (h, i) { if (h) o[h] = r[i]; });
    return o;
  });
}

function adminJd14Programs_() {
  const map = {};
  adminJd14Rows_('Programs').forEach(function (p) { const id = String(p.CourseID || '').trim(); if (id) map[id] = p; });
  return map;
}

function adminJd14Companies_(startDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error('Choose the training start date first.');
  const out = [];

  // In-house (and any request that carries its own dates).
  adminJd14Rows_('QuotationRequests').forEach(function (r) {
    if (String(r.ProgramType || '').toUpperCase() === 'PUBLIC') return;
    if (adminJd14Iso_(r.StartDate) !== startDate) return;
    out.push({
      requestId: String(r.RequestID || ''),
      companyName: String(r.CompanyName || ''),
      programName: String(r.CustomProgramName || r.CourseID || ''),
      source: 'INHOUSE'
    });
  });

  // Public programmes starting on that date.
  const programs = adminJd14Programs_();
  adminJd14Rows_('Registrations').forEach(function (r) {
    const p = programs[String(r.CourseID || '').trim()];
    if (!p || adminJd14Iso_(p.StartDate) !== startDate) return;
    if (String(r.RegistrationStatus || '').toUpperCase() === 'CANCELLED') return;
    if (String(r.Status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return;
    out.push({
      requestId: 'REG:' + String(r.RegistrationID || ''),
      companyName: String(r.CompanyName || ''),
      programName: String(p.ProgramName || r.CourseID || '') + ' · ' + String(r.RegistrationID || ''),
      source: 'PUBLIC'
    });
  });

  out.sort(function (a, b) { return a.companyName.localeCompare(b.companyName); });
  return out;
}

function adminJd14Details_(id) {
  if (!id) throw new Error('Choose a company first.');
  if (id.indexOf('REG:') !== 0) {
    const d = getJD14DataByRequestId(id);
    if (d && !d.trainingStartDate) d.trainingStartDate = '';
    return d;
  }

  const regId = id.slice(4);
  const reg = adminJd14Rows_('Registrations').filter(function (r) { return String(r.RegistrationID || '') === regId; })[0];
  if (!reg) throw new Error('Registration ' + regId + ' was not found.');
  const p = adminJd14Programs_()[String(reg.CourseID || '').trim()];
  if (!p) throw new Error('Programme ' + reg.CourseID + ' was not found.');

  const pax = Number(reg.RequestedPax || 0);
  const isHrd = String(reg.PaymentMethod || '').toUpperCase() === 'HRD';
  const fee = Number((isHrd ? p.HRDFee : p.SelfFee) || 0);
  const discount = Number(reg.DiscountAmount || 0);
  const total = fee ? Math.max(0, fee * pax - discount) : '';

  return {
    requestId: id,
    companyName: String(reg.CompanyName || ''),
    companyAddress: String(reg.CompanyAddress || ''),
    noOfParticipants: pax,
    employerCode: '',
    approvalNo: String(reg.GrantRefNo || ''),
    trainingStartDate: adminJd14Iso_(p.StartDate),
    trainingEndDate: adminJd14Iso_(p.EndDate),
    venue: String(p.Venue || ''),
    courseTitle: String(p.ProgramName || ''),
    totalPax: pax,
    totalFee: total === '' ? '' : total.toFixed(2),
    dateSubmission: Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd')
  };
}
