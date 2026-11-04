/**
 * Prospect Pool for the EasyLatih Agent Portal.
 *
 * - Every morning a CSV of new companies (min 10 staff) is dropped into a Drive
 *   folder. importPoolFromDrive() moves them into the "Prospect Pool" sheet.
 * - Agents see only the company name, industry and district, and press "Ambil".
 *   The first agent wins (LockService). Each agent may take 10 a day.
 * - After claiming, the company address, phone and email appear, and the agent
 *   records the PIC (name, position, email, mobile).
 * - releaseStaleProspects() runs daily and returns to the pool:
 *     a) pool prospects not contacted within 3 days of being taken
 *     b) any prospect with no activity for 30 days (7-day grace at launch)
 *   Prospects at QUOTATION SENT, HRD APPLICATION, REGISTERED, NOT INTERESTED or
 *   DO NOT CONTACT, or with a quotation sent/accepted, are never released.
 * - recordContact saves the outcome of the first call (from the dashboard's
 *   "Hubungi Sekarang" card), optionally with the PIC. "Maklumat salah" removes a
 *   pool company and does not count it towards the daily limit.
 * - Agents who stop logging in are handled in AgentAccess.gs.
 *
 * Lives in the same Apps Script project as AgentPortalSecure.gs and uses its
 * helpers (jsonOutput, isAdmin_, forbidden_, validRowNumber_, canEditRow_,
 * normalizeCompany, PROSPECT_SHEET).
 */

const POOL_SHEET = "Prospect Pool";
const POOL_DAILY_CLAIM_LIMIT = 10;
const POOL_FIRST_CONTACT_DAYS = 3;
const POOL_STALE_DAYS = 30;
const POOL_WARN_DAYS = 21;
const POOL_GRACE_DAYS = 7;
const POOL_TZ = "Asia/Kuala_Lumpur";

// Drive folder the daily CSV is uploaded to. Set by setupProspectPool() or by hand
// in Project Settings → Script properties → POOL_IMPORT_FOLDER_ID.
const POOL_DEFAULT_IMPORT_FOLDER_ID = "1tZ90Juw6VKyrbHLNBvj2cOE_Rni7O-pu"; // "EasyLatih Prospect Pool Import"

const POOL_HEADERS = [
  "Pool ID", "Date Added", "Company", "Industry", "Address", "District", "State",
  "Company Phone", "Company Email", "Website", "Est. Employees", "Employee Confidence",
  "Source", "Status", "Claimed By", "Claimed Name", "Claimed At", "Origin",
  "Released From", "Prospect Key", "Notes"
];
const P = { // Prospect Pool column indexes (0-based)
  id: 0, added: 1, company: 2, industry: 3, address: 4, district: 5, state: 6,
  phone: 7, email: 8, website: 9, employees: 10, confidence: 11, source: 12,
  status: 13, claimedBy: 14, claimedName: 15, claimedAt: 16, origin: 17,
  releasedFrom: 18, key: 19, notes: 20
};

// Extra columns appended to the existing Prospects sheet (after column X).
const PROSPECT_EXTRA_HEADERS = [
  "Source", "Prospect Key", "Claimed At", "Company Address",
  "Company Phone", "Company Email", "Last Activity", "Industry"
];
const X = { // Prospects column indexes (0-based) for the extra columns
  source: 24, key: 25, claimedAt: 26, address: 27,
  companyPhone: 28, companyEmail: 29, lastActivity: 30, industry: 31
};
const PROSPECT_WIDTH = 32;
const CLOSED_STATUSES = ["QUOTATION SENT", "HRD APPLICATION", "REGISTERED", "NOT INTERESTED", "DO NOT CONTACT"];
// Prospects that must never be called again or sent back to the pool.
const DEAD_STATUSES = ["NOT INTERESTED", "DO NOT CONTACT", "INVALID INFO"];

function isDeadStatus_(status) {
  return DEAD_STATUSES.indexOf(String(status || "").toUpperCase()) !== -1;
}

/* ---------- routing (called from doGet in AgentPortalSecure.gs) ---------- */

function routeProspectPool_(action, e, session) {
  if (action === "getPool") return getPool_(e, session);
  if (action === "claimProspect") return claimProspect_(e, session);
  if (action === "updatePic") return updatePic_(e, session);
  if (action === "recordContact") return recordContact_(e, session);
  if (action === "adminPool") return adminPool_(e, session);
  return null;
}

