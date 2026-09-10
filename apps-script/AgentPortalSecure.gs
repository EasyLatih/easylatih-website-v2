const SHEET_NAME = "Agents";
const PROSPECT_SHEET = "Prospects";

function doGet(e) {
  const action = String(e.parameter.action || "").trim();

  // Login is the only public action. Every other action needs an active session.
  if (action === "login") return loginAgent(e);
  if (action === "logout") return logoutAgent(e);

  const session = getSession_(e);
  if (!session) return unauthorized_();

  if (action === "getDashboard") return getDashboard(e, session);
  if (action === "adminDashboard") return adminDashboard(e, session);
  if (action === "addProspect") return addProspect(e, session);
  if (action === "updateStatus") return updateStatus(e, session);
  if (action === "updateCallLog") return updateCallLog(e, session);
  if (action === "checkProspect") return checkProspect(e, session);

  return jsonOutput({ success: false, message: "Invalid action" });
}

const SESSION_PREFIX = "agent-session:";
const SESSION_TTL_SECONDS = 6 * 60 * 60;
const LOGIN_LIMIT_PREFIX = "agent-login-limit:";
const ALLOWED_STATUSES = [
  "NEW LEAD", "CONTACTED", "INTERESTED", "QUOTATION SENT",
  "HRD APPLICATION", "REGISTERED", "NOT INTERESTED"
];

function sessionCache_() {
  return CacheService.getScriptCache();
}

function getSession_(e) {
  const token = String(e.parameter.sessionToken || "").trim();
  if (token.length < 30) return null;
  const stored = sessionCache_().get(SESSION_PREFIX + token);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch (error) {
    return null;
  }
}

function createSession_(agentId, name, role) {
  const token = Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
  const session = {
    agentId: String(agentId),
    name: String(name),
    role: String(role || "").trim().toUpperCase()
  };
  sessionCache_().put(SESSION_PREFIX + token, JSON.stringify(session), SESSION_TTL_SECONDS);
  return token;
}

function logoutAgent(e) {
  const token = String(e.parameter.sessionToken || "").trim();
  if (token) sessionCache_().remove(SESSION_PREFIX + token);
  return jsonOutput({ success: true });
}

function unauthorized_() {
  return jsonOutput({ success: false, code: "SESSION_REQUIRED", message: "Sesi tamat atau tidak sah. Sila log masuk semula." });
}

function isAdmin_(session) {
  return ["ADMIN", "SUPER ADMIN", "SUPERADMIN", "ADMINISTRATOR", "OWNER"].indexOf(session.role) !== -1;
}

function forbidden_() {
  return jsonOutput({ success: false, code: "FORBIDDEN", message: "Akses tidak dibenarkan." });
}

function validRowNumber_(rowNumber, sheet) {
  return Number.isInteger(rowNumber) && rowNumber > 1 && rowNumber <= sheet.getLastRow();
}

function canEditRow_(sheet, rowNumber, session) {
  if (isAdmin_(session)) return true;
  return String(sheet.getRange(rowNumber, 2).getValue()) === String(session.agentId);
}

function loginAgent(e) {
  const agentId = String(e.parameter.agentId || "").trim();
  const password = String(e.parameter.password || "");
  const cache = sessionCache_();
  const rateKey = LOGIN_LIMIT_PREFIX + agentId;
  const attempts = Number(cache.get(rateKey) || 0);

  if (!agentId || !password || attempts >= 5) {
    return jsonOutput({ success: false, message: "Login tidak berjaya. Cuba semula dalam 15 minit." });
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (String(row[0]) === agentId && String(row[5]) === password && String(row[7]).toUpperCase() === "ACTIVE") {
      cache.remove(rateKey);
      const role = String(row[6] || "").trim().toUpperCase();
      return jsonOutput({
        success: true,
        agentId: String(row[0]),
        name: String(row[1]),
        role: role,
        sessionToken: createSession_(row[0], row[1], role),
        expiresInSeconds: SESSION_TTL_SECONDS
      });
    }
  }

  cache.put(rateKey, String(attempts + 1), 15 * 60);
  return jsonOutput({ success: false, message: "Login tidak berjaya." });
}

