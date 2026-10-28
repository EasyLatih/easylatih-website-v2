/**
 * EasyLatih Admin Centre: dummy programme for testing.
 *
 * createTestProgramme()  adds programme TEST-001 (hidden from the public website)
 *                        with four dummy registrations at different stages.
 * deleteTestProgramme()  removes everything the test created or produced:
 *                        rows in Programs, Registrations, Participants,
 *                        RegistrationProgress, ProgrammeSettings, the *_Archive tabs,
 *                        TEST receipts in Documents, and TEST receipt files in Drive.
 *
 * No quotation, invoice, registration or certificate running numbers are used.
 * All test emails go to TEST_PROGRAMME_EMAIL_.
 */

const TEST_PROGRAMME_ID_ = 'TEST-001';
const TEST_PROGRAMME_EMAIL_ = 'syamsulizzat93@gmail.com';
const TEST_REG_PREFIX_ = 'TEST-REG-';

// Each test company gets its own Gmail "+" address (all land in the same inbox),
// because the Registrations page links participants to a registration by PIC email.
function testEmail_(tag) { return TEST_PROGRAMME_EMAIL_.replace('@', '+' + tag + '@'); }

function testDate_(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return Utilities.formatDate(d, 'Asia/Kuala_Lumpur', 'yyyy-MM-dd');
}

// Appends one row, matching values to the sheet's own header names.
function testAppendByHeaders_(sheet, values) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  const row = headers.map(function (h) { return Object.prototype.hasOwnProperty.call(values, h) ? values[h] : ''; });
  if (values._timestampColumn2 && row.length > 1 && row[1] === '') row[1] = new Date();
  sheet.appendRow(row);
}

function createTestProgramme() {
  const book = SpreadsheetApp.openById(SHEET_ID);
  const programs = book.getSheetByName('Programs');
  if (findRowByValue(programs, 'CourseID', TEST_PROGRAMME_ID_)) {
    throw new Error('TEST-001 already exists. Run deleteTestProgramme() first if you want a fresh copy.');
  }

  const start = testDate_(14), end = testDate_(15);
  const name = '[TEST] Dummy Programme – Admin Centre check';
  const venue = 'EasyLatih Training Room, Kuantan';

  testAppendByHeaders_(programs, {
    CourseID: TEST_PROGRAMME_ID_, ProgramName: name, StartDate: start, EndDate: end,
    ProgramType: 'PUBLIC', Category: 'TEST', FeeType: 'PAX', HRDFee: 1200, SelfFee: 950,
    MaxPax: 20, MinPax: 5, Duration: '2 Days', TotalTime: '14 Hours', Venue: venue, State: 'Pahang',
    Status: 'CONFIRMED', IsActive: 'FALSE', IsPublished: 'FALSE', DeliveryMode: 'PHYSICAL',
    RegistrationCloseDate: testDate_(7), CreatedDate: new Date(), UpdatedDate: new Date()
  });

  praUpsert_(praSettingsSheet_(), 'CourseID', TEST_PROGRAMME_ID_, {
    GuidelineUrl: 'https://www.easylatih.my/schedule.html',
    WhatsAppLink: 'https://chat.whatsapp.com/TESTONLY',
    JoiningInstructions: '[TEST] Arrive 8:30am for registration. Parking is available at the building. Please bring your laptop.',
    UpdatedDate: new Date()
  });

  const regs = book.getSheetByName('Registrations');
  const people = book.getSheetByName('Participants');
  const list = [
    { id: '001', tag: 'alpha', company: '[TEST] Alpha Trading Sdn Bhd', pic: 'Test PIC Alpha', method: 'SELF', pax: 3, note: 'Self payment, awaiting payment: try "Payment received".' },
    { id: '002', tag: 'beta', company: '[TEST] Beta Manufacturing Sdn Bhd', pic: 'Test PIC Beta', method: 'HRD', pax: 2, note: 'HRD, awaiting grant: try "Grant approved".' },
    { id: '003', tag: 'gamma', company: '[TEST] Gamma Logistics Sdn Bhd', pic: 'Test PIC Gamma', method: 'HRD', pax: 2, grant: true, attended: true, note: 'HRD, certificate sent: try the JD14 and claim steps.' },
    { id: '004', tag: 'delta', company: '[TEST] Delta Services Enterprise', pic: 'Test PIC Delta', method: 'SELF', pax: 1, note: 'Self payment: try "Cancel".' }
  ];

  list.forEach(function (r) {
    const regId = TEST_REG_PREFIX_ + r.id;
    testAppendByHeaders_(regs, {
      _timestampColumn2: true,
      RegistrationID: regId, CourseID: TEST_PROGRAMME_ID_, ProgramType: 'PUBLIC',
      CompanyName: r.company, CompanyAddress: 'No. 1, Jalan Ujian, 25000 Kuantan, Pahang',
      PICName: r.pic, PICPosition: 'HR Executive', PICEmail: testEmail_(r.tag), PICPhone: '0100000000',
      PaymentMethod: r.method, RequestedPax: r.pax, DiscountCode: '', DiscountAmount: 0, TermsAccepted: 'YES',
      RegistrationStatus: 'SUBMITTED',
      GrantStatus: r.grant ? 'APPROVED' : '', GrantRefNo: r.grant ? 'TEST-GRANT-003' : '', GrantApprovedDate: r.grant ? testDate_(-3) : '',
      Remarks: r.note, Status: 'ACTIVE',
      ConfirmationEmailStatus: r.grant ? 'SENT' : '', ConfirmationEmailSentDate: r.grant ? new Date() : ''
    });
    for (let i = 1; i <= r.pax; i++) {
      testAppendByHeaders_(people, {
        ParticipantName: 'Test Participant ' + r.id + '-' + i, ICNo: '900101-01-000' + i,
        Email: TEST_PROGRAMME_EMAIL_, PICName: r.pic, PICEmail: testEmail_(r.tag), HREmail: testEmail_(r.tag),
        Phone: '0100000000', CourseID: TEST_PROGRAMME_ID_,
        AttendanceStatus: r.attended ? 'ATTENDED' : 'REGISTERED',
        ProgramName: name, Venue: venue, ProgramStartDate: start, ProgramEndDate: end,
        CertificateStatus: r.attended ? 'GENERATED' : '', EmailStatus: r.attended ? 'SENT' : '', EmailSentDate: r.attended ? new Date() : ''
      });
    }
    if (r.grant) {
      praUpsert_(praProgressSheet_(), 'RegistrationID', regId, { CourseID: TEST_PROGRAMME_ID_, ConfirmationSentDate: new Date(), UpdatedDate: new Date() });
    }
  });

  console.log('Participants headers: ' + people.getRange(1, 1, 1, people.getLastColumn()).getValues()[0].join(' | '));
  return 'TEST-001 created with 4 registrations. Open Admin Centre → Public Registrations.';
}

