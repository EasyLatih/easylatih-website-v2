/**
 * EasyLatih free public programmes: registration that waits for admin approval.
 *
 * Add this as a NEW file in the "EasyLatih Management System V2 - STAGING"
 * project, next to PublicRegistrationAdmin.gs and AdminToolsBridge.gs.
 * Code.gs does not change: the website sends free registrations through the
 * existing adminTools hook as action "adminTools.publicFreeRegister", which
 * AdminToolsBridge.gs passes here without an admin sign-in.
 *
 * A programme is FREE when its self-payment fee is RM0 and it has no HRD fee
 * (or is non-HRD claimable). No quotation or invoice is made.
 *
 * Flow:
 *   1. Website registration -> Registrations row with PaymentMethod FREE,
 *      RegistrationStatus PENDING. The PIC gets a bilingual "registration
 *      received, awaiting confirmation" email; the admin gets a short notice.
 *   2. Admin Centre -> Registrations -> Approve: RegistrationStatus CONFIRMED,
 *      PaymentStatus FREE, confirmation email with joining instructions.
 *   3. Admin Centre -> Registrations -> Reject: RegistrationStatus CANCELLED,
 *      PaymentStatus REJECTED, a polite email to the PIC.
 */

const FREE_REG_PUBLIC_ACTION_ = 'publicFreeRegister';

function isFreeProgramme_(p) {
  if (praText_(p.SelfFee) === '') return false; // fee not set yet is not the same as free
  const self = Number(p.SelfFee || 0);
  const hrd = Number(p.HRDFee || 0);
  const hrdClaimable = typeof regV2HrdClaimable_ === 'function'
    ? regV2HrdClaimable_(p.HRDClaimable)
    : ['FALSE', 'NO', 'N', '0'].indexOf(praUpper_(p.HRDClaimable)) === -1;
  return self === 0 && (!hrdClaimable || hrd === 0);
}

// Entry from handleAdminTools_ (no admin token needed for this one action).
function freeRegistrationPublic_(params) {
  let payload = {};
  try { payload = JSON.parse(params.payload || '{}') || {}; } catch (e) { throw new Error('Registration data could not be read.'); }
  let participants = [];
  try { participants = JSON.parse(payload.participantsJson || '[]'); } catch (e) { throw new Error('Participant data is invalid.'); }
  const data = {
    courseId: praText_(payload.courseId),
    companyName: praText_(payload.companyName),
    companyAddress: praText_(payload.companyAddress),
    picName: praText_(payload.picName),
    picPosition: praText_(payload.picPosition),
    picEmail: praText_(payload.picEmail),
    picPhone: praText_(payload.picPhone),
    paymentMethod: 'FREE',
    participants: (Array.isArray(participants) ? participants : []).filter(function (x) { return x && praText_(x.name); })
  };
  const submit = function (d) { return freeRegistrationSubmit_(d); };
  if (typeof withRegistrationGuard_ === 'function') return withRegistrationGuard_(data, praText_(payload.submissionId), submit);
  return submit(data);
}

