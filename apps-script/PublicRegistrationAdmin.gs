/**
 * EasyLatih Public Programme Registrations (Admin Centre)
 *
 * Add this as a NEW file in the "EasyLatih Management System V2 - STAGING"
 * project, next to AdminToolsBridge.gs. It works on the existing master
 * spreadsheet (Programs, Registrations, Participants, Documents) and adds:
 *   - ProgrammeSettings      HRD guideline, WhatsApp group link, joining instructions
 *   - RegistrationProgress   receipt, confirmation, JD14 and HRD claim steps
 *   - *_Archive tabs         rows moved here when a programme is archived
 * Existing columns and existing functions are not changed.
 *
 * Wiring (done once):
 *   1. AdminToolsBridge.gs merges publicRegistrationActions_() into its actions.
 *   2. Code.gs submitRegistration() calls praAfterRegistration_(data, program)
 *      after the quotation/invoice email, to send the HRD guideline.
 *   3. Run installPublicRegistrationDailyCheck() once from the editor to email the
 *      participant list automatically when a programme's registration closes.
 */

const PRA_TZ_ = 'Asia/Kuala_Lumpur';
const PRA_SETTINGS_SHEET_ = 'ProgrammeSettings';
const PRA_SETTINGS_HEADERS_ = ['CourseID', 'GuidelineUrl', 'WhatsAppLink', 'JoiningInstructions', 'ParticipantListSentDate', 'ArchivedDate', 'UpdatedDate'];
const PRA_PROGRESS_SHEET_ = 'RegistrationProgress';
const PRA_PROGRESS_HEADERS_ = ['RegistrationID', 'CourseID', 'ConfirmationSentDate', 'ReceiptNo', 'ReceiptUrl', 'AmountReceived', 'JD14SentDate', 'JD14SignedDate', 'ClaimSubmittedDate', 'ClaimRefNo', 'ClaimAmount', 'ClaimPaidDate', 'UpdatedDate'];
const PRA_HRD_STEPS_ = {
  JD14_SENT: 'JD14SentDate',
  JD14_SIGNED: 'JD14SignedDate',
  CLAIM_SUBMITTED: 'ClaimSubmittedDate',
  CLAIM_PAID: 'ClaimPaidDate'
};

// ---------------------------------------------------------------------------
// Actions exposed to the Admin Centre (merged into AdminToolsBridge.gs)
// ---------------------------------------------------------------------------
function publicRegistrationActions_() {
  return {
    regPrograms: function () { return praPrograms_(); },
    regProgramDetail: function (d) { return praProgramDetail_(praText_(d.courseId)); },
    regSaveSettings: function (d) { return praSaveSettings_(d); },
    regSaveLimits: function (d) { return praSaveLimits_(d); },
    regTrainerConfirmed: function (d) { return praTrainerConfirmed_(praText_(d.courseId)); },
    regConfirmProgramme: function (d) { return praConfirmProgramme_(praText_(d.courseId)); },
    regSaveStatus: function (d) { return praSaveStatus_(d); },
    regPaymentReceived: function (d) { return praPaymentReceived_(d); },
    regGrantApproved: function (d) { return praGrantApproved_(d); },
    regHrdStep: function (d) { return praHrdStep_(d); },
    regCancel: function (d) { return praCancel_(d); },
    regResendConfirmation: function (d) { return praResendConfirmation_(d); },
    regEmailParticipantList: function (d) { return praEmailParticipantList_(praText_(d.courseId)); },
    regArchive: function (d) { return praArchive_(praText_(d.courseId), d.force === true); },
    regArchivedPrograms: function () { return praArchivedPrograms_(); },
    regFormerClients: function (d) { return praFormerClients_(praText_(d.query)); },
    regAppendixSource: function (d) { return praAppendixSource_(praText_(d.courseId)); }
  };
}

// ---------------------------------------------------------------------------
// Sheet helpers
// ---------------------------------------------------------------------------
function praBook_() { return SpreadsheetApp.openById(SHEET_ID); }
function praText_(v) { return String(v == null ? '' : v).trim(); }
function praUpper_(v) { return praText_(v).toUpperCase(); }
function praLower_(v) { return praText_(v).toLowerCase(); }
function praToday_() { return Utilities.formatDate(new Date(), PRA_TZ_, 'yyyy-MM-dd'); }

function praIso_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, PRA_TZ_, 'yyyy-MM-dd');
  return praText_(v);
}

function praRead_(sheet) {
  if (!sheet || sheet.getLastRow() < 1) return { headers: [], rows: [] };
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return praText_(h); });
  const rows = values.slice(1).map(function (r, i) {
    const o = { _row: i + 2 };
    headers.forEach(function (h, j) { if (h) o[h] = r[j]; });
    return o;
  });
  return { headers: headers, rows: rows };
}