// Sends the HRD guideline email the way a real HRD registration would.
function sendTestGuidelineEmail() {
  const program = findRowByValue(SpreadsheetApp.openById(SHEET_ID).getSheetByName('Programs'), 'CourseID', TEST_PROGRAMME_ID_);
  if (!program) throw new Error('Run createTestProgramme() first.');
  praAfterRegistration_({ paymentMethod: 'HRD', courseId: TEST_PROGRAMME_ID_, picEmail: testEmail_('beta'), picName: 'Test PIC Beta' }, program);
  return 'Guideline email sent to ' + TEST_PROGRAMME_EMAIL_;
}

function testDeleteRows_(sheet, match) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  let removed = 0;
  for (let i = values.length - 1; i >= 1; i--) {
    const row = {};
    headers.forEach(function (h, j) { if (h) row[h] = values[i][j]; });
    if (match(row)) { sheet.deleteRow(i + 1); removed++; }
  }
  return removed;
}

function deleteTestProgramme() {
  const book = SpreadsheetApp.openById(SHEET_ID);
  const isTest = function (r) {
    return String(r.CourseID || '').trim() === TEST_PROGRAMME_ID_ || String(r.RegistrationID || '').indexOf(TEST_REG_PREFIX_) === 0;
  };
  const report = {};
  ['Programs', 'Registrations', 'Participants', 'RegistrationProgress', 'ProgrammeSettings',
   'Registrations_Archive', 'Participants_Archive', 'RegistrationProgress_Archive'].forEach(function (name) {
    report[name] = testDeleteRows_(book.getSheetByName(name), isTest);
  });
  report.Documents = testDeleteRows_(book.getSheetByName('Documents'), function (r) {
    return String(r.DocumentNo || r.DocumentNumber || '').indexOf('RC-' + TEST_REG_PREFIX_) === 0;
  });
  let files = 0;
  const it = DriveApp.searchFiles("title contains 'RC-" + TEST_REG_PREFIX_ + "' and trashed = false");
  while (it.hasNext()) { it.next().setTrashed(true); files++; }
  report.receiptFilesTrashed = files;
  console.log(JSON.stringify(report));
  return report;
}