/* ---------- sheets ---------- */

function poolSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(POOL_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(POOL_SHEET);
    sheet.getRange(1, 1, 1, POOL_HEADERS.length).setValues([POOL_HEADERS]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function prospectSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROSPECT_SHEET);
  const header = sheet.getRange(1, X.source + 1, 1, PROSPECT_EXTRA_HEADERS.length).getValues()[0];
  if (!header[0]) {
    sheet.getRange(1, X.source + 1, 1, PROSPECT_EXTRA_HEADERS.length)
      .setValues([PROSPECT_EXTRA_HEADERS]).setFontWeight("bold");
  }
  return sheet;
}

function readRows_(sheet, width) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, width).getValues();
}

/* ---------- date helpers ---------- */

function dayKey_(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return "";
  return Utilities.formatDate(d, POOL_TZ, "yyyy-MM-dd");
}

function toTime_(value) {
  if (!value) return 0;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function daysSince_(time) {
  return time ? Math.floor((Date.now() - time) / 86400000) : 9999;
}

function rulesStart_() {
  const props = PropertiesService.getScriptProperties();
  let start = Number(props.getProperty("POOL_RULES_START") || 0);
  if (!start) {
    start = Date.now();
    props.setProperty("POOL_RULES_START", String(start));
  }
  return start;
}

/* ---------- prospect status helpers (also used by getDashboard) ---------- */

function isProtected_(row) {
  const status = String(row[13] || "NEW LEAD").toUpperCase();
  const quotation = String(row[16] || "").toUpperCase();
  return CLOSED_STATUSES.indexOf(status) !== -1 || quotation === "SENT" || quotation === "ACCEPTED";
}

function lastActivityTime_(row) {
  return Math.max(toTime_(row[0]), toTime_(row[20]), toTime_(row[X.claimedAt]), toTime_(row[X.lastActivity]));
}

// Returns {rule, daysLeft} for the rule that will release this prospect first, or null.
function releaseInfo_(row, startTime) {
  if (!row[1] || isProtected_(row)) return null;
  const status = String(row[13] || "NEW LEAD").toUpperCase();
  const claimedAt = toTime_(row[X.claimedAt]);
  const lastCall = toTime_(row[20]);
  const fromPool = String(row[X.source] || "").toUpperCase().indexOf("POOL") === 0;

  if (fromPool && claimedAt && status === "NEW LEAD" && lastCall < claimedAt) {
    return { rule: "FIRST_CONTACT", daysLeft: POOL_FIRST_CONTACT_DAYS - daysSince_(claimedAt) };
  }

  const graceFloor = startTime - (POOL_STALE_DAYS - POOL_GRACE_DAYS) * 86400000;
  const effective = Math.max(lastActivityTime_(row), graceFloor);
  return { rule: "IDLE_30", daysLeft: POOL_STALE_DAYS - daysSince_(effective) };
}

function prospectExtras_(row) {
  const info = releaseInfo_(row, rulesStart_());
  return {
    source: row[X.source] || "",
    companyAddress: row[X.address] || "",
    companyPhone: row[X.companyPhone] || "",
    companyEmail: row[X.companyEmail] || "",
    industry: row[X.industry] || "",
    claimedAt: dayKey_(row[X.claimedAt]),
    lastActivity: dayKey_(lastActivityTime_(row)),
    picMissing: !String(row[4] || "").trim(),
    releaseRule: info ? info.rule : "",
    releaseInDays: info ? info.daysLeft : null
  };
}

// Prospects that will soon go back to the pool, for the agent's warning list.
function releaseWarnings_(prospects) {
  return prospects.filter(p =>
    p.releaseRule && (
      (p.releaseRule === "FIRST_CONTACT") ||
      (p.releaseRule === "IDLE_30" && p.releaseInDays <= POOL_STALE_DAYS - POOL_WARN_DAYS)
    )
  ).sort((a, b) => a.releaseInDays - b.releaseInDays);
}

function touchProspect_(sheet, rowNumber) {
  prospectSheet_();
  sheet.getRange(rowNumber, X.lastActivity + 1).setValue(new Date());
}

/* ---------- agent actions ---------- */

function claimsToday_(agentId, prospects) {
  const today = dayKey_(new Date());
  return prospects.filter(r =>
    String(r[1]) === String(agentId) &&
    String(r[X.source] || "").toUpperCase().indexOf("POOL") === 0 &&
    dayKey_(r[X.claimedAt]) === today
  ).length;
}

function getPool_(e, session) {
  const pool = readRows_(poolSheet_(), POOL_HEADERS.length);
  const prospects = readRows_(prospectSheet_(), PROSPECT_WIDTH);
  const taken = claimsToday_(session.agentId, prospects);

  const available = pool
    .filter(r => String(r[P.status]).toUpperCase() === "AVAILABLE")
    .map(r => ({
      poolId: String(r[P.id]),
      company: r[P.company],
      industry: r[P.industry],
      district: r[P.district],
      state: r[P.state],
      employees: r[P.employees],
      confidence: r[P.confidence],
      origin: r[P.origin],
      dateAdded: dayKey_(r[P.added])
    }))
    .sort((a, b) => String(b.dateAdded).localeCompare(String(a.dateAdded)));

  return jsonOutput({
    success: true,
    limit: POOL_DAILY_CLAIM_LIMIT,
    takenToday: taken,
    remainingToday: Math.max(0, POOL_DAILY_CLAIM_LIMIT - taken),
    available: available
  });
}

function claimProspect_(e, session) {
  const poolId = String(e.parameter.poolId || "").trim();
  if (!poolId) return jsonOutput({ success: false, message: "Prospek tidak sah." });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return jsonOutput({ success: false, message: "Sistem sibuk. Cuba lagi sebentar." });
  }

  try {
    const poolSheet = poolSheet_();
    const prospectSheet = prospectSheet_();
    const pool = readRows_(poolSheet, POOL_HEADERS.length);
    const prospects = readRows_(prospectSheet, PROSPECT_WIDTH);

    const index = pool.findIndex(r => String(r[P.id]) === poolId);
    if (index === -1) return jsonOutput({ success: false, message: "Prospek tidak dijumpai." });
    const item = pool[index];
    const poolRow = index + 2;

    if (String(item[P.status]).toUpperCase() !== "AVAILABLE") {
      return jsonOutput({ success: false, code: "TAKEN", message: "Maaf, syarikat ini sudah diambil oleh ejen lain." });
    }

    if (claimsToday_(session.agentId, prospects) >= POOL_DAILY_CLAIM_LIMIT) {
      return jsonOutput({ success: false, code: "LIMIT", message: "Anda sudah ambil " + POOL_DAILY_CLAIM_LIMIT + " syarikat hari ini. Cuba lagi esok." });
    }

    const now = new Date();
    let key = String(item[P.key] || "");
    let prospectRow = 0;

    if (key) {
      // A released prospect: hand the existing record (with its history) to the new agent.
      const i = prospects.findIndex(r => String(r[X.key]) === key);
      if (i !== -1) prospectRow = i + 2;
    } else {
      // Guard against a company an agent added by hand since the import.
      const name = normalizeCompany(item[P.company]);
      const owned = prospects.find(r => r[1] && name && normalizeCompany(r[3]) === name);
      if (owned) {
        poolSheet.getRange(poolRow, P.status + 1).setValue("DUPLICATE");
        poolSheet.getRange(poolRow, P.notes + 1).setValue("Sudah ada dalam Prospects (" + owned[2] + ")");
        return jsonOutput({ success: false, code: "TAKEN", message: "Syarikat ini sudah ada dalam senarai ejen lain." });
      }
    }

    if (prospectRow) {
      prospectSheet.getRange(prospectRow, 2, 1, 2).setValues([[session.agentId, session.name]]);
      prospectSheet.getRange(prospectRow, 14).setValue("NEW LEAD");
      prospectSheet.getRange(prospectRow, X.source + 1).setValue("POOL (RELEASED)");
      prospectSheet.getRange(prospectRow, X.claimedAt + 1).setValue(now);
      prospectSheet.getRange(prospectRow, X.lastActivity + 1).setValue(now);
    } else {
      key = key || Utilities.getUuid();
      const row = new Array(PROSPECT_WIDTH).fill("");
      row[0] = now;
      row[1] = session.agentId;
      row[2] = session.name;
      row[3] = item[P.company];
      row[9] = item[P.state];
      row[10] = item[P.district];
      row[13] = "NEW LEAD";
      row[15] = "Dari Prospect Pool" + (item[P.employees] ? " · anggaran " + item[P.employees] + " pekerja" : "");
      row[16] = "NOT SENT";
      row[X.source] = "POOL";
      row[X.key] = key;
      row[X.claimedAt] = now;
      row[X.address] = item[P.address];
      row[X.companyPhone] = item[P.phone];
      row[X.companyEmail] = item[P.email];
      row[X.lastActivity] = now;
      row[X.industry] = item[P.industry];
      prospectSheet.appendRow(row);
      prospectRow = prospectSheet.getLastRow();
    }

    poolSheet.getRange(poolRow, P.status + 1, 1, 4)
      .setValues([["CLAIMED", session.agentId, session.name, now]]);
    poolSheet.getRange(poolRow, P.key + 1).setValue(key);
    SpreadsheetApp.flush();

    return jsonOutput({
      success: true,
      message: "Prospek berjaya diambil.",
      rowNumber: prospectRow,
      company: item[P.company],
      address: item[P.address],
      district: item[P.district],
      state: item[P.state],
      companyPhone: item[P.phone],
      companyEmail: item[P.email],
      website: item[P.website]
    });
  } finally {
    lock.releaseLock();
  }
}

