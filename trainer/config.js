window.EASYLATIH_TRAINER_PORTAL = {
  supabaseUrl: "https://uxplxejkegommcandldj.supabase.co",
  supabasePublishableKey: "sb_publishable_1AW0hE-8BHIHnzmo2sGDNg_n2kvWkvP",
  appName: "EasyLatih Trainer Collaboration",
  privacyNoticeVersion: "2026-09-09",
  collaborationTermsVersion: "2026-09-09",
  maxActiveProposals: 5,
  supportEmail: "admin@easylatih.my",
  supportWhatsApp: "+60109202811"
};

if (/\/trainer\/dashboard(?:\.html)?$/.test(window.location.pathname)) {
  document.write('<script src="etris-drive-documents.js"><\/script>');
  document.write('<script src="programme-course-outline.js"><\/script>');
  document.write('<script src="programme-admin-changes.js"><\/script>');
  document.write('<script src="journey-notifications.js"><\/script>');
  document.write('<script src="onboarding-ttt-override.js"><\/script>');
  document.write('<script src="onboarding-save-fix.js"><\/script>');
  document.write('<script src="onboarding-accordion.js"><\/script>');
  document.write('<script src="ttt-evidence-sync.js"><\/script>');
  document.write('<script src="consultancy-profile.js"><\/script>');
  document.write('<script src="waiting-list-sync.js"><\/script>');
  document.write('<script src="opportunity-fee-policy.js"><\/script>');
}

if (/\/internal\/trainer-admin(?:\.html)?$/.test(window.location.pathname)) {
  document.write('<script src="trainer-admin-course-outline.js"><\/script>');
  document.write('<script src="trainer-admin-programme-editor.js"><\/script>');
  document.write('<script src="trainer-admin-ttt-evidence-sync.js"><\/script>');
  document.write('<script src="trainer-admin-pools.js"><\/script>');
  document.write('<script src="../internal/trainer-admin-search.js"><\/script>');
  document.write('<script src="../internal/trainer-admin-workspace.js"><\/script>');
  document.write('<script src="../internal/trainer-admin-opportunity-shortcut.js"><\/script>');
  document.write('<script src="../trainer/opportunity-fee-policy.js"><\/script>');
}
