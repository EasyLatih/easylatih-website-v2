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
  const programmeId = String(e.parameter.programmeId || '').trim();
  const programmeTitle = sanitiseFileName_(String(e.parameter.programmeTitle || '').trim());
  const originalName = sanitiseFileName_(String(e.parameter.fileName || 'document'));
  const mimeType = String(e.parameter.mimeType || 'application/octet-stream').trim();
  const base64 = String(e.parameter.base64 || '').trim();

  if (!trainerId || !trainerName || !documentType || !base64) {
    throw new Error('Incomplete trainer document upload payload.');
  }

  if (documentType === 'COURSE_CONTENT' && (!programmeId || !programmeTitle)) {
    throw new Error('Programme ID and title are required for course content upload.');
  }

  const bytes = Utilities.base64Decode(base64);
  if (!bytes.length) throw new Error('Uploaded document is empty.');
  if (bytes.length > 10 * 1024 * 1024) throw new Error('Document exceeds 10 MB.');

  const folders = ensureTrainerDriveFolders_(trainerId, trainerName);
  let target = trainerDocumentFolderForType_(folders, documentType);

  if (documentType === 'COURSE_CONTENT') {
    const programmeShortId = String(programmeId).replace(/-/g, '').substring(0, 8).toUpperCase();
    target = getOrCreateTrainerChildFolder_(target, 'PRG-' + programmeShortId + ' - ' + programmeTitle);
  }

  const shortId = String(trainerId).replace(/-/g, '').substring(0, 8).toUpperCase();
  const programmePart = documentType === 'COURSE_CONTENT'
    ? ' - PRG-' + String(programmeId).replace(/-/g, '').substring(0, 8).toUpperCase()
    : '';
  const storedName = 'TR-' + shortId + programmePart + ' - ' + documentType + ' - ' + originalName;
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
    courseContentFolderId: folders.courseContent.getId(),
    programmeFolderId: documentType === 'COURSE_CONTENT' ? target.getId() : null
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
