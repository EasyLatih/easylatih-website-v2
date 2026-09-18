/**
 * EasyLatih public homepage impact metrics.
 *
 * Add this file to the existing EasyLatih Apps Script project that owns the
 * deployed public web app, then add this route near the top of doGet(e):
 *
 *   if (String(e.parameter.action || '') === 'getImpactStats') {
 *     return getImpactStatsResponse_(e);
 *   }
 *
 * The Master Database remains private. Only the three rows from ImpactStats
 * are returned publicly.
 */

const EASYLATIH_MASTER_DATABASE_ID_ = '1GjiC8RJF189_nK8T-3SM64xrR6yo5v4HtEC248Xl7DQ';

function getImpactStats_() {
  const sheet = SpreadsheetApp
    .openById(EASYLATIH_MASTER_DATABASE_ID_)
    .getSheetByName('ImpactStats');

  if (!sheet) return [];

  const values = sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 1), 4).getDisplayValues();
  if (values.length < 2) return [];

  const allowed = new Set([
    'TRAINING_DELIVERED',
    'PARTICIPANTS_TRAINED',
    'ORGANISATIONS_SERVED'
  ]);

  return values.slice(1)
    .map(row => ({
      metricKey: String(row[0] || '').trim().toUpperCase(),
      value: Number(String(row[1] || '').replace(/,/g, '')) || 0,
      label: String(row[2] || '').trim(),
      updatedAt: String(row[3] || '').trim()
    }))
    .filter(row => allowed.has(row.metricKey));
}

function getImpactStatsResponse_(e) {
  const callback = String((e && e.parameter && e.parameter.callback) || '').trim();
  const payload = JSON.stringify(getImpactStats_());

  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + '(' + payload + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}
