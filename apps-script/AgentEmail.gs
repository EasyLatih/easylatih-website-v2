/**
 * Emel templat untuk Agent Portal EasyLatih.
 *
 * - Admin sediakan templat dalam tab "Email Templates" (Google Sheet yang sama).
 * - Ejen pilih templat, masukkan emel penerima (dan kod diskaun jika templat
 *   memerlukannya), kemudian tekan Hantar dalam portal.
 * - Semua emel keluar dari sales@easylatih.my. Tandatangan di bawah emel
 *   menggunakan nama dan nombor telefon ejen dari tab "Agents".
 * - Ejen dapat salinan (BCC) di emel mereka dalam tab "Agents". Prospek tidak
 *   nampak emel ejen, dan balasan prospek masuk ke sales@easylatih.my.
 * - Setiap emel direkod dalam tab "Email Log".
 *
 * Placeholder yang boleh digunakan dalam Subjek dan Isi Emel:
 *   {{nama_pic}}   nama penerima (jika kosong: "Tuan/Puan")
 *   {{syarikat}}   nama syarikat penerima
 *   {{kod_diskaun}} kod diskaun yang ejen masukkan. Baris yang mengandungi
 *                  {{kod_diskaun}} dibuang jika ejen tidak masukkan kod.
 *   {{nama_ejen}}  nama ejen
 *   {{telefon_ejen}} nombor telefon ejen
 * Format Isi Emel: baris kosong = perenggan baharu, **teks** = tebal,
 * pautan https://... jadi boleh diklik. Tandatangan ditambah automatik.
 *
 * Lives in the same Apps Script project as AgentPortalSecure.gs and uses its
 * helpers (jsonOutput, isAdmin_, validRowNumber_, canEditRow_, SHEET_NAME,
 * PROSPECT_SHEET) and touchProspect_/dayKey_ from ProspectPool.gs.
 */

const EMAIL_SENDER = "sales@easylatih.my";
const EMAIL_SENDER_NAME = "Easy Latih Consultancy";
const EMAIL_TEMPLATE_SHEET = "Email Templates";
const EMAIL_LOG_SHEET = "Email Log";
const EMAIL_DAILY_LIMIT_PER_AGENT = 30;
const EMAIL_TEMPLATE_HEADERS = ["Template ID", "Nama Templat", "Subjek", "Isi Emel", "Aktif"];
const EMAIL_LOG_HEADERS = [
  "Tarikh", "Agent ID", "Nama Ejen", "Kepada", "Nama PIC", "Syarikat",
  "Template ID", "Subjek", "Kod Diskaun", "Prospect Row", "Status"
];
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/;

/* ---------- routing (called from doGet in AgentPortalSecure.gs) ---------- */

function routeAgentEmail_(action, e, session) {
  if (action === "getEmailTemplates") return getEmailTemplates_(e, session);
  if (action === "sendTemplateEmail") return sendTemplateEmail_(e, session);
  return null;
}

/* ---------- sheets ---------- */

function emailSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function emailTemplates_() {
  const sheet = emailSheet_(EMAIL_TEMPLATE_SHEET, EMAIL_TEMPLATE_HEADERS);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 5).getValues()
    .map(r => ({
      id: String(r[0] || "").trim(),
      name: String(r[1] || "").trim(),
      subject: String(r[2] || "").trim(),
      body: String(r[3] || ""),
      active: ["", "YA", "YES", "Y", "TRUE", "AKTIF"].indexOf(String(r[4]).trim().toUpperCase()) !== -1
    }))
    .filter(t => t.id && t.subject && t.body.trim() && t.active);
}

// Name, phone and email of the signed-in agent, from the Agents sheet.
function emailAgentProfile_(session) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const width = Math.max(sheet.getLastColumn(), 2);
  const header = sheet.getRange(1, 1, 1, width).getValues()[0].map(h => String(h).trim());
  let phoneCol = header.findIndex(h => /phone|telefon|mobile|no\.?\s*h\/?p|^tel/i.test(h));
  if (phoneCol === -1) {
    phoneCol = header.length;
    sheet.getRange(1, phoneCol + 1).setValue("Phone").setFontWeight("bold");
  }
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(width, phoneCol + 1)).getValues();
  const row = rows.find(r => String(r[0]).trim() === String(session.agentId));
  const emailCol = header.findIndex(h => /e-?mail/i.test(h) && !/invite/i.test(h));
  const email = String((row && emailCol !== -1 && row[emailCol]) || "").trim().toLowerCase();
  return {
    name: String((row && row[1]) || session.name || "").trim(),
    phone: String((row && row[phoneCol]) || "").trim(),
    email: EMAIL_RE.test(email) ? email : ""
  };
}

