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
 * Format Isi Emel (emel dihantar dalam bentuk HTML):
 *   baris kosong        perenggan baharu
 *   - teks              bullet
 *   **teks** / *teks*   tebal / italik
 *   [teks](https://...) pautan dengan teks; pautan https://... biasa juga boleh diklik
 *   [[BUTANG: Teks | https://...]]  butang oren
 *   [[POSTER]]          kedudukan poster (jika tiada, poster diletak selepas perenggan pertama)
 * Poster: letak pautan Google Drive gambar poster dalam lajur "Poster (pautan Drive)".
 * Poster dan logo dimasukkan terus ke dalam emel (bukan lampiran).
 * Tandatangan (logo, nama ejen, telefon, alamat pejabat) ditambah automatik.
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
const EMAIL_TEMPLATE_HEADERS = ["Template ID", "Nama Templat", "Subjek", "Isi Emel", "Aktif", "Poster (pautan Drive)"];
const EMAIL_LOGO_URL = "https://www.easylatih.my/assets/email-logo.jpg";
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

function emailTemplates_() {
  const sheet = emailSheet_(EMAIL_TEMPLATE_SHEET, EMAIL_TEMPLATE_HEADERS);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  if (!String(sheet.getRange(1, 6).getValue()).trim()) {
    sheet.getRange(1, 6).setValue(EMAIL_TEMPLATE_HEADERS[5]).setFontWeight("bold");
  }
  return sheet.getRange(2, 1, last - 1, 6).getValues()
    .map(r => ({
      id: String(r[0] || "").trim(),
      name: String(r[1] || "").trim(),
      subject: String(r[2] || "").trim(),
      body: String(r[3] || ""),
      active: ["", "YA", "YES", "Y", "TRUE", "AKTIF"].indexOf(String(r[4]).trim().toUpperCase()) !== -1,
      posterId: driveFileId_(r[5])
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

// Turns the template's simple markup into email HTML. The same function is
// copied into internal/agent-dashboard.html for the preview: keep them in step.
//   blank line = new paragraph · "- " = bullet · **bold** · *italic*
//   [text](https://link) · bare https:// links · [[POSTER]] · [[BUTANG: Text | https://link]]
function emailMarkup_(text, posterHtml) {
  const inline = s => emailEsc_(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#0d3b66">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, '$1<a href="$2" style="color:#0d3b66">$2</a>')
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>");
  const out = [];
  let para = [];
  let list = [];
  let posterUsed = false;
  const flush = () => {
    if (para.length) out.push('<p style="margin:0 0 14px">' + para.map(inline).join("<br>") + "</p>");
    if (list.length) out.push('<ul style="margin:0 0 14px;padding-left:22px">' + list.map(li => '<li style="margin:0 0 6px">' + inline(li) + "</li>").join("") + "</ul>");
    para = []; list = [];
  };
  String(text || "").replace(/\r/g, "").trim().split("\n").forEach(raw => {
    const line = raw.trim();
    const button = line.match(/^\[\[\s*butang\s*:\s*(.+?)\s*\|\s*(https?:\/\/\S+?)\s*\]\]$/i);
    const bullet = line.match(/^[-•]\s+(.*)$/);
    if (!line) { flush(); return; }
    if (/^\[\[\s*poster\s*\]\]$/i.test(line)) {
      flush();
      if (posterHtml) { out.push(posterHtml); posterUsed = true; }
      return;
    }
    if (button) {
      flush();
      out.push('<p style="margin:6px 0 18px"><a href="' + emailEsc_(button[2]) + '" style="display:inline-block;background:#e8630a;color:#ffffff;' +
        'padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold">' + emailEsc_(button[1]) + "</a></p>");
      return;
    }
    if (bullet) {
      if (para.length) { const keep = list; list = []; flush(); list = keep; }
      list.push(bullet[1]);
      return;
    }
    if (list.length) flush();
    para.push(line);
  });
  flush();
  // No [[POSTER]] in the template: the poster goes after the first paragraph.
  if (posterHtml && !posterUsed) out.splice(Math.min(1, out.length), 0, posterHtml);
  return out.join("");
}

function driveFileId_(value) {
  const m = String(value || "").match(/[-\w]{25,}/);
  return m ? m[0] : "";
}

function waLink_(phone) {
  let digits = String(phone || "").replace(/[^0-9]/g, "");
  if (digits.indexOf("0") === 0) digits = "6" + digits;
  return digits ? "https://wa.me/" + digits : "";
}

function emailLogoBlob_() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get("email-logo");
  try {
    if (cached) return Utilities.newBlob(Utilities.base64Decode(cached), "image/jpeg", "easylatih-logo.jpg");
    const res = UrlFetchApp.fetch(EMAIL_LOGO_URL, { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return null;
    const blob = res.getBlob().setName("easylatih-logo.jpg");
    cache.put("email-logo", Utilities.base64Encode(blob.getBytes()), 21600);
    return blob;
  } catch (error) {
    return null; // The email still goes out, just without the logo.
  }
}

function emailPosterBlob_(posterId) {
  if (!posterId) return null;
  const file = DriveApp.getFileById(posterId);
  if (!/^image\//.test(file.getMimeType())) throw new Error("Poster mesti fail gambar (PNG/JPG).");
  if (file.getSize() > EMAIL_POSTER_MAX_BYTES) throw new Error("Poster terlalu besar (maksimum 5MB).");
  return file.getBlob().setName(file.getName());
}

function emailSignatureHtml_(data, withLogo) {
  const wa = waLink_(data.telefon_ejen);
  const phone = wa ? '<a href="' + wa + '" style="color:#0d3b66;text-decoration:none">' + emailEsc_(data.telefon_ejen) + "</a>" : emailEsc_(data.telefon_ejen);
  return '<table cellpadding="0" cellspacing="0" style="margin-top:22px;border-top:1px solid #e2e8f0;padding-top:14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.55;color:#1e293b"><tr>' +
    (withLogo ? '<td style="padding:14px 16px 0 0;vertical-align:top"><img src="cid:logo" width="120" height="60" alt="Easy Latih" style="display:block"></td>' : "") +
    '<td style="padding-top:14px;vertical-align:top">' +
    "<strong>" + emailEsc_(data.nama_ejen) + "</strong> | " + EMAIL_AGENT_TITLE + "<br>" +
    "<strong>Easy Latih Consultancy</strong><br>" +
    "Tel / WhatsApp: " + phone + " · Pejabat: " + EMAIL_OFFICE_PHONE + "<br>" +
    '<a href="https://www.easylatih.my" style="color:#0d3b66">www.easylatih.my</a> · ' +
    '<a href="mailto:' + EMAIL_SENDER + '" style="color:#0d3b66">' + EMAIL_SENDER + "</a><br>" +
    '<span style="color:#64748b">' + EMAIL_OFFICE_ADDRESS + "</span></td></tr></table>";
}

function emailPlainText_(text) {
  return String(text || "").trim()
    .replace(/^\[\[\s*poster\s*\]\]$/gim, "")
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
  const poster = emailPosterBlob_(template.posterId);
  if (poster) images.poster = poster;
  const logo = emailLogoBlob_();
  if (logo) images.logo = logo;
  const posterHtml = poster
    ? '<p style="margin:0 0 16px"><img src="cid:poster" alt="Poster" width="560" style="display:block;width:100%;max-width:560px;height:auto;border:0"></p>'
    : "";
  const html =
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1e293b;max-width:620px">' +
    emailMarkup_(bodyText, posterHtml) + emailSignatureHtml_(data, !!logo) + "</div>";
  const plain = emailPlainText_(bodyText) + "\n\n--\n" + data.nama_ejen + " | " + EMAIL_AGENT_TITLE +
    "\nEasy Latih Consultancy\nTel / WhatsApp: " + data.telefon_ejen + " · Pejabat: " + EMAIL_OFFICE_PHONE +
    "\nwww.easylatih.my · " + EMAIL_SENDER + "\n" + EMAIL_OFFICE_ADDRESS;
  return { subject: subject, html: html, plain: plain, inlineImages: images };
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
    signature: { title: EMAIL_AGENT_TITLE, officePhone: EMAIL_OFFICE_PHONE, address: EMAIL_OFFICE_ADDRESS, logo: EMAIL_LOGO_URL },
    templates: emailTemplates_().map(t => ({ id: t.id, name: t.name, subject: t.subject, body: t.body, hasPoster: !!t.posterId }))
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
  if (!String(sheet.getRange(1, 6).getValue()).trim()) {
    sheet.getRange(1, 6).setValue(EMAIL_TEMPLATE_HEADERS[5]).setFontWeight("bold");
  }
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
        "**KURSUS: Akta Kerja 1955: Perkara Yang Wajib Diketahui Oleh Setiap Majikan**",
        "📅 **Tarikh:** 6 & 7 Disember 2026",
        "⏰ **Masa:** 9.00 pagi – 5.00 petang",
        "📍 **Lokasi:** Raia Hotel & Convention Centre Terengganu",
        "💳 **Pembiayaan:** 100% HRD Corp Claimable (Skim SBL Khas) @ Tunai",
        "",
        "***Untuk syarikat yang menggunakan levi HRD Corp:***",
        "*Yuran kursus tidak perlu dibayar terlebih dahulu. EasyLatih akan membuat tuntutan yuran kepada HRD Corp (bergantung pada baki levi syarikat), manakala syarikat hanya perlu memohon geran. Kami juga akan membimbing syarikat dalam proses permohonan geran secara percuma.*",
        "",
        "Syarikat yang membayar levi HRD Corp juga boleh memohon tuntutan **elaun peserta**, berdasarkan jarak sehala dari syarikat ke tempat latihan:",
        "- **Kurang daripada 100 km:** RM250 seorang sehari",
        "- **Lebih daripada 100 km:** RM500 seorang sehari",
        "- **Perjalanan melebihi 100 km:** Boleh memohon tambahan elaun untuk 1 hari perjalanan (travelling day)",
        "*Tuntutan elaun peserta tertakluk kepada baki levi syarikat dan kelulusan HRD Corp.*",
        "",
        "[[POSTER]]",
        "",
        "**Topik Utama Yang Akan Dipelajari:**",
        "- **Kontrak Pekerjaan & Status Pekerja:** Menilai terma perkhidmatan, mengenal pasti klausa berisiko, dan membezakan status pekerja.",
        "- **Formula Gaji & Kerja Lebih Masa (OT):** Latihan pengiraan tepat bagi OT, kerja pada hari rehat, cuti umum, serta potongan gaji statutori.",
        "- **Pengurusan Cuti & Perlindungan Keluarga:** Hak cuti sakit/hospitalisasi, penyalahgunaan MC, serta elaun bersalin dan paterniti.",
        "- **Disiplin, Siasatan Dalaman & Penamatan:** Prosedur salah laku, kes tidak hadir bertugas, Siasatan Dalaman (DI), dan pemecatan berisiko.",
        "- **Simulasi Audit & Pemeriksaan JTK:** Persediaan dokumen dan langkah pembetulan apabila berdepan aduan atau lawatan JTK.",
        "",
        "**Kumpulan Sasaran:** Pengurus & Pegawai Sumber Manusia (HR), Pegawai Penggajian, Pegawai Pentadbiran, Penyelia, serta Pemilik Perniagaan.",
        "",
        "Tempat adalah **TERHAD** bagi memastikan sesi praktikal dan kajian kes berjalan secara optimal.",
        "",
        "Maklumat lengkap program, kandungan kursus dan profil tenaga pengajar:",
        "- [Rangka kursus](https://drive.google.com/file/d/1HGK6G6bcAPYBK1eRFd1qtg7rq1mZn1jg/view?usp=drive_link)",
        "- [Profil pengajar](https://drive.google.com/file/d/1J8pbkXnO0PuKInnvX3lHppIeM5MuHhmx/view?usp=drive_link)",
        "",
        "**Khas untuk anda, sila gunakan kod diskaun {{kod_diskaun}} semasa pendaftaran.**",
        "",
        "[[BUTANG: LIHAT HARGA & DAFTAR DI SINI | https://www.easylatih.my/registration/?course=HR006]]",
        "",
        "Pihak tuan/puan digalakkan membuat pendaftaran serta permohonan geran HRD Corp lebih awal. Sekiranya memerlukan bantuan untuk permohonan geran HRD Corp, sila hubungi saya di {{telefon_ejen}} atau admin kami di **010-920 2811 / 09-560 4273**.",
        "",
        "***Nota HRD Corp:*** *Majikan yang mempunyai 10 atau lebih pekerja warganegara Malaysia dan tertakluk di bawah Akta PSMB 2001 diwajibkan berdaftar serta membayar levi HRD Corp. Levi tersebut boleh digunakan untuk membiayai latihan kakitangan.* Rujukan: https://hrdcorp.gov.my/ms/employer-bm",
        "",
        "Terima kasih dan kami berharap dapat menerima penyertaan daripada organisasi tuan/puan.",
        "",
        "Salam hormat,"
      ].join("\n"),
      "YA",
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
