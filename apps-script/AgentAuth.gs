/**
 * Agent sign-in with Supabase (email + password), replacing Agent ID login.
 *
 * - Admin presses "Hantar jemputan" in the Agent Portal. For each ACTIVE agent
 *   with an email in the Agents sheet, the agent-auth-link Edge Function makes a
 *   one-time "set your password" link and this script emails it (BM + English)
 *   from the EasyLatih account. Supabase itself sends no email.
 * - The agent sets a password from that link, then signs in with email +
 *   password. The portal posts the Supabase token to doPost (SupabaseAdminBridge.gs),
 *   which calls agentSupabaseSession_ to match the email to an ACTIVE row.
 * - "Lupa / tetapkan kata laluan" in the portal asks for a new link by email
 *   (agentPasswordLink_). The reply is the same whether or not the email is known.
 *
 * Script properties: AGENT_AUTH_SECRET (same value as the Edge Function secret).
 * Uses SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY from SupabaseAdminBridge.gs.
 */

const AGENT_PORTAL_URL = "https://www.easylatih.my/internal/agent-dashboard.html";
const AGENT_AUTH_FUNCTION = "/functions/v1/agent-auth-link";
const AGENT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ---------- Agents sheet helpers ---------- */

function agentEmail_(row, cols) {
  return cols.email === -1 ? "" : String(row[cols.email] || "").trim().toLowerCase();
}

// Agents with their email problems flagged. Rows are 0-based data rows (sheet row = i + 2).
function agentDirectory_() {
  const sheet = agentSheet_();
  const cols = agentColumns_(sheet);
  const rows = sheet.getDataRange().getValues().slice(1);
  rows.forEach(r => { while (r.length < cols.width) r.push(""); });
  const counts = {};
  rows.forEach(r => { const em = agentEmail_(r, cols); if (em) counts[em] = (counts[em] || 0) + 1; });
  const list = rows.map((r, i) => {
    const email = agentEmail_(r, cols);
    let problem = "";
    if (!email) problem = "Tiada emel";
    else if (!AGENT_EMAIL_RE.test(email)) problem = "Format emel salah";
    else if (counts[email] > 1) problem = "Emel berulang";
    return {
      rowNumber: i + 2,
      agentId: String(r[0] || "").trim(),
      name: String(r[1] || ""),
      email: email,
      role: String(r[AGENT_ROLE_COL] || "").trim().toUpperCase(),
      status: String(r[AGENT_STATUS_COL] || "").trim().toUpperCase(),
      lastLogin: dayKey_(r[cols.lastLogin]),
      invited: dayKey_(r[cols.invited]),
      agreed: agreementAccepted_(r[cols.agreement]),
      problem: problem
    };
  }).filter(a => a.agentId);
  return { sheet: sheet, cols: cols, list: list };
}

/* ---------- Edge Function and email ---------- */

function agentAuthLink_(agent) {
  const secret = PropertiesService.getScriptProperties().getProperty("AGENT_AUTH_SECRET") || "";
  if (secret.length < 32) throw new Error("AGENT_AUTH_SECRET belum ditetapkan dalam Script properties.");
  const response = UrlFetchApp.fetch(SUPABASE_URL + AGENT_AUTH_FUNCTION, {
    method: "post",
    contentType: "application/json",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "x-agent-auth-secret": secret },
    payload: JSON.stringify({ action: "link", email: agent.email, name: agent.name, agent_id: agent.agentId }),
    muteHttpExceptions: true
  });
  let result = {};
  try { result = JSON.parse(response.getContentText()); } catch (error) { result = {}; }
  if (response.getResponseCode() !== 200 || !result.ok || !result.link) {
    throw new Error(result.error || ("HTTP " + response.getResponseCode()));
  }
  return result;
}

