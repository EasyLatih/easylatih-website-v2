// Shared branded email preview; kept in sync with AgentEmail.gs.
(() => {
const emailEsc_ = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
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

window.EasyLatihEmailRenderer = { layout: emailLayout_, fill: function fillTemplate_(text, data) {
  let out = String(text || "");
  if (!data.kod_diskaun) {
    out = out.split("\n").filter(line => line.indexOf("{{kod_diskaun}}") === -1).join("\n");
  }
  return out.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key) =>
    Object.prototype.hasOwnProperty.call(data, key) ? data[key] : m);
} };
})();
