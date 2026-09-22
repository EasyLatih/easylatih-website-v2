/**
 * EasyLatih Public Training Calendar — V2 data source
 *
 * Add this file to the EXISTING Apps Script project used by schedule.html.
 * Then route action=getPublishedPrograms to getPublishedProgramsV2Response_(e)
 * and deploy a new version of the existing Web App deployment.
 *
 * Source of truth:
 * EasyLatih Master Database V2 - STAGING
 */
const EASYLATIH_PUBLIC_TRAINING_DATABASE_ID_ = '1W6mLl9U2xdlfrlWHTs7VYmmRk34BcfaKTBo7gJatGsc';
const EASYLATIH_PUBLIC_TRAINING_TZ_ = 'Asia/Kuala_Lumpur';

function getPublishedProgramsV2Response_(e) {
  const callback = String((e && e.parameter && e.parameter.callback) || '').trim();
  const payload = JSON.stringify(getPublishedProgramsV2_());

  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + payload + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function getPublishedProgramsV2_() {
  const ss = SpreadsheetApp.openById(EASYLATIH_PUBLIC_TRAINING_DATABASE_ID_);
  const programsSheet = ss.getSheetByName('Programs');
  if (!programsSheet || programsSheet.getLastRow() < 2) return [];

  const values = programsSheet
    .getRange(1, 1, programsSheet.getLastRow(), programsSheet.getLastColumn())
    .getValues();

  const headers = values[0].map(v => String(v || '').trim());
  const index = {};
  headers.forEach((name, i) => { index[name] = i; });

  const registrationsByCourse = getPublishedProgrammePaxV2_(ss);
  const todayKey = Utilities.formatDate(new Date(), EASYLATIH_PUBLIC_TRAINING_TZ_, 'yyyy-MM-dd');

  return values.slice(1)
    .map(row => {
      const get = name => index[name] === undefined ? '' : row[index[name]];

      const courseId = String(get('CourseID') || '').trim();
      const programType = String(get('ProgramType') || '').trim().toUpperCase();
      const isPublished = toBoolV2_(get('IsPublished'));
      const isActive = toBoolV2_(get('IsActive'));
      const startDate = normalizeDateV2_(get('StartDate'));
      const endDate = normalizeDateV2_(get('EndDate'));
      const closeDate = normalizeDateV2_(get('RegistrationCloseDate'));
      const maxPax = Number(get('MaxPax') || 0) || 0;
      const registeredPax = Number(registrationsByCourse[courseId] || 0);
      const remainingSeats = maxPax > 0 ? Math.max(maxPax - registeredPax, 0) : '';

      const programmeStarted = !!startDate && startDate <= todayKey;
      const registrationClosedByDate = !!closeDate && closeDate < todayKey;
      const isFull = maxPax > 0 && registeredPax >= maxPax;
      const registrationLink = String(get('RegistrationLink') || '').trim();

      return {
        courseId,
        programName: String(get('ProgramName') || '').trim(),
        startDateRaw: startDate,
        startDate,
        endDate,
        programDate: formatProgrammeDateV2_(startDate, endDate),
        programType,
        category: String(get('Category') || '').trim(),
        venue: String(get('Venue') || '').trim(),
        state: String(get('State') || '').trim(),
        courseContentUrl: String(get('CourseContentURL') || '').trim(),
        trainerProfileUrl: String(get('TrainerProfileURL') || '').trim(),
        registrationLink,
        programmeStatus: String(get('TrainerConfirmationStatus') || get('Status') || 'SCHEDULED').trim().toUpperCase(),
        maxPax,
        registeredPax,
        remainingSeats,
        programmeStarted,
        isFull,
        registrationClosed: programmeStarted || registrationClosedByDate || !isActive,
        registrationOpen: !programmeStarted && !registrationClosedByDate && isActive && !isFull && !!registrationLink,
        _published: isPublished,
        _active: isActive
      };
    })
    .filter(item =>
      item.courseId &&
      item.programName &&
      item.programType === 'PUBLIC' &&
      item._published &&
      item._active
    )
    .map(item => {
      delete item._published;
      delete item._active;
      return item;
    });
}

function getPublishedProgrammePaxV2_(ss) {
  const sheet = ss.getSheetByName('Registrations');
  if (!sheet || sheet.getLastRow() < 2) return {};

  const values = sheet
    .getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn())
    .getValues();

  const headers = values[0].map(v => String(v || '').trim());
  const idx = {};
  headers.forEach((name, i) => { idx[name] = i; });

  const totals = {};
  values.slice(1).forEach(row => {
    const courseId = idx.CourseID === undefined ? '' : String(row[idx.CourseID] || '').trim();
    if (!courseId) return;

    const registrationStatus = idx.RegistrationStatus === undefined
      ? ''
      : String(row[idx.RegistrationStatus] || '').trim().toUpperCase();

    const status = idx.Status === undefined
      ? ''
      : String(row[idx.Status] || '').trim().toUpperCase();

    if (
      registrationStatus === 'CANCELLED' ||
      registrationStatus === 'CANCELED' ||
      status === 'CANCELLED' ||
      status === 'CANCELED'
    ) return;

    const pax = idx.RequestedPax === undefined ? 0 : Number(row[idx.RequestedPax] || 0);
    totals[courseId] = (totals[courseId] || 0) + (Number.isFinite(pax) ? pax : 0);
  });

  return totals;
}

function normalizeDateV2_(value) {
  if (!value) return '';

  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value)) {
    return Utilities.formatDate(value, EASYLATIH_PUBLIC_TRAINING_TZ_, 'yyyy-MM-dd');
  }

  const text = String(value).trim();
  const m = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[1] + '-' + m[2] + '-' + m[3];

  const parsed = new Date(value);
  if (isNaN(parsed)) return '';
  return Utilities.formatDate(parsed, EASYLATIH_PUBLIC_TRAINING_TZ_, 'yyyy-MM-dd');
}

function formatProgrammeDateV2_(startKey, endKey) {
  if (!startKey) return '';

  const start = new Date(startKey + 'T00:00:00+08:00');
  const end = endKey ? new Date(endKey + 'T00:00:00+08:00') : start;

  const startText = Utilities.formatDate(start, EASYLATIH_PUBLIC_TRAINING_TZ_, 'd MMM yyyy');
  if (!endKey || startKey === endKey) return startText;

  if (
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth()
  ) {
    return Utilities.formatDate(start, EASYLATIH_PUBLIC_TRAINING_TZ_, 'd') +
      '–' +
      Utilities.formatDate(end, EASYLATIH_PUBLIC_TRAINING_TZ_, 'd MMM yyyy');
  }

  return startText + ' – ' +
    Utilities.formatDate(end, EASYLATIH_PUBLIC_TRAINING_TZ_, 'd MMM yyyy');
}

function toBoolV2_(value) {
  if (value === true) return true;
  const text = String(value || '').trim().toUpperCase();
  return text === 'TRUE' || text === 'YES' || text === 'Y' || text === '1';
}

/*
 * Route to add near the TOP of the existing doGet(e):
 *
 * const action = String((e && e.parameter && e.parameter.action) || '').trim();
 * if (action === 'getPublishedPrograms') {
 *   return getPublishedProgramsV2Response_(e);
 * }
 */