function sendAgentAccessEmail_(agent, link, kind, shared) {
  const invite = kind === "invite";
  const subject = invite
    ? "Log masuk baharu Agent Portal Easy Latih | New Agent Portal login"
    : "Tetapkan kata laluan Agent Portal Easy Latih | Set your Agent Portal password";
  const button = label => '<p><a href="' + link + '" style="display:inline-block;background:#0d3b66;color:#fff;' +
    'padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">' + label + '</a></p>';
  const sharedBm = shared
    ? "<p>Emel ini sudah ada akaun Easy Latih (contohnya Trainer Portal). Kata laluan baharu akan digunakan untuk semua portal Easy Latih anda.</p>" : "";
  const sharedEn = shared
    ? "<p>This email already has an Easy Latih account (for example the Trainer Portal). The new password will apply to all your Easy Latih portals.</p>" : "";

  const bm =
    "<p>Salam " + agent.name + ",</p>" +
    (invite
      ? "<p>Easy Latih telah menukar cara log masuk ke Agent Portal. <strong>Agent ID dan kata laluan lama tidak lagi boleh digunakan.</strong> Anda perlu tetapkan kata laluan baharu sebelum boleh log masuk.</p>"
      : "<p>Kami terima permintaan untuk menetapkan kata laluan Agent Portal anda.</p>") +
    "<ol><li>Klik butang di bawah.</li>" +
    "<li>Masukkan kata laluan baharu (sekurang-kurangnya 8 aksara) dan tekan Simpan.</li>" +
    "<li>Selepas itu, log masuk di " + AGENT_PORTAL_URL + " menggunakan emel <strong>" + agent.email + "</strong> dan kata laluan baharu anda.</li></ol>" +
    button("Tetapkan Kata Laluan") +
    sharedBm +
    "<p>Pautan ini hanya boleh digunakan sekali dan akan tamat tempoh. Jika tamat, buka Agent Portal dan tekan <strong>Lupa / tetapkan kata laluan</strong> untuk pautan baharu.</p>" +
    (invite ? "" : "<p>Jika anda tidak membuat permintaan ini, abaikan emel ini.</p>");

  const en =
    "<p>Hi " + agent.name + ",</p>" +
    (invite
      ? "<p>Easy Latih has changed how you log in to the Agent Portal. <strong>Your old Agent ID and password no longer work.</strong> You need to set a new password before you can log in.</p>"
      : "<p>We received a request to set your Agent Portal password.</p>") +
    "<ol><li>Click the button below.</li>" +
    "<li>Enter a new password (at least 8 characters) and press Save.</li>" +
    "<li>Then log in at " + AGENT_PORTAL_URL + " with <strong>" + agent.email + "</strong> and your new password.</li></ol>" +
    button("Set Password") +
    sharedEn +
    "<p>This link works once and expires. If it has expired, open the Agent Portal and press <strong>Lupa / tetapkan kata laluan</strong> (Forgot / set password) for a new link.</p>" +
    (invite ? "" : "<p>If you did not ask for this, ignore this email.</p>");

  MailApp.sendEmail({
    to: agent.email,
    subject: subject,
    htmlBody: bm + "<hr>" + en + "<p>Easy Latih Consultancy</p>",
    name: "Easy Latih"
  });
}

/* ---------- admin actions (Agent Portal, admin session) ---------- */

function adminAgents_(e, session) {
  if (!isAdmin_(session)) return forbidden_();
  const dir = agentDirectory_();
  return jsonOutput({
    success: true,
    secretSet: (PropertiesService.getScriptProperties().getProperty("AGENT_AUTH_SECRET") || "").length >= 32,
    agents: dir.list
  });
}

// agentIds: comma-separated IDs, or "PENDING" for every active agent not yet invited.
function sendAgentInvites_(e, session) {
  if (!isAdmin_(session)) return forbidden_();
  const wanted = String(e.parameter.agentIds || "").trim();
  if (!wanted) return jsonOutput({ success: false, message: "Pilih ejen." });

  const dir = agentDirectory_();
  const ids = wanted === "PENDING" ? null : wanted.split(",").map(s => s.trim()).filter(Boolean);
  const targets = dir.list.filter(a =>
    a.status === "ACTIVE" && !isAdminRole_(a.role) &&
    (ids ? ids.indexOf(a.agentId) !== -1 : !a.invited));

  const results = [];
  targets.forEach(a => {
    if (a.problem) { results.push({ agentId: a.agentId, ok: false, message: a.problem }); return; }
    try {
      const link = agentAuthLink_(a);
      sendAgentAccessEmail_(a, link.link, "invite", link.shared);
      dir.sheet.getRange(a.rowNumber, dir.cols.invited + 1).setValue(new Date());
      results.push({ agentId: a.agentId, ok: true, message: "Dihantar ke " + a.email });
    } catch (error) {
      results.push({ agentId: a.agentId, ok: false, message: String(error.message || error) });
    }
  });

  const sent = results.filter(r => r.ok).length;
  return jsonOutput({
    success: true,
    message: sent + " jemputan dihantar" + (results.length > sent ? ", " + (results.length - sent) + " gagal" : "") + ".",
    results: results
  });
}

