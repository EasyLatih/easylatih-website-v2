/**
 * Agent access rules for the EasyLatih Agent Portal.
 *
 * - Every successful login is stamped in the Agents sheet ("Last Login").
 * - checkInactiveAgents() runs every morning (6am):
 *     a) an ACTIVE agent with no login for 30 days is set to INACTIVE and loses
 *        access straight away (open sessions stop working);
 *     b) the agent gets a warning email 9 days and 2 days before that happens;
 *     c) every prospect owned by an agent who is not ACTIVE, including the ones
 *        the agent keyed in, goes back to the Prospect Pool. Prospects at
 *        Quotation Sent / HRD Application / Registered, or Not Interested /
 *        Do Not Contact, are handed to Easy Latih (house account) instead, so
 *        they are not called again by another agent.
 *   The 30 days are counted from the later of: last login, the day these rules
 *   started, or the day an admin last set the agent INACTIVE (so reactivating
 *   an agent gives them a fresh 30 days).
 * - Agents must accept the data-ownership notice once (AGREEMENT_VERSION)
 *   before the portal returns any data.
 * - Admin rows (role ADMIN etc.) are never deactivated.
 *
 * Lives in the same Apps Script project as AgentPortalSecure.gs and
 * ProspectPool.gs and uses their helpers.
 */

const AGENT_INACTIVE_DAYS = 30;
const AGENT_WARN_DAYS_LEFT = [9, 2]; // warning emails on day 21 and day 28
const AGREEMENT_VERSION = "DATA-v1";
const AGENT_COL_LAST_LOGIN = "Last Login";
const AGENT_COL_AGREEMENT = "Data Agreement";
const AGENT_COL_DEACTIVATED = "Deactivated At";
const AGENT_COL_INVITED = "Login Invite Sent";
const AGENT_COL_INVITE_EMAIL = "Login Invite Email";
const AGENT_STATUS_COL = 7; // 0-based, "ACTIVE" / "INACTIVE"
const AGENT_ROLE_COL = 6;
const HOUSE_DEFAULT = { id: "EASYLATIH", name: "Easy Latih" };

/* ---------- Agents sheet columns ---------- */

function agentSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
}

// Finds (and if needed adds) the extra columns by header name. 0-based indexes.
function agentColumns_(sheet) {
  const width = Math.max(sheet.getLastColumn(), AGENT_STATUS_COL + 1);
  const header = sheet.getRange(1, 1, 1, width).getValues()[0].map(h => String(h).trim());
  const find = name => header.findIndex(h => h.toLowerCase() === name.toLowerCase());
  const ensure = name => {
    let i = find(name);
    if (i === -1) {
      i = header.length;
      header.push(name);
      sheet.getRange(1, i + 1).setValue(name).setFontWeight("bold");
    }
    return i;
  };
  const cols = {
    lastLogin: ensure(AGENT_COL_LAST_LOGIN),
    agreement: ensure(AGENT_COL_AGREEMENT),
    deactivated: ensure(AGENT_COL_DEACTIVATED),
    invited: ensure(AGENT_COL_INVITED),
    inviteEmail: ensure(AGENT_COL_INVITE_EMAIL)
  };
  cols.email = header.findIndex(h => /e-?mail/i.test(h));
  cols.width = header.length;
  return cols;
}

function isAdminRole_(role) {
  return ["ADMIN", "SUPER ADMIN", "SUPERADMIN", "ADMINISTRATOR", "OWNER"]
    .indexOf(String(role || "").trim().toUpperCase()) !== -1;
}

function agentRulesStart_() {
  const props = PropertiesService.getScriptProperties();
  let start = Number(props.getProperty("AGENT_RULES_START") || 0);
  if (!start) {
    start = Date.now();
    props.setProperty("AGENT_RULES_START", String(start));
  }
  return start;
}

/* ---------- revoked agents (stops open sessions) ---------- */

function revokedAgents_() {
  try {
    return JSON.parse(PropertiesService.getScriptProperties().getProperty("REVOKED_AGENTS") || "[]");
  } catch (error) {
    return [];
  }
}

function setRevoked_(agentId, revoked) {
  const id = String(agentId);
  const list = revokedAgents_().filter(x => x !== id);
  if (revoked) list.push(id);
  PropertiesService.getScriptProperties().setProperty("REVOKED_AGENTS", JSON.stringify(list));
}

function isRevokedAgent_(agentId) {
  return revokedAgents_().indexOf(String(agentId)) !== -1;
}

/* ---------- login and agreement ---------- */