function emailsSentToday_(agentId) {
  const sheet = emailSheet_(EMAIL_LOG_SHEET, EMAIL_LOG_HEADERS);
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const today = dayKey_(new Date());
  return sheet.getRange(2, 1, last - 1, 11).getValues()
    .filter(r => String(r[1]) === String(agentId) && dayKey_(r[0]) === today && String(r[10]) === "SENT")
    .length;
}

// sales@easylatih.my must be this script's own account or one of its Gmail
// "Send mail as" addresses, otherwise Gmail refuses to send from it.
function emailSenderMode_() {
  const me = String(Session.getEffectiveUser().getEmail() || "").toLowerCase();
  if (me === EMAIL_SENDER) return "self";
  const aliases = GmailApp.getAliases().map(a => String(a).toLowerCase());
  return aliases.indexOf(EMAIL_SENDER) !== -1 ? "alias" : "";
}

/* ---------- rendering ---------- */

function emailEsc_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function cleanDiscountCode_(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 30);
}

// Fills the placeholders. Lines with {{kod_diskaun}} are dropped when no code.
function fillTemplate_(text, data) {
  let out = String(text || "");
  if (!data.kod_diskaun) {
    out = out.split("\n").filter(line => line.indexOf("{{kod_diskaun}}") === -1).join("\n");
  }
  return out.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(data, key) ? data[key] : m);
}

function textToHtml_(text) {
  return String(text || "").trim().split(/\n\s*\n/).map(para => {
    let html = emailEsc_(para)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#0d3b66">$1</a>')
      .replace(/\n/g, "<br>");
    return '<p style="margin:0 0 14px">' + html + "</p>";
  }).join("");
}

function waLink_(phone) {
  let digits = String(phone || "").replace(/[^0-9]/g, "");
  if (digits.indexOf("0") === 0) digits = "6" + digits;
  return digits ? "https://wa.me/" + digits : "";
}

function buildEmail_(template, data) {
  const subject = fillTemplate_(template.subject, data).replace(/\s+/g, " ").trim().slice(0, 200);
  const bodyText = fillTemplate_(template.body, data);
  const wa = waLink_(data.telefon_ejen);
  const signatureHtml =
    '<p style="margin:24px 0 0;padding-top:14px;border-top:1px solid #e2e8f0">' +
    "<strong>" + emailEsc_(data.nama_ejen) + "</strong><br>" +
    "Easy Latih Consultancy<br>" +
    "HRD Corp Registered Training Provider<br>" +
    "Tel / WhatsApp: " + (wa ? '<a href="' + wa + '" style="color:#0d3b66">' + emailEsc_(data.telefon_ejen) + "</a>" : emailEsc_(data.telefon_ejen)) + "<br>" +
    '<a href="mailto:' + EMAIL_SENDER + '" style="color:#0d3b66">' + EMAIL_SENDER + "</a> · " +
    '<a href="https://www.easylatih.my" style="color:#0d3b66">www.easylatih.my</a></p>';
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;max-width:620px">' +
    textToHtml_(bodyText) + signatureHtml + "</div>";
  const plain = bodyText.trim().replace(/\*\*(.+?)\*\*/g, "$1") + "\n\n--\n" + data.nama_ejen + "\nEasy Latih Consultancy\nHRD Corp Registered Training Provider\n" +
    "Tel / WhatsApp: " + data.telefon_ejen + "\n" + EMAIL_SENDER + " · www.easylatih.my";
  return { subject: subject, html: html, plain: plain };
}

/* ---------- agent actions ---------- */

function getEmailTemplates_(e, session) {
  const profile = emailAgentProfile_(session);
  return jsonOutput({
    success: true,
    sender: EMAIL_SENDER,
    agent: profile,
    dailyLimit: EMAIL_DAILY_LIMIT_PER_AGENT,
    sentToday: emailsSentToday_(session.agentId),
    templates: emailTemplates_().map(t => ({ id: t.id, name: t.name, subject: t.subject, body: t.body }))
  });
}

