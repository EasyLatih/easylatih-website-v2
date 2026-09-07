// EasyLatih Trainer Drive Bridge
// Add this file to the existing EasyLatih Apps Script project.
// Then add this guard at the VERY TOP of the existing doPost(e):
//
//   if (e && e.parameter && String(e.parameter.action || '').indexOf('trainerDocument') === 0) {
//     return handleTrainerDocumentBridge_(e);
//   }
//
// The shared secret is read from Settings!A:B using Item = TrainerDriveBridgeSecret.
// TRAINER_DOCUMENT_FOLDER_ID and SHEET_ID already exist in the current EasyLatih V2 Apps Script.

function trainerDriveJson_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getTrainerDriveBridgeSecret_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName('Settings');
  if (!sheet) throw new Error('Settings sheet not found.');
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === 'TrainerDriveBridgeSecret') {
      return String(values[i][1] || '').trim();
    }
  }
  throw new Error('TrainerDriveBridgeSecret is not configured.');
}

function assertTrainerDriveBridge_(e) {
  const supplied = String((e && e.parameter && e.parameter.bridgeSecret) || '');
  const expected = getTrainerDriveBridgeSecret_();
  if (!supplied || supplied !== expected) throw new Error('Unauthorized trainer Drive bridge request.');
}

function getOrCreateTrainerChildFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function ensureTrainerDriveFolders_(trainerId, trainerName) {
  const parent = DriveApp.getFolderById(TRAINER_DOCUMENT_FOLDER_ID);
  const shortId = String(trainerId || '').replace(/-/g, '').substring(0, 8).toUpperCase();
  const safeName = sanitiseFileName_(trainerName || 'Trainer');
  const rootName = 'TR-' + shortId + ' - ' + safeName;
  const root = getOrCreateTrainerChildFolder_(parent, rootName);
  return {
    root: root,
    ttt: getOrCreateTrainerChildFolder_(root, '01 TTT'),
    accredited: getOrCreateTrainerChildFolder_(root, '02 Accredited Trainer'),
    resume: getOrCreateTrainerChildFolder_(root, '03 Resume'),
    other: getOrCreateTrainerChildFolder_(root, '04 Other Certificates'),
    courseContent: getOrCreateTrainerChildFolder_(root, '05 Course Content')
  };
}

function trainerDocumentFolderForType_(folders, documentType) {
  const type = String(documentType || '').toUpperCase();
  if (type === 'TTT_CERTIFICATE') return folders.ttt;
  if (type === 'ACCREDITED_TRAINER_CERTIFICATE') return folders.accredited;
  if (type === 'RESUME_CV') return folders.resume;
  if (type === 'OTHER_RELEVANT_CERTIFICATE') return folders.other;
  if (type === 'COURSE_CONTENT') return folders.courseContent;
  throw new Error('Unsupported trainer document type.');
}

function handleTrainerDocumentBridge_(e) {
  try {
    assertTrainerDriveBridge_(e);
    const action = String(e.parameter.action || '');
    if (action === 'trainerDocumentUpload') return handleTrainerDocumentUpload_(e);
    if (action === 'trainerDocumentDownload') return handleTrainerDocumentDownload_(e);
    if (action === 'trainerDocumentCourseOutlineGenerate') return handleTrainerCourseOutlineGenerate_(e);
    return trainerDriveJson_({ ok: false, error: 'Unsupported action.' });
  } catch (error) {
    return trainerDriveJson_({
      ok: false,
      error: error && error.message ? error.message : String(error)
    });
  }
}

function handleTrainerDocumentUpload_(e) {
  const trainerId = String(e.parameter.trainerId || '').trim();
  const trainerName = String(e.parameter.trainerName || '').trim();
  const documentType = String(e.parameter.documentType || '').trim().toUpperCase();
  const originalName = sanitiseFileName_(String(e.parameter.fileName || 'document'));
  const mimeType = String(e.parameter.mimeType || 'application/octet-stream').trim();
  const base64 = String(e.parameter.base64 || '').trim();

  if (!trainerId || !trainerName || !documentType || !base64) {
    throw new Error('Incomplete trainer document upload payload.');
  }

  const bytes = Utilities.base64Decode(base64);
  if (!bytes.length) throw new Error('Uploaded document is empty.');
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Document exceeds 10 MB.');

  const folders = ensureTrainerDriveFolders_(trainerId, trainerName);
  const target = trainerDocumentFolderForType_(folders, documentType);
  const shortId = String(trainerId).replace(/-/g, '').substring(0, 8).toUpperCase();
  const storedName = 'TR-' + shortId + ' - ' + documentType + ' - ' + originalName;
  const blob = Utilities.newBlob(bytes, mimeType, storedName);
  const file = target.createFile(blob);

  return trainerDriveJson_({
    ok: true,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: file.getName(),
    rootFolderId: folders.root.getId(),
    tttFolderId: folders.ttt.getId(),
    accreditedFolderId: folders.accredited.getId(),
    resumeFolderId: folders.resume.getId(),
    otherCertificatesFolderId: folders.other.getId(),
    courseContentFolderId: folders.courseContent.getId()
  });
}