// Returns the sheet, creating it (or adding any missing headers at the end).
function praSheet_(name, headers) {
  const book = praBook_();
  let sheet = book.getSheetByName(name);
  if (!sheet) {
    sheet = book.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }
  const width = Math.max(1, sheet.getLastColumn());
  const current = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return praText_(h); });
  const missing = headers.filter(function (h) { return current.indexOf(h) === -1; });
  if (missing.length) {
    const last = sheet.getLastColumn();
    sheet.getRange(1, (current.join('') ? last : 0) + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

function praIndex_(rows, key) {
  const map = {};
  rows.forEach(function (r) { const k = praText_(r[key]); if (k) map[k] = r; });
  return map;
}

// Insert or update one row matched by keyHeader = keyValue, writing only the given fields.
function praUpsert_(sheet, keyHeader, keyValue, fields) {
  const data = praRead_(sheet);
  const headers = data.headers;
  const keyCol = headers.indexOf(keyHeader);
  if (keyCol === -1) throw new Error('Missing ' + keyHeader + ' header in ' + sheet.getName());
  const existing = data.rows.filter(function (r) { return praText_(r[keyHeader]) === praText_(keyValue); })[0];
  if (existing) {
    Object.keys(fields).forEach(function (h) {
      const col = headers.indexOf(h);
      if (col !== -1) sheet.getRange(existing._row, col + 1).setValue(fields[h]);
    });
    return;
  }
  const row = headers.map(function (h) {
    if (h === keyHeader) return keyValue;
    return Object.prototype.hasOwnProperty.call(fields, h) ? fields[h] : '';
  });
  sheet.appendRow(row);
}

function praSettingsSheet_() { return praSheet_(PRA_SETTINGS_SHEET_, PRA_SETTINGS_HEADERS_); }
function praProgressSheet_() { return praSheet_(PRA_PROGRESS_SHEET_, PRA_PROGRESS_HEADERS_); }

function praProgramDate_(p) {
  if (typeof formatProgramAdminDateDisplay_ === 'function') {
    try { return formatProgramAdminDateDisplay_(p.StartDate, p.EndDate); } catch (e) { /* fall through */ }
  }
  if (typeof formatProgramDate === 'function') {
    try { return formatProgramDate(p.StartDate, p.EndDate); } catch (e) { /* fall through */ }
  }
  return praIso_(p.StartDate) + (p.EndDate ? ' – ' + praIso_(p.EndDate) : '');
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
function praParticipantKey_(courseId, picEmail) { return praText_(courseId) + '|' + praLower_(picEmail); }

function praParticipantIndex_(participants) {
  const map = {};
  participants.forEach(function (p) {
    // Website registrations store the PIC's email on each participant row (HREmail).
    const k = praParticipantKey_(p.CourseID, p.PICEmail || p.HREmail);
    (map[k] = map[k] || []).push(p);
  });
  return map;
}

// Works out where a registration is in the flow and what the next step is.
function praStage_(reg, progress, people) {
  progress = progress || {};
  people = people || [];
  const method = praUpper_(reg.PaymentMethod) === 'HRD' ? 'HRD' : 'SELF';
  const attendedPeople = people.filter(function (p) { return praUpper_(p.AttendanceStatus) === 'ATTENDED'; });
  const attended = attendedPeople.length > 0;
  const certSent = attended && attendedPeople.every(function (p) { return praUpper_(p.EmailStatus) === 'SENT'; });
  const paid = praUpper_(reg.PaymentStatus) === 'RECEIVED';
  const grant = praUpper_(reg.GrantStatus) === 'APPROVED';

  if (praUpper_(reg.RegistrationStatus) === 'CANCELLED') return { key: 'CANCELLED', label: 'Cancelled', next: '', done: true, method: method };

  if (method === 'SELF') {
    if (!paid) return { key: 'AWAITING_PAYMENT', label: 'Awaiting payment', next: 'PAYMENT', done: false, method: method };
    if (!attended) return { key: 'CONFIRMED', label: 'Paid · confirmed', next: '', done: false, method: method };
    if (!certSent) return { key: 'ATTENDED', label: 'Attended · certificate pending', next: '', done: false, method: method };
    return { key: 'COMPLETED', label: 'Completed', next: '', done: true, method: method };
  }

  if (!grant) return { key: 'AWAITING_GRANT', label: 'Awaiting grant approval', next: 'GRANT', done: false, method: method };
  if (!attended) return { key: 'CONFIRMED', label: 'Grant approved · confirmed', next: '', done: false, method: method };
  if (!certSent) return { key: 'ATTENDED', label: 'Attended · certificate pending', next: '', done: false, method: method };
  if (!progress.JD14SentDate) return { key: 'CERT_SENT', label: 'Certificate sent · send JD14', next: 'JD14_SENT', done: false, method: method };
  if (!progress.JD14SignedDate) return { key: 'JD14_SENT', label: 'JD14 sent · waiting for signature', next: 'JD14_SIGNED', done: false, method: method };
  if (!progress.ClaimSubmittedDate) return { key: 'JD14_SIGNED', label: 'JD14 signed · submit claim', next: 'CLAIM_SUBMITTED', done: false, method: method };
  if (!progress.ClaimPaidDate) return { key: 'CLAIM_SUBMITTED', label: 'Claim submitted · waiting for HRD Corp', next: 'CLAIM_PAID', done: false, method: method };
  return { key: 'COMPLETED', label: 'Completed · claim paid', next: '', done: true, method: method };
}

// ---------------------------------------------------------------------------
// Programmes
// ---------------------------------------------------------------------------
function praPrograms_() {
  const book = praBook_();
  const programs = praRead_(book.getSheetByName('Programs')).rows;
  const regs = praRead_(book.getSheetByName('Registrations')).rows;
  const people = praParticipantIndex_(praRead_(book.getSheetByName('Participants')).rows);
  const settings = praIndex_(praRead_(praSettingsSheet_()).rows, 'CourseID');
  const progress = praIndex_(praRead_(praProgressSheet_()).rows, 'RegistrationID');

  const byCourse = {};
  regs.forEach(function (r) {
    const c = praText_(r.CourseID);
    if (c && praText_(r.RegistrationID)) (byCourse[c] = byCourse[c] || []).push(r);
  });

  return programs.filter(function (p) {
    const id = praText_(p.CourseID);
    if (!id || praUpper_(p.ProgramType) === 'INHOUSE') return false;
    if (settings[id] && praText_(settings[id].ArchivedDate)) return false;
    const status = praUpper_(p.Status);
    if ((byCourse[id] || []).length > 0) return true;
    // No registrations: only show upcoming programmes that are open for registration.
    const ends = praIso_(p.EndDate) || praIso_(p.StartDate);
    return ['CANCELLED', 'DECLINED', 'COMPLETED'].indexOf(status) === -1 && (!ends || ends >= praToday_());
  }).map(function (p) {
    const id = praText_(p.CourseID);
    const list = byCourse[id] || [];
    const counts = { total: 0, pax: 0, cancelled: 0, awaitingPayment: 0, awaitingGrant: 0, confirmed: 0, inClaim: 0, completed: 0 };
    list.forEach(function (r) {
      const st = praStage_(r, progress[praText_(r.RegistrationID)], people[praParticipantKey_(r.CourseID, r.PICEmail)]);
      if (st.key === 'CANCELLED') { counts.cancelled++; return; }
      counts.total++;
      counts.pax += Number(r.RequestedPax || 0);
      if (st.key === 'AWAITING_PAYMENT') counts.awaitingPayment++;
      else if (st.key === 'AWAITING_GRANT') counts.awaitingGrant++;
      else if (st.key === 'COMPLETED') counts.completed++;
      else if (['CERT_SENT', 'JD14_SENT', 'JD14_SIGNED', 'CLAIM_SUBMITTED'].indexOf(st.key) !== -1) counts.inClaim++;
      else counts.confirmed++;
    });
    return {
      courseId: id,
      programName: praText_(p.ProgramName),
      programDate: praProgramDate_(p),
      startDate: praIso_(p.StartDate),
      endDate: praIso_(p.EndDate),
      venue: praText_(p.Venue),
      deliveryMode: praText_(p.DeliveryMode),
      status: praUpper_(p.Status) || 'DRAFT',
      isActive: praFlag_(p.IsActive),
      isPublished: praFlag_(p.IsPublished),
      minPax: Number(p.MinPax || 0),
      maxPax: Number(p.MaxPax || 0),
      closeDate: praIso_(p.RegistrationCloseDate),
      counts: counts,
      archivable: counts.total > 0 ? counts.completed === counts.total : list.length > 0,
      participantListSentDate: settings[id] ? praIso_(settings[id].ParticipantListSentDate) : ''
    };
  }).sort(function (a, b) { return String(a.startDate).localeCompare(String(b.startDate)); });
}

function praProgramRecord_(courseId) {
  const program = findRowByValue(praBook_().getSheetByName('Programs'), 'CourseID', courseId);
  if (!program) throw new Error('Programme not found: ' + courseId);
  return program;
}

function praProgramDetail_(courseId) {
  if (!courseId) throw new Error('Choose a programme.');
  const book = praBook_();
  const p = praProgramRecord_(courseId);
  const regs = praRead_(book.getSheetByName('Registrations')).rows.filter(function (r) { return praText_(r.CourseID) === courseId && praText_(r.RegistrationID); });
  const people = praParticipantIndex_(praRead_(book.getSheetByName('Participants')).rows.filter(function (x) { return praText_(x.CourseID) === courseId; }));
  const progress = praIndex_(praRead_(praProgressSheet_()).rows, 'RegistrationID');
  const s = praIndex_(praRead_(praSettingsSheet_()).rows, 'CourseID')[courseId] || {};

  return {
    program: {
      courseId: courseId,
      programName: praText_(p.ProgramName),
      programDate: praProgramDate_(p),
      venue: praText_(p.Venue),
      deliveryMode: praText_(p.DeliveryMode),
      status: praUpper_(p.Status) || 'DRAFT',
      isActive: praFlag_(p.IsActive),
      isPublished: praFlag_(p.IsPublished),
      startDate: praIso_(p.StartDate),
      minPax: Number(p.MinPax || 0),
      maxPax: Number(p.MaxPax || 0),
      closeDate: praIso_(p.RegistrationCloseDate),
      hrdFee: Number(p.HRDFee || 0),
      selfFee: Number(p.SelfFee || 0),
      confirm: praConfirmCheck_(p, courseId)
    },
    settings: {
      guidelineUrl: praText_(s.GuidelineUrl),
      whatsAppLink: praText_(s.WhatsAppLink),
      joiningInstructions: praText_(s.JoiningInstructions),
      participantListSentDate: praIso_(s.ParticipantListSentDate)
    },
    registrations: regs.map(function (r) {
      const id = praText_(r.RegistrationID);
      const pr = progress[id] || {};
      const ppl = people[praParticipantKey_(r.CourseID, r.PICEmail)] || [];
      return {
        registrationId: id,
        companyName: praText_(r.CompanyName),
        picName: praText_(r.PICName),
        picEmail: praText_(r.PICEmail),
        picPhone: praText_(r.PICPhone),
        paymentMethod: praUpper_(r.PaymentMethod) === 'HRD' ? 'HRD' : 'SELF',
        requestedPax: Number(r.RequestedPax || 0),
        discountAmount: Number(r.DiscountAmount || 0),
        paymentDate: praIso_(r.PaymentDate),
        paymentRef: praText_(r.PaymentRefNo),
        grantRef: praText_(r.GrantRefNo),
        grantDate: praIso_(r.GrantApprovedDate),
        remarks: praText_(r.Remarks),
        receiptNo: praText_(pr.ReceiptNo),
        receiptUrl: praText_(pr.ReceiptUrl),
        confirmationSentDate: praIso_(pr.ConfirmationSentDate),
        jd14SentDate: praIso_(pr.JD14SentDate),
        jd14SignedDate: praIso_(pr.JD14SignedDate),
        claimSubmittedDate: praIso_(pr.ClaimSubmittedDate),
        claimRefNo: praText_(pr.ClaimRefNo),
        claimAmount: praText_(pr.ClaimAmount),
        claimPaidDate: praIso_(pr.ClaimPaidDate),
        stage: praStage_(r, pr, ppl),
        participants: ppl.map(function (x) {
          return {
            name: praText_(x.ParticipantName),
            icNo: praText_(x.ICNo),
            email: praText_(x.Email),
            phone: praText_(x.Phone || x.ParticipantPhone),
            attendance: praUpper_(x.AttendanceStatus) || 'REGISTERED',
            certificateStatus: praUpper_(x.EmailStatus) === 'SENT' ? 'SENT' : praText_(x.CertificateStatus)
          };
        })
      };
    })
  };
}

function praSaveSettings_(d) {
  const courseId = praText_(d.courseId);
  praProgramRecord_(courseId);
  const url = function (v, label) {
    v = praText_(v);
    if (v && !/^https:\/\//i.test(v)) throw new Error(label + ' must start with https://');
    return v;
  };
  praUpsert_(praSettingsSheet_(), 'CourseID', courseId, {
    GuidelineUrl: url(d.guidelineUrl, 'The HRD guideline link'),
    WhatsAppLink: url(d.whatsAppLink, 'The WhatsApp group link'),
    JoiningInstructions: praText_(d.joiningInstructions).slice(0, 5000),
    UpdatedDate: new Date()
  });
  return praProgramDetail_(courseId).settings;
}

// Edits minimum pax, maximum pax and registration close date on the Programs sheet.
function praSaveLimits_(d) {
  const courseId = praText_(d.courseId);
  const program = praProgramRecord_(courseId);
  const whole = function (v, label) {
    const n = Number(v);
    if (praText_(v) === '' || !isFinite(n) || n < 1 || Math.floor(n) !== n) throw new Error(label + ' must be a whole number of 1 or more.');
    return n;
  };
  const minPax = whole(d.minPax, 'Minimum pax');
  const maxPax = whole(d.maxPax, 'Maximum pax');
  if (maxPax < minPax) throw new Error('Maximum pax cannot be lower than minimum pax.');

  const closeText = praText_(d.closeDate);
  let closeDate = '';
  if (closeText) {
    const m = closeText.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) throw new Error('Registration close date is not a valid date.');
    closeDate = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const start = praIso_(program.StartDate);
    if (/^\d{4}-\d{2}-\d{2}$/.test(start) && closeText > start) throw new Error('Registration close date cannot be after the programme start date (' + start + ').');
  }

  praUpsert_(praBook_().getSheetByName('Programs'), 'CourseID', courseId, {
    MinPax: minPax,
    MaxPax: maxPax,
    RegistrationCloseDate: closeDate,
    UpdatedDate: new Date()
  });

  // A later close date means the participant list should go out again on the new date.
  const previousClose = praIso_(program.RegistrationCloseDate);
  if (closeText && closeText !== previousClose && closeText >= praToday_()) {
    const s = praIndex_(praRead_(praSettingsSheet_()).rows, 'CourseID')[courseId];
    if (s && praText_(s.ParticipantListSentDate)) {
      praUpsert_(praSettingsSheet_(), 'CourseID', courseId, { ParticipantListSentDate: '', UpdatedDate: new Date() });
    }
  }

  // Refresh the public training calendar so the website shows the new seats and deadline.
  if (typeof syncPublicTrainingCalendarMirror === 'function') {
    try { syncPublicTrainingCalendarMirror(); } catch (e) { console.error('Calendar sync after limits change failed: ' + e.message); }
  }

  return praProgramDetail_(courseId).program;
}

// Same checks as Programme Management's Confirm Programme button (confirmScheduledProgramAdmin).
function praConfirmCheck_(p, courseId) {
  let confirmedPax = 0;
  try {
    const summary = buildProgramRegistrationSummary_(praBook_().getSheetByName('Registrations'));
    confirmedPax = Number((summary[courseId] || {}).confirmedPax || 0);
  } catch (e) { /* summary unavailable */ }
  const status = praUpper_(p.Status) || 'DRAFT';
  const isActive = praFlag_(p.IsActive);
  const trainerStatus = praUpper_(p.TrainerConfirmationStatus) || 'TENTATIVE';
  const minPax = Number(p.MinPax || 0);
  const checks = [
    { ok: status === 'TENTATIVE', label: 'Programme status is TENTATIVE (now ' + status + ')' },
    { ok: isActive, label: 'Programme is active' },
    { ok: trainerStatus === 'CONFIRMED', label: 'Trainer confirmed (now ' + trainerStatus + ')', fix: trainerStatus === 'CONFIRMED' ? '' : 'TRAINER' },
    { ok: minPax > 0, label: 'Minimum pax is set' },
    { ok: minPax > 0 && confirmedPax >= minPax, label: 'Confirmed pax ' + confirmedPax + ' of minimum ' + (minPax || '—') }
  ];
  return { status: status, trainerStatus: trainerStatus, confirmedPax: confirmedPax, checks: checks, ready: checks.every(function (c) { return c.ok; }) };
}

function praTrainerConfirmed_(courseId) {
  praProgramRecord_(courseId);
  praUpsert_(praBook_().getSheetByName('Programs'), 'CourseID', courseId, { TrainerConfirmationStatus: 'CONFIRMED', UpdatedDate: new Date() });
  return praProgramDetail_(courseId).program;
}

function praConfirmProgramme_(courseId) {
  if (typeof confirmScheduledProgramAdmin !== 'function') throw new Error('Programme confirmation is not available in this Apps Script project.');
  const result = confirmScheduledProgramAdmin(courseId);
  if (typeof syncPublicTrainingCalendarMirror === 'function') {
    try { syncPublicTrainingCalendarMirror(); } catch (e) { console.error('Calendar sync after confirmation failed: ' + e.message); }
  }
  return {
    program: praProgramDetail_(courseId).program,
    emailsSent: Number(result.confirmationEmailsSent || 0),
    emailsSkipped: Number(result.confirmationEmailsSkipped || 0),
    emailsFailed: Number(result.confirmationEmailsFailed || 0)
  };
}

function praFlag_(v) {
  if (typeof isProgramAdminTrue_ === 'function') return !!isProgramAdminTrue_(v);
  return v === true || ['TRUE', 'YES', '1', 'Y'].indexOf(praUpper_(v)) !== -1;
}

// Status, Active and Published, through Programme Management's own update (same rules and cancellation emails).
function praSaveStatus_(d) {
  const courseId = praText_(d.courseId);
  const p = praProgramRecord_(courseId);
  const status = praUpper_(d.status);
  const current = praUpper_(p.Status) || 'DRAFT';
  if (status === 'CONFIRMED' && current !== 'CONFIRMED') throw new Error('Use the Confirm programme button so the PICs get the confirmation email.');
  if (typeof updateScheduledProgramAdmin !== 'function') throw new Error('Programme status update is not available in this Apps Script project.');
  const result = updateScheduledProgramAdmin({
    courseId: courseId,
    status: status,
    trainerConfirmationStatus: praUpper_(p.TrainerConfirmationStatus) || 'TENTATIVE',
    isActive: d.isActive === true,
    isPublished: d.isPublished === true
  });
  if (typeof syncPublicTrainingCalendarMirror === 'function') {
    try { syncPublicTrainingCalendarMirror(); } catch (e) { console.error('Calendar sync after status change failed: ' + e.message); }
  }
  return {
    program: praProgramDetail_(courseId).program,
    cancellationEmailsSent: Number(result.cancellationEmailsSent || 0),
    cancellationEmailsFailed: Number(result.cancellationEmailsFailed || 0)
  };
}

// ---------------------------------------------------------------------------
// Registration actions
// ---------------------------------------------------------------------------
function praRegistration_(registrationId) {
  const sheet = praBook_().getSheetByName('Registrations');
  const reg = findRowByValue(sheet, 'RegistrationID', registrationId);
  if (!reg) throw new Error('Registration not found: ' + registrationId);
  return { sheet: sheet, reg: reg };
}

function praMarkConfirmationSent_(sheet, registrationId, courseId) {
  updateRowValue(sheet, 'RegistrationID', registrationId, { ConfirmationEmailStatus: 'SENT', ConfirmationEmailSentDate: new Date() });
  praUpsert_(praProgressSheet_(), 'RegistrationID', registrationId, { CourseID: courseId, ConfirmationSentDate: new Date(), UpdatedDate: new Date() });
}

function praPaymentReceived_(d) {
  const registrationId = praText_(d.registrationId);
  const found = praRegistration_(registrationId);
  const reg = found.reg;
  if (praUpper_(reg.RegistrationStatus) === 'CANCELLED') throw new Error('This registration is cancelled.');
  if (praUpper_(reg.PaymentMethod) === 'HRD') throw new Error('This is an HRD Corp registration. Record the grant approval instead.');
  const paymentDate = praText_(d.paymentDate) || praToday_();
  const amount = Number(d.amount || 0);
  if (!(amount > 0)) throw new Error('Enter the amount received.');

  updateRowValue(found.sheet, 'RegistrationID', registrationId, {
    PaymentStatus: 'RECEIVED',
    PaymentDate: paymentDate,
    PaymentRefNo: praText_(d.paymentRef),
    Remarks: praText_(d.remarks)
  });
  praUpsert_(praProgressSheet_(), 'RegistrationID', registrationId, { CourseID: praText_(reg.CourseID), AmountReceived: amount, UpdatedDate: new Date() });

  const warnings = [];
  const program = praProgramRecord_(praText_(reg.CourseID));
  let receipt = null;
  try {
    receipt = praCreateReceipt_(reg, program, { paymentDate: paymentDate, paymentRef: praText_(d.paymentRef), method: praText_(d.method) || 'Bank transfer', amount: amount });
    praUpsert_(praProgressSheet_(), 'RegistrationID', registrationId, { ReceiptNo: receipt.receiptNo, ReceiptUrl: receipt.pdfUrl, UpdatedDate: new Date() });
  } catch (error) {
    warnings.push('Receipt could not be created: ' + error.message);
  }
  try {
    praSendConfirmation_(reg, program, 'PAYMENT', { receipt: receipt, paymentDate: paymentDate });
    praMarkConfirmationSent_(found.sheet, registrationId, praText_(reg.CourseID));
  } catch (error) {
    warnings.push('Confirmation email was not sent: ' + error.message);
  }
  return { ok: true, receiptNo: receipt ? receipt.receiptNo : '', receiptUrl: receipt ? receipt.pdfUrl : '', warnings: warnings };
}

function praGrantApproved_(d) {
  const registrationId = praText_(d.registrationId);
  const found = praRegistration_(registrationId);
  const reg = found.reg;
  if (praUpper_(reg.RegistrationStatus) === 'CANCELLED') throw new Error('This registration is cancelled.');
  if (praUpper_(reg.PaymentMethod) !== 'HRD') throw new Error('This is a self-payment registration. Record the payment instead.');
  const grantRef = praText_(d.grantRef);
  if (!grantRef) throw new Error('Enter the HRD Corp grant reference.');
  const approvalDate = praText_(d.approvalDate) || praToday_();

  updateRowValue(found.sheet, 'RegistrationID', registrationId, {
    GrantStatus: 'APPROVED',
    GrantRefNo: grantRef,
    GrantApprovedDate: approvalDate,
    Remarks: praText_(d.remarks)
  });

  const warnings = [];
  try {
    const program = praProgramRecord_(praText_(reg.CourseID));
    praSendConfirmation_(reg, program, 'GRANT', { grantRef: grantRef });
    praMarkConfirmationSent_(found.sheet, registrationId, praText_(reg.CourseID));
  } catch (error) {
    warnings.push('Confirmation email was not sent: ' + error.message);
  }
  return { ok: true, warnings: warnings };
}

function praResendConfirmation_(d) {
  const registrationId = praText_(d.registrationId);
  const found = praRegistration_(registrationId);
  const reg = found.reg;
  const program = praProgramRecord_(praText_(reg.CourseID));
  const isHrd = praUpper_(reg.PaymentMethod) === 'HRD';
  if (isHrd ? praUpper_(reg.GrantStatus) !== 'APPROVED' : praUpper_(reg.PaymentStatus) !== 'RECEIVED') {
    throw new Error(isHrd ? 'Record the grant approval first.' : 'Record the payment first.');
  }
  const pr = praIndex_(praRead_(praProgressSheet_()).rows, 'RegistrationID')[registrationId] || {};
  const receipt = pr.ReceiptUrl ? { receiptNo: praText_(pr.ReceiptNo), pdfUrl: praText_(pr.ReceiptUrl) } : null;
  praSendConfirmation_(reg, program, isHrd ? 'GRANT' : 'PAYMENT', { receipt: receipt, grantRef: praText_(reg.GrantRefNo), paymentDate: praIso_(reg.PaymentDate) });
  praMarkConfirmationSent_(found.sheet, registrationId, praText_(reg.CourseID));
  return { ok: true };
}

function praHrdStep_(d) {
  const registrationId = praText_(d.registrationId);
  const step = praUpper_(d.step);
  const column = PRA_HRD_STEPS_[step];
  if (!column) throw new Error('Unknown step.');
  const found = praRegistration_(registrationId);
  if (praUpper_(found.reg.PaymentMethod) !== 'HRD') throw new Error('HRD claim steps only apply to HRD Corp registrations.');
  const fields = { CourseID: praText_(found.reg.CourseID), UpdatedDate: new Date() };
  fields[column] = d.clear === true ? '' : (praText_(d.date) || praToday_());
  if (step === 'CLAIM_SUBMITTED' && d.clear !== true) {
    fields.ClaimRefNo = praText_(d.ref);
    if (d.amount !== undefined && d.amount !== '') fields.ClaimAmount = Number(d.amount) || '';
  }
  praUpsert_(praProgressSheet_(), 'RegistrationID', registrationId, fields);
  return { ok: true };
}

function praCancel_(d) {
  const registrationId = praText_(d.registrationId);
  const found = praRegistration_(registrationId);
  updateRowValue(found.sheet, 'RegistrationID', registrationId, { RegistrationStatus: 'CANCELLED', Remarks: praText_(d.remarks) });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Receipt (same layout as the Consultancy official receipt)
// ---------------------------------------------------------------------------
function praFindInvoiceNo_(reg, program) {
  const docs = praRead_(praBook_().getSheetByName('Documents')).rows;
  const company = praLower_(reg.CompanyName);
  const name = praLower_(program.ProgramName);
  const match = docs.filter(function (x) {
    const type = praUpper_(x.DocumentType || x.Type);
    return (type === 'INVOICE') && praLower_(x.CompanyName || x.Company) === company && praLower_(x.ProgramName || x.Program) === name;
  });
  if (!match.length) return '';
  const last = match[match.length - 1];
  return praText_(last.DocumentNo || last.DocumentNumber);
}

function praCreateReceipt_(reg, program, pay) {
  if (typeof bdBuild_ !== 'function' || typeof bdMarker_ !== 'function') throw new Error('The consultancy receipt template is not available in this project.');
  const invoiceNo = praFindInvoiceNo_(reg, program);
  const receiptNo = 'RC-' + (invoiceNo || praText_(reg.RegistrationID));
  const pax = Math.max(1, Number(reg.RequestedPax || 1));
  const built = bdBuild_({
    type: 'RECEIPT',
    documentId: Utilities.getUuid(),
    payload: {
      client_name: praText_(reg.CompanyName),
      client_address: praText_(reg.CompanyAddress),
      project_title: praText_(program.ProgramName),
      scope: 'Public training programme: ' + praText_(program.ProgramName) + ' (' + praProgramDate_(program) + ', ' + praText_(program.Venue) + ')' + (invoiceNo ? '. Invoice ' + invoiceNo + '.' : '.'),
      mode: praText_(program.DeliveryMode) || 'Public training',
      notes: 'Registration ' + praText_(reg.RegistrationID) + ' · ' + pax + ' participant(s)',
      payment_date: pay.paymentDate,
      payment_method: pay.method,
      payment_reference: pay.paymentRef,
      amount_received: pay.amount,
      total: pay.amount,
      lines: [{ description: praText_(program.ProgramName) + ' – ' + praProgramDate_(program), quantity: pax, unit_price: Math.round((pay.amount / pax) * 100) / 100 }]
    }
  });
  const doc = DocumentApp.openById(built.googleDocId);
  vdReplace(doc.getBody(), bdMarker_('RECEIPT'), receiptNo);
  doc.saveAndClose();
  const docFile = DriveApp.getFileById(built.googleDocId);
  const parents = docFile.getParents();
  const folder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
  const pdf = folder.createFile(docFile.getAs(MimeType.PDF)).setName('RECEIPT - ' + receiptNo + ' - ' + praText_(reg.CompanyName) + '.pdf');
  docFile.setName('RECEIPT - ' + receiptNo + ' (editable)');
  try {
    saveDocumentRecord({ documentNo: receiptNo, documentType: 'RECEIPT', companyName: praText_(reg.CompanyName), programName: praText_(program.ProgramName), amount: pay.amount, status: 'SENT', pdfLink: pdf.getUrl(), draftDocLink: docFile.getUrl() });
  } catch (error) { /* receipt still valid without the register row */ }
  return { receiptNo: receiptNo, pdfUrl: pdf.getUrl(), pdfId: pdf.getId() };
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------
function praEscape_(v) {
  return praText_(v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

function praSend_(to, subject, text, html, attachments) {
  const safeTo = typeof getSafeEmail === 'function' ? getSafeEmail(to) : to;
  const safeSubject = typeof getEmailSubject === 'function' ? getEmailSubject(subject) : subject;
  const options = { htmlBody: html, name: 'Easy Latih Consultancy' };
  if (attachments && attachments.length) options.attachments = attachments;
  GmailApp.sendEmail(safeTo, safeSubject, text, options);
}

function praSettingsFor_(courseId) {
  return praIndex_(praRead_(praSettingsSheet_()).rows, 'CourseID')[praText_(courseId)] || {};
}

// Client emails are bilingual: Bahasa Malaysia first, then English.
function praBilingualHtml_(ms, en) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">' +
    ms +
    '<hr style="border:none;border-top:1px solid #ccc;margin:24px 0">' +
    '<p style="color:#777;font-size:12px;margin:0 0 8px"><i>English version</i></p>' +
    en +
    '</div>';
}

function praBilingualText_(ms, en) {
  return ms.join('\n') + '\n\n--------------------\nEnglish version\n--------------------\n\n' + en.join('\n');
}

function praDetailsTable_(rows) {
  return '<table cellpadding="4" style="border-collapse:collapse;font-size:14px">' +
    rows.map(function (r) { return '<tr><td><b>' + praEscape_(r[0]) + '</b></td><td>' + praEscape_(r[1]) + '</td></tr>'; }).join('') +
    '</table>';
}

function praSendConfirmation_(reg, program, kind, extra) {
  extra = extra || {};
  const to = praText_(reg.PICEmail);
  if (!to) throw new Error('PIC email is empty.');
  const s = praSettingsFor_(reg.CourseID);
  const name = praText_(program.ProgramName);
  const date = praProgramDate_(program);
  const venue = praText_(program.Venue);
  const mode = praText_(program.DeliveryMode);
  const venueText = venue + (mode ? ' (' + mode + ')' : '');
  const pax = Number(reg.RequestedPax || 0);
  const regNo = praText_(reg.RegistrationID);
  const pic = praText_(reg.PICName);
  const joining = praText_(s.JoiningInstructions);
  const wa = praText_(s.WhatsAppLink);

  const msOpening = kind === 'GRANT'
    ? 'Kami telah menerima kelulusan geran HRD Corp anda' + (extra.grantRef ? ' (rujukan ' + extra.grantRef + ')' : '') + '. Pendaftaran anda telah disahkan.'
    : 'Kami telah menerima bayaran anda. Pendaftaran anda telah disahkan' + (extra.receipt ? ' dan resit rasmi dilampirkan bersama e-mel ini.' : '.');
  const enOpening = kind === 'GRANT'
    ? 'We have received your HRD Corp grant approval' + (extra.grantRef ? ' (reference ' + extra.grantRef + ')' : '') + '. Your registration is confirmed.'
    : 'We have received your payment. Your registration is confirmed' + (extra.receipt ? ' and the official receipt is attached.' : '.');

  const msRows = [['Program', name], ['Tarikh', date], ['Tempat', venueText], ['Bilangan peserta', String(pax)], ['No. pendaftaran', regNo]];
  const enRows = [['Programme', name], ['Date', date], ['Venue', venueText], ['Participants', String(pax)], ['Registration no.', regNo]];

  const msText = ['Tuan/Puan ' + pic + ',', '', msOpening, ''].concat(msRows.map(function (r) { return r[0] + ': ' + r[1]; }));
  if (joining) msText.push('', 'Arahan kehadiran:', joining);
  if (wa) msText.push('', 'Kumpulan WhatsApp program: ' + wa, 'Sila kongsikan pautan ini kepada semua peserta yang anda daftarkan supaya mereka menerima makluman terkini terus daripada kami.');
  msText.push('', 'Terima kasih.', 'Easy Latih Consultancy');

  const enText = ['Dear ' + (pic || 'Sir/Madam') + ',', '', enOpening, ''].concat(enRows.map(function (r) { return r[0] + ': ' + r[1]; }));
  if (joining) enText.push('', 'Joining instructions:', joining);
  if (wa) enText.push('', 'Programme WhatsApp group: ' + wa, 'Please share this link with all the participants you registered so they receive updates directly from us.');
  enText.push('', 'Thank you.', 'Easy Latih Consultancy', 'Easy Learning, Real Results!');

  const joiningHtml = joining ? praEscape_(joining).replace(/\n/g, '<br>') : '';
  const waButton = function (label) {
    return wa ? '<p><a href="' + praEscape_(wa) + '" style="display:inline-block;background:#25D366;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold">' + label + '</a></p>' : '';
  };
  const msHtml =
    '<p>Tuan/Puan ' + praEscape_(pic) + ',</p>' +
    '<p>' + praEscape_(msOpening) + '</p>' + praDetailsTable_(msRows) +
    (joining ? '<h3 style="margin:18px 0 6px">Arahan kehadiran</h3><p>' + joiningHtml + '</p>' : '') +
    (wa ? '<h3 style="margin:18px 0 6px">Kumpulan WhatsApp program</h3><p>Sila kongsikan pautan ini kepada <b>semua peserta yang anda daftarkan</b> supaya mereka menerima makluman terkini terus daripada kami.</p>' : '') +
    waButton('Sertai kumpulan WhatsApp program') +
    '<p>Terima kasih.<br>Easy Latih Consultancy</p>';
  const enHtml =
    '<p>Dear ' + praEscape_(pic || 'Sir/Madam') + ',</p>' +
    '<p>' + praEscape_(enOpening) + '</p>' + praDetailsTable_(enRows) +
    (joining ? '<h3 style="margin:18px 0 6px">Joining instructions</h3><p>' + joiningHtml + '</p>' : '') +
    (wa ? '<h3 style="margin:18px 0 6px">Programme WhatsApp group</h3><p>Please share this link with <b>all the participants you registered</b> so they receive updates directly from us.</p>' : '') +
    waButton('Join the programme WhatsApp group') +
    '<p>Thank you.<br>Easy Latih Consultancy<br><i>Easy Learning, Real Results!</i></p>';

  const attachments = [];
  if (extra.receipt && extra.receipt.pdfUrl) {
    const m = String(extra.receipt.pdfUrl).match(/\/d\/([a-zA-Z0-9_-]+)/);
    const id = extra.receipt.pdfId || (m ? m[1] : '');
    if (id) attachments.push(DriveApp.getFileById(id).getBlob());
  }
  praSend_(to, 'Pendaftaran disahkan / Registration confirmed – ' + name,
    praBilingualText_(msText, enText), praBilingualHtml_(msHtml, enHtml), attachments);
}

// Called from submitRegistration() after the quotation/invoice email.
// HRD registrations get this programme's grant application guideline.
function praAfterRegistration_(data, program) {
  try {
    if (praUpper_(data && data.paymentMethod) !== 'HRD') return;
    const s = praSettingsFor_(data.courseId);
    const link = praText_(s.GuidelineUrl);
    if (!link || !praText_(data.picEmail)) return;
    const name = praText_(program && program.ProgramName);
    const pic = praText_(data.picName);
    const button = function (label) {
      return '<p><a href="' + praEscape_(link) + '" style="display:inline-block;background:#003e6f;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:bold">' + label + '</a></p>';
    };

    const msText = [
      'Tuan/Puan ' + pic + ',',
      '',
      'Terima kasih kerana mendaftar untuk ' + name + '.',
      'Sebut harga yang dihantar dalam e-mel kami sebelum ini ialah lampiran untuk permohonan geran HRD Corp anda.',
      'Sila ikut panduan ini untuk memohon geran bagi program ini:',
      link,
      '',
      'Setelah geran anda diluluskan, sila balas e-mel ini bersama surat kelulusan atau nombor rujukan geran.',
      '',
      'Terima kasih.',
      'Easy Latih Consultancy'
    ];
    const enText = [
      'Dear ' + (pic || 'Sir/Madam') + ',',
      '',
      'Thank you for registering for ' + name + '.',
      'The quotation sent in our earlier email is the attachment for your HRD Corp grant application.',
      'Please follow this guide to apply for the grant for this programme:',
      link,
      '',
      'Once your grant is approved, simply reply to this email with the approval letter or grant reference.',
      '',
      'Thank you.',
      'Easy Latih Consultancy'
    ];
    const msHtml =
      '<p>Tuan/Puan ' + praEscape_(pic) + ',</p>' +
      '<p>Terima kasih kerana mendaftar untuk <b>' + praEscape_(name) + '</b>.</p>' +
      '<p>Sebut harga yang dihantar dalam e-mel kami sebelum ini ialah lampiran untuk permohonan geran HRD Corp anda. Sila ikut panduan ini untuk memohon geran bagi program ini:</p>' +
      button('Buka panduan permohonan geran HRD Corp') +
      '<p>Setelah geran anda diluluskan, sila balas e-mel ini bersama surat kelulusan atau nombor rujukan geran.</p>' +
      '<p>Terima kasih.<br>Easy Latih Consultancy</p>';
    const enHtml =
      '<p>Dear ' + praEscape_(pic || 'Sir/Madam') + ',</p>' +
      '<p>Thank you for registering for <b>' + praEscape_(name) + '</b>.</p>' +
      '<p>The quotation sent in our earlier email is the attachment for your HRD Corp grant application. Please follow this guide to apply for the grant for this programme:</p>' +
      button('Open the HRD Corp grant guide') +
      '<p>Once your grant is approved, simply reply to this email with the approval letter or grant reference.</p>' +
      '<p>Thank you.<br>Easy Latih Consultancy</p>';
    praSend_(praText_(data.picEmail), 'Panduan permohonan geran HRD Corp / HRD Corp grant application guide – ' + name,
      praBilingualText_(msText, enText), praBilingualHtml_(msHtml, enHtml));
  } catch (error) {
    console.error('Guideline email failed: ' + error.message);
  }
}

// One email on website registration: quotation (HRD) or invoice (self payment) attached,
// plus the HRD Corp grant guide, course outline and trainer profile, so the PIC has everything at once.
function praRegistrationEmail_(data, program, documentType, documentNo, pdfUrl) {
  const to = praText_(data && data.picEmail);
  if (!to) throw new Error('PIC email is empty.');
  const idMatch = String(pdfUrl || '').match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) throw new Error('PDF URL is empty.');
  const pdf = DriveApp.getFileById(idMatch[1]).getBlob();

  const hrd = documentType === 'Quotation';
  const name = praText_(program && program.ProgramName);
  const pic = praText_(data.picName);
  const s = praSettingsFor_(data.courseId);
  const guide = hrd ? praText_(s.GuidelineUrl) : '';
  const outline = praText_(program && (program.CourseContentURL || program.CourseContentUrl));
  const trainer = praText_(program && (program.TrainerProfileURL || program.TrainerProfileUrl));
  const when = praProgramDate_(program || {});
  const where = praText_(program && program.Venue);

  const button = function (href, label) {
    return '<a href="' + praEscape_(href) + '" style="display:inline-block;background:#003e6f;color:#fff;padding:9px 14px;border-radius:6px;text-decoration:none;font-weight:bold;margin:0 6px 6px 0">' + praEscape_(label) + '</a>';
  };
  const links = function (ms) {
    const out = [];
    if (outline) out.push([outline, 'Course outline']);
    if (trainer) out.push([trainer, ms ? 'Profil jurulatih' : 'Trainer profile']);
    return out;
  };
  const details = function (ms) {
    return praDetailsTable_([
      [ms ? 'Program' : 'Programme', name],
      [ms ? 'Tarikh' : 'Date', when],
      [ms ? 'Tempat' : 'Venue', where],
      [ms ? (hrd ? 'No. sebut harga' : 'No. invois') : (hrd ? 'Quotation no.' : 'Invoice no.'), praText_(documentNo)],
      [ms ? 'Bilangan peserta' : 'Participants', praText_(data.requestedPax)]
    ].filter(function (r) { return praText_(r[1]); }));
  };

  // ---- Bahasa Malaysia ----
  const msHtml = [
    '<p>Tuan/Puan ' + praEscape_(pic) + ',</p>',
    '<p>Terima kasih kerana mendaftar dengan Easy Latih Consultancy.</p>',
    details(true),
    hrd
      ? '<p><b>Sebut harga dilampirkan.</b> Semua dokumen yang diperlukan untuk permohonan geran HRD Corp ada dalam e-mel ini:</p>'
      : '<p><b>Invois dilampirkan.</b> Sila buat bayaran berdasarkan invois ini.</p>',
    links(true).length ? '<p>' + links(true).map(function (l) { return button(l[0], l[1]); }).join('') + '</p>' : '',
    guide ? '<p>Sila ikut panduan ini untuk memohon geran HRD Corp bagi program ini:</p><p>' + button(guide, 'Panduan permohonan geran HRD Corp') + '</p>' : '',
    hrd
      ? '<p>Setelah geran diluluskan, sila balas e-mel ini bersama surat kelulusan atau nombor rujukan geran.</p>'
      : '<p>Setelah bayaran dibuat, sila balas e-mel ini bersama bukti bayaran.</p>',
    '<p>Terima kasih.<br>Easy Latih Consultancy</p>'
  ].join('');
  const msText = [
    'Tuan/Puan ' + pic + ',', '',
    'Terima kasih kerana mendaftar dengan Easy Latih Consultancy.', '',
    'Program: ' + name, 'Tarikh: ' + when, 'Tempat: ' + where, (hrd ? 'No. sebut harga: ' : 'No. invois: ') + documentNo, '',
    hrd ? 'Sebut harga dilampirkan. Semua dokumen untuk permohonan geran HRD Corp ada dalam e-mel ini.' : 'Invois dilampirkan. Sila buat bayaran berdasarkan invois ini.'
  ].concat(outline ? ['Course outline: ' + outline] : [], trainer ? ['Profil jurulatih: ' + trainer] : [], guide ? ['Panduan permohonan geran HRD Corp: ' + guide] : [], [
    '',
    hrd ? 'Setelah geran diluluskan, sila balas e-mel ini bersama surat kelulusan atau nombor rujukan geran.' : 'Setelah bayaran dibuat, sila balas e-mel ini bersama bukti bayaran.',
    '', 'Terima kasih.', 'Easy Latih Consultancy'
  ]);

  // ---- English ----
  const enHtml = [
    '<p>Dear ' + praEscape_(pic || 'Sir/Madam') + ',</p>',
    '<p>Thank you for registering with Easy Latih Consultancy.</p>',
    details(false),
    hrd
      ? '<p><b>The quotation is attached.</b> Everything you need for the HRD Corp grant application is in this email:</p>'
      : '<p><b>The invoice is attached.</b> Please make payment based on this invoice.</p>',
    links(false).length ? '<p>' + links(false).map(function (l) { return button(l[0], l[1]); }).join('') + '</p>' : '',
    guide ? '<p>Please follow this guide to apply for the HRD Corp grant for this programme:</p><p>' + button(guide, 'HRD Corp grant application guide') + '</p>' : '',
    hrd
      ? '<p>Once your grant is approved, simply reply to this email with the approval letter or grant reference.</p>'
      : '<p>Once payment is made, simply reply to this email with the proof of payment.</p>',
    '<p>Thank you.<br>Easy Latih Consultancy<br><i>Easy Learning, Real Results!</i></p>'
  ].join('');
  const enText = [
    'Dear ' + (pic || 'Sir/Madam') + ',', '',
    'Thank you for registering with Easy Latih Consultancy.', '',
    'Programme: ' + name, 'Date: ' + when, 'Venue: ' + where, (hrd ? 'Quotation no.: ' : 'Invoice no.: ') + documentNo, '',
    hrd ? 'The quotation is attached. Everything you need for the HRD Corp grant application is in this email.' : 'The invoice is attached. Please make payment based on this invoice.'
  ].concat(outline ? ['Course outline: ' + outline] : [], trainer ? ['Trainer profile: ' + trainer] : [], guide ? ['HRD Corp grant application guide: ' + guide] : [], [
    '',
    hrd ? 'Once your grant is approved, simply reply to this email with the approval letter or grant reference.' : 'Once payment is made, simply reply to this email with the proof of payment.',
    '', 'Thank you.', 'Easy Latih Consultancy', 'Easy Learning, Real Results!'
  ]);

  const subject = (hrd ? 'Sebut Harga / Quotation' : 'Invois / Invoice') + ' – ' + name;
  praSend_(to, subject, praBilingualText_(msText, enText), praBilingualHtml_(msHtml, enHtml), [pdf]);
}

// ---------------------------------------------------------------------------
// Participant list
// ---------------------------------------------------------------------------
function praParticipantRows_(courseId) {
  const detail = praProgramDetail_(courseId);
  const rows = [];
  detail.registrations.forEach(function (r) {
    if (r.stage.key === 'CANCELLED') return;
    r.participants.forEach(function (p) {
      rows.push([p.name, p.icNo, p.email, p.phone, r.companyName, r.picName, r.picEmail, r.picPhone, r.paymentMethod, r.stage.label, r.registrationId]);
    });
  });
  return { detail: detail, rows: rows };
}

function praCsv_(rows) {
  return rows.map(function (r) {
    return r.map(function (v) { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
  }).join('\n');
}

function praAdminEmail_() {
  // Uses the admin list in Code.gs, so no extra Google permission is needed.
  return typeof TRAINER_ADMIN_EMAILS !== 'undefined' && TRAINER_ADMIN_EMAILS.length ? TRAINER_ADMIN_EMAILS[0] : 'admin@easylatih.my';
}

function praEmailParticipantList_(courseId) {
  const built = praParticipantRows_(courseId);
  const p = built.detail.program;
  const regs = built.detail.registrations.filter(function (r) { return r.stage.key !== 'CANCELLED'; });
  const pax = regs.reduce(function (n, r) { return n + r.requestedPax; }, 0);
  const confirmedPax = regs.filter(function (r) { return ['AWAITING_PAYMENT', 'AWAITING_GRANT'].indexOf(r.stage.key) === -1; }).reduce(function (n, r) { return n + r.requestedPax; }, 0);
  const verdict = p.minPax ? (pax >= p.minPax ? 'Minimum pax met (' + pax + ' of ' + p.minPax + ').' : 'Below minimum: ' + pax + ' registered, minimum ' + p.minPax + '.') : pax + ' registered (no minimum set).';
  const header = ['Participant', 'IC / Passport', 'Email', 'Phone', 'Company', 'PIC', 'PIC email', 'PIC phone', 'Payment', 'Stage', 'Registration'];
  const csv = praCsv_([header].concat(built.rows));
  const blob = Utilities.newBlob(csv, 'text/csv', 'Participants - ' + p.programName + ' - ' + praToday_() + '.csv');
  const text = [
    'Participant list for ' + p.programName + ' (' + p.programDate + ').',
    verdict,
    'Confirmed (paid or grant approved): ' + confirmedPax + ' pax.',
    'Registrations: ' + regs.length + ' companies, ' + built.rows.length + ' participants listed.',
    '',
    'The full list is attached as a CSV file.'
  ].join('\n');
  praSend_(praAdminEmail_(), 'Participant list – ' + p.programName, text, '<p>' + praEscape_(text).replace(/\n/g, '<br>') + '</p>', [blob]);
  praUpsert_(praSettingsSheet_(), 'CourseID', courseId, { ParticipantListSentDate: new Date(), UpdatedDate: new Date() });
  return { ok: true, participants: built.rows.length, pax: pax, verdict: verdict };
}

// Daily: email the participant list once a programme's registration has closed.
function publicRegistrationDailyCheck() {
  const today = praToday_();
  praPrograms_().forEach(function (p) {
    if (!p.closeDate || p.closeDate > today) return;
    if (p.participantListSentDate) return;
    if (['CANCELLED', 'DRAFT', 'DECLINED', 'COMPLETED'].indexOf(p.status) !== -1) return;
    try { praEmailParticipantList_(p.courseId); } catch (error) { console.error('Participant list for ' + p.courseId + ' failed: ' + error.message); }
  });
}

// Run once from the editor.
function installPublicRegistrationDailyCheck() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'publicRegistrationDailyCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('publicRegistrationDailyCheck').timeBased().everyDays(1).atHour(7).inTimezone(PRA_TZ_).create();
  return 'Daily participant-list check installed (7am Kuala Lumpur).';
}

// ---------------------------------------------------------------------------
// Archive
// ---------------------------------------------------------------------------
function praMoveRows_(sourceName, matchFn) {
  const book = praBook_();
  const source = book.getSheetByName(sourceName);
  if (!source || source.getLastRow() < 2) return 0;
  const values = source.getDataRange().getValues();
  const headers = values[0].map(function (h) { return praText_(h); });
  const picked = [];
  for (let i = values.length - 1; i >= 1; i--) {
    const row = {};
    headers.forEach(function (h, j) { if (h) row[h] = values[i][j]; });
    if (matchFn(row)) picked.push({ index: i + 1, values: values[i] });
  }
  if (!picked.length) return 0;

  const archiveName = sourceName + '_Archive';
  let archive = book.getSheetByName(archiveName);
  if (!archive) {
    archive = book.insertSheet(archiveName);
    archive.getRange(1, 1, 1, headers.length + 1).setValues([headers.concat(['ArchivedDate'])]);
  }
  const archiveHeaders = praSheet_(archiveName, headers.filter(Boolean).concat(['ArchivedDate']))
    .getRange(1, 1, 1, archive.getLastColumn()).getValues()[0].map(function (h) { return praText_(h); });
  const now = new Date();
  const out = picked.slice().reverse().map(function (p) {
    return archiveHeaders.map(function (h) {
      if (h === 'ArchivedDate') return now;
      const j = headers.indexOf(h);
      return j === -1 ? '' : p.values[j];
    });
  });
  archive.getRange(archive.getLastRow() + 1, 1, out.length, archiveHeaders.length).setValues(out);
  SpreadsheetApp.flush();
  picked.forEach(function (p) { source.deleteRow(p.index); });
  return picked.length;
}

function praArchive_(courseId, force) {
  if (!courseId) throw new Error('Choose a programme.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const program = praProgramRecord_(courseId);
    const summary = praPrograms_().filter(function (p) { return p.courseId === courseId; })[0];
    if (summary && !summary.archivable && !force) {
      throw new Error('Some registrations are not completed yet. Finish them, cancel them, or choose "Archive anyway".');
    }
    const ids = {};
    praRead_(praBook_().getSheetByName('Registrations')).rows.forEach(function (r) {
      if (praText_(r.CourseID) === courseId) ids[praText_(r.RegistrationID)] = true;
    });
    const movedRegs = praMoveRows_('Registrations', function (r) { return praText_(r.CourseID) === courseId; });
    const movedPeople = praMoveRows_('Participants', function (r) { return praText_(r.CourseID) === courseId; });
    const movedProgress = praMoveRows_(PRA_PROGRESS_SHEET_, function (r) { return ids[praText_(r.RegistrationID)] === true || praText_(r.CourseID) === courseId; });
    praUpsert_(praSettingsSheet_(), 'CourseID', courseId, { ArchivedDate: new Date(), UpdatedDate: new Date() });
    const status = praUpper_(program.Status);
    if (status !== 'CANCELLED' && status !== 'COMPLETED') {
      updateRowValue(praBook_().getSheetByName('Programs'), 'CourseID', courseId, { Status: 'COMPLETED', UpdatedDate: new Date() });
    }
    return { ok: true, registrations: movedRegs, participants: movedPeople, progress: movedProgress };
  } finally {
    lock.releaseLock();
  }
}

function praArchivedPrograms_() {
  const book = praBook_();
  const settings = praRead_(praSettingsSheet_()).rows.filter(function (s) { return praText_(s.ArchivedDate); });
  const programs = praIndex_(praRead_(book.getSheetByName('Programs')).rows, 'CourseID');
  const regs = praRead_(book.getSheetByName('Registrations_Archive')).rows;
  return settings.map(function (s) {
    const id = praText_(s.CourseID);
    const p = programs[id] || {};
    const list = regs.filter(function (r) { return praText_(r.CourseID) === id && praUpper_(r.RegistrationStatus) !== 'CANCELLED'; });
    return {
      courseId: id,
      programName: praText_(p.ProgramName) || id,
      programDate: p.StartDate ? praProgramDate_(p) : '',
      archivedDate: praIso_(s.ArchivedDate),
      companies: list.length,
      pax: list.reduce(function (n, r) { return n + Number(r.RequestedPax || 0); }, 0)
    };
  }).sort(function (a, b) { return String(b.archivedDate).localeCompare(String(a.archivedDate)); });
}

// ---------------------------------------------------------------------------
// Former clients (active + archived registrations), for upselling
// ---------------------------------------------------------------------------
function praFormerClients_(query) {
  const book = praBook_();
  const programs = praIndex_(praRead_(book.getSheetByName('Programs')).rows, 'CourseID');
  const regs = praRead_(book.getSheetByName('Registrations')).rows
    .concat(praRead_(book.getSheetByName('Registrations_Archive')).rows)
    .filter(function (r) { return praText_(r.RegistrationID) && praUpper_(r.RegistrationStatus) !== 'CANCELLED'; });
  const q = praLower_(query);
  const companies = {};
  regs.forEach(function (r) {
    const key = praLower_(r.CompanyName).replace(/\s+/g, ' ').replace(/\b(sdn\.?\s*bhd\.?|bhd\.?|plt|enterprise)\b/g, '').trim() || praLower_(r.PICEmail);
    if (!key) return;
    const p = programs[praText_(r.CourseID)] || {};
    const c = companies[key] = companies[key] || { companyName: praText_(r.CompanyName), address: praText_(r.CompanyAddress), contacts: {}, programmes: [], pax: 0, lastDate: '', hrd: 0, self: 0 };
    const email = praLower_(r.PICEmail);
    if (email || praText_(r.PICName)) c.contacts[email || praLower_(r.PICName)] = { name: praText_(r.PICName), position: praText_(r.PICPosition), email: praText_(r.PICEmail), phone: praText_(r.PICPhone) };
    const start = praIso_(p.StartDate) || praIso_(r.Timestamp || r.CreatedDate || r.RegistrationDate);
    c.programmes.push({ courseId: praText_(r.CourseID), programName: praText_(p.ProgramName) || praText_(r.CourseID), date: start, pax: Number(r.RequestedPax || 0), payment: praUpper_(r.PaymentMethod) === 'HRD' ? 'HRD' : 'SELF' });
    c.pax += Number(r.RequestedPax || 0);
    if (praUpper_(r.PaymentMethod) === 'HRD') c.hrd++; else c.self++;
    if (start > c.lastDate) c.lastDate = start;
  });
  let list = Object.keys(companies).map(function (k) {
    const c = companies[k];
    c.contacts = Object.keys(c.contacts).map(function (x) { return c.contacts[x]; });
    c.programmes.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return c;
  });
  if (q) {
    list = list.filter(function (c) {
      const hay = [c.companyName, c.address].concat(c.contacts.map(function (x) { return [x.name, x.email, x.phone].join(' '); }), c.programmes.map(function (x) { return x.programName; })).join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    });
  }
  list.sort(function (a, b) { return String(b.lastDate).localeCompare(String(a.lastDate)); });
  return { total: list.length, clients: list.slice(0, 300) };
}

// Read-only check you can run from the editor: lists what the Admin Centre will see.
function praSelfTest() {
  const programmes = praPrograms_();
  console.log('Programmes shown: ' + programmes.length);
  programmes.slice(0, 5).forEach(function (p) {
    console.log(p.courseId + ' | ' + p.programName + ' | ' + p.status + ' | pax ' + p.counts.pax + ' | min ' + p.minPax + ' | closes ' + p.closeDate);
  });
  if (programmes.length) {
    const d = praProgramDetail_(programmes[0].courseId);
    console.log('First programme registrations: ' + d.registrations.length + ', participants linked: ' + d.registrations.reduce(function (n, r) { return n + r.participants.length; }, 0));
    d.registrations.slice(0, 5).forEach(function (r) { console.log('  ' + r.registrationId + ' | ' + r.paymentMethod + ' | ' + r.stage.label); });
  }
  console.log('Former clients: ' + praFormerClients_('').total);
  console.log('Receipt template available: ' + (typeof bdBuild_ === 'function'));
}


// ---------------------------------------------------------------------------
// Appendices generator (Admin Centre → Appendices)
// Returns the Programs-sheet fields the eTRiS Appendices A–R are built from.
// Read only; nothing is written.
// ---------------------------------------------------------------------------
function praAppendixSource_(courseId) {
  if (!courseId) throw new Error('Choose a programme.');
  const p = praProgramRecord_(courseId);
  return {
    courseId: courseId,
    programName: praText_(p.ProgramName),
    startDate: praIso_(p.StartDate),
    endDate: praIso_(p.EndDate),
    programType: praUpper_(p.ProgramType),
    category: praText_(p.Category),
    hrdFee: Number(p.HRDFee || 0),
    selfFee: Number(p.SelfFee || 0),
    duration: praText_(p.Duration),
    totalTime: praText_(p.TotalTime),
    venue: praText_(p.Venue),
    state: praText_(p.State),
    deliveryMode: praText_(p.DeliveryMode),
    courseContentUrl: praText_(p.CourseContentURL),
    trainerProfileUrl: praText_(p.TrainerProfileURL || p.TrainerProfileUrl)
  };
}