// Called by loginAgent after a successful login. Returns true when the agent has
// already accepted the current data agreement.
function recordAgentLogin_(sheet, rowNumber, row) {
  const cols = agentColumns_(sheet);
  sheet.getRange(rowNumber, cols.lastLogin + 1).setValue(new Date());
  if (isRevokedAgent_(row[0])) setRevoked_(row[0], false);
  PropertiesService.getScriptProperties().deleteProperty("AGENT_WARN_" + row[0]);
  return agreementAccepted_(sheet.getRange(rowNumber, cols.agreement + 1).getValue());
}

function agreementAccepted_(value) {
  return String(value || "").indexOf(AGREEMENT_VERSION) === 0;
}

function acceptAgreement_(e, session) {
  if (String(e.parameter.accept || "") !== "YES") {
    return jsonOutput({ success: false, message: "Persetujuan diperlukan untuk guna portal." });
  }
  const sheet = agentSheet_();
  const cols = agentColumns_(sheet);
  const data = sheet.getDataRange().getValues();
  const stamp = Utilities.formatDate(new Date(), POOL_TZ, "dd/MM/yyyy HH:mm");
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(session.agentId)) {
      sheet.getRange(i + 1, cols.agreement + 1).setValue(AGREEMENT_VERSION + " · " + stamp);
      break;
    }
  }
  const token = String(e.parameter.sessionToken || "").trim();
  session.agreed = true;
  sessionCache_().put(SESSION_PREFIX + token, JSON.stringify(session), SESSION_TTL_SECONDS);
  return jsonOutput({ success: true, message: "Terima kasih. Persetujuan direkodkan." });
}

function agreementRequired_() {
  return jsonOutput({
    success: false,
    code: "AGREEMENT_REQUIRED",
    version: AGREEMENT_VERSION,
    message: "Sila baca dan setuju dengan notis pemilikan data prospek dahulu."
  });
}

/* ---------- daily job ---------- */

function houseOwner_(agentRows) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty("HOUSE_AGENT_ID");
  if (id) return { id: id, name: props.getProperty("HOUSE_AGENT_NAME") || HOUSE_DEFAULT.name };
  const admin = agentRows.find(r =>
    isAdminRole_(r[AGENT_ROLE_COL]) && String(r[AGENT_STATUS_COL]).toUpperCase() === "ACTIVE");
  return admin ? { id: String(admin[0]), name: String(admin[1]) } : HOUSE_DEFAULT;
}

// Works out what the daily check would do. With dryRun it only reports.
function runAgentCheck_(dryRun) {
  const sheet = agentSheet_();
  const cols = agentColumns_(sheet);
  const rows = sheet.getDataRange().getValues().slice(1);
  rows.forEach(r => { while (r.length < cols.width) r.push(""); });
  const start = agentRulesStart_();
  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  const stamp = Utilities.formatDate(now, POOL_TZ, "dd/MM/yyyy");
  const summary = { deactivated: [], warned: [], released: 0, toHouse: 0, inactiveAgents: 0 };
  const inactive = {}; // agentId -> name

  rows.forEach((row, i) => {
    const id = String(row[0] || "").trim();
    if (!id || isAdminRole_(row[AGENT_ROLE_COL])) return;
    const status = String(row[AGENT_STATUS_COL] || "").trim().toUpperCase();

    if (status !== "ACTIVE") {
      inactive[id] = String(row[1] || id);
      return;
    }

    const base = Math.max(toTime_(row[cols.lastLogin]), toTime_(row[cols.deactivated]), start);
    const daysLeft = AGENT_INACTIVE_DAYS - daysSince_(base);

    if (daysLeft <= 0) {
      summary.deactivated.push(id + " (" + row[1] + ")");
      inactive[id] = String(row[1] || id);
      if (!dryRun) {
        sheet.getRange(i + 2, AGENT_STATUS_COL + 1).setValue("INACTIVE");
        sheet.getRange(i + 2, cols.deactivated + 1).setValue(now);
        setRevoked_(id, true);
        props.deleteProperty("AGENT_WARN_" + id);
      }
      return;
    }

    const stage = AGENT_WARN_DAYS_LEFT.filter(d => daysLeft <= d).length; // 0, 1 or 2
    const sent = String(props.getProperty("AGENT_WARN_" + id) || "").split(":");
    const sentStage = sent[0] === String(base) ? Number(sent[1] || 0) : 0;
    if (stage > sentStage) {
      const email = cols.email === -1 ? "" : String(row[cols.email] || "").trim();
      summary.warned.push(id + " (" + daysLeft + " hari lagi" + (email ? "" : ", tiada emel") + ")");
      if (!dryRun) {
        if (email) {
          try {
            sendInactivityWarning_(email, String(row[1] || ""), id, daysLeft);
          } catch (error) {
            console.warn("Warning email to " + id + " failed: " + error);
          }
        }
        props.setProperty("AGENT_WARN_" + id, base + ":" + stage);
      }
    }
  });

  summary.inactiveAgents = Object.keys(inactive).length;

  if (summary.inactiveAgents) {
    const prospectSheet = prospectSheet_();
    const poolSheet = poolSheet_();
    const prospects = readRows_(prospectSheet, PROSPECT_WIDTH);
    const pool = readRows_(poolSheet, POOL_HEADERS.length);
    const house = houseOwner_(rows);

    prospects.forEach((row, i) => {
      const owner = String(row[1] || "");
      if (!owner || !inactive[owner]) return;
      const rowNumber = i + 2;
      const reason = "Ejen tidak aktif (" + inactive[owner] + ")";
      const keep = isProtected_(row) || isDeadStatus_(row[13]);

      if (keep) {
        summary.toHouse++;
        if (!dryRun) {
          prospectSheet.getRange(rowNumber, 2, 1, 2).setValues([[house.id, house.name]]);
          prospectSheet.getRange(rowNumber, 16).setValue(
            String(row[15] || "") + " [Dipindah ke " + house.name + " " + stamp + ": " + reason + "]"
          );
          prospectSheet.getRange(rowNumber, X.lastActivity + 1).setValue(now);
        }
      } else {
        summary.released++;
        if (!dryRun) releaseRowToPool_(prospectSheet, poolSheet, pool, row, rowNumber, reason, now, stamp);
      }
    });
  }

  return summary;
}