function sendTemplateEmail_(e, session) {
  const p = e.parameter;
  const to = String(p.to || "").trim().toLowerCase();
  const picName = String(p.picName || "").trim().slice(0, 100);
  const company = String(p.company || "").trim().slice(0, 150);
  const code = cleanDiscountCode_(p.discountCode);
  const rowNumber = Number(p.rowNumber || 0);

  if (!EMAIL_RE.test(to)) return jsonOutput({ success: false, message: "Alamat emel penerima tidak sah." });

  const template = emailTemplates_().find(t => t.id === String(p.templateId || "").trim());
  if (!template) return jsonOutput({ success: false, message: "Templat tidak dijumpai atau tidak aktif." });

  const profile = emailAgentProfile_(session);
  if (!profile.name || !profile.phone) {
    return jsonOutput({ success: false, message: "Nama atau nombor telefon anda belum ada dalam sistem. Sila hubungi admin Easy Latih." });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return jsonOutput({ success: false, message: "Sistem sibuk. Cuba lagi sebentar." });
  try {
    if (!isAdmin_(session) && emailsSentToday_(session.agentId) >= EMAIL_DAILY_LIMIT_PER_AGENT) {
      return jsonOutput({ success: false, message: "Had " + EMAIL_DAILY_LIMIT_PER_AGENT + " emel sehari telah dicapai. Cuba lagi esok." });
    }
    const mode = emailSenderMode_();
    if (!mode) {
      return jsonOutput({ success: false, message: "Emel " + EMAIL_SENDER + " belum disediakan untuk penghantaran. Sila maklumkan admin Easy Latih." });
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      return jsonOutput({ success: false, message: "Had emel harian Easy Latih telah dicapai. Cuba lagi esok." });
    }

    const mail = buildEmail_(template, {
      nama_pic: picName || "Tuan/Puan",
      syarikat: company,
      kod_diskaun: code,
      nama_ejen: profile.name,
      telefon_ejen: profile.phone
    });

    const options = { htmlBody: mail.html, name: EMAIL_SENDER_NAME, replyTo: EMAIL_SENDER };
    if (mode === "alias") options.from = EMAIL_SENDER;
    // The agent gets a hidden copy in their own Gmail; the prospect never sees it.
    if (profile.email && profile.email !== to) options.bcc = profile.email;
    GmailApp.sendEmail(to, mail.subject, mail.plain, options);

    // Emailing a prospect counts as contacting them.
    let prospectRow = "";
    const prospectSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PROSPECT_SHEET);
    if (rowNumber && validRowNumber_(rowNumber, prospectSheet) && canEditRow_(prospectSheet, rowNumber, session)) {
      prospectRow = rowNumber;
      const status = String(prospectSheet.getRange(rowNumber, 14).getValue()).toUpperCase();
      if (!status || status === "NEW LEAD") prospectSheet.getRange(rowNumber, 14).setValue("CONTACTED");
      touchProspect_(prospectSheet, rowNumber);
    }

    emailSheet_(EMAIL_LOG_SHEET, EMAIL_LOG_HEADERS).appendRow([
      new Date(), session.agentId, profile.name, to, picName, company,
      template.id, mail.subject, code, prospectRow, "SENT"
    ]);

    return jsonOutput({
      success: true,
      message: "Emel dihantar kepada " + to + ".",
      sentToday: emailsSentToday_(session.agentId)
    });
  } catch (error) {
    return jsonOutput({ success: false, message: "Emel gagal dihantar: " + error.message });
  } finally {
    lock.releaseLock();
  }
}

/* ---------- one-time setup (run from the Apps Script editor) ---------- */

function setupAgentEmail() {
  const sheet = emailSheet_(EMAIL_TEMPLATE_SHEET, EMAIL_TEMPLATE_HEADERS);
  if (sheet.getLastRow() < 2) {
    sheet.appendRow([
      "PENGENALAN",
      "Pengenalan Easy Latih",
      "Latihan HRD Corp untuk {{syarikat}} bersama Easy Latih",
      "Assalamualaikum dan salam sejahtera {{nama_pic}},\n\n" +
      "Saya {{nama_ejen}} dari Easy Latih Consultancy, penyedia latihan berdaftar HRD Corp.\n\n" +
      "Kami menawarkan program latihan yang boleh dituntut melalui levi HRD Corp, termasuk kursus awam dan in-house mengikut keperluan syarikat Tuan/Puan.\n\n" +
      "Sebagai tanda penghargaan, gunakan kod diskaun **{{kod_diskaun}}** semasa pendaftaran.\n\n" +
      "Jadual program terkini: https://www.easylatih.my/schedule.html\n\n" +
      "Saya boleh dihubungi di {{telefon_ejen}} jika ada sebarang pertanyaan.\n\n" +
      "Terima kasih.",
      "YA"
    ]);
    sheet.setColumnWidth(4, 520);
    sheet.getRange("D:D").setWrap(true);
  }
  emailSheet_(EMAIL_LOG_SHEET, EMAIL_LOG_HEADERS);

  const mode = emailSenderMode_();
  Logger.log(mode
    ? "OK: emel akan dihantar dari " + EMAIL_SENDER + (mode === "alias" ? " (alias Gmail)." : ".")
    : "BELUM SEDIA: tambah " + EMAIL_SENDER + " sebagai 'Send mail as' dalam Gmail akaun " +
      Session.getEffectiveUser().getEmail() + " (Settings → Accounts → Send mail as), kemudian Run semula setupAgentEmail.");
  Logger.log("Baki kuota emel hari ini: " + MailApp.getRemainingDailyQuota());
}