function freeRegistrationSubmit_(data) {
  if (!data.courseId) throw new Error('Course ID is required.');
  if (!data.companyName) throw new Error('Company / organisation name is required.');
  if (!data.picEmail) throw new Error('PIC email is required.');
  if (!data.participants.length) throw new Error('At least one participant is required.');

  const book = praBook_();
  const program = findRowByValue(book.getSheetByName('Programs'), 'CourseID', data.courseId);
  if (!program || praUpper_(program.ProgramType) === 'INHOUSE') throw new Error('Programme not found or not open for public registration.');
  if (!isFreeProgramme_(program)) throw new Error('This programme is not free. Please choose a payment method.');
  if (!praFlag_(program.IsActive)) throw new Error('Registration is currently unavailable.');
  if (['CANCELLED', 'DECLINED', 'COMPLETED', 'DRAFT'].indexOf(praUpper_(program.Status)) !== -1) throw new Error('Registration is currently unavailable.');
  const today = praToday_();
  const close = praIso_(program.RegistrationCloseDate);
  if (close && close < today) throw new Error('Registration is closed.');
  const start = praIso_(program.StartDate);
  if (start && start < today) throw new Error('Registration is closed because the programme has started.');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  let registrationId;
  try {
    const regsSheet = book.getSheetByName('Registrations');
    const maxPax = Number(program.MaxPax || 0);
    if (maxPax > 0) {
      const approved = praRead_(regsSheet).rows.filter(function (r) {
        return praText_(r.CourseID) === data.courseId && praUpper_(r.RegistrationStatus) === 'CONFIRMED';
      }).reduce(function (n, r) { return n + Number(r.RequestedPax || 0); }, 0);
      if (approved >= maxPax) throw new Error('Registration is full.');
    }

    registrationId = freeNextRegistrationId_(book);
    const now = new Date();
    freeAppendByHeaders_(regsSheet, {
      RegistrationID: registrationId,
      DateCreated: now,
      CourseID: data.courseId,
      ProgramType: 'PUBLIC',
      CompanyName: data.companyName,
      CompanyAddress: data.companyAddress,
      PICName: data.picName,
      PICPosition: data.picPosition,
      PICEmail: data.picEmail,
      PICPhone: data.picPhone,
      PaymentMethod: 'FREE',
      RequestedPax: data.participants.length,
      DiscountCode: '',
      DiscountAmount: 0,
      TermsAccepted: 'YES',
      RegistrationStatus: 'PENDING',
      PaymentStatus: '',
      Remarks: 'Free programme: awaiting admin approval',
      Status: 'ACTIVE'
    });

    const peopleSheet = book.getSheetByName('Participants');
    data.participants.forEach(function (person) {
      freeAppendByHeaders_(peopleSheet, {
        ParticipantName: praText_(person.name),
        ICNo: praText_(person.icNo),
        Email: praText_(person.email),
        PICName: data.picName,
        PICEmail: data.picEmail,
        Phone: praText_(person.phone),
        CourseID: data.courseId,
        AttendanceStatus: 'REGISTERED',
        ProgramName: program.ProgramName,
        Venue: program.Venue,
        ProgramStartDate: program.StartDate || '',
        ProgramEndDate: program.EndDate || ''
      });
    });
  } finally {
    lock.releaseLock();
  }

  try { freeSendReceived_(data, program, registrationId); } catch (e) { console.error('Free registration email failed: ' + e.message); }
  try { freeNotifyAdmin_(data, program, registrationId); } catch (e) { console.error('Free registration admin notice failed: ' + e.message); }

  return {
    registrationId: registrationId,
    message: 'Pendaftaran diterima, menunggu pengesahan. / Registration received, awaiting confirmation. Reference: ' + registrationId
  };
}

// Same running number as the website registration (RunningNumbers row "REGISTRATION").
function freeNextRegistrationId_(book) {
  if (typeof nextRegistrationIdV2_ === 'function') return nextRegistrationIdV2_(book);
  const sheet = book.getSheetByName('RunningNumbers');
  if (!sheet) throw new Error('RunningNumbers sheet is missing.');
  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  const month = Number(Utilities.formatDate(now, PRA_TZ_, 'M'));
  const yy = Utilities.formatDate(now, PRA_TZ_, 'yy');
  let row = -1;
  for (let i = 1; i < rows.length; i++) {
    if (praUpper_(rows[i][0]) === 'REGISTRATION') { row = i + 1; break; }
  }
  if (row < 0) {
    row = sheet.getLastRow() + 1;
    sheet.getRange(row, 1, 1, 3).setValues([['REGISTRATION', 0, month]]);
  }
  const last = Number(sheet.getRange(row, 2).getValue() || 0);
  const lastMonth = Number(sheet.getRange(row, 3).getValue() || 0);
  const next = lastMonth === month ? last + 1 : 1;
  sheet.getRange(row, 2, 1, 2).setValues([[next, month]]);
  return 'REG' + yy + '/' + String(month).padStart(2, '0') + '-' + String(next).padStart(4, '0');
}