function checkInactiveAgents() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return;
  try {
    const s = runAgentCheck_(false);
    PropertiesService.getScriptProperties().setProperty(
      "AGENT_LAST_CHECK",
      Utilities.formatDate(new Date(), POOL_TZ, "yyyy-MM-dd HH:mm") +
        " · " + s.deactivated.length + " dinyahaktif · " + s.warned.length + " diberi amaran · " +
        s.released + " prospek ke pool · " + s.toHouse + " ke Easy Latih"
    );
  } finally {
    lock.releaseLock();
  }
}

// Run from the editor to see what tomorrow's check would do, without changing anything.
function previewAgentCheck() {
  const s = runAgentCheck_(true);
  Logger.log("Ejen akan dinyahaktif: " + (s.deactivated.join(", ") || "tiada"));
  Logger.log("Amaran emel: " + (s.warned.join(", ") || "tiada"));
  Logger.log("Ejen tidak aktif (prospek akan dilepaskan): " + s.inactiveAgents);
  Logger.log("Prospek ke pool: " + s.released + " · Dipindah ke Easy Latih: " + s.toHouse);
}

function sendInactivityWarning_(email, name, agentId, daysLeft) {
  const portal = "https://www.easylatih.my/internal/agent-dashboard.html";
  const subject = "Akaun Agent Portal anda akan dinyahaktifkan dalam " + daysLeft + " hari | Your Agent Portal account";
  const html =
    "<p>Salam " + name + ",</p>" +
    "<p>Akaun Agent Portal Easy Latih anda (<strong>" + agentId + "</strong>) tidak digunakan sejak sekian lama. " +
    "Akaun akan <strong>dinyahaktifkan dalam " + daysLeft + " hari</strong> jika anda tidak log masuk.</p>" +
    "<p>Apabila akaun dinyahaktifkan, semua prospek anda (termasuk yang anda isi sendiri) akan diberikan kepada ejen lain yang aktif.</p>" +
    "<p>Log masuk sekarang untuk kekalkan akaun dan prospek anda: <a href=\"" + portal + "\">" + portal + "</a></p>" +
    "<hr>" +
    "<p>Hi " + name + ",</p>" +
    "<p>Your Easy Latih Agent Portal account (<strong>" + agentId + "</strong>) has not been used for a while. " +
    "It will be <strong>deactivated in " + daysLeft + " days</strong> unless you log in.</p>" +
    "<p>When an account is deactivated, all its prospects (including the ones you added yourself) are given to active agents.</p>" +
    "<p>Log in now to keep your account and prospects: <a href=\"" + portal + "\">" + portal + "</a></p>" +
    "<p>Easy Latih Consultancy</p>";
  MailApp.sendEmail({ to: email, subject: subject, htmlBody: html, name: "Easy Latih" });
}

/* ---------- setup (called from setupProspectPool) ---------- */

function setupAgentAccess_() {
  agentColumns_(agentSheet_());
  agentRulesStart_();
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "checkInactiveAgents") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("checkInactiveAgents").timeBased().everyDays(1).atHour(6).inTimezone(POOL_TZ).create();
}
