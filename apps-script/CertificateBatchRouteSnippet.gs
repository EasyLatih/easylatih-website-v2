/**
 * Add this block inside the existing EasyLatih V2 doGet(e),
 * after requestedPage/page has been resolved and before the default Index return.
 *
 * Preferred URL:
 *   .../exec?page=certificate-batch
 */

// START: Manual Certificate Batch route
if (requestedPage === "certificate-batch" || page === "certificate-batch") {
  try {
    assertTrainerAdminAccess_();

    return HtmlService
      .createTemplateFromFile("CertificateBatch")
      .evaluate()
      .setTitle("Manual Certificate Batch | EasyLatih")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return HtmlService
      .createHtmlOutput("ACCESS ERROR: " + error.message)
      .setTitle("Access Denied");
  }
}
// END: Manual Certificate Batch route
