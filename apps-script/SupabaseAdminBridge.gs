// One login for EasyLatih admins.
// Add this as a NEW file in the Agent Portal Apps Script project (the one with
// AgentPortalSecure.gs). It uses SHEET_NAME, SESSION_TTL_SECONDS, createSession_,
// jsonOutput, unauthorized_ and forbidden_ from AgentPortalSecure.gs.
//
// A signed-in Admin Centre (Supabase) admin posts their Supabase access token here.
// The token is checked with Supabase; accounts whose app_metadata.role is "admin"
// get an admin Agent Portal session. Any other account is matched by email to an
// ACTIVE row in the Agents sheet (agentSupabaseSession_ in AgentAuth.gs).

const SUPABASE_URL = 'https://uxplxejkegommcandldj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_1AW0hE-8BHIHnzmo2sGDNg_n2kvWkvP';
const ADMIN_ROLES = ['ADMIN', 'SUPER ADMIN', 'SUPERADMIN', 'ADMINISTRATOR', 'OWNER'];

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (error) { body = {}; }
  if (body.action === 'supabaseSession') return supabaseAdminSession_(String(body.accessToken || ''));
  if (typeof routeAgentEmailAdmin_ === 'function') {
    const emailResult = routeAgentEmailAdmin_(body);
    if (emailResult) return emailResult;
  }
  return jsonOutput({ success: false, message: 'Invalid action' });
}

function supabaseAdminSession_(accessToken) {
  if (accessToken.length < 20) return unauthorized_();

  const response = UrlFetchApp.fetch(SUPABASE_URL + '/auth/v1/user', {
    method: 'get',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: 'Bearer ' + accessToken },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) return unauthorized_();

  let user = null;
  try { user = JSON.parse(response.getContentText()); } catch (error) { return unauthorized_(); }
  if (!user) return unauthorized_();
  // Sales agents sign in with their own Supabase account (AgentAuth.gs).
  if (!user.app_metadata || user.app_metadata.role !== 'admin') return agentSupabaseSession_(user);

  // Use the admin's own row in the Agents sheet when one matches their email,
  // otherwise the first active admin row, so the Agent Portal shows their prospects.
  const email = String(user.email || '').trim().toLowerCase();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const cols = agentColumns_(sheet);
  const rows = sheet.getDataRange().getValues();
  let match = null;
  let fallback = null;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const role = String(row[cols.role] || '').trim().toUpperCase();
    if (String(row[cols.status]).trim().toUpperCase() !== 'ACTIVE' || ADMIN_ROLES.indexOf(role) === -1) continue;
    if (!fallback) fallback = row;
    if (email && row.some(cell => String(cell).trim().toLowerCase() === email)) { match = row; break; }
  }
  const row = match || fallback;
  const agentId = row ? String(row[0]) : 'ADMIN';
  const name = row ? String(row[1]) : ((user.user_metadata && user.user_metadata.full_name) || email || 'Admin');

  return jsonOutput({
    success: true,
    agentId: agentId,
    name: name,
    role: 'ADMIN',
    sessionToken: createSession_(agentId, name, 'ADMIN'),
    expiresInSeconds: SESSION_TTL_SECONDS
  });
}
