/**
 * EasyLatih – Appendices generator: draft Appendix B (Description) and C (Relevance)
 * with Gemini, from the course content.
 *
 * Add this as a NEW file in the same Apps Script project as AdminToolsBridge.gs and
 * PublicRegistrationAdmin.gs. The action is exposed through publicRegistrationActions_()
 * as "regAppendixGenerate", so only signed-in Admin Centre admins can call it.
 *
 * One-time setup (Project Settings → Script properties):
 *   GEMINI_API_KEY   API key from Google AI Studio (aistudio.google.com) on a project with
 *                    billing enabled, so the paid-tier data terms apply (prompts and files
 *                    are not used to train Google's models).
 *   GEMINI_MODEL     optional, defaults to gemini-2.5-flash.
 *
 * Course content can come from:
 *   - a PDF uploaded on the Appendices page (sent as base64), or
 *   - the programme's CourseContentURL (Google Doc, or a PDF / Word file in Drive).
 */

const APPX_AI_LIMIT_ = 400;
const APPX_AI_MAX_BYTES_ = 15 * 1024 * 1024;

function appxGenerate_(d) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('Gemini is not set up yet: add GEMINI_API_KEY in the Apps Script project settings, or use "Copy prompt for Gemini".');
  const model = props.getProperty('GEMINI_MODEL') || 'gemini-2.5-flash';
  const title = String(d.title || '').trim();
  if (!title) throw new Error('Enter the course title first.');

  const content = appxCourseContent_(d);
  const parts = [{ text: appxPrompt_(title, d.retrainingType) }];
  if (content.text) parts.push({ text: 'COURSE CONTENT:\n' + content.text.slice(0, 60000) });
  if (content.blob) parts.push({ inline_data: { mime_type: content.blob.getContentType(), data: Utilities.base64Encode(content.blob.getBytes()) } });
  if (!content.text && !content.blob) throw new Error('Attach the course content (PDF) or set the course content link on the programme.');

  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      contents: [{ role: 'user', parts: parts }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { description: { type: 'STRING' }, relevance: { type: 'STRING' } },
          required: ['description', 'relevance']
        }
      }
    })
  });
  const code = res.getResponseCode();
  const body = JSON.parse(res.getContentText() || '{}');
  if (code !== 200) throw new Error('Gemini error (' + code + '): ' + ((body.error && body.error.message) || 'no details'));
  const text = (((body.candidates || [])[0] || {}).content || {}).parts;
  const raw = (text || []).map(function (p) { return p.text || ''; }).join('');
  let out;
  try { out = JSON.parse(raw); } catch (_) { throw new Error('Gemini replied in an unexpected format. Try again.'); }
  return {
    description: appxFit_(out.description),
    relevance: appxFit_(out.relevance),
    source: content.source,
    model: model
  };
}

function appxPrompt_(title, retrainingType) {
  return [
    'Anda membantu penyedia latihan berdaftar HRD Corp (Easy Latih Consultancy) mengisi permohonan geran dalam sistem eTRiS.',
    'Kursus: ' + title + (retrainingType ? ' (kategori: ' + retrainingType + ')' : ''),
    'Berdasarkan course content yang diberi, tulis dalam Bahasa Melayu yang formal:',
    '1. description: ringkasan kursus – apa yang dipelajari dan hasil kepada peserta.',
    '2. relevance: sebab latihan ini relevan dan penting kepada majikan serta pekerja (risiko, pematuhan, prestasi, produktiviti).',
    'Syarat: setiap satu MAKSIMUM ' + APPX_AI_LIMIT_ + ' aksara termasuk ruang; satu perenggan; tiada bullet, tajuk atau emoji; jangan reka fakta yang tiada dalam course content.',
    'Contoh gaya description: "Memahami teras undang-undang perburuhan di Malaysia (termasuk Pindaan Akta Kerja 1955 terkini). Kursus ini memberikan kefahaman praktikal mengenai hak dan kewajipan majikan bagi memastikan operasi syarikat patuh undang-undang, mengelakkan risiko saman atau denda daripada Jabatan Tenaga Kerja (JTK), serta mewujudkan persekitaran kerja yang harmoni."',
    'Contoh gaya relevance: "Latihan ini sangat relevan kerana ia membekalkan majikan dan pihak HR dengan kefahaman kritikal mengenai Pindaan Akta Kerja 1955 terkini bagi mengelakkan risiko denda, kompaun, serta tindakan undang-undang daripada Jabatan Tenaga Kerja (JTK) atau Mahkamah Perusahaan."'
  ].join('\n');
}

// Cut to the limit at the last full sentence (or word) if the model runs long.
function appxFit_(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= APPX_AI_LIMIT_) return s;
  const cut = s.slice(0, APPX_AI_LIMIT_);
  const dot = cut.lastIndexOf('.');
  return dot > 200 ? cut.slice(0, dot + 1) : cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:]$/, '') + '.';
}

function appxCourseContent_(d) {
  if (d.fileBase64) {
    const bytes = Utilities.base64Decode(String(d.fileBase64));
    if (bytes.length > APPX_AI_MAX_BYTES_) throw new Error('The file is larger than 15 MB.');
    const mime = String(d.fileType || 'application/pdf');
    if (mime !== 'application/pdf') throw new Error('Upload the course content as a PDF.');
    return { blob: Utilities.newBlob(bytes, mime, d.fileName || 'course-content.pdf'), source: 'uploaded file' };
  }
  const url = String(d.courseContentUrl || '').trim();
  const m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(url) || /[?&]id=([a-zA-Z0-9_-]{20,})/.exec(url);
  if (!m) return {};
  const file = DriveApp.getFileById(m[1]);
  const mime = file.getMimeType();
  if (mime === MimeType.GOOGLE_DOCS) return { text: DocumentApp.openById(file.getId()).getBody().getText(), source: 'course content link (Google Doc)' };
  if (mime === MimeType.PDF) return { blob: file.getBlob(), source: 'course content link (PDF)' };
  if (mime === MimeType.MICROSOFT_WORD) {
    // Word → temporary Google Doc to read the text (needs the Drive advanced service, v3).
    if (typeof Drive === 'undefined') throw new Error('For Word files, turn on the Drive advanced service in Apps Script, or upload a PDF instead.');
    const tmp = Drive.Files.create({ name: 'tmp-appendix-' + Date.now(), mimeType: MimeType.GOOGLE_DOCS }, file.getBlob());
    try { return { text: DocumentApp.openById(tmp.id).getBody().getText(), source: 'course content link (Word)' }; }
    finally { DriveApp.getFileById(tmp.id).setTrashed(true); }
  }
  throw new Error('The course content link is not a Google Doc, PDF or Word file. Upload a PDF instead.');
}