function updatePic_(e, session) {
  const rowNumber = Number(e.parameter.rowNumber);
  const sheet = prospectSheet_();
  if (!validRowNumber_(rowNumber, sheet)) return jsonOutput({ success: false, message: "Rekod tidak sah." });
  if (!canEditRow_(sheet, rowNumber, session)) return forbidden_();

  const pic = readPic_(e);
  if (!pic.name || !pic.position) return jsonOutput({ success: false, message: "Isi nama dan jawatan PIC." });
  const error = picError_(pic);
  if (error) return jsonOutput({ success: false, message: error });

  writePic_(sheet, rowNumber, pic);
  sheet.getRange(rowNumber, X.lastActivity + 1).setValue(new Date());

  return jsonOutput({ success: true, message: "Maklumat PIC disimpan." });
}

function readPic_(e) {
  const clean = v => String(v || "").trim().slice(0, 200);
  return {
    name: clean(e.parameter.picName),
    position: clean(e.parameter.picPosition),
    email: clean(e.parameter.picEmail).toLowerCase(),
    mobile: clean(e.parameter.picPhone),
    levy: clean(e.parameter.levy).toUpperCase()
  };
}

function picError_(pic) {
  if (!pic.email && !pic.mobile) return "Isi sekurang-kurangnya emel atau no. HP PIC.";
  if (pic.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pic.email)) return "Format emel PIC tidak sah.";
  return "";
}