function freeAppendByHeaders_(sheet, record) {
  if (!sheet) throw new Error('Sheet is missing.');
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return praText_(h); });
  sheet.appendRow(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(record, h) ? record[h] : ''; }));
}

function freeDetailsRows_(program, registrationId, pax) {
  const venue = praText_(program.Venue) + (praText_(program.DeliveryMode) ? ' (' + praText_(program.DeliveryMode) + ')' : '');
  return {
    ms: [['Program', praText_(program.ProgramName)], ['Tarikh', praProgramDate_(program)], ['Tempat', venue], ['Bilangan peserta', String(pax)], ['No. pendaftaran', registrationId]],
    en: [['Programme', praText_(program.ProgramName)], ['Date', praProgramDate_(program)], ['Venue', venue], ['Participants', String(pax)], ['Registration no.', registrationId]]
  };
}

function freeSendReceived_(data, program, registrationId) {
  const pic = data.picName;
  const name = praText_(program.ProgramName);
  const rows = freeDetailsRows_(program, registrationId, data.participants.length);
  const msLead = 'Terima kasih kerana mendaftar untuk program percuma ' + name + '. Pendaftaran anda telah diterima dan sedang menunggu pengesahan daripada pihak kami.';
  const msNext = 'Kami akan menghantar e-mel pengesahan beserta arahan kehadiran sebaik sahaja pendaftaran anda diluluskan. Tiada sebarang bayaran dikenakan.';
  const enLead = 'Thank you for registering for the free programme ' + name + '. Your registration has been received and is awaiting our confirmation.';
  const enNext = 'We will email you a confirmation with joining instructions once your registration is approved. There is no fee for this programme.';

  const msText = ['Tuan/Puan ' + pic + ',', '', msLead, ''].concat(rows.ms.map(function (r) { return r[0] + ': ' + r[1]; }), ['', msNext, '', 'Terima kasih.', 'Easy Latih Consultancy']);
  const enText = ['Dear ' + (pic || 'Sir/Madam') + ',', '', enLead, ''].concat(rows.en.map(function (r) { return r[0] + ': ' + r[1]; }), ['', enNext, '', 'Thank you.', 'Easy Latih Consultancy', 'Easy Learning, Real Results!']);
  const msHtml = '<p>Tuan/Puan ' + praEscape_(pic) + ',</p><p>' + praEscape_(msLead) + '</p>' + praDetailsTable_(rows.ms) + '<p>' + praEscape_(msNext) + '</p><p>Terima kasih.<br>Easy Latih Consultancy</p>';
  const enHtml = '<p>Dear ' + praEscape_(pic || 'Sir/Madam') + ',</p><p>' + praEscape_(enLead) + '</p>' + praDetailsTable_(rows.en) + '<p>' + praEscape_(enNext) + '</p><p>Thank you.<br>Easy Latih Consultancy<br><i>Easy Learning, Real Results!</i></p>';
  praSend_(data.picEmail, 'Pendaftaran diterima, menunggu pengesahan / Registration received, awaiting confirmation – ' + name,
    praBilingualText_(msText, enText), praBilingualHtml_(msHtml, enHtml));
}

function freeNotifyAdmin_(data, program, registrationId) {
  const text = [
    'New registration for a FREE programme, waiting for your approval.',
    '',
    'Programme: ' + praText_(program.ProgramName) + ' (' + praProgramDate_(program) + ')',
    'Registration: ' + registrationId,
    'Company: ' + data.companyName,
    'PIC: ' + data.picName + ' · ' + data.picEmail + ' · ' + data.picPhone,
    'Participants: ' + data.participants.length,
    '',
    'Approve or reject in Admin Centre → Registrations: https://www.easylatih.my/admin'
  ].join('\n');
  praSend_(praAdminEmail_(), 'Free registration to approve – ' + praText_(program.ProgramName), text, '<p>' + praEscape_(text).replace(/\n/g, '<br>') + '</p>');
}

