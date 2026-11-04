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
    jd14Generate: function (d) { return adminJd14CreateDraft_(d || {}); },
    jd14Finalise: function (d) { return adminJd14Finalise_(String(d.jd14Id || '')); },
    jd14Email: function (d) { return adminJd14Email_(d || {}); },
    jd14List: function () { return adminJd14List_(); },
    jd14Signed: function (d) { return adminJd14MarkSigned_(String(d.jd14Id || '')); },
    hrdInvoiceDraft: function (d) { return adminHrdInvoiceDraft_(String(d.jd14Id || '')); },
    hrdInvoiceFinalise: function (d) { return adminHrdInvoiceFinalise_(String(d.jd14Id || '')); },

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

// ---------------------------------------------------------------------------
// JD14 draft -> finalise -> email PIC.
// Generate makes an editable Google Slides draft in the JD14 folder and logs it
// in the JD14Documents sheet. Finalise exports the current draft to PDF.
// Email sends the PDF to the PIC (bilingual) asking them to sign and reply.
// ---------------------------------------------------------------------------
const ADMIN_JD14_SHEET_ = 'JD14Documents';
const ADMIN_JD14_HEADERS_ = ['JD14ID', 'SourceRef', 'CompanyName', 'CourseTitle', 'TrainingStartDate', 'TrainingEndDate', 'TotalPax', 'PICName', 'PICEmail', 'SlidesId', 'SlidesUrl', 'PdfId', 'PdfUrl', 'Status', 'CreatedDate', 'FinalisedDate', 'SentDate', 'SentTo', 'UpdatedDate',
  'CompanyAddress', 'Venue', 'TotalFee', 'ApprovalNo', 'EmployerCode', 'SignedDate', 'InvoiceNo', 'InvoiceDocId', 'InvoiceDocUrl', 'InvoicePdfId', 'InvoicePdfUrl', 'InvoiceStatus', 'InvoiceFinalisedDate'];

