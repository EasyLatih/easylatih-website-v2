window.EASYLATIH_TRAINER_PORTAL = {
  supabaseUrl: "https://uxplxejkegommcandldj.supabase.co",
  supabasePublishableKey: "sb_publishable_1AW0hE-8BHIHnzmo2sGDNg_n2kvWkvP",
  appName: "EasyLatih Trainer Collaboration",
  privacyNoticeVersion: "2026-09-06",
  collaborationTermsVersion: "2026-09-06",
  maxActiveProposals: 5,
  supportEmail: "sales@easylatih.my",
  supportWhatsApp: "+60109202811"
};

if (/\/trainer\/dashboard(?:\.html)?$/.test(window.location.pathname)) {
  document.write('<script src="etris-drive-documents.js"><\/script>');
  document.write('<script src="programme-course-outline.js"><\/script>');
  document.write('<script src="programme-admin-changes.js"><\/script>');
  document.write('<script src="journey-notifications.js"><\/script>');
  document.write('<script src="onboarding-ttt-override.js"><\/script>');
  document.write('<script src="onboarding-save-fix.js"><\/script>');
}

if (/\/internal\/trainer-admin(?:\.html)?$/.test(window.location.pathname)) {
  document.write('<script src="trainer-admin-course-outline.js"><\/script>');
  document.write('<script src="trainer-admin-programme-editor.js"><\/script>');
}