/* ---------- public: forgot / set password ---------- */

function agentPasswordLink_(e) {
  const email = String(e.parameter.email || "").trim().toLowerCase();
  const reply = jsonOutput({
    success: true,
    message: "Jika emel ini berdaftar sebagai ejen aktif, pautan untuk tetapkan kata laluan telah dihantar. Semak inbox dan folder spam."
  });
  if (!AGENT_EMAIL_RE.test(email)) return reply;

  // At most one link per email every 10 minutes, and 30 an hour overall.
  const cache = CacheService.getScriptCache();
  const key = "agent-pw-link:" + Utilities.base64EncodeWebSafe(email).slice(0, 200);
  if (cache.get(key)) return reply;
  const hourKey = "agent-pw-link-hour:" + Utilities.formatDate(new Date(), POOL_TZ, "yyyyMMddHH");
  const hourCount = Number(cache.get(hourKey) || 0);
  if (hourCount >= 30) return reply;
  cache.put(key, "1", 600);
  cache.put(hourKey, String(hourCount + 1), 3600);

  const agent = agentDirectory_().list.find(a =>
    a.email === email && a.status === "ACTIVE" && !isAdminRole_(a.role) && a.problem !== "Emel berulang");
  if (!agent) return reply;
  try {
    const link = agentAuthLink_(agent);
    sendAgentAccessEmail_(agent, link.link, link.existing ? "reset" : "invite", link.shared);
  } catch (error) {
    console.warn("Password link for " + agent.agentId + " failed: " + error);
  }
  return reply;
}

/* ---------- sign-in (called from doPost in SupabaseAdminBridge.gs) ---------- */

// user: the Supabase user returned by /auth/v1/user for a non-admin account.
function agentSupabaseSession_(user) {
  const email = String(user.email || "").trim().toLowerCase();
  if (!email) return forbidden_();
  const dir = agentDirectory_();
  const matches = dir.list.filter(a => a.email === email);
  if (!matches.length) {
    return jsonOutput({ success: false, code: "NOT_AGENT", message: "Emel ini tidak berdaftar sebagai ejen Easy Latih. Hubungi admin." });
  }
  if (matches.length > 1) {
    return jsonOutput({ success: false, code: "NOT_AGENT", message: "Emel ini digunakan oleh lebih daripada satu ejen. Hubungi admin." });
  }
  const agent = matches[0];
  if (agent.status !== "ACTIVE") {
    return jsonOutput({ success: false, code: "INACTIVE", message: "Akaun ejen anda tidak aktif. Hubungi admin Easy Latih." });
  }
  const row = dir.sheet.getRange(agent.rowNumber, 1, 1, dir.cols.width).getValues()[0];
  const agreed = recordAgentLogin_(dir.sheet, agent.rowNumber, row);
  return jsonOutput({
    success: true,
    agentId: agent.agentId,
    name: agent.name,
    role: agent.role,
    needsAgreement: !agreed && !isAdminRole_(agent.role),
    sessionToken: createSession_(agent.agentId, agent.name, agent.role, agreed),
    expiresInSeconds: SESSION_TTL_SECONDS
  });
}

/* ---------- run from the editor ---------- */

// Lists agents whose email is missing, malformed or used twice. Never logs passwords.
function auditAgentEmails() {
  const list = agentDirectory_().list.filter(a => a.status === "ACTIVE" && !isAdminRole_(a.role));
  Logger.log("Ejen aktif: " + list.length);
  const bad = list.filter(a => a.problem);
  Logger.log("Bermasalah: " + bad.length);
  bad.forEach(a => Logger.log(a.agentId + " (" + a.name + "): " + a.problem + (a.email ? " · " + a.email : "")));
}

// Checks where a password link lands (needs AGENT_AUTH_SECRET). Uses the script owner's email.
function probeAgentRedirect() {
  const secret = PropertiesService.getScriptProperties().getProperty("AGENT_AUTH_SECRET") || "";
  const response = UrlFetchApp.fetch(SUPABASE_URL + AGENT_AUTH_FUNCTION, {
    method: "post",
    contentType: "application/json",
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, "x-agent-auth-secret": secret },
    payload: JSON.stringify({ action: "probe", email: Session.getEffectiveUser().getEmail() }),
    muteHttpExceptions: true
  });
  Logger.log(response.getResponseCode() + " " + response.getContentText());
}
