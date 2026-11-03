/**
 * HRD Corp grant pack folder, built automatically for every public programme.
 *
 * Add this as a NEW file named "GrantPack" in the "EasyLatih Management System V2 - STAGING"
 * project, next to PublicRegistrationAdmin.gs. Then Deploy → Manage deployments → Edit →
 * New version → Deploy, so the Web App URL stays the same.
 *
 * When the admin saves a programme on Admin Centre → Appendices, the page calls
 * regPublishGrantPack. This:
 *   1. creates (or reuses) one Drive folder per programme, e.g. "Customer Service ... 19 Nov 2026",
 *      inside the grant pack parent folder;
 *   2. copies the HRD Corp grant application guideline PDF into it (same file for every programme);
 *   3. turns the Appendices into a PDF and puts it in the folder, replacing the previous one;
 *   4. shares the folder as "anyone with the link can view";
 *   5. saves the folder link as the programme's GuidelineUrl in ProgrammeSettings, so the
 *      registration email includes it automatically.
 *
 * Optional Script properties (Project Settings → Script properties) override the defaults:
 *   GRANT_PACK_PARENT_FOLDER_ID   folder that holds one sub-folder per programme
 *   GRANT_GUIDELINE_FILE_ID       the master "EasyLatih Public Training Grant Application Guideline.pdf"
 */

const GP_DEFAULT_PARENT_FOLDER_ID_ = '1rY5bAux_8QRD4y5x1q8TUyymlDW_jdoq';
const GP_DEFAULT_GUIDELINE_FILE_ID_ = '14oLvOWU6OdlR7nTNcTK4i9bCJWHkteH4';
const GP_APPENDICES_PREFIX_ = 'Appendices - ';

function gpProp_(name, fallback) {
  return PropertiesService.getScriptProperties().getProperty(name) || fallback;
}

function gpGuidelineFileId_() { return gpProp_('GRANT_GUIDELINE_FILE_ID', GP_DEFAULT_GUIDELINE_FILE_ID_); }

// Direct link to the master guideline, used when a programme has no grant pack yet.
function gpGuidelineFallbackUrl_() {
  return 'https://drive.google.com/file/d/' + gpGuidelineFileId_() + '/view';
}

function gpSafeName_(s) {
  return praText_(s).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function gpFolderFor_(courseId, program) {
  const settings = praSettingsFor_(courseId);
  const savedId = praText_(settings.GrantFolderId);
  if (savedId) {
    try {
      const f = DriveApp.getFolderById(savedId);
      if (!f.isTrashed()) return f;
    } catch (e) { /* folder deleted or no access: make a new one */ }
  }
  const parent = DriveApp.getFolderById(gpProp_('GRANT_PACK_PARENT_FOLDER_ID', GP_DEFAULT_PARENT_FOLDER_ID_));
  const when = praText_(praProgramDate_(program || {}));
  const name = gpSafeName_(praText_(program && program.ProgramName) + (when ? ' - ' + when : '') + ' (' + courseId + ')');
  return parent.createFolder(name);
}

function gpEnsureGuideline_(folder) {
  const master = DriveApp.getFileById(gpGuidelineFileId_());
  if (!folder.getFilesByName(master.getName()).hasNext()) master.makeCopy(master.getName(), folder);
}

function gpReplaceAppendices_(folder, html, title) {
  const old = folder.getFiles();
  while (old.hasNext()) {
    const f = old.next();
    if (f.getName().indexOf(GP_APPENDICES_PREFIX_) === 0) f.setTrashed(true);
  }
  const fileName = GP_APPENDICES_PREFIX_ + gpSafeName_(title || 'Programme') + '.pdf';
  const pdf = Utilities.newBlob(html, 'text/html', 'appendices.html').getAs('application/pdf').setName(fileName);
  return folder.createFile(pdf);
}

// Called from Admin Centre → Appendices after "Save details".
function gpPublishGrantPack_(d) {
  const courseId = praText_(d.courseId);
  if (!courseId || /^MANUAL-/i.test(courseId)) throw new Error('This programme is not in the Programs sheet, so no grant pack was made.');
  const html = String(d.html || '');
  if (html.length < 200 || html.length > 500000) throw new Error('The Appendices content is missing or too large.');
  const program = praProgramRecord_(courseId);

  const folder = gpFolderFor_(courseId, program);
  gpEnsureGuideline_(folder);
  const appendices = gpReplaceAppendices_(folder, html, d.title || program.ProgramName);
  folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  const url = folder.getUrl();
  praUpsert_(praSettingsSheet_(), 'CourseID', courseId, {
    GuidelineUrl: url,
    GrantFolderId: folder.getId(),
    UpdatedDate: new Date()
  });
  return { folderUrl: url, appendicesUrl: appendices.getUrl(), folderName: folder.getName() };
}
