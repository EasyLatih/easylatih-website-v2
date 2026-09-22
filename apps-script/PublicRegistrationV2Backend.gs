/**
 * EasyLatih Public Registration Backend — V2
 *
 * Deploy this in the EXISTING Apps Script project used by:
 * https://www.easylatih.my/registration?course=...
 *
 * Keep the existing Web App deployment URL so old registration links continue to work.
 *
 * Source of truth:
 * EasyLatih Master Database V2 - STAGING
 */
const EASYLATIH_REG_V2_DATABASE_ID_ = '1W6mLl9U2xdlfrlWHTs7VYmmRk34BcfaKTBo7gJatGsc';
const EASYLATIH_REG_V2_TZ_ = 'Asia/Kuala_Lumpur';
const EASYLATIH_REG_V2_DETAILS_CACHE_SECONDS_ = 60;

function doGet(e) {
  const action = regV2String_(e && e.parameter && e.parameter.action);
  const callback = regV2String_(e && e.parameter && e.parameter.callback);

  try {
    if (action === 'getProgramDetails') {
      const courseId = regV2String_(e.parameter.course);
      return regV2Jsonp_(getProgramDetailsV2_(courseId), callback);
    }

    if (action === 'validatePromoCode') {
      const courseId = regV2String_(e.parameter.course);
      const promoCode = regV2String_(e.parameter.promoCode);
      return regV2Jsonp_(validatePromoCodeV2_(courseId, promoCode), callback);
    }

    return regV2Jsonp_({ error: 'Unsupported action.' }, callback);
  } catch (err) {
    return regV2Jsonp_({ error: err && err.message ? err.message : String(err) }, callback);
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const p = (e && e.parameter) || {};

    const courseId = regV2String_(p.courseId);
    const companyName = regV2String_(p.companyName);
    const companyAddress = regV2String_(p.companyAddress);
    const picName = regV2String_(p.picName);
    const picPosition = regV2String_(p.picPosition);
    const picEmail = regV2String_(p.picEmail);
    const picPhone = regV2String_(p.picPhone);
    const paymentMethod = regV2String_(p.paymentMethod).toUpperCase();

    if (!courseId) throw new Error('Course ID is required.');
    if (!companyName) throw new Error('Company name is required.');
    if (!picEmail) throw new Error('PIC email is required.');
    if (paymentMethod !== 'HRD' && paymentMethod !== 'SELF') {
      throw new Error('Invalid payment method.');
    }

    let participants = [];
    try {
      participants = JSON.parse(p.participantsJson || '[]');
    } catch (_) {
      throw new Error('Participant data is invalid.');
    }

    participants = Array.isArray(participants)
      ? participants.filter(x => x && regV2String_(x.name))
      : [];

    if (!participants.length) throw new Error('At least one participant is required.');

    const ss = SpreadsheetApp.openById(EASYLATIH_REG_V2_DATABASE_ID_);
    const program = findProgramV2_(ss, courseId, true);

    if (!program) throw new Error('Programme not found or not available for public registration.');

    const hrdClaimable = regV2HrdClaimable_(program.HRDClaimable);
    if (paymentMethod === 'HRD' && !hrdClaimable) {
      throw new Error('This programme is non-HRD claimable. Please select Self Payment.');
    }

    const availability = getRegistrationAvailabilityV2_(ss, program);
    if (!availability.registrationOpen) {
      if (availability.programmeStarted) throw new Error('Registration is closed because the programme has started.');
      if (availability.isFull) throw new Error('Registration is full.');
      if (availability.registrationClosed) throw new Error('Registration is closed.');
      throw new Error('Registration is currently unavailable.');
    }

    if (
      availability.maxPax > 0 &&
      participants.length > availability.remainingSeats
    ) {
      throw new Error('Only ' + availability.remainingSeats + ' seat(s) remaining.');
    }

    const submittedPromoCode = regV2String_(p.discountCode);
    let promo = {
      valid: false,
      discountAmount: 0,
      promoCode: '',
      agentId: '',
      agentName: ''
    };

    if (submittedPromoCode) {
      promo = validatePromoCodeV2_(courseId, submittedPromoCode, ss);
      if (!promo.valid) throw new Error(promo.message || 'Promo code is invalid.');
    }

    const registrationId = nextRegistrationIdV2_(ss);
    const now = new Date();

    const registrationsSheet = ss.getSheetByName('Registrations');
    if (!registrationsSheet) throw new Error('Registrations sheet is missing.');

    appendByHeadersV2_(registrationsSheet, {
      RegistrationID: registrationId,
      DateCreated: now,
      CourseID: courseId,
      ProgramType: 'PUBLIC',
      CompanyName: companyName,
      CompanyAddress: companyAddress,
      PICName: picName,
      PICPosition: picPosition,
      PICEmail: picEmail,
      PICPhone: picPhone,
      PaymentMethod: paymentMethod,
      RequestedPax: participants.length,
      DiscountCode: promo.promoCode || '',
      DiscountAmount: Number(promo.discountAmount || 0),
      TermsAccepted: 'YES',
      RegistrationStatus: 'PENDING',
      GrantStatus: '',
      GrantRefNo: '',
      GrantApprovedDate: '',
      PaymentStatus: '',
      PaymentDate: '',
      PaymentRefNo: '',
      Remarks: promo.agentId
        ? 'Promo Agent: ' + promo.agentId + (promo.agentName ? ' - ' + promo.agentName : '')
        : '',
      Status: 'ACTIVE',
      ConfirmationEmailStatus: '',
      ConfirmationEmailSentDate: '',
      CancellationEmailStatus: '',
      CancellationEmailSentDate: ''
    });

    const participantsSheet = ss.getSheetByName('Participants');
    if (!participantsSheet) throw new Error('Participants sheet is missing.');

    participants.forEach(person => {
      appendByHeadersV2_(participantsSheet, {
        ParticipantName: regV2String_(person.name),
        ICNo: regV2String_(person.icNo),
        Email: regV2String_(person.email),
        PICName: picName,
        PICEmail: picEmail,
        Phone: regV2String_(person.phone),
        CourseID: courseId,
        AttendanceStatus: 'REGISTERED',
        ProgramName: program.ProgramName,
        Venue: program.Venue,
        ProgramStartDate: program.StartDate || '',
        ProgramEndDate: program.EndDate || ''
      });
    });

    return ContentService
      .createTextOutput(
        'Registration submitted successfully. Reference: ' + registrationId
      )
      .setMimeType(ContentService.MimeType.TEXT);
  } catch (err) {
    return ContentService
      .createTextOutput(
        'ERROR: ' + (err && err.message ? err.message : String(err))
      )
      .setMimeType(ContentService.MimeType.TEXT);
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function getProgramDetailsV2_(courseId) {
  if (!courseId) return { error: 'Course ID is required.' };

  const cache = CacheService.getScriptCache();
  const cacheKey = regV2DetailsCacheKey_(courseId);
  const cached = cache.get(cacheKey);

  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (_) {
      cache.remove(cacheKey);
    }
  }

  const ss = SpreadsheetApp.openById(EASYLATIH_REG_V2_DATABASE_ID_);
  const program = findProgramV2_(ss, courseId, true);

  if (!program) return { error: 'Programme not found.' };

  const availability = getRegistrationAvailabilityV2_(ss, program);

  const details = {
    courseId: program.CourseID,
    programName: program.ProgramName,
    programDate: formatProgrammeDateRegV2_(program.StartDate, program.EndDate),
    startDate: program.StartDate,
    endDate: program.EndDate,
    venue: program.Venue,
    state: program.State,
    duration: program.Duration,
    totalTime: program.TotalTime,
    hrdClaimable: regV2HrdClaimable_(program.HRDClaimable),
    hrdFee: Number(program.HRDFee || 0),
    selfFee: Number(program.SelfFee || 0),
    maxPax: availability.maxPax,
    registeredPax: availability.registeredPax,
    remainingSeats: availability.remainingSeats,
    programmeStarted: availability.programmeStarted,
    registrationClosed: availability.registrationClosed,
    isFull: availability.isFull,
    registrationOpen: availability.registrationOpen
  };

  cache.put(cacheKey, JSON.stringify(details), EASYLATIH_REG_V2_DETAILS_CACHE_SECONDS_);
  return details;
}

function validatePromoCodeV2_(courseId, promoCode, optionalSs) {
  if (!courseId || !promoCode) {
    return { valid: false, message: 'Promo code is required.' };
  }

  const ss = optionalSs || SpreadsheetApp.openById(EASYLATIH_REG_V2_DATABASE_ID_);
  const sheet = ss.getSheetByName('PromoCodes');
  if (!sheet || sheet.getLastRow() < 2) {
    return { valid: false, message: 'Promo code not found.' };
  }

  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(v => regV2String_(v));
  const idx = regV2HeaderIndex_(headers);

  const wantedCourse = courseId.toUpperCase();
  const wantedCode = promoCode.toUpperCase();
  const todayKey = Utilities.formatDate(new Date(), EASYLATIH_REG_V2_TZ_, 'yyyy-MM-dd');

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const rowCourse = regV2String_(regV2Cell_(row, idx, 'CourseID')).toUpperCase();
    const rowCode = regV2String_(regV2Cell_(row, idx, 'PromoCode')).toUpperCase();

    if (rowCourse !== wantedCourse || rowCode !== wantedCode) continue;

    if (!regV2Bool_(regV2Cell_(row, idx, 'IsActive'))) {
      return { valid: false, message: 'Promo code is inactive.' };
    }

    const expiryKey = regV2DateKey_(regV2Cell_(row, idx, 'ExpiryDate'));
    if (expiryKey && expiryKey < todayKey) {
      return { valid: false, message: 'Promo code has expired.' };
    }

    return {
      valid: true,
      message: 'Promo code applied.',
      promoCode: regV2String_(regV2Cell_(row, idx, 'PromoCode')),
      discountAmount: Number(regV2Cell_(row, idx, 'DiscountAmount') || 0),
      agentId: regV2String_(regV2Cell_(row, idx, 'AgentID')),
      agentName: regV2String_(regV2Cell_(row, idx, 'AgentName'))
    };
  }

  return { valid: false, message: 'Promo code is not valid for this programme.' };
}