function courseOutlineHeading_(body, number, title) {
  const p = body.appendParagraph(number + '  ' + title);
  p.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  return p;
}

function courseOutlineText_(body, value) {
  body.appendParagraph(String(value || '-'));
}

function courseOutlineList_(body, values) {
  const list = Array.isArray(values) ? values : [];
  if (!list.length) return courseOutlineText_(body, '-');
  list.forEach(function(value) {
    body.appendListItem(String(value || '')).setGlyphType(DocumentApp.GlyphType.BULLET);
  });
}

function courseOutlineMinutes_(start, end) {
  const s = String(start || '').split(':').map(Number);
  const e = String(end || '').split(':').map(Number);
  if (s.length < 2 || e.length < 2 || s.some(isNaN) || e.some(isNaN)) return 0;
  return Math.max(0, (e[0] * 60 + e[1]) - (s[0] * 60 + s[1]));
}

function courseOutlineHours_(minutes) {
  const h = Number(minutes || 0) / 60;
  return Number.isInteger(h) ? String(h) : String(Math.round(h * 100) / 100);
}

function courseOutlineTypeLabel_(type) {
  const labels = {
    SESSION: 'Training Session',
    MORNING_BREAK: 'Morning Break',
    LUNCH: 'Lunch',
    AFTERNOON_BREAK: 'Afternoon Break'
  };
  return labels[String(type || '').toUpperCase()] || String(type || '');
}

function styleCourseOutlineSummary_(table) {
  for (let i = 0; i < table.getNumRows(); i++) {
    const row = table.getRow(i);
    if (row.getNumCells() > 0) row.getCell(0).editAsText().setBold(true);
  }
}

function styleCourseOutlineHeader_(table) {
  if (!table || table.getNumRows() < 1) return;
  const row = table.getRow(0);
  for (let i = 0; i < row.getNumCells(); i++) {
    row.getCell(i).editAsText().setBold(true);
  }
}

