/**
 * Paste this block INSIDE the existing EasyLatih V2 doGet(e),
 * before the final/default Index return.
 *
 * Preferred URL:
 *   .../exec?page=certificate-batch
 *
 * This version does not depend on an existing `page` or `requestedPage`
 * variable, so it is safe with the current EasyLatih V2 doGet structure.
 */

// START: Manual Certificate Batch route
const certificateBatchPage = String(
  e && e.parameter && e.parameter.page
    ? e.parameter.page
    : ""
).trim();

if (certificateBatchPage === "certificate-batch") {
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