function adminJd14Sheet_() {
  const book = SpreadsheetApp.openById(SHEET_ID);
  let sheet = book.getSheetByName(ADMIN_JD14_SHEET_);
  if (!sheet) {
    sheet = book.insertSheet(ADMIN_JD14_SHEET_);
    sheet.getRange(1, 1, 1, ADMIN_JD14_HEADERS_.length).setValues([ADMIN_JD14_HEADERS_]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  // Add any columns introduced later (kept at the end).
  const current = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(function (h) { return String(h || '').trim(); });
  const missing = ADMIN_JD14_HEADERS_.filter(function (h) { return current.indexOf(h) === -1; });
  if (missing.length) sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
  return sheet;
}

function adminJd14Find_(jd14Id) {
  const sheet = adminJd14Sheet_();
  const map = adminHeaderMap_(sheet);
  if (sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  for (let i = 0; i < values.length; i++) {
    if (adminCell_(values[i], map, 'JD14ID') === jd14Id) {
      const rec = { _row: i + 2 };
      Object.keys(map).forEach(function (k) { rec[k] = values[i][map[k]]; });
      return rec;
    }
  }
  return null;
}

function adminJd14Set_(row, fields) {
  const sheet = adminJd14Sheet_();
  const map = adminHeaderMap_(sheet);
  Object.keys(fields).forEach(function (k) { if (k in map) sheet.getRange(row, map[k] + 1).setValue(fields[k]); });
}

// PIC name and email for the company the JD14 is for.
function adminJd14Pic_(ref) {
  ref = String(ref || '');
  if (ref.indexOf('REG:') === 0) {
    const reg = adminJd14Rows_('Registrations').filter(function (r) { return String(r.RegistrationID || '') === ref.slice(4); })[0];
    return reg ? { name: String(reg.PICName || ''), email: String(reg.PICEmail || ''), courseId: String(reg.CourseID || '') } : {};
  }
  const q = adminJd14Rows_('QuotationRequests').filter(function (r) { return String(r.RequestID || '') === ref; })[0];
  return q ? { name: String(q.PICName || ''), email: String(q.PICEmail || ''), courseId: String(q.CourseID || '') } : {};
}

function adminJd14Public_(rec) {
  const iso = function (v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd') : String(v || ''); };
  return {
    jd14Id: String(rec.JD14ID || ''),
    companyName: String(rec.CompanyName || ''),
    courseTitle: String(rec.CourseTitle || ''),
    trainingStartDate: iso(rec.TrainingStartDate),
    picName: String(rec.PICName || ''),
    picEmail: String(rec.PICEmail || ''),
    slidesUrl: String(rec.SlidesUrl || ''),
    pdfUrl: String(rec.PdfUrl || ''),
    status: String(rec.Status || ''),
    createdDate: iso(rec.CreatedDate),
    sentDate: iso(rec.SentDate),
    sentTo: String(rec.SentTo || ''),
    signedDate: iso(rec.SignedDate),
    totalFee: String(rec.TotalFee || ''),
    invoiceNo: String(rec.InvoiceNo || ''),
    invoiceDocUrl: String(rec.InvoiceDocUrl || ''),
    invoicePdfUrl: String(rec.InvoicePdfUrl || ''),
    invoiceDownloadUrl: rec.InvoicePdfId ? 'https://drive.google.com/uc?export=download&id=' + String(rec.InvoicePdfId) : '',
    invoiceStatus: String(rec.InvoiceStatus || '')
  };
}

function adminJd14CreateDraft_(d) {
  const company = String(d.companyName || '').trim();
  const course = String(d.courseTitle || '').trim();
  if (!company || !course) throw new Error('Company name and course title are required.');

  const folder = DriveApp.getFolderById(JD14_FOLDER_ID);
  const name = 'JD14 DRAFT - ' + company + ' - ' + course;
  const copy = DriveApp.getFileById(JD14_SLIDES_TEMPLATE_ID).makeCopy(name, folder);
  const deck = SlidesApp.openById(copy.getId());
  const fill = {
    '{{COMPANY_NAME}}': company,
    '{{COMPANY_ADDRESS}}': d.companyAddress,
    '{{NO_OF_PARTICIPANTS}}': d.noOfParticipants || d.totalPax,
    '{{EMPLOYER_CODE}}': d.employerCode,
    '{{APPROVAL_NO}}': d.approvalNo,
    '{{TRAINING_START_DATE}}': d.trainingStartDate,
    '{{TRAINING_END_DATE}}': d.trainingEndDate,
    '{{VENUE}}': d.venue,
    '{{COURSE_TITLE}}': course,
    '{{TOTAL_PAX}}': d.totalPax,
    '{{TOTAL_FEE}}': d.totalFee,
    '{{DATE_SUBMISSION}}': d.dateSubmission
  };
  Object.keys(fill).forEach(function (k) { deck.replaceAllText(k, String(fill[k] == null ? '' : fill[k])); });
  deck.saveAndClose();

  const ref = String(d.sourceRef || '');
  const pic = adminJd14Pic_(ref);
  const id = 'JD14-' + Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyMMddHHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
  const now = new Date();
  const rec = {
    JD14ID: id, SourceRef: ref, CompanyName: company, CourseTitle: course,
    TrainingStartDate: String(d.trainingStartDate || ''), TrainingEndDate: String(d.trainingEndDate || ''), TotalPax: String(d.totalPax || ''),
    PICName: pic.name || '', PICEmail: pic.email || '',
    SlidesId: copy.getId(), SlidesUrl: copy.getUrl(), PdfId: '', PdfUrl: '',
    Status: 'DRAFT', CreatedDate: now, FinalisedDate: '', SentDate: '', SentTo: '', UpdatedDate: now,
    CompanyAddress: String(d.companyAddress || ''), Venue: String(d.venue || ''), TotalFee: String(d.totalFee || ''),
    ApprovalNo: String(d.approvalNo || ''), EmployerCode: String(d.employerCode || '')
  };
  const sheet = adminJd14Sheet_();
  const map = adminHeaderMap_(sheet);
  const row = new Array(sheet.getLastColumn()).fill('');
  Object.keys(rec).forEach(function (k) { if (k in map) row[map[k]] = rec[k]; });
  sheet.appendRow(row);
  return adminJd14Public_(rec);
}

function adminJd14Finalise_(jd14Id) {
  const rec = adminJd14Find_(jd14Id);
  if (!rec) throw new Error('JD14 draft not found. Refresh the list.');
  const slides = DriveApp.getFileById(String(rec.SlidesId));
  const folder = DriveApp.getFolderById(JD14_FOLDER_ID);

  // Re-finalising replaces the earlier PDF so only one final copy exists.
  if (rec.PdfId) { try { DriveApp.getFileById(String(rec.PdfId)).setTrashed(true); } catch (e) { console.warn('Old JD14 PDF not trashed: ' + e.message); } }

  const name = 'JD14 - ' + rec.CompanyName + ' - ' + rec.CourseTitle;
  const pdf = folder.createFile(slides.getAs(MimeType.PDF)).setName(name + '.pdf');
  slides.setName(name + ' (editable)');
  const now = new Date();
  const status = ['SENT', 'SIGNED'].indexOf(String(rec.Status)) !== -1 ? String(rec.Status) : 'FINAL';
  adminJd14Set_(rec._row, { PdfId: pdf.getId(), PdfUrl: pdf.getUrl(), Status: status, FinalisedDate: now, UpdatedDate: now });
  rec.PdfId = pdf.getId(); rec.PdfUrl = pdf.getUrl(); rec.Status = status;
  return adminJd14Public_(rec);
}

function adminJd14Email_(d) {
  const rec = adminJd14Find_(String(d.jd14Id || ''));
  if (!rec) throw new Error('JD14 not found. Refresh the list.');
  if (!rec.PdfId) throw new Error('Finalise the JD14 before emailing it.');
  const to = String(d.to || rec.PICEmail || '').trim();
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) throw new Error('Enter the PIC email address.');
  const cc = String(d.cc || '').split(/[,;\s]+/).filter(function (x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x); }).join(',');
  const pic = String(d.picName || rec.PICName || '').trim();
  const iso = function (v) { return v instanceof Date ? Utilities.formatDate(v, 'Asia/Kuala_Lumpur', 'dd/MM/yyyy') : String(v || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1'); };
  const dates = iso(rec.TrainingStartDate) + (rec.TrainingEndDate && iso(rec.TrainingEndDate) !== iso(rec.TrainingStartDate) ? ' – ' + iso(rec.TrainingEndDate) : '');
  const course = String(rec.CourseTitle), company = String(rec.CompanyName);
  const esc = function (t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

  const fieldsMs = ['Tandatangan', 'Nama', 'No. MyKad', 'Jawatan', 'Cop syarikat', 'Tarikh'];
  const fieldsEn = ['Signature', 'Name', 'MyKad no.', 'Designation', 'Company stamp', 'Date'];
  const table = function (rows) { return '<table cellpadding="4" style="border-collapse:collapse;font-size:14px">' + rows.map(function (r) { return '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td></tr>'; }).join('') + '</table>'; };

  const ms = '<p>Tuan/Puan' + (pic ? ' ' + esc(pic) : '') + ',</p>' +
    '<p>Terima kasih kerana menyertai program bersama Easy Latih Consultancy. Bersama-sama ini dilampirkan <b>Borang JD14</b> untuk tujuan tuntutan HRD Corp.</p>' +
    table([['Program', course], ['Tarikh', dates], ['Syarikat', company], ['Bilangan peserta', String(rec.TotalPax || '')]]) +
    '<p>Mohon pihak tuan/puan:</p><ol><li>Cetak borang yang dilampirkan.</li><li>Lengkapkan ruangan berikut: <b>' + fieldsMs.join(', ') + '</b>.</li><li>Imbas (scan) borang yang lengkap dan hantar semula dengan <b>membalas (reply) emel ini</b>.</li></ol>' +
    '<p>Terima kasih.</p><p>Easy Latih Consultancy</p>';
  const en = '<p>Dear ' + (pic ? esc(pic) : 'Sir/Madam') + ',</p>' +
    '<p>Thank you for joining our programme. Attached is the <b>JD14 form</b> for the HRD Corp claim.</p>' +
    table([['Programme', course], ['Date', dates], ['Company', company], ['Participants', String(rec.TotalPax || '')]]) +
    '<p>Please:</p><ol><li>Print the attached form.</li><li>Complete these fields: <b>' + fieldsEn.join(', ') + '</b>.</li><li>Scan the completed form and send it back by <b>replying to this email</b>.</li></ol>' +
    '<p>Thank you.</p><p>Easy Latih Consultancy<br>Easy Learning, Real Results!</p>';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">' + ms +
    '<hr style="border:none;border-top:1px solid #ccc;margin:24px 0"><p style="color:#777;font-size:12px;margin:0 0 8px"><i>English version</i></p>' + en + '</div>';
  const text = [
    'Tuan/Puan' + (pic ? ' ' + pic : '') + ',', '',
    'Bersama-sama ini dilampirkan Borang JD14 untuk tujuan tuntutan HRD Corp.',
    'Program: ' + course, 'Tarikh: ' + dates, 'Syarikat: ' + company, '',
    'Mohon cetak borang, lengkapkan ' + fieldsMs.join(', ') + ', kemudian imbas dan hantar semula dengan membalas emel ini.', '',
    'Terima kasih.', 'Easy Latih Consultancy', '',
    '--------------------', 'English version', '--------------------', '',
    'Dear ' + (pic || 'Sir/Madam') + ',', '',
    'Attached is the JD14 form for the HRD Corp claim.',
    'Programme: ' + course, 'Date: ' + dates, 'Company: ' + company, '',
    'Please print the form, complete the ' + fieldsEn.join(', ') + ', then scan it and send it back by replying to this email.', '',
    'Thank you.', 'Easy Latih Consultancy'
  ].join('\n');

  const subject = 'Borang JD14 untuk ditandatangani / JD14 Form for Signature – ' + course;
  const options = { htmlBody: html, name: 'Easy Latih Consultancy', attachments: [DriveApp.getFileById(String(rec.PdfId)).getBlob()] };
  if (cc) options.cc = typeof getSafeCc === 'function' ? getSafeCc(cc) : cc;
  GmailApp.sendEmail(typeof getSafeEmail === 'function' ? getSafeEmail(to) : to, typeof getEmailSubject === 'function' ? getEmailSubject(subject) : subject, text, options);

  const now = new Date();
  adminJd14Set_(rec._row, { Status: 'SENT', SentDate: now, SentTo: to + (cc ? ' (cc ' + cc + ')' : ''), PICEmail: to, PICName: pic, UpdatedDate: now });

  // Public programme: tick "JD14 sent" on the registration's progress.
  const ref = String(rec.SourceRef || '');
  if (ref.indexOf('REG:') === 0 && typeof praUpsert_ === 'function' && typeof praProgressSheet_ === 'function') {
    try {
      const p = adminJd14Pic_(ref);
      praUpsert_(praProgressSheet_(), 'RegistrationID', ref.slice(4), { CourseID: p.courseId || '', JD14SentDate: now, UpdatedDate: now });
    } catch (e) { console.warn('JD14 sent date not recorded: ' + e.message); }
  }
  rec.Status = 'SENT'; rec.SentDate = now; rec.SentTo = to; rec.PICEmail = to; rec.PICName = pic;
  return adminJd14Public_(rec);
}

function adminJd14List_() {
  const sheet = adminJd14Sheet_();
  if (sheet.getLastRow() < 2) return [];
  const map = adminHeaderMap_(sheet);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  return values.map(function (r) { const rec = {}; Object.keys(map).forEach(function (k) { rec[k] = r[map[k]]; }); return adminJd14Public_(rec); })
    .filter(function (x) { return x.jd14Id; })
    .reverse()
    .slice(0, 40);
}

// ---------------------------------------------------------------------------
// Signed JD14 back from the PIC -> HRD Corp invoice draft -> final PDF.
// The invoice is a Google Docs draft from the HRD Corp invoice template, with a
// running invoice number (ELCyy/mm-xxxx). Finalise saves the PDF in the invoice
// folder for download and upload to the HRD Corp system. Nothing is emailed.
// ---------------------------------------------------------------------------
function adminJd14Progress_(ref, fields) {
  ref = String(ref || '');
  if (ref.indexOf('REG:') !== 0 || typeof praUpsert_ !== 'function' || typeof praProgressSheet_ !== 'function') return;
  try {
    const p = adminJd14Pic_(ref);
    fields.UpdatedDate = new Date();
    if (p.courseId) fields.CourseID = p.courseId;
    praUpsert_(praProgressSheet_(), 'RegistrationID', ref.slice(4), fields);
  } catch (e) { console.warn('Registration progress not updated: ' + e.message); }
}

function adminJd14MarkSigned_(jd14Id) {
  const rec = adminJd14Find_(jd14Id);
  if (!rec) throw new Error('JD14 not found. Refresh the list.');
  if (['SENT', 'SIGNED'].indexOf(String(rec.Status)) === -1) throw new Error('Email the JD14 to the PIC first.');
  const now = new Date();
  adminJd14Set_(rec._row, { Status: 'SIGNED', SignedDate: now, UpdatedDate: now });
  adminJd14Progress_(rec.SourceRef, { JD14SignedDate: now });
  rec.Status = 'SIGNED'; rec.SignedDate = now;
  return adminJd14Public_(rec);
}

// Course duration and total time from the programme (public) or the request (in-house).
function adminJd14Duration_(ref) {
  ref = String(ref || '');
  if (ref.indexOf('REG:') === 0) {
    const p = adminJd14Programs_()[adminJd14Pic_(ref).courseId || ''];
    return p ? { duration: String(p.Duration || ''), totalTime: String(p.TotalTime || '') } : {};
  }
  const q = adminJd14Rows_('QuotationRequests').filter(function (r) { return String(r.RequestID || '') === ref; })[0];
  return q ? { duration: String(q.ProgramDuration || ''), totalTime: String(q.TotalTime || '') } : {};
}

function adminHrdInvoiceDraft_(jd14Id) {
  const rec = adminJd14Find_(jd14Id);
  if (!rec) throw new Error('JD14 not found. Refresh the list.');
  if (String(rec.Status) !== 'SIGNED') throw new Error('Mark the signed JD14 as received first.');
  if (rec.InvoiceDocId) throw new Error('An HRD Corp invoice (' + rec.InvoiceNo + ') already exists for this JD14. Edit that draft instead.');

  const pax = Number(rec.TotalPax || 0);
  const total = Number(String(rec.TotalFee || '').replace(/[^\d.]/g, '')) || 0;
  const dur = adminJd14Duration_(rec.SourceRef);
  const no = getRunningNumber('INVOICE');
  const company = String(rec.CompanyName || '');
  const dateText = (rec.TrainingStartDate && rec.TrainingEndDate) ? formatProgramDate(rec.TrainingStartDate, rec.TrainingEndDate) : String(rec.TrainingStartDate || '');

  const folder = DriveApp.getFolderById(INVOICE_FOLDER_ID);
  const copy = DriveApp.getFileById(HRD_INVOICE_TEMPLATE_ID).makeCopy(no + ' - HRD DRAFT - ' + company, folder);
  const doc = DocumentApp.openById(copy.getId());
  const body = doc.getBody();
  const fill = {
    '{{DOCUMENT_NO}}': no,
    '{{DATE}}': formatDate(new Date()),
    '{{CLIENT_NAME}}': company,
    '{{CLIENT_ADDRESS}}': String(rec.CompanyAddress || ''),
    '{{EMPLOYER_NAME}}': company,
    '{{PROGRAM_NAME}}': String(rec.CourseTitle || ''),
    '{{PROGRAM_DATE}}': dateText,
    '{{PROGRAM_DURATION}}': dur.duration || '',
    '{{TOTAL_TIME}}': dur.totalTime || '',
    '{{VENUE}}': String(rec.Venue || ''),
    '{{PAX}}': pax + ' pax',
    '{{NUMBER_OF_GROUP}}': '',
    '{{MAX_PAX_PER_GROUP}}': '',
    '{{FEE}}': pax ? 'RM' + formatMoney(total / pax) : '',
    '{{UNIT}}': pax + ' pax',
    '{{AMOUNT}}': 'RM' + formatMoney(total),
    '{{TOTAL}}': 'RM' + formatMoney(total)
  };
  Object.keys(fill).forEach(function (k) { body.replaceText(k.replace(/[{}]/g, '\\$&'), String(fill[k] == null ? '' : fill[k])); });
  doc.saveAndClose();

  saveDocumentRecord({
    documentNo: no, documentType: 'HRD Invoice Draft', companyName: company, programName: String(rec.CourseTitle || ''),
    amount: 'RM' + formatMoney(total), status: 'DRAFT', pdfLink: '', draftDocLink: copy.getUrl(), finalPdfLink: '', finalisedDate: ''
  });
  const now = new Date();
  adminJd14Set_(rec._row, { InvoiceNo: no, InvoiceDocId: copy.getId(), InvoiceDocUrl: copy.getUrl(), InvoiceStatus: 'DRAFT', UpdatedDate: now });
  rec.InvoiceNo = no; rec.InvoiceDocId = copy.getId(); rec.InvoiceDocUrl = copy.getUrl(); rec.InvoiceStatus = 'DRAFT';
  return adminJd14Public_(rec);
}

function adminHrdInvoiceFinalise_(jd14Id) {
  const rec = adminJd14Find_(jd14Id);
  if (!rec) throw new Error('JD14 not found. Refresh the list.');
  if (!rec.InvoiceDocId) throw new Error('Create the HRD Corp invoice draft first.');
  const docFile = DriveApp.getFileById(String(rec.InvoiceDocId));
  const folder = DriveApp.getFolderById(INVOICE_FOLDER_ID);
  if (rec.InvoicePdfId) { try { DriveApp.getFileById(String(rec.InvoicePdfId)).setTrashed(true); } catch (e) { console.warn('Old invoice PDF not trashed: ' + e.message); } }

  const no = String(rec.InvoiceNo);
  const pdf = folder.createFile(docFile.getAs(MimeType.PDF)).setName(no.replace(/\//g, '-') + ' - HRD - ' + rec.CompanyName + '.pdf');
  docFile.setName(no + ' - HRD - ' + rec.CompanyName + ' (editable)');
  const now = new Date();
  adminJd14Set_(rec._row, { InvoicePdfId: pdf.getId(), InvoicePdfUrl: pdf.getUrl(), InvoiceStatus: 'FINAL', InvoiceFinalisedDate: now, UpdatedDate: now });
  try {
    updateRowValue(SpreadsheetApp.openById(SHEET_ID).getSheetByName('Documents'), 'DocumentNo', no,
      { DocumentType: 'HRD Invoice', Status: 'FINAL', PdfLink: pdf.getUrl(), FinalPDFLink: pdf.getUrl(), FinalisedDate: now });
  } catch (e) { console.warn('Documents record not updated: ' + e.message); }
  rec.InvoicePdfId = pdf.getId(); rec.InvoicePdfUrl = pdf.getUrl(); rec.InvoiceStatus = 'FINAL';
  return adminJd14Public_(rec);
}