function findProgramV2_(ss, courseId, requirePublicAvailable) {
  const sheet = ss.getSheetByName('Programs');
  if (!sheet || sheet.getLastRow() < 2) return null;

  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(v => regV2String_(v));
  const idx = regV2HeaderIndex_(headers);
  const wanted = regV2String_(courseId).toUpperCase();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowCourse = regV2String_(regV2Cell_(row, idx, 'CourseID')).toUpperCase();
    if (rowCourse !== wanted) continue;

    const program = {};
    headers.forEach((h, col) => {
      program[h] = row[col] === undefined ? '' : row[col];
    });

    program.CourseID = regV2String_(program.CourseID);
    program.ProgramName = regV2String_(program.ProgramName);
    program.ProgramType = regV2String_(program.ProgramType).toUpperCase();
    program.Venue = regV2String_(program.Venue);
    program.State = regV2String_(program.State);
    program.Duration = regV2String_(program.Duration);
    program.TotalTime = regV2String_(program.TotalTime);
    program.StartDate = regV2DateKey_(program.StartDate);
    program.EndDate = regV2DateKey_(program.EndDate);
    program.RegistrationCloseDate = regV2DateKey_(program.RegistrationCloseDate);

    if (requirePublicAvailable) {
      if (program.ProgramType !== 'PUBLIC') return null;
      if (!regV2Bool_(program.IsActive)) return null;
      if (!regV2Bool_(program.IsPublished)) return null;
    }

    return program;
  }

  return null;
}