function getDashboard(e, session) {
  const agentId = session.agentId;

  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(PROSPECT_SHEET);

  const data = sheet.getDataRange().getValues();

  const today = Utilities.formatDate(
    new Date(),
    "Asia/Kuala_Lumpur",
    "yyyy-MM-dd"
  );

  let total = 0;
  let levy = 0;
  let nonLevy = 0;
  let newCompaniesToday = 0;
  let followUpDoneToday = 0;
  let quotationSent = 0;
  let quotationAccepted = 0;
  let quotationRejected = 0;
  let potentialSales = 0;
  let confirmedSales = 0;

  const prospects = [];
  const followUpsToday = [];
  const overdueFollowUps = [];
  const suggestedFollowUps = [];
  const quotationFollowUps = [];

  const funnel = {
    "NEW LEAD": 0,
    "CONTACTED": 0,
    "INTERESTED": 0,
    "QUOTATION SENT": 0,
    "HRD APPLICATION": 0,
    "REGISTERED": 0,
    "NOT INTERESTED": 0
  };

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    if (row[1] != agentId) continue;

    total++;

    const timestamp = row[0]
      ? Utilities.formatDate(new Date(row[0]), "Asia/Kuala_Lumpur", "yyyy-MM-dd")
      : "";

    if (timestamp === today) newCompaniesToday++;

    const isLevy = String(row[11]).toUpperCase() == "YA";
    if (isLevy) levy++;
    else nonLevy++;

    const status = String(row[13] || "NEW LEAD").toUpperCase();

    if (funnel[status] !== undefined) {
      funnel[status]++;
    }

    const followUpDate = row[14]
      ? Utilities.formatDate(new Date(row[14]), "Asia/Kuala_Lumpur", "yyyy-MM-dd")
      : "";

    const lastCallDate = row[20]
      ? Utilities.formatDate(new Date(row[20]), "Asia/Kuala_Lumpur", "yyyy-MM-dd")
      : "";

    const callRemark = row[21] || "";

    const nextFollowUpDate = row[22]
      ? Utilities.formatDate(new Date(row[22]), "Asia/Kuala_Lumpur", "yyyy-MM-dd")
      : "";

    const lastCallType = String(row[23] || "").toUpperCase();

    if (
      lastCallDate === today &&
      lastCallType === "FOLLOW UP"
    ) {
      followUpDoneToday++;
    }

    if (
      nextFollowUpDate &&
      nextFollowUpDate < today &&
      status !== "REGISTERED" &&
      status !== "NOT INTERESTED"
    ) {
      overdueFollowUps.push({
        rowNumber: i + 1,
        company: row[3],
        contact: row[4],
        phone: row[6],
        email: row[8],
        status: status,
        nextFollowUpDate: nextFollowUpDate,
        daysOverdue: Math.floor(
          (new Date(today) - new Date(nextFollowUpDate)) /
          (1000 * 60 * 60 * 24)
        )
      });
    }

    const quotationStatus = String(row[16] || "").toUpperCase();
    const quotationAmount = Number(row[18] || 0);
    const quotationDate = row[17] ? new Date(row[17]) : null;

    if (quotationStatus === "SENT") {
      quotationSent++;
      potentialSales += quotationAmount;
    }

    if (quotationStatus === "ACCEPTED") {
      quotationAccepted++;
      confirmedSales += quotationAmount;
    }

    if (quotationStatus === "REJECTED") {
      quotationRejected++;
    }

    if (
      quotationStatus === "SENT" &&
      quotationDate
    ) {
      const daysOutstanding = Math.floor(
        (new Date() - quotationDate) /
        (1000 * 60 * 60 * 24)
      );

      if (daysOutstanding >= 3) {
        quotationFollowUps.push({
          rowNumber: i + 1,
          company: row[3],
          contact: row[4],
          phone: row[6],
          email: row[8],
          quotationAmount: quotationAmount,
          quotationDate: Utilities.formatDate(
            quotationDate,
            "Asia/Kuala_Lumpur",
            "yyyy-MM-dd"
          ),
          daysOutstanding: daysOutstanding
        });
      }
    }

    const prospectObj = {
      rowNumber: i + 1,

      company: row[3],
      contact: row[4],
      position: row[5],
      phone: row[6],
      phone2: row[7],
      email: row[8],
      state: row[9],
      district: row[10],
      levyStatus: row[11],
      training: row[12],

      status: status,
      followUpDate: followUpDate,
      remarks: row[15],

      quotationStatus: row[16],
      quotationDate: row[17],
      quotationAmount: row[18],
      quotationRemarks: row[19],

      lastCallDate: lastCallDate,
      callRemark: callRemark,
      nextFollowUpDate: nextFollowUpDate,
      lastCallType: lastCallType
    };

    prospects.push(prospectObj);

    if (nextFollowUpDate === today || followUpDate === today) {
      followUpsToday.push(prospectObj);
    }

    if (
      status !== "REGISTERED" &&
      status !== "NOT INTERESTED"
    ) {
      const priorityDate = nextFollowUpDate || lastCallDate || "1900-01-01";

      suggestedFollowUps.push({
        ...prospectObj,
        priorityDate: priorityDate
      });
    }
  }

  suggestedFollowUps.sort((a, b) =>
    String(a.priorityDate).localeCompare(String(b.priorityDate))
  );

  return jsonOutput({
    success: true,

    totalProspects: total,
    levy: levy,
    nonLevy: nonLevy,

    newCompaniesToday: newCompaniesToday,
    followUpDoneToday: followUpDoneToday,

    prospects: prospects,
    followUpsToday: followUpsToday,
    overdueFollowUps: overdueFollowUps,
    suggestedFollowUps: suggestedFollowUps.slice(0, 10),

    funnel: funnel,

    quotationSent: quotationSent,
    quotationAccepted: quotationAccepted,
    quotationRejected: quotationRejected,
    quotationFollowUps: quotationFollowUps,

    potentialSales: potentialSales,
    confirmedSales: confirmedSales
  });
}