function writePic_(sheet, rowNumber, pic) {
  sheet.getRange(rowNumber, 5, 1, 2).setValues([[pic.name, pic.position]]);
  sheet.getRange(rowNumber, 7).setValue(pic.mobile);
  sheet.getRange(rowNumber, 9).setValue(pic.email);
  if (pic.levy === "YA" || pic.levy === "TIDAK") sheet.getRange(rowNumber, 12).setValue(pic.levy);
}

// Outcome of contacting a prospect, from the "Hubungi Sekarang" card.
const CONTACT_OUTCOMES = {
  NO_ANSWER:      { status: "CONTACTED",      label: "Tiada jawapan",          needsDate: true },
  CALLBACK:       { status: "CONTACTED",      label: "Minta hubungi semula",   needsDate: true },
  INTERESTED:     { status: "INTERESTED",     label: "Berminat",               needsDate: true },
  NOT_INTERESTED: { status: "NOT INTERESTED", label: "Tidak berminat",         needsDate: false },
  DO_NOT_CONTACT: { status: "DO NOT CONTACT", label: "Minta jangan dihubungi", needsDate: false },
  WRONG_INFO:     { status: "INVALID INFO",   label: "Maklumat syarikat salah", needsDate: false }
};

function recordContact_(e, session) {
  const rowNumber = Number(e.parameter.rowNumber);
  const outcomeKey = String(e.parameter.outcome || "").trim().toUpperCase();
  const outcome = CONTACT_OUTCOMES[outcomeKey];
  const remark = String(e.parameter.callRemark || "").trim().slice(0, 2000);
  const nextDate = String(e.parameter.nextFollowUpDate || "").trim();
  const sheet = prospectSheet_();

  if (!validRowNumber_(rowNumber, sheet)) return jsonOutput({ success: false, message: "Rekod tidak sah." });
  if (!canEditRow_(sheet, rowNumber, session)) return forbidden_();
  if (!outcome) return jsonOutput({ success: false, message: "Pilih hasil panggilan." });
  if (outcome.needsDate && !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) {
    return jsonOutput({ success: false, message: "Pilih tarikh follow up seterusnya." });
  }
  if (outcomeKey === "WRONG_INFO" && !remark) {
    return jsonOutput({ success: false, message: "Nyatakan apa yang salah (cth. nombor tidak wujud, syarikat sudah tutup)." });
  }

  const pic = readPic_(e);
  const hasPic = pic.name || pic.position || pic.email || pic.mobile;
  if (hasPic) {
    if (!pic.name) return jsonOutput({ success: false, message: "Isi nama PIC, atau kosongkan semua ruangan PIC." });
    const error = picError_(pic);
    if (error) return jsonOutput({ success: false, message: error });
  }

  const row = sheet.getRange(rowNumber, 1, 1, PROSPECT_WIDTH).getValues()[0];
  const now = new Date();
  const note = outcome.label + (remark ? ": " + remark : "");

  if (outcomeKey === "WRONG_INFO") {
    if (String(row[X.source] || "").toUpperCase().indexOf("POOL") !== 0) {
      return jsonOutput({ success: false, message: "Laporan maklumat salah hanya untuk prospek dari pool." });
    }
    return reportWrongInfo_(sheet, rowNumber, row, session, remark, now);
  }

  sheet.getRange(rowNumber, 21, 1, 4).setValues([[now, note, nextDate, "FOLLOW UP"]]);
  sheet.getRange(rowNumber, 14).setValue(outcome.status);
  if (hasPic) writePic_(sheet, rowNumber, pic);
  sheet.getRange(rowNumber, X.lastActivity + 1).setValue(now);

  return jsonOutput({ success: true, message: "Hasil panggilan disimpan." });
}