function handleTrainerCourseOutlineGenerate_(e) {
  const trainerId = String(e.parameter.trainerId || '').trim();
  const trainerName = String(e.parameter.trainerName || '').trim();
  const programmeJson = String(e.parameter.programmeJson || '').trim();

  if (!trainerId || !trainerName || !programmeJson) {
    throw new Error('Incomplete course outline generation payload.');
  }

  let programme;
  try {
    programme = JSON.parse(programmeJson);
  } catch (error) {
    throw new Error('Invalid programme data for Course Outline generation.');
  }

  const folders = ensureTrainerDriveFolders_(trainerId, trainerName);
  const shortProgrammeId = String(programme.id || '').replace(/-/g, '').substring(0, 8).toUpperCase();
  const safeTitle = sanitiseFileName_(String(programme.title || 'Programme'));
  const stamp = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyyMMdd-HHmm');
  const fileName = 'COURSE OUTLINE - ' + safeTitle + ' - ' + shortProgrammeId + ' - ' + stamp;

  const doc = DocumentApp.create(fileName);
  const file = DriveApp.getFileById(doc.getId());
  file.moveTo(folders.courseContent);
  const body = doc.getBody();
  body.clear();

  body.appendParagraph('COURSE OUTLINE').setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph('EasyLatih Consultancy').setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

  const summary = body.appendTable([
    ['Course Title', String(programme.title || '-')],
    ['Course Duration', String(programme.duration || '-')],
    ['Target Level', String(programme.target_participants || '-')],
    ['Total Contact Hours', String(programme.total_contact_hours || '-') + ' Hour(s)'],
    ['Delivery Method', String(programme.delivery_method || '-')],
    ['Prerequisite', String(programme.prerequisites || 'None')],
    ['HRD Corp Claimable', 'Subject to EasyLatih review and applicable eTRiS/HRD Corp requirements']
  ]);
  styleCourseOutlineSummary_(summary);

  courseOutlineHeading_(body, '01', 'Programme Overview');
  courseOutlineText_(body, programme.programme_overview);

  courseOutlineHeading_(body, '02', 'Learning Objectives');
  courseOutlineList_(body, programme.learning_objectives);

  courseOutlineHeading_(body, '03', 'Learning Outcomes');
  courseOutlineList_(body, programme.learning_outcomes);

  courseOutlineHeading_(body, '04', 'Target Participants');
  courseOutlineText_(body, programme.target_participants);

  courseOutlineHeading_(body, '05', 'Duration & Contact Hours');
  courseOutlineText_(body, String(programme.duration || '-') + ' | Total Contact Hours: ' + String(programme.total_contact_hours || '-') + ' hour(s). Breaks and lunch are excluded from contact hours.');

  courseOutlineHeading_(body, '06', 'Training Methodology');
  courseOutlineText_(body, programme.training_methodology);

  courseOutlineHeading_(body, '07', 'Prerequisite');
  courseOutlineText_(body, programme.prerequisites || 'None');

  courseOutlineHeading_(body, '08', 'Module Outline / Course Content');
  const modules = Array.isArray(programme.modules) ? programme.modules : [];
  if (modules.length) {
    modules.forEach(function(module, index) {
      const title = module && (module.title || module.name) ? (module.title || module.name) : String(module || '');
      body.appendListItem('Module ' + (index + 1) + ': ' + title).setGlyphType(DocumentApp.GlyphType.NUMBER);
    });
  } else {
    courseOutlineText_(body, '-');
  }

  body.appendParagraph('Training Schedule').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph('EasyLatih break allocation: Morning break 15 minutes once per training day; lunch 1 hour; afternoon break 15 minutes once per training day. Breaks and lunch are not counted as contact hours.');

  const schedule = Array.isArray(programme.schedule) ? programme.schedule : [];
  const scheduleRows = [['Day', 'Time', 'Type', 'Module / Topic', 'Detailed Content / Learning Activity', 'Contact Hours']];
  schedule.forEach(function(row) {
    const type = String(row.type || 'SESSION').toUpperCase();
    const minutes = type === 'SESSION' ? courseOutlineMinutes_(row.start, row.end) : 0;
    scheduleRows.push([
      String(row.day || ''),
      String(row.start || '') + ' - ' + String(row.end || ''),
      courseOutlineTypeLabel_(type),
      String(row.topic || ''),
      String(row.content || ''),
      courseOutlineHours_(minutes)
    ]);
  });
  const scheduleTable = body.appendTable(scheduleRows);
  styleCourseOutlineHeader_(scheduleTable);

  courseOutlineHeading_(body, '09', 'Assessment Method');
  courseOutlineText_(body, programme.assessment_method || 'To be confirmed during EasyLatih review.');

  courseOutlineHeading_(body, '10', 'Trainer Profile');
  courseOutlineText_(body, trainerName + '. Full trainer credentials and supporting documents are maintained separately in the EasyLatih Trainer Collaboration Portal.');

  courseOutlineHeading_(body, '11', 'Administrative Notes');
  courseOutlineText_(body, 'Generated automatically from the trainer submission. This Google Docs version is an editable working document for EasyLatih internal review, amendment, eTRiS preparation and finalisation.');

  doc.saveAndClose();

  return trainerDriveJson_({
    ok: true,
    fileId: file.getId(),
    fileUrl: file.getUrl(),
    fileName: file.getName(),
    rootFolderId: folders.root.getId(),
    tttFolderId: folders.ttt.getId(),
    accreditedFolderId: folders.accredited.getId(),
    resumeFolderId: folders.resume.getId(),
    otherCertificatesFolderId: folders.other.getId(),
    courseContentFolderId: folders.courseContent.getId()
  });
}

function handleTrainerDocumentDownload_(e) {
  const fileId = String(e.parameter.fileId || '').trim();
  if (!fileId) throw new Error('Missing Google Drive file ID.');
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  return trainerDriveJson_({
    ok: true,
    fileName: file.getName(),
    mimeType: blob.getContentType() || 'application/octet-stream',
    base64: Utilities.base64Encode(blob.getBytes())
  });
}