function adminDashboard(e, session) {
  if (!isAdmin_(session)) return forbidden_();
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(PROSPECT_SHEET);

  const data = sheet.getDataRange().getValues();

  const today = Utilities.formatDate(
    new Date(),
    "Asia/Kuala_Lumpur",
    "yyyy-MM-dd"
  );

  let totalProspects = 0;
  let levy = 0;
  let nonLevy = 0;
  let overdueCount = 0;
  let quotationFollowUpCount = 0;

  const agentStats = {};
  const overdueFollowUps = [];
  const quotationFollowUps = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const agentId = row[1];
    const agentName = row[2];

    if (!agentId) continue;

    totalProspects++;

    const isLevy = String(row[11]).toUpperCase() == "YA";
    const status = String(row[13] || "NEW LEAD").toUpperCase();

    if (isLevy) levy++;
    else nonLevy++;

    if (!agentStats[agentId]) {
      agentStats[agentId] = {
        agentId: agentId,
        agentName: agentName,
        prospects: 0,
        levy: 0,
        nonLevy: 0,
        overdue: 0,
        quotationFollowUp: 0,
        newToday: 0,
        followUpToday: 0
      };
    }

    agentStats[agentId].prospects++;

    if (isLevy) agentStats[agentId].levy++;
    else agentStats[agentId].nonLevy++;

    const timestamp = row[0]
      ? Utilities.formatDate(new Date(row[0]), "Asia/Kuala_Lumpur", "yyyy-MM-dd")
      : "";

    if (timestamp === today) {
      agentStats[agentId].newToday++;
    }

    const lastCallDate = row[20]
      ? Utilities.formatDate(new Date(row[20]), "Asia/Kuala_Lumpur", "yyyy-MM-dd")
      : "";

    const lastCallType = String(row[23] || "").toUpperCase();

    if (
      lastCallDate === today &&
      lastCallType === "FOLLOW UP"
    ) {
      agentStats[agentId].followUpToday++;
    }

    const nextFollowUpDate = row[22]
      ? Utilities.formatDate(new Date(row[22]), "Asia/Kuala_Lumpur", "yyyy-MM-dd")
      : "";

    if (
      nextFollowUpDate &&
      nextFollowUpDate < today &&
      status !== "REGISTERED" &&
      status !== "NOT INTERESTED"
    ) {
      const daysOverdue = Math.floor(
        (new Date(today) - new Date(nextFollowUpDate)) /
        (1000 * 60 * 60 * 24)
      );

      overdueCount++;
      agentStats[agentId].overdue++;

      overdueFollowUps.push({
        rowNumber: i + 1,
        agentId: agentId,
        agentName: agentName,
        company: row[3],
        contact: row[4],
        phone: row[6],
        email: row[8],
        status: status,
        nextFollowUpDate: nextFollowUpDate,
        daysOverdue: daysOverdue
      });
    }

    const quotationStatus = String(row[16] || "").toUpperCase();
    const quotationAmount = Number(row[18] || 0);
    const quotationDate = row[17] ? new Date(row[17]) : null;

    if (
      quotationStatus === "SENT" &&
      quotationDate
    ) {
      const daysOutstanding = Math.floor(
        (new Date() - quotationDate) /
        (1000 * 60 * 60 * 24)
      );

      if (daysOutstanding >= 3) {
        quotationFollowUpCount++;
        agentStats[agentId].quotationFollowUp++;

        quotationFollowUps.push({
          rowNumber: i + 1,
          agentId: agentId,
          agentName: agentName,
          company: row[3],
          contact: row[4],
          phone: row[6],
          email: row[8],
          quotationAmount: quotationAmount,
          quotationDate: Utilities.formatDate(
            quotationDate,
            "Asia/Kuala_Lumpur",
            "yyyy-MM-dd"
          ),
          daysOutstanding: daysOutstanding
        });
      }
    }
  }

  return jsonOutput({
    success: true,

    totalProspects: totalProspects,
    levy: levy,
    nonLevy: nonLevy,

    overdueCount: overdueCount,
    quotationFollowUpCount: quotationFollowUpCount,

    overdueFollowUps: overdueFollowUps,
    quotationFollowUps: quotationFollowUps,

    agents: Object.values(agentStats)
      .sort((a, b) => b.prospects - a.prospects)
  });
}