// A pool company whose details are wrong: remove it from the agent and the pool,
// and do not count it towards the agent's 10-a-day limit.
function reportWrongInfo_(sheet, rowNumber, row, session, remark, now) {
  const stamp = Utilities.formatDate(now, POOL_TZ, "dd/MM/yyyy");
  sheet.getRange(rowNumber, 2, 1, 2).setValues([["", ""]]);
  sheet.getRange(rowNumber, 14).setValue("INVALID INFO");
  sheet.getRange(rowNumber, 16).setValue(
    String(row[15] || "") + " [Maklumat salah " + stamp + " oleh " + session.name + " (" + session.agentId + "): " + remark + "]"
  );
  sheet.getRange(rowNumber, X.lastActivity + 1).setValue(now);

  const key = String(row[X.key] || "");
  if (key) {
    const poolSheet = poolSheet_();
    const pool = readRows_(poolSheet, POOL_HEADERS.length);
    const i = pool.findIndex(r => String(r[P.key]) === key);
    if (i !== -1) {
      poolSheet.getRange(i + 2, P.status + 1).setValue("INVALID");
      poolSheet.getRange(i + 2, P.notes + 1).setValue("Dilapor salah oleh " + session.agentId + " (" + stamp + "): " + remark);
    }
  }
  return jsonOutput({ success: true, message: "Terima kasih. Syarikat ini dikeluarkan dan tidak dikira dalam had harian anda." });
}