function getRegistrationAvailabilityV2_(ss, program) {
  const maxPax = Number(program.MaxPax || 0) || 0;
  const registeredPax = getRegisteredPaxV2_(ss, program.CourseID);
  const remainingSeats = maxPax > 0 ? Math.max(maxPax - registeredPax, 0) : '';

  const todayKey = Utilities.formatDate(new Date(), EASYLATIH_REG_V2_TZ_, 'yyyy-MM-dd');
  const programmeStarted = !!program.StartDate && program.StartDate <= todayKey;
  const registrationClosedByDate =
    !!program.RegistrationCloseDate && program.RegistrationCloseDate < todayKey;
  const isFull = maxPax > 0 && registeredPax >= maxPax;
  const registrationClosed =
    programmeStarted ||
    registrationClosedByDate ||
    !regV2Bool_(program.IsActive);

  return {
    maxPax,
    registeredPax,
    remainingSeats,
    programmeStarted,
    isFull,
    registrationClosed,
    registrationOpen:
      !registrationClosed &&
      !isFull &&
      regV2Bool_(program.IsPublished) &&
      program.ProgramType === 'PUBLIC'
  };
}

function getRegisteredPaxV2_(ss, courseId) {
  const sheet = ss.getSheetByName('Registrations');
  if (!sheet || sheet.getLastRow() < 2) return 0;

  const rows = sheet.getDataRange().getValues();
  const headers = rows[0].map(v => regV2String_(v));
  const idx = regV2HeaderIndex_(headers);
  let total = 0;
  const wanted = regV2String_(courseId).toUpperCase();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowCourse = regV2String_(regV2Cell_(row, idx, 'CourseID')).toUpperCase();
    if (rowCourse !== wanted) continue;

    const registrationStatus =
      regV2String_(regV2Cell_(row, idx, 'RegistrationStatus')).toUpperCase();

    // Pending applications do not occupy a seat. Update this field to CONFIRMED
    // in the Registrations sheet only after payment is received or HRD grant is approved.
    if (registrationStatus !== 'CONFIRMED') continue;

    total += Number(regV2Cell_(row, idx, 'RequestedPax') || 0) || 0;
  }

  return total;
}