// Admin Centre action: { registrationId, decision: 'APPROVE' | 'REJECT', remarks }
function freeRegistrationDecision_(d) {
  const registrationId = praText_(d.registrationId);
  const found = praRegistration_(registrationId);
  const reg = found.reg;
  if (praUpper_(reg.PaymentMethod) !== 'FREE') throw new Error('Approve and reject only apply to free programme registrations.');
  if (praUpper_(reg.RegistrationStatus) === 'CANCELLED') throw new Error('This registration is already cancelled or rejected.');
  const decision = praUpper_(d.decision);
  const remarks = praText_(d.remarks);
  const program = praProgramRecord_(praText_(reg.CourseID));
  const warnings = [];

  if (decision === 'APPROVE') {
    if (praUpper_(reg.RegistrationStatus) === 'CONFIRMED') throw new Error('This registration is already approved.');
    updateRowValue(found.sheet, 'RegistrationID', registrationId, {
      RegistrationStatus: 'CONFIRMED',
      PaymentStatus: 'FREE',
      Remarks: remarks || 'Free programme: approved ' + praToday_()
    });
    try {
      praSendConfirmation_(reg, program, 'FREE', {});
      praMarkConfirmationSent_(found.sheet, registrationId, praText_(reg.CourseID));
    } catch (error) {
      warnings.push('Confirmation email was not sent: ' + error.message);
    }
    return { ok: true, decision: 'APPROVED', warnings: warnings };
  }

  if (decision === 'REJECT') {
    updateRowValue(found.sheet, 'RegistrationID', registrationId, {
      RegistrationStatus: 'CANCELLED',
      PaymentStatus: 'REJECTED',
      Remarks: 'Not approved' + (remarks ? ': ' + remarks : '')
    });
    if (d.notify !== false) {
      try { freeSendRejected_(reg, program, remarks); } catch (error) { warnings.push('Email to the PIC was not sent: ' + error.message); }
    }
    return { ok: true, decision: 'REJECTED', warnings: warnings };
  }

  throw new Error('Choose Approve or Reject.');
}

function freeSendRejected_(reg, program, reason) {
  const pic = praText_(reg.PICName);
  const name = praText_(program.ProgramName);
  const regNo = praText_(reg.RegistrationID);
  const msLead = 'Terima kasih atas minat anda terhadap program ' + name + ' (No. pendaftaran ' + regNo + '). Dukacita dimaklumkan bahawa kami tidak dapat mengesahkan pendaftaran anda bagi sesi ini.';
  const enLead = 'Thank you for your interest in ' + name + ' (registration no. ' + regNo + '). We regret that we are unable to confirm your registration for this session.';
  const msWhy = reason ? 'Sebab: ' + reason : '';
  const enWhy = reason ? 'Reason: ' + reason : '';
  const msEnd = 'Kami akan memaklumkan anda tentang program akan datang. Terima kasih.';
  const enEnd = 'We will keep you informed about upcoming programmes. Thank you.';
  const msText = ['Tuan/Puan ' + pic + ',', '', msLead].concat(msWhy ? ['', msWhy] : [], ['', msEnd, 'Easy Latih Consultancy']);
  const enText = ['Dear ' + (pic || 'Sir/Madam') + ',', '', enLead].concat(enWhy ? ['', enWhy] : [], ['', enEnd, 'Easy Latih Consultancy', 'Easy Learning, Real Results!']);
  const msHtml = '<p>Tuan/Puan ' + praEscape_(pic) + ',</p><p>' + praEscape_(msLead) + '</p>' + (msWhy ? '<p>' + praEscape_(msWhy) + '</p>' : '') + '<p>' + praEscape_(msEnd) + '<br>Easy Latih Consultancy</p>';
  const enHtml = '<p>Dear ' + praEscape_(pic || 'Sir/Madam') + ',</p><p>' + praEscape_(enLead) + '</p>' + (enWhy ? '<p>' + praEscape_(enWhy) + '</p>' : '') + '<p>' + praEscape_(enEnd) + '<br>Easy Latih Consultancy<br><i>Easy Learning, Real Results!</i></p>';
  praSend_(praText_(reg.PICEmail), 'Status pendaftaran / Registration status – ' + name,
    praBilingualText_(msText, enText), praBilingualHtml_(msHtml, enHtml));
}