function adminPool_(e, session) {
  if (!isAdmin_(session)) return forbidden_();
  const pool = readRows_(poolSheet_(), POOL_HEADERS.length);
  const today = dayKey_(new Date());
  const weekAgo = Date.now() - 7 * 86400000;
  const byAgent = {};
  let available = 0, claimedToday = 0, released7d = 0;

  let invalid7d = 0;
  pool.forEach(r => {
    const status = String(r[P.status]).toUpperCase();
    if (status === "AVAILABLE") available++;
    if (status === "AVAILABLE" && String(r[P.origin]).toUpperCase() === "RELEASED" && toTime_(r[P.added]) >= weekAgo) released7d++;
    if (status === "INVALID" && toTime_(r[P.claimedAt]) >= weekAgo) invalid7d++;
    if ((status === "CLAIMED" || status === "INVALID") && dayKey_(r[P.claimedAt]) === today) {
      const id = String(r[P.claimedBy]);
      byAgent[id] = byAgent[id] || { agentId: id, agentName: r[P.claimedName], claimedToday: 0, invalidToday: 0 };
      if (status === "CLAIMED") { claimedToday++; byAgent[id].claimedToday++; }
      else byAgent[id].invalidToday++;
    }
  });

  const props = PropertiesService.getScriptProperties();
  return jsonOutput({
    success: true,
    available: available,
    claimedToday: claimedToday,
    released7d: released7d,
    invalid7d: invalid7d,
    agents: Object.values(byAgent).sort((a, b) => b.claimedToday - a.claimedToday),
    lastImport: props.getProperty("POOL_LAST_IMPORT") || "",
    lastAgentCheck: props.getProperty("AGENT_LAST_CHECK") || ""
  });
}

/* ---------- daily jobs (time-driven triggers) ---------- */

function releaseStaleProspects() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return;
  try {
    const startTime = rulesStart_();
    const prospectSheet = prospectSheet_();
    const poolSheet = poolSheet_();
    const prospects = readRows_(prospectSheet, PROSPECT_WIDTH);
    const pool = readRows_(poolSheet, POOL_HEADERS.length);
    const now = new Date();
    const stamp = Utilities.formatDate(now, POOL_TZ, "dd/MM/yyyy");
    let released = 0;

    prospects.forEach((row, i) => {
      const info = releaseInfo_(row, startTime);
      if (!info || info.daysLeft > 0) return;
      const reason = info.rule === "FIRST_CONTACT"
        ? "Tidak dihubungi dalam " + POOL_FIRST_CONTACT_DAYS + " hari selepas diambil"
        : "Tiada aktiviti " + POOL_STALE_DAYS + " hari";
      releaseRowToPool_(prospectSheet, poolSheet, pool, row, i + 2, reason, now, stamp);
      released++;
    });

    PropertiesService.getScriptProperties().setProperty(
      "POOL_LAST_RELEASE", Utilities.formatDate(now, POOL_TZ, "yyyy-MM-dd HH:mm") + " · " + released + " dilepaskan"
    );
  } finally {
    lock.releaseLock();
  }
}

// Takes a prospect away from its agent and makes it available in the pool,
// keeping the call history and PIC on the Prospects row for the next agent.
function releaseRowToPool_(prospectSheet, poolSheet, pool, row, rowNumber, reason, now, stamp) {
  const fromAgent = String(row[1]);
  const fromName = String(row[2]);
  const key = String(row[X.key] || "") || Utilities.getUuid();

  prospectSheet.getRange(rowNumber, 2, 1, 2).setValues([["", ""]]);
  prospectSheet.getRange(rowNumber, 16).setValue(
    String(row[15] || "") + " [Dilepaskan " + stamp + " dari " + fromName + ": " + reason + "]"
  );
  prospectSheet.getRange(rowNumber, X.key + 1).setValue(key);

  const values = new Array(POOL_HEADERS.length).fill("");
  values[P.added] = now;
  values[P.company] = row[3];
  values[P.industry] = row[X.industry];
  values[P.address] = row[X.address];
  values[P.district] = row[10];
  values[P.state] = row[9];
  values[P.phone] = row[X.companyPhone] || row[6];
  values[P.email] = row[X.companyEmail] || row[8];
  values[P.source] = "Dilepaskan";
  values[P.status] = "AVAILABLE";
  values[P.origin] = "RELEASED";
  values[P.releasedFrom] = fromAgent;
  values[P.key] = key;
  values[P.notes] = reason;

  const existing = pool.findIndex(r => String(r[P.key]) === key);
  if (existing !== -1) {
    values[P.id] = pool[existing][P.id];
    values[P.website] = pool[existing][P.website];
    values[P.employees] = pool[existing][P.employees];
    values[P.confidence] = pool[existing][P.confidence];
    poolSheet.getRange(existing + 2, 1, 1, values.length).setValues([values]);
    pool[existing] = values;
  } else {
    values[P.id] = "R" + Utilities.formatDate(now, POOL_TZ, "yyMMdd") + "-" + rowNumber;
    poolSheet.appendRow(values);
    pool.push(values);
  }
}

