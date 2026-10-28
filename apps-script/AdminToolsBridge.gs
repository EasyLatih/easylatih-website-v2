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
    return adminToolsJson_({ success: true, data: actions[action](payload || {}) });
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
    jd14Companies: function (d) { return getCompaniesByTrainingDate(String(d.startDate || '')); },
    jd14Details: function (d) { return getJD14DataByRequestId(String(d.requestId || '')); },
    jd14Generate: function (d) { return generateJD14(d); },

    // Certificates: template
    certSettings: function () { return getCertificateTemplateSettings(); },
    certSettingsSave: function (d) { return saveCertificateTemplateSettings({ templateUrl: String(d.templateUrl || '') }); },
    certSettingsReset: function () { return resetCertificateTemplateSettings(); },

    // Certificates: attendance and per-programme certificates
    attendancePrograms: function () { return getProgramsForAttendance(); },
    attendanceParticipants: function (d) { return getParticipantsByCourse(String(d.courseId || '')); },
    attendanceUpdate: function (d) { return updateAttendance(String(d.courseId || ''), Array.isArray(d.attendanceList) ? d.attendanceList : []); },
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