function addProspect(e, session) {
  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(PROSPECT_SHEET);

  sheet.appendRow([
    new Date(),
    session.agentId,
    session.name,
    e.parameter.company,
    e.parameter.contact,
    e.parameter.position || "",
    e.parameter.phone,
    e.parameter.phone2 || "",
    e.parameter.email,
    e.parameter.state,
    e.parameter.district || "",
    e.parameter.levy,
    e.parameter.training || "",
    "NEW LEAD",
    e.parameter.followUpDate || "",
    e.parameter.remarks || "",
    "NOT SENT",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ]);

  return jsonOutput({
    success: true,
    message: "Prospect Added"
  });
}

function updateStatus(e, session) {
  const rowNumber = Number(e.parameter.rowNumber);
  const status = String(e.parameter.status || "").trim().toUpperCase();
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROSPECT_SHEET);

  if (!validRowNumber_(rowNumber, sheet)) return jsonOutput({ success: false, message: "Rekod tidak sah." });
  if (!canEditRow_(sheet, rowNumber, session)) return forbidden_();
  if (ALLOWED_STATUSES.indexOf(status) === -1) return jsonOutput({ success: false, message: "Status tidak sah." });

  sheet.getRange(rowNumber, 14).setValue(status);
  return jsonOutput({ success: true, message: "Status Updated" });
}

function updateCallLog(e, session) {
  const rowNumber = Number(e.parameter.rowNumber);
  const callRemark = String(e.parameter.callRemark || "").slice(0, 2000);
  const nextFollowUpDate = String(e.parameter.nextFollowUpDate || "");
  const callType = "FOLLOW UP";
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROSPECT_SHEET);

  if (!validRowNumber_(rowNumber, sheet)) return jsonOutput({ success: false, message: "Rekod tidak sah." });
  if (!canEditRow_(sheet, rowNumber, session)) return forbidden_();

  sheet.getRange(rowNumber, 21).setValue(new Date());
  sheet.getRange(rowNumber, 22).setValue(callRemark);
  sheet.getRange(rowNumber, 23).setValue(nextFollowUpDate);
  sheet.getRange(rowNumber, 24).setValue(callType);

  const currentStatus = String(sheet.getRange(rowNumber, 14).getValue()).toUpperCase();
  if (currentStatus === "NEW LEAD") sheet.getRange(rowNumber, 14).setValue("CONTACTED");

  return jsonOutput({ success: true, message: "Call Log Updated" });
}

function checkProspect(e, session) {
  const company = normalizeCompany(e.parameter.company);

  const phone = String(e.parameter.phone || "")
    .replace(/\D/g, "");

  const email = String(e.parameter.email || "")
    .trim()
    .toLowerCase();

  const sheet = SpreadsheetApp
    .getActiveSpreadsheet()
    .getSheetByName(PROSPECT_SHEET);

  const data = sheet.getDataRange().getValues();

  const matches = [];

  for (let i = 1; i < data.length; i++) {
    const existingCompany = normalizeCompany(data[i][3]);

    const existingPhone = String(data[i][6] || "")
      .replace(/\D/g, "");

    const existingEmail = String(data[i][8] || "")
      .trim()
      .toLowerCase();

    let matched = false;

    if (
      company.length >= 3 &&
      existingCompany &&
      (
        existingCompany.includes(company) ||
        company.includes(existingCompany)
      )
    ) {
      matched = true;
    }

    if (
      phone &&
      existingPhone &&
      phone === existingPhone
    ) {
      matched = true;
    }

    if (
      email &&
      existingEmail &&
      email === existingEmail
    ) {
      matched = true;
    }

    if (matched) {
      matches.push({
        // Duplicate checking intentionally returns ownership only. Contact details
        // stay private to the agent who owns this prospect.
        ownerAgent: data[i][1],
        ownerName: data[i][2],
        company: data[i][3],
        state: data[i][9],
        status: data[i][13]
      });
    }
  }

  matches.sort((a, b) =>
    String(a.company).localeCompare(String(b.company))
  );

  matches.splice(5);

  return jsonOutput({
    success: true,
    exists: matches.length > 0,
    matches: matches
  });
}

function normalizeCompany(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/SDN\.?\s*BHD\.?/g, "")
    .replace(/BERHAD/g, "")
    .replace(/LTD/g, "")
    .replace(/LIMITED/g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}