function importFolderId_() {
  return PropertiesService.getScriptProperties().getProperty("POOL_IMPORT_FOLDER_ID") || POOL_DEFAULT_IMPORT_FOLDER_ID;
}

// Reads every new CSV in the import folder, adds new companies to the pool,
// then renames the file to DONE_<name>. Expected headers (any order):
// company, industry, address, district, state, phone, email, website,
// est_employees, employee_confidence, source
function importPoolFromDrive() {
  const folderId = importFolderId_();
  if (!folderId) throw new Error("Set POOL_IMPORT_FOLDER_ID in Script properties first.");

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(60000)) return;
  try {
    const poolSheet = poolSheet_();
    const pool = readRows_(poolSheet, POOL_HEADERS.length);
    const prospects = readRows_(prospectSheet_(), PROSPECT_WIDTH);
    const known = {};
    pool.forEach(r => { known[normalizeCompany(r[P.company])] = true; });
    prospects.forEach(r => { known[normalizeCompany(r[3])] = true; });

    const files = DriveApp.getFolderById(folderId).getFiles();
    const now = new Date();
    const prefix = "P" + Utilities.formatDate(now, POOL_TZ, "yyMMdd") + "-";
    let seq = pool.filter(r => String(r[P.id]).indexOf(prefix) === 0).length;
    let added = 0, skipped = 0, fileCount = 0;
    const newRows = [];

    while (files.hasNext()) {
      const file = files.next();
      const name = file.getName();
      if (name.indexOf("DONE_") === 0 || !/\.csv$/i.test(name)) continue;
      fileCount++;

      const rows = Utilities.parseCsv(file.getBlob().getDataAsString("UTF-8"));
      if (rows.length < 2) { file.setName("DONE_" + name); continue; }
      const head = rows[0].map(h => String(h).trim().toLowerCase().replace(/[^a-z_]/g, "_"));
      const col = h => head.indexOf(h);

      for (let i = 1; i < rows.length; i++) {
        const get = h => col(h) === -1 ? "" : String(rows[i][col(h)] || "").trim().slice(0, 300);
        const company = get("company");
        const phone = get("phone");
        const email = get("email");
        const norm = normalizeCompany(company);
        if (!norm || norm.length < 3 || (!phone && !email) || known[norm]) { skipped++; continue; }
        known[norm] = true;

        const values = new Array(POOL_HEADERS.length).fill("");
        values[P.id] = prefix + String(++seq).padStart(3, "0");
        values[P.added] = now;
        values[P.company] = company;
        values[P.industry] = get("industry");
        values[P.address] = get("address");
        values[P.district] = get("district");
        values[P.state] = get("state");
        values[P.phone] = phone;
        values[P.email] = email;
        values[P.website] = get("website");
        values[P.employees] = get("est_employees");
        values[P.confidence] = get("employee_confidence");
        values[P.source] = get("source");
        values[P.status] = "AVAILABLE";
        values[P.origin] = "DAILY";
        newRows.push(values);
        added++;
      }
      file.setName("DONE_" + name);
    }

    if (newRows.length) {
      poolSheet.getRange(poolSheet.getLastRow() + 1, 1, newRows.length, POOL_HEADERS.length).setValues(newRows);
    }
    PropertiesService.getScriptProperties().setProperty(
      "POOL_LAST_IMPORT",
      Utilities.formatDate(now, POOL_TZ, "yyyy-MM-dd HH:mm") + " · " + fileCount + " fail · " + added + " ditambah · " + skipped + " diabaikan"
    );
  } finally {
    lock.releaseLock();
  }
}

/* ---------- one-time setup: run this once from the Apps Script editor ---------- */

function setupProspectPool() {
  poolSheet_();
  prospectSheet_();
  rulesStart_();

  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === "importPoolFromDrive" || fn === "releaseStaleProspects") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("releaseStaleProspects").timeBased().everyDays(1).atHour(7).inTimezone(POOL_TZ).create();
  ScriptApp.newTrigger("importPoolFromDrive").timeBased().everyDays(1).atHour(8).inTimezone(POOL_TZ).create();

  // Agent access rules (AgentAccess.gs): last-login tracking, 30-day revoke, data agreement.
  setupAgentAccess_();

  Logger.log("Prospect Pool ready. Import folder: " + (importFolderId_() || "NOT SET"));
}