function nextRegistrationIdV2_(ss) {
  const sheet = ss.getSheetByName('RunningNumbers');
  if (!sheet) throw new Error('RunningNumbers sheet is missing.');

  const rows = sheet.getDataRange().getValues();
  const now = new Date();
  const currentMonth = Number(Utilities.formatDate(now, EASYLATIH_REG_V2_TZ_, 'M'));
  const yy = Utilities.formatDate(now, EASYLATIH_REG_V2_TZ_, 'yy');

  let targetRow = -1;
  for (let i = 1; i < rows.length; i++) {
    if (regV2String_(rows[i][0]).toUpperCase() === 'REGISTRATION') {
      targetRow = i + 1;
      break;
    }
  }

  if (targetRow < 0) {
    targetRow = sheet.getLastRow() + 1;
    sheet.getRange(targetRow, 1, 1, 3)
      .setValues([['REGISTRATION', 0, currentMonth]]);
  }

  const lastNumber = Number(sheet.getRange(targetRow, 2).getValue() || 0);
  const lastMonth = Number(sheet.getRange(targetRow, 3).getValue() || 0);
  const nextNumber = lastMonth === currentMonth ? lastNumber + 1 : 1;

  sheet.getRange(targetRow, 2, 1, 2)
    .setValues([[nextNumber, currentMonth]]);

  return 'REG' + yy + '/' +
    String(currentMonth).padStart(2, '0') + '-' +
    String(nextNumber).padStart(4, '0');
}

function appendByHeadersV2_(sheet, record) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) throw new Error(sheet.getName() + ' has no headers.');

  const headers = sheet.getRange(1, 1, 1, lastColumn)
    .getValues()[0]
    .map(v => regV2String_(v));

  const row = headers.map(header =>
    Object.prototype.hasOwnProperty.call(record, header)
      ? record[header]
      : ''
  );

  sheet.appendRow(row);
}

function formatProgrammeDateRegV2_(startKey, endKey) {
  if (!startKey) return '';

  const start = new Date(startKey + 'T00:00:00+08:00');
  const end = endKey ? new Date(endKey + 'T00:00:00+08:00') : start;

  if (!endKey || startKey === endKey) {
    return Utilities.formatDate(start, EASYLATIH_REG_V2_TZ_, 'd MMM yyyy');
  }

  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return Utilities.formatDate(start, EASYLATIH_REG_V2_TZ_, 'd') +
      '–' +
      Utilities.formatDate(end, EASYLATIH_REG_V2_TZ_, 'd MMM yyyy');
  }

  return Utilities.formatDate(start, EASYLATIH_REG_V2_TZ_, 'd MMM yyyy') +
    ' – ' +
    Utilities.formatDate(end, EASYLATIH_REG_V2_TZ_, 'd MMM yyyy');
}

function regV2DetailsCacheKey_(courseId) {
  return 'reg-v2-details-' +
    Utilities.base64EncodeWebSafe(regV2String_(courseId))
      .replace(/=+$/g, '');
}

function regV2Jsonp_(data, callback) {
  const payload = JSON.stringify(data);
  const cb = regV2String_(callback);

  if (cb && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(cb)) {
    return ContentService
      .createTextOutput(cb + '(' + payload + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function regV2HeaderIndex_(headers) {
  const idx = {};
  headers.forEach((header, i) => {
    if (header) idx[header] = i;
  });
  return idx;
}

function regV2Cell_(row, idx, header) {
  return idx[header] === undefined ? '' : row[idx[header]];
}

function regV2String_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function regV2HrdClaimable_(value) {
  const s = regV2String_(value).toUpperCase();
  // Backward-compatible: blank/missing means claimable; only explicit FALSE disables HRD.
  return s !== 'FALSE' && s !== 'NO' && s !== 'N' && s !== '0';
}

function regV2Bool_(value) {
  if (value === true) return true;
  const s = regV2String_(value).toUpperCase();
  return s === 'TRUE' || s === 'YES' || s === 'Y' || s === '1';
}

function regV2DateKey_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, EASYLATIH_REG_V2_TZ_, 'yyyy-MM-dd');
  }

  const text = regV2String_(value);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];

  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    return dmy[3] + '-' +
      String(dmy[2]).padStart(2, '0') + '-' +
      String(dmy[1]).padStart(2, '0');
  }

  const parsed = new Date(value);
  if (isNaN(parsed)) return '';

  return Utilities.formatDate(parsed, EASYLATIH_REG_V2_TZ_, 'yyyy-MM-dd');
}
