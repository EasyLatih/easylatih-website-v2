window.EASYLATIH_TRAINER_PORTAL = {
  supabaseUrl: "https://uxplxejkegommcandldj.supabase.co",
  supabasePublishableKey: "sb_publishable_1AW0hE-8BHIHnzmo2sGDNg_n2kvWkvP",
  appName: "EasyLatih Trainer Collaboration",
  privacyNoticeVersion: "2026-09-09",
  collaborationTermsVersion: "2026-09-09",
  maxActiveProposals: 5,
  supportEmail: "admin@easylatih.my",
  supportWhatsApp: "+60109202811",
  publicTrainingAppsScriptUrl: "https://script.google.com/macros/s/AKfycbw1PRE_G3xUUc9WEAOX6m2bAAJ4yvtY3ghMihC4dxGVfsT6JwPjIyJl_VhPdihGA3c/exec"
};

// Trainer dashboard add-on scripts are listed directly in trainer/dashboard.html.

if (/\/internal\/trainer-admin(?:\.html)?$/.test(window.location.pathname)) {
  document.write('<script src="trainer-admin-course-outline.js"><\/script>');
  document.write('<script src="trainer-admin-programme-editor.js"><\/script>');
  document.write('<script src="trainer-admin-ttt-evidence-sync.js"><\/script>');
  document.write('<script src="trainer-admin-pools.js"><\/script>');
  document.write('<script src="../internal/trainer-admin-search.js"><\/script>');
  document.write('<script src="../internal/trainer-admin-scheduled-training.js"><\/script>');
  document.write('<script src="../internal/trainer-admin-shell.js"><\/script>');
  document.write('<script src="../trainer/opportunity-fee-policy.js"><\/script>');
  document.write('<script src="../internal/trainer-admin-public-schedule-bridge.js"><\/script>');
}
