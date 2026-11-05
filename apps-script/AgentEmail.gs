/**
 * Emel templat untuk Agent Portal EasyLatih.
 *
 * - Admin sediakan templat dalam tab "Email Templates" (Google Sheet yang sama).
 * - Ejen pilih templat, masukkan emel penerima, kemudian tekan Hantar dalam portal.
 * - Semua emel keluar dari sales@easylatih.my. Tandatangan di bawah emel
 *   menggunakan nama dan nombor telefon ejen dari tab "Agents".
 * - Ejen dapat salinan (BCC) di emel mereka dalam tab "Agents". Prospek tidak
 *   nampak emel ejen, dan balasan prospek masuk ke sales@easylatih.my.
 * - Setiap emel direkod dalam tab "Email Log".
 *
 * Placeholder yang boleh digunakan dalam Subjek dan Isi Emel:
 *   {{nama_pic}}   nama penerima (jika kosong: "Tuan/Puan")
 *   {{syarikat}}   nama syarikat penerima
 *   {{kod_diskaun}} kod diskaun: "Kod Khas" templat (contoh early bird) jika ada,
 *                  jika tiada, kod ejen dari lajur "Kod Diskaun" tab Agents.
 *                  Ejen tidak boleh ubah kod. Baris yang mengandungi
 *                  {{kod_diskaun}} dibuang jika tiada kod langsung.
 *   {{nama_ejen}}  nama ejen
 *   {{telefon_ejen}} nombor telefon ejen
 * Format Isi Emel (emel dihantar dalam bentuk HTML):
 *   baris kosong        perenggan baharu
 *   - teks              bullet
 *   **teks** / *teks*   tebal / italik
 *   [teks](https://...) pautan dengan teks; pautan https://... biasa juga boleh diklik
 *   [[BUTANG: Teks | https://...]]  butang oren
 *   ## Tajuk            tajuk seksyen
 *   [[KOTAK]] ... [[/KOTAK]]  kotak info berwarna (contoh: tarikh, masa, lokasi)
 *   [[POSTER]]          kedudukan poster (jika tiada, poster diletak selepas perenggan pertama)
 * Poster: letak pautan Google Drive gambar poster (atau pautan https gambar biasa)
 * dalam lajur "Poster (pautan Drive)".
 * Poster dan logo dimasukkan terus ke dalam emel (bukan lampiran).
 * Kepala emel (logo), kad ejen (nama, telefon, butang WhatsApp) dan kaki emel
 * (alamat pejabat) ditambah automatik.
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
const EMAIL_TEMPLATE_HEADERS = ["Template ID", "Nama Templat", "Subjek", "Isi Emel", "Aktif", "Poster (pautan Drive)", "Kod Khas"];
const AGENT_COL_DISCOUNT = "Kod Diskaun";
const EMAIL_LOGO_URL = "https://www.easylatih.my/assets/email-logo.jpg";
// HRD Corp badges shown beside the logo in the email header.
const EMAIL_BADGES = [
  { id: "hrdprovider", url: "https://www.easylatih.my/assets/email-hrd-provider.png", alt: "HRD Corp Registered Training Provider" },
  { id: "hrdclaimable", url: "https://www.easylatih.my/assets/email-hrd-claimable.png", alt: "HRD Corp Claimable" }
];
const EMAIL_AGENT_TITLE = "Training Advisor";
const EMAIL_OFFICE_ADDRESS = "B-62, Tkt 1, Jln IM 7/1, Bdr Indera Mahkota 6, 25200 Kuantan, Pahang";
const EMAIL_OFFICE_PHONE = "09-560 4273";
const EMAIL_POSTER_MAX_BYTES = 5 * 1024 * 1024;
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

// Adds columns introduced after the tab was created (Poster, Kod Khas).
function ensureTemplateHeaders_(sheet) {
  if (sheet.getMaxColumns() < EMAIL_TEMPLATE_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), EMAIL_TEMPLATE_HEADERS.length - sheet.getMaxColumns());
  }
  const header = sheet.getRange(1, 1, 1, EMAIL_TEMPLATE_HEADERS.length).getValues()[0];
  EMAIL_TEMPLATE_HEADERS.forEach((name, i) => {
    if (!String(header[i]).trim()) sheet.getRange(1, i + 1).setValue(name).setFontWeight("bold");
  });
}

function emailTemplates_() {
  const sheet = emailSheet_(EMAIL_TEMPLATE_SHEET, EMAIL_TEMPLATE_HEADERS);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  ensureTemplateHeaders_(sheet);
  return sheet.getRange(2, 1, last - 1, EMAIL_TEMPLATE_HEADERS.length).getValues()
    .map(r => ({
      id: String(r[0] || "").trim(),
      name: String(r[1] || "").trim(),
      subject: String(r[2] || "").trim(),
      body: String(r[3] || ""),
      active: ["", "YA", "YES", "Y", "TRUE", "AKTIF"].indexOf(String(r[4]).trim().toUpperCase()) !== -1,
      poster: String(r[5] || "").trim(),
      specialCode: cleanDiscountCode_(r[6])
    }))
    .filter(t => t.id && t.subject && t.body.trim() && t.active);
}

// Name, phone, email and own discount code of the signed-in agent, from the Agents sheet.
function emailAgentProfile_(session) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const width = Math.max(sheet.getLastColumn(), 2);
  const header = sheet.getRange(1, 1, 1, width).getValues()[0].map(h => String(h).trim());
  let phoneCol = header.findIndex(h => /phone|telefon|mobile|no\.?\s*h\/?p|^tel/i.test(h));
  if (phoneCol === -1) {
    phoneCol = header.length;
    sheet.getRange(1, phoneCol + 1).setValue("Phone").setFontWeight("bold");
  }
  let codeCol = header.findIndex(h => h.toLowerCase() === AGENT_COL_DISCOUNT.toLowerCase());
  if (codeCol === -1) {
    codeCol = Math.max(header.length, phoneCol + 1);
    sheet.getRange(1, codeCol + 1).setValue(AGENT_COL_DISCOUNT).setFontWeight("bold");
  }
  const cols = Math.max(width, phoneCol + 1, codeCol + 1);
  const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, cols).getValues();
  const row = rows.find(r => String(r[0]).trim() === String(session.agentId));
  const emailCol = header.findIndex(h => /e-?mail/i.test(h) && !/invite/i.test(h));
  const email = String((row && emailCol !== -1 && row[emailCol]) || "").trim().toLowerCase();
  return {
    name: String((row && row[1]) || session.name || "").trim(),
    phone: formatMyPhone_((row && row[phoneCol]) || ""),
    email: EMAIL_RE.test(email) ? email : "",
    code: cleanDiscountCode_(row && row[codeCol])
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

// ---- shared email renderer (also in internal/agent-dashboard.html; keep in step) ----
// Markup: blank line = paragraph · "- " bullet · **bold** · *italic* · ***both***
//   [text](https://link) · bare https:// links · ## Heading
//   [[KOTAK]] ... [[/KOTAK]] highlighted info box · [[POSTER]] · [[BUTANG: Text | https://link]]
const EMAIL_NAVY = "#0d3b66";
const EMAIL_ORANGE = "#e8630a";
const EMAIL_FONT = "Arial,Helvetica,sans-serif";

function emailInline_(s) {
  return emailEsc_(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:' + EMAIL_NAVY + ';font-weight:bold">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<*]+)/g, '$1<a href="$2" style="color:' + EMAIL_NAVY + '">$2</a>')
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
}

function emailMarkup_(text, posterHtml) {
  const P = 'margin:0 0 16px;font-family:' + EMAIL_FONT + ';font-size:15px;line-height:1.65;color:#334155';
  const out = [];
  let para = [];
  let list = [];
  let posterUsed = false;
  const flush = () => {
    if (para.length) out.push('<p style="' + P + '">' + para.map(emailInline_).join("<br>") + "</p>");
    if (list.length) {
      out.push('<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px">' +
        list.map(li => '<tr><td width="26" valign="top" style="padding:2px 0 8px;font-family:' + EMAIL_FONT + ';font-size:15px;line-height:1.6;color:' + EMAIL_ORANGE + ';font-weight:bold">&#10004;</td>' +
          '<td valign="top" style="padding:2px 0 8px;font-family:' + EMAIL_FONT + ';font-size:15px;line-height:1.6;color:#334155">' + emailInline_(li) + "</td></tr>").join("") +
        "</table>");
    }
    para = []; list = [];
  };
  const lines = String(text || "").replace(/\r/g, "").trim().split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { flush(); continue; }
    if (/^\[\[\s*kotak\s*\]\]$/i.test(line)) {
      flush();
      const inner = [];
      for (i++; i < lines.length && !/^\[\[\s*\/\s*kotak\s*\]\]$/i.test(lines[i].trim()); i++) inner.push(lines[i]);
      const body = emailMarkup_(inner.join("\n"), "").replace(/margin:0 0 16px/g, "margin:0 0 8px");
      out.push('<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 22px"><tr>' +
        '<td style="background:#f1f6fb;border-left:5px solid ' + EMAIL_ORANGE + ';border-radius:10px;padding:18px 20px 10px">' + body + "</td></tr></table>");
      continue;
    }
    if (/^\[\[\s*poster\s*\]\]$/i.test(line)) {
      flush();
      if (posterHtml) { out.push(posterHtml); posterUsed = true; }
      continue;
    }
    const button = line.match(/^\[\[\s*butang\s*:\s*(.+?)\s*\|\s*(https?:\/\/\S+?)\s*\]\]$/i);
    if (button) {
      flush();
      out.push('<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:8px 0 24px"><tr><td align="center">' +
        '<a href="' + emailEsc_(button[2]) + '" style="display:inline-block;background:' + EMAIL_ORANGE + ';color:#ffffff;font-family:' + EMAIL_FONT + ';' +
        'font-size:16px;font-weight:bold;letter-spacing:.3px;padding:15px 34px;border-radius:30px;text-decoration:none">' + emailEsc_(button[1]) + " &#8594;</a></td></tr></table>");
      continue;
    }
    const heading = line.match(/^##\s+(.+)$/);
    if (heading) {
      flush();
      out.push('<h2 style="margin:26px 0 12px;font-family:' + EMAIL_FONT + ';font-size:19px;line-height:1.35;color:' + EMAIL_NAVY + '">' + emailInline_(heading[1]) +
        '<div style="width:44px;height:3px;background:' + EMAIL_ORANGE + ';margin-top:8px;font-size:0;line-height:0">&nbsp;</div></h2>');
      continue;
    }
    const bullet = line.match(/^[-•]\s+(.*)$/);
    if (bullet) {
      if (para.length) { const keep = list; list = []; flush(); list = keep; }
      list.push(bullet[1]);
      continue;
    }
    if (list.length) flush();
    para.push(line);
  }
  flush();
  if (posterHtml && !posterUsed) out.splice(Math.min(1, out.length), 0, posterHtml);
  return out.join("");
}

// Full branded layout. src = { logo, poster, badges: [{src, alt}] } image sources (cid: in the email, URLs in the preview).
function emailLayout_(bodyText, data, src, sig) {
  const F = "font-family:" + EMAIL_FONT + ";";
  const posterHtml = src.poster
    ? '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:6px 0 24px"><tr><td align="center">' +
      '<img src="' + src.poster + '" alt="Poster program" width="536" style="display:block;width:100%;max-width:536px;height:auto;border:0;border-radius:10px"></td></tr></table>'
    : "";
  const preheader = String(bodyText || "").replace(/\[\[[^\]]*\]\]|[*#]/g, "").replace(/\s+/g, " ").trim().slice(0, 140);
  let digits = String(data.telefon_ejen || "").replace(/[^0-9]/g, "");
  if (digits.indexOf("0") === 0) digits = "6" + digits;
  const wa = digits ? "https://wa.me/" + digits : "";
  return '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + emailEsc_(preheader) + "</div>" +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2f7"><tr><td align="center" style="padding:24px 10px">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">' +
    // header
    '<tr><td style="padding:18px 28px;border-bottom:4px solid ' + EMAIL_ORANGE + '">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>' +
      '<td valign="middle">' + (src.logo ? '<img src="' + src.logo + '" alt="Easy Latih" width="130" style="display:block;border:0;width:130px;height:auto">' : '<strong style="' + F + 'font-size:20px;color:' + EMAIL_NAVY + '">Easy Latih</strong>') + "</td>" +
      '<td align="right" valign="middle">' + ((src.badges || []).length
        ? src.badges.map(b => '<img src="' + b.src + '" alt="' + emailEsc_(b.alt) + '" width="62" height="62" style="display:inline-block;width:62px;height:62px;border:0;margin-left:8px;vertical-align:middle">').join("")
        : '<span style="' + F + 'font-size:11px;line-height:1.4;color:' + EMAIL_NAVY + ';font-weight:bold;letter-spacing:.4px">HRD CORP<br>REGISTERED TRAINING<br>PROVIDER</span>') + "</td>" +
      "</tr></table></td></tr>" +
    // body
    '<tr><td style="padding:30px 32px 8px">' + emailMarkup_(bodyText, posterHtml) + "</td></tr>" +
    // agent card
    '<tr><td style="padding:0 32px 30px">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px"><tr>' +
      '<td style="padding:18px 20px;' + F + 'font-size:14px;line-height:1.55;color:#334155">' +
        '<div style="font-size:16px;font-weight:bold;color:' + EMAIL_NAVY + '">' + emailEsc_(data.nama_ejen) + "</div>" +
        '<div style="color:#64748b">' + emailEsc_(sig.title) + " · Easy Latih Consultancy</div>" +
        '<div style="margin-top:6px">&#9742; ' + emailEsc_(data.telefon_ejen) + "</div>" +
      "</td>" +
      (wa ? '<td align="right" valign="middle" style="padding:18px 20px"><a href="' + wa + '" style="display:inline-block;background:#25d366;color:#ffffff;' + F +
        'font-size:14px;font-weight:bold;padding:11px 18px;border-radius:24px;text-decoration:none;white-space:nowrap">WhatsApp Saya</a></td>' : "") +
      "</tr></table></td></tr>" +
    // footer
    '<tr><td style="background:' + EMAIL_NAVY + ';padding:24px 32px;' + F + 'font-size:12px;line-height:1.7;color:#cbd5e1">' +
      '<div style="font-size:14px;font-weight:bold;color:#ffffff">Easy Latih Consultancy</div>' +
      emailEsc_(sig.address) + "<br>" +
      "Pejabat: " + emailEsc_(sig.officePhone) + " · " +
      '<a href="https://www.easylatih.my" style="color:#ffffff;text-decoration:underline">www.easylatih.my</a> · ' +
      '<a href="mailto:' + emailEsc_(sig.sender) + '" style="color:#ffffff;text-decoration:underline">' + emailEsc_(sig.sender) + "</a>" +
      '<div style="margin-top:12px;font-size:11px;color:#94a3b8">Emel ini dihantar oleh ' + emailEsc_(data.nama_ejen) +
      " bagi pihak Easy Latih Consultancy. Balas emel ini jika ada sebarang pertanyaan atau jika tidak mahu menerima emel seterusnya.</div>" +
    "</td></tr>" +
    "</table></td></tr></table>";
}
// ---- end shared email renderer ----

function driveFileId_(value) {
  const m = String(value || "").match(/[-\w]{25,}/);
  return m ? m[0] : "";
}

// 60179858651 -> 017-985 8651, 601139177388 -> 011-3917 7388
function formatMyPhone_(value) {
  const raw = String(value || "").trim();
  let d = raw.replace(/[^0-9]/g, "");
  if (d.indexOf("60") === 0) d = "0" + d.slice(2);
  if (!/^0\d{8,10}$/.test(d)) return raw;
  if (d.indexOf("01") !== 0) return d.slice(0, 2) + "-" + d.slice(2, d.length - 4) + " " + d.slice(-4);
  return d.slice(0, 3) + "-" + d.slice(3, d.length - 4) + " " + d.slice(-4);
}

function waLink_(phone) {
  let digits = String(phone || "").replace(/[^0-9]/g, "");
  if (digits.indexOf("0") === 0) digits = "6" + digits;
  return digits ? "https://wa.me/" + digits : "";
}

// Fetches a small image from the website once and keeps it cached for 6 hours.
function emailAssetBlob_(key, url) {
  const cache = CacheService.getScriptCache();
  const name = url.split("/").pop();
  try {
    const cached = cache.get("email-asset:" + key);
    if (cached) {
      const c = JSON.parse(cached);
      return Utilities.newBlob(Utilities.base64Decode(c.data), c.type, name);
    }
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const blob = res.getBlob().setName(name);
    const data = Utilities.base64Encode(blob.getBytes());
    if (data.length < 90000) cache.put("email-asset:" + key, JSON.stringify({ data: data, type: blob.getContentType() }), 21600);
    return blob;
  } catch (error) {
    return null; // The email still goes out, just without that image.
  }
}

function emailLogoBlob_() {
  return emailAssetBlob_("logo", EMAIL_LOGO_URL);
}

// Poster: a Google Drive link (file the script's account can open) or a
// public https image link, e.g. https://www.easylatih.my/assets/posters/x.jpg
function emailPosterBlob_(poster) {
  if (!poster) return null;
  if (/^https?:\/\//i.test(poster) && !/(drive|docs)\.google\.com/i.test(poster)) {
    const res = UrlFetchApp.fetch(poster, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) throw new Error("Poster tidak dapat dimuat turun (" + res.getResponseCode() + ").");
    const blob = res.getBlob();
    if (!/^image\//.test(blob.getContentType())) throw new Error("Pautan poster bukan fail gambar.");
    if (blob.getBytes().length > EMAIL_POSTER_MAX_BYTES) throw new Error("Poster terlalu besar (maksimum 5MB).");
    return blob.setName("poster");
  }
  const posterId = driveFileId_(poster);
  if (!posterId) throw new Error("Pautan poster tidak sah.");
  const file = DriveApp.getFileById(posterId);
  if (!/^image\//.test(file.getMimeType())) throw new Error("Poster mesti fail gambar (PNG/JPG).");
  if (file.getSize() > EMAIL_POSTER_MAX_BYTES) throw new Error("Poster terlalu besar (maksimum 5MB).");
  return file.getBlob().setName(file.getName());
}

function emailPlainText_(text) {
  return String(text || "").trim()
    .replace(/^\[\[\s*(poster|kotak|\/\s*kotak)\s*\]\]$/gim, "")
    .replace(/^##\s+/gm, "")
    .replace(/^\[\[\s*butang\s*:\s*(.+?)\s*\|\s*(\S+?)\s*\]\]$/gim, "$1: $2")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1$2")
    .replace(/\n{3,}/g, "\n\n");
}

// Returns subject, html, plain text and the inline images for GmailApp.
function buildEmail_(template, data) {
  const subject = fillTemplate_(template.subject, data).replace(/\s+/g, " ").trim().slice(0, 200);
  const bodyText = fillTemplate_(template.body, data);
  const images = {};
  const poster = emailPosterBlob_(template.poster);
  if (poster) images.poster = poster;
  const logo = emailLogoBlob_();
  if (logo) images.logo = logo;
  const badges = [];
  EMAIL_BADGES.forEach(b => {
    const blob = emailAssetBlob_(b.id, b.url);
    if (blob) { images[b.id] = blob; badges.push({ src: "cid:" + b.id, alt: b.alt }); }
  });
  const html = emailLayout_(bodyText, data,
    { logo: logo ? "cid:logo" : "", poster: poster ? "cid:poster" : "", badges: badges },
    emailSignatureInfo_());
  const plain = emailPlainText_(bodyText) + "\n\n--\n" + data.nama_ejen + " | " + EMAIL_AGENT_TITLE +
    "\nEasy Latih Consultancy\nTel / WhatsApp: " + data.telefon_ejen + " · Pejabat: " + EMAIL_OFFICE_PHONE +
    "\nwww.easylatih.my · " + EMAIL_SENDER + "\n" + EMAIL_OFFICE_ADDRESS;
  // GmailApp garbles characters outside the Basic Multilingual Plane (most
  // emoji such as 📅 📍 💳), so the HTML carries them as numeric entities.
  return {
    subject: subject.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, "").replace(/\s+/g, " ").trim(),
    html: html.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, c => "&#" + c.codePointAt(0) + ";"),
    plain: plain.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]\uFE0F?\s?/g, ""),
    inlineImages: images
  };
}

function emailSignatureInfo_() {
  return {
    title: EMAIL_AGENT_TITLE, officePhone: EMAIL_OFFICE_PHONE, address: EMAIL_OFFICE_ADDRESS, sender: EMAIL_SENDER,
    logo: EMAIL_LOGO_URL, badges: EMAIL_BADGES.map(b => ({ src: b.url, alt: b.alt }))
  };
}

// A public image link can be shown in the portal preview; a Drive file cannot.
function emailPosterPreview_(poster) {
  return /^https?:\/\//i.test(poster) && !/(drive|docs)\.google\.com/i.test(poster) ? poster : "";
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
    signature: emailSignatureInfo_(),
    templates: emailTemplates_().map(t => ({
      id: t.id, name: t.name, subject: t.subject, body: t.body,
      hasPoster: !!t.poster, posterPreview: emailPosterPreview_(t.poster), specialCode: t.specialCode
    }))
  });
}

function sendTemplateEmail_(e, session) {
  const p = e.parameter;
  const to = String(p.to || "").trim().toLowerCase();
  const picName = String(p.picName || "").trim().slice(0, 100);
  const company = String(p.company || "").trim().slice(0, 150);
  const rowNumber = Number(p.rowNumber || 0);

  if (!EMAIL_RE.test(to)) return jsonOutput({ success: false, message: "Alamat emel penerima tidak sah." });

  const template = emailTemplates_().find(t => t.id === String(p.templateId || "").trim());
  if (!template) return jsonOutput({ success: false, message: "Templat tidak dijumpai atau tidak aktif." });

  const profile = emailAgentProfile_(session);
  // The template's special code (early bird etc.) wins over the agent's own code.
  const code = template.specialCode || profile.code;
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

    const options = { htmlBody: mail.html, name: EMAIL_SENDER_NAME, replyTo: EMAIL_SENDER, inlineImages: mail.inlineImages };
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
  ensureTemplateHeaders_(sheet);
  if (sheet.getLastRow() < 2) {
    sheet.appendRow([
      "AKTA-KERJA-KT",
      "Jemputan Akta Kerja 1955 (Terengganu)",
      "[Penting untuk HR & Majikan] Adakah Pengurusan Pekerja Syarikat Anda Mematuhi Akta Kerja 1955?",
      [
        "Assalamualaikum dan Salam Sejahtera {{nama_pic}},",
        "",
        "Adakah syarikat anda pasti bahawa pengiraan gaji lebih masa (OT), pengurusan cuti, dan prosedur siasatan disiplin pekerja yang diamalkan sekarang benar-benar mematuhi undang-undang?",
        "",
        "Kesilapan kecil dalam mentafsir Akta Kerja 1955 bukan sahaja boleh mencetuskan pertikaian dengan pekerja, malah berisiko mengundang tindakan atau pemeriksaan daripada Jabatan Tenaga Kerja (JTK).",
        "",
        "Bagi membantu organisasi anda mengurus pekerja secara sah, adil, dan berkesan, **EasyLatih** menganjurkan kursus interaktif selama 2 hari:",
        "",
        "[[KOTAK]]",
        "**AKTA KERJA 1955: Perkara Yang Wajib Diketahui Oleh Setiap Majikan**",
        "",
        "📅 **Tarikh:** 6 & 7 Disember 2026",
        "⏰ **Masa:** 9.00 pagi – 5.00 petang",
        "📍 **Lokasi:** Raia Hotel & Convention Centre Terengganu",
        "💳 **Pembiayaan:** 100% HRD Corp Claimable (Skim SBL Khas) @ Tunai",
        "[[/KOTAK]]",
        "",
        "[[POSTER]]",
        "",
        "## Tanpa Bayaran Awal untuk Syarikat Pembayar Levi",
        "Yuran kursus tidak perlu dibayar terlebih dahulu. EasyLatih akan membuat tuntutan yuran kepada HRD Corp (bergantung pada baki levi syarikat), manakala syarikat hanya perlu memohon geran. Kami juga akan membimbing syarikat dalam proses permohonan geran secara **percuma**.",
        "",
        "Syarikat juga boleh menuntut **elaun peserta** berdasarkan jarak sehala dari syarikat ke tempat latihan:",
        "- **Kurang daripada 100 km:** RM250 seorang sehari",
        "- **Lebih daripada 100 km:** RM500 seorang sehari",
        "- **Perjalanan melebihi 100 km:** Tambahan elaun untuk 1 hari perjalanan (travelling day)",
        "*Tuntutan elaun tertakluk kepada baki levi syarikat dan kelulusan HRD Corp.*",
        "",
        "## Apa Yang Akan Dipelajari",
        "- **Kontrak Pekerjaan & Status Pekerja:** Menilai terma perkhidmatan, mengenal pasti klausa berisiko, dan membezakan status pekerja.",
        "- **Formula Gaji & Kerja Lebih Masa (OT):** Latihan pengiraan tepat bagi OT, kerja pada hari rehat, cuti umum, serta potongan gaji statutori.",
        "- **Pengurusan Cuti & Perlindungan Keluarga:** Hak cuti sakit/hospitalisasi, penyalahgunaan MC, serta elaun bersalin dan paterniti.",
        "- **Disiplin, Siasatan Dalaman & Penamatan:** Prosedur salah laku, kes tidak hadir bertugas, Siasatan Dalaman (DI), dan pemecatan berisiko.",
        "- **Simulasi Audit & Pemeriksaan JTK:** Persediaan dokumen dan langkah pembetulan apabila berdepan aduan atau lawatan JTK.",
        "",
        "**Sesuai untuk:** Pengurus & Pegawai HR, Pegawai Penggajian, Pegawai Pentadbiran, Penyelia, serta Pemilik Perniagaan.",
        "",
        "Lihat [rangka kursus](https://drive.google.com/file/d/1HGK6G6bcAPYBK1eRFd1qtg7rq1mZn1jg/view?usp=drive_link) dan [profil pengajar](https://drive.google.com/file/d/1J8pbkXnO0PuKInnvX3lHppIeM5MuHhmx/view?usp=drive_link).",
        "",
        "[[KOTAK]]",
        "🎁 **Khas untuk anda:** gunakan kod diskaun **{{kod_diskaun}}** semasa pendaftaran.",
        "Tempat adalah **TERHAD** bagi memastikan sesi praktikal dan kajian kes berjalan secara optimal.",
        "[[/KOTAK]]",
        "",
        "[[BUTANG: LIHAT HARGA & DAFTAR | https://www.easylatih.my/registration/?course=HR006]]",
        "",
        "Perlukan bantuan permohonan geran HRD Corp? Hubungi saya di {{telefon_ejen}} atau admin kami di **010-920 2811 / 09-560 4273**.",
        "",
        "*Nota: Majikan yang mempunyai 10 atau lebih pekerja warganegara Malaysia dan tertakluk di bawah Akta PSMB 2001 diwajibkan berdaftar serta membayar levi HRD Corp. Levi tersebut boleh digunakan untuk membiayai latihan kakitangan. Rujukan: https://hrdcorp.gov.my/ms/employer-bm*",
        "",
        "Terima kasih dan kami berharap dapat menerima penyertaan daripada organisasi tuan/puan.",
        "",
        "Salam hormat,"
      ].join("\n"),
      "YA",
      "",
      ""
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
