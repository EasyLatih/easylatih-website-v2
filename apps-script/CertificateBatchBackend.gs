/**
 * EasyLatih V2 - Manual Certificate Batch
 *
 * Drop this file into the existing EasyLatih V2 Google Apps Script project.
 * It intentionally reuses the existing certificate engine:
 *   - SHEET_ID
 *   - assertTrainerAdminAccess_()
 *   - getRunningNumber("CERTIFICATE")
 *   - createCertificateFromSlides(certNo, data)
 *   - getSafeEmail(), getSafeCc(), getEmailSubject() when available
 *
 * Manual imports are stored in the existing Participants sheet using a
 * synthetic CourseID (MANUAL-...). This keeps the feature compatible with
 * the current certificate and reporting structure without touching normal
 * public-programme registration rows.
 */

const MANUAL_CERTIFICATE_REQUIRED_HEADERS = [
  "CourseID",
  "ParticipantName",
  "ICNo",
  "Email",
  "HREmail",
  "ProgramName",
  "ProgramStartDate",
  "ProgramEndDate",
  "Venue",
  "AttendanceStatus",
  "CertificateNo",
  "CertificateURL",
  "CertificateStatus",
  "IssueDate",
  "EmailStatus",
  "EmailSentDate"
];

function getManualCertificateConfig() {
  assertTrainerAdminAccess_();

  return {
    isStaging: typeof IS_STAGING !== "undefined" ? Boolean(IS_STAGING) : false,
    stagingEmail: typeof STAGING_EMAIL !== "undefined" ? String(STAGING_EMAIL || "") : "",
    maxImport: 500,
    generateChunkSize: 40,
    emailChunkSize: 30
  };
}

function importManualCertificateBatch(payload) {
  assertTrainerAdminAccess_();

  payload = payload || {};
  const programName = cleanManualCertificateText_(payload.programName);
  const venue = cleanManualCertificateText_(payload.venue);
  const startDateText = cleanManualCertificateText_(payload.programStartDate);
  const endDateText = cleanManualCertificateText_(payload.programEndDate || payload.programStartDate);
  const participants = Array.isArray(payload.participants) ? payload.participants : [];

  if (!programName) {
    throw new Error("Program name is required.");
  }

  if (!startDateText) {
    throw new Error("Program start date is required.");
  }

  if (!participants.length) {
    throw new Error("At least one participant is required.");
  }

  if (participants.length > 500) {
    throw new Error("Maximum 500 participants per import batch.");
  }

  const sheetInfo = getManualCertificateParticipantsSheet_();
  const sheet = sheetInfo.sheet;
  const headers = sheetInfo.headers;
  const headerMap = sheetInfo.headerMap;

  const batchId = createManualCertificateBatchId_();
  const startDate = parseManualCertificateDate_(startDateText);
  const endDate = parseManualCertificateDate_(endDateText || startDateText);
  const createdRows = [];
  const rejected = [];

  participants.forEach(function (raw, index) {
    const participantName = cleanManualCertificateText_(raw && raw.participantName);
    const email = cleanManualCertificateText_(raw && raw.email).toLowerCase();
    const hrEmail = cleanManualCertificateText_(raw && raw.hrEmail).toLowerCase();
    const icNo = cleanManualCertificateText_(raw && raw.icNo);

    if (!participantName) {
      rejected.push({
        row: index + 1,
        reason: "Participant name is missing."
      });
      return;
    }

    const row = new Array(headers.length).fill("");

    setManualCertificateRowValue_(row, headerMap, "CourseID", batchId);
    setManualCertificateRowValue_(row, headerMap, "ParticipantName", participantName);
    setManualCertificateRowValue_(row, headerMap, "ICNo", icNo);
    setManualCertificateRowValue_(row, headerMap, "Email", email);
    setManualCertificateRowValue_(row, headerMap, "HREmail", hrEmail);
    setManualCertificateRowValue_(row, headerMap, "ProgramName", programName);
    setManualCertificateRowValue_(row, headerMap, "ProgramStartDate", startDate);
    setManualCertificateRowValue_(row, headerMap, "ProgramEndDate", endDate);
    setManualCertificateRowValue_(row, headerMap, "Venue", venue);
    setManualCertificateRowValue_(row, headerMap, "AttendanceStatus", "ATTENDED");
    setManualCertificateRowValue_(row, headerMap, "CertificateStatus", "PENDING");
    setManualCertificateRowValue_(row, headerMap, "EmailStatus", email ? "PENDING" : "MISSING_EMAIL");

    createdRows.push(row);
  });

  if (!createdRows.length) {
    throw new Error("No valid participant rows to import.");
  }

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, createdRows.length, headers.length).setValues(createdRows);

  return {
    success: true,
    batchId: batchId,
    imported: createdRows.length,
    rejected: rejected,
    status: getManualCertificateBatchStatus(batchId)
  };
}

function generateManualCertificateBatch(batchId, chunkSize) {
  assertTrainerAdminAccess_();

  batchId = cleanManualCertificateText_(batchId);
  if (!batchId) {
    throw new Error("Batch ID is required.");
  }

  const limit = Math.max(1, Math.min(Number(chunkSize) || 40, 60));
  const info = getManualCertificateParticipantsSheet_();
  const sheet = info.sheet;
  const values = sheet.getDataRange().getValues();
  const headers = info.headers;
  const map = info.headerMap;

  const required = [
    "CourseID",
    "ParticipantName",
    "ProgramName",
    "ProgramStartDate",
    "ProgramEndDate",
    "Venue",
    "AttendanceStatus",
    "CertificateNo",
    "CertificateURL",
    "CertificateStatus",
    "IssueDate"
  ];
  assertManualCertificateHeaders_(map, required);

  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let remaining = 0;
  const errors = [];

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][map.CourseID] || "").trim() !== batchId) {
      continue;
    }

    const attendance = String(values[i][map.AttendanceStatus] || "").trim().toUpperCase();
    const certStatus = String(values[i][map.CertificateStatus] || "").trim().toUpperCase();

    if (certStatus === "GENERATED") {
      skipped++;
      continue;
    }

    if (attendance !== "ATTENDED") {
      skipped++;
      continue;
    }

    if (generated + failed >= limit) {
      remaining++;
      continue;
    }

    try {
      if (typeof getRunningNumber !== "function") {
        throw new Error('Missing dependency: getRunningNumber("CERTIFICATE").');
      }
      if (typeof createCertificateFromSlides !== "function") {
        throw new Error("Missing dependency: createCertificateFromSlides().");
      }

      const certNo = getRunningNumber("CERTIFICATE");
      const programDate = formatManualCertificateProgramDate_(
        values[i][map.ProgramStartDate],
        values[i][map.ProgramEndDate]
      );

      const pdfUrl = createCertificateFromSlides(certNo, {
        participantName: values[i][map.ParticipantName],
        icNo: map.ICNo !== undefined ? values[i][map.ICNo] : "",
        programName: values[i][map.ProgramName],
        venue: values[i][map.Venue],
        programDate: programDate,
        certificateNo: certNo
      });

      sheet.getRange(i + 1, map.CertificateNo + 1).setValue(certNo);
      sheet.getRange(i + 1, map.CertificateURL + 1).setValue(pdfUrl);
      sheet.getRange(i + 1, map.CertificateStatus + 1).setValue("GENERATED");
      sheet.getRange(i + 1, map.IssueDate + 1).setValue(new Date());

      values[i][map.CertificateStatus] = "GENERATED";
      generated++;
    } catch (error) {
      failed++;
      errors.push({
        row: i + 1,
        participantName: String(values[i][map.ParticipantName] || ""),
        message: error.message
      });
    }
  }

  return {
    success: true,
    batchId: batchId,
    generated: generated,
    skipped: skipped,
    failed: failed,
    remaining: remaining,
    errors: errors.slice(0, 20),
    status: getManualCertificateBatchStatus(batchId)
  };
}

function sendManualCertificateBatch(batchId, chunkSize) {
  assertTrainerAdminAccess_();

  batchId = cleanManualCertificateText_(batchId);
  if (!batchId) {
    throw new Error("Batch ID is required.");
  }

  const limit = Math.max(1, Math.min(Number(chunkSize) || 30, 40));
  const info = getManualCertificateParticipantsSheet_();
  const sheet = info.sheet;
  const values = sheet.getDataRange().getValues();
  const map = info.headerMap;

  const required = [
    "CourseID",
    "ParticipantName",
    "Email",
    "HREmail",
    "ProgramName",
    "ProgramStartDate",
    "ProgramEndDate",
    "CertificateURL",
    "CertificateStatus",
    "EmailStatus",
    "EmailSentDate"
  ];
  assertManualCertificateHeaders_(map, required);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let missingEmail = 0;
  let remaining = 0;
  const errors = [];

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][map.CourseID] || "").trim() !== batchId) {
      continue;
    }

    const certificateStatus = String(values[i][map.CertificateStatus] || "").trim().toUpperCase();
    const emailStatus = String(values[i][map.EmailStatus] || "").trim().toUpperCase();

    if (emailStatus === "SENT") {
      skipped++;
      continue;
    }

    if (certificateStatus !== "GENERATED") {
      skipped++;
      continue;
    }

    const participantEmail = String(values[i][map.Email] || "").trim();
    const hrEmail = String(values[i][map.HREmail] || "").trim();

    if (!participantEmail) {
      missingEmail++;
      sheet.getRange(i + 1, map.EmailStatus + 1).setValue("MISSING_EMAIL");
      continue;
    }

    if (sent + failed >= limit) {
      remaining++;
      continue;
    }

    try {
      const certificateUrl = String(values[i][map.CertificateURL] || "").trim();
      const pdfFile = getManualCertificatePdfBlob_(certificateUrl);
      const participantName = String(values[i][map.ParticipantName] || "Participant").trim();
      const programName = String(values[i][map.ProgramName] || "").trim();
      const programDate = formatManualCertificateProgramDate_(
        values[i][map.ProgramStartDate],
        values[i][map.ProgramEndDate]
      );

      const subject = "Certificate of Attendance - " + programName;
      const body =
        "Dear " + participantName + ",\n\n" +
        "Thank you for attending the programme below:\n\n" +
        "Programme:\n" + programName + "\n\n" +
        "Date:\n" + programDate + "\n\n" +
        "Please find attached your Certificate of Attendance.\n\n" +
        "Thank you.\n\n" +
        "Easy Latih Consultancy\n" +
        "Easy Learning, Real Results!";

      GmailApp.sendEmail(
        safeManualCertificateRecipient_(participantEmail),
        safeManualCertificateSubject_(subject),
        body,
        {
          cc: safeManualCertificateCc_(hrEmail),
          attachments: [pdfFile]
        }
      );

      sheet.getRange(i + 1, map.EmailStatus + 1).setValue("SENT");
      sheet.getRange(i + 1, map.EmailSentDate + 1).setValue(new Date());
      values[i][map.EmailStatus] = "SENT";
      sent++;
    } catch (error) {
      failed++;
      sheet.getRange(i + 1, map.EmailStatus + 1).setValue("FAILED");
      errors.push({
        row: i + 1,
        participantName: String(values[i][map.ParticipantName] || ""),
        message: error.message
      });
    }
  }

  return {
    success: true,
    batchId: batchId,
    sent: sent,
    skipped: skipped,
    failed: failed,
    missingEmail: missingEmail,
    remaining: remaining,
    errors: errors.slice(0, 20),
    status: getManualCertificateBatchStatus(batchId)
  };
}

function getManualCertificateBatchStatus(batchId) {
  assertTrainerAdminAccess_();

  batchId = cleanManualCertificateText_(batchId);
  const info = getManualCertificateParticipantsSheet_();
  const values = info.sheet.getDataRange().getValues();
  const map = info.headerMap;

  assertManualCertificateHeaders_(map, [
    "CourseID",
    "ParticipantName",
    "Email",
    "HREmail",
    "ProgramName",
    "ProgramStartDate",
    "ProgramEndDate",
    "Venue",
    "CertificateNo",
    "CertificateURL",
    "CertificateStatus",
    "EmailStatus"
  ]);

  const rows = [];
  const counts = {
    total: 0,
    generated: 0,
    pendingCertificate: 0,
    sent: 0,
    pendingEmail: 0,
    missingEmail: 0,
    failedEmail: 0
  };

  values.slice(1).forEach(function (row) {
    if (String(row[map.CourseID] || "").trim() !== batchId) {
      return;
    }

    const certStatus = String(row[map.CertificateStatus] || "PENDING").trim().toUpperCase();
    const emailStatus = String(row[map.EmailStatus] || "PENDING").trim().toUpperCase();
    const email = String(row[map.Email] || "").trim();

    counts.total++;
    if (certStatus === "GENERATED") counts.generated++;
    else counts.pendingCertificate++;

    if (!email) counts.missingEmail++;
    else if (emailStatus === "SENT") counts.sent++;
    else if (emailStatus === "FAILED") counts.failedEmail++;
    else counts.pendingEmail++;

    rows.push({
      participantName: String(row[map.ParticipantName] || ""),
      email: email,
      hrEmail: String(row[map.HREmail] || ""),
      certificateNo: String(row[map.CertificateNo] || ""),
      certificateUrl: String(row[map.CertificateURL] || ""),
      certificateStatus: certStatus,
      emailStatus: emailStatus
    });
  });

  let programme = null;
  if (rows.length) {
    const sourceRow = values.slice(1).find(function (row) {
      return String(row[map.CourseID] || "").trim() === batchId;
    });

    programme = {
      batchId: batchId,
      programName: String(sourceRow[map.ProgramName] || ""),
      programDate: formatManualCertificateProgramDate_(
        sourceRow[map.ProgramStartDate],
        sourceRow[map.ProgramEndDate]
      ),
      venue: String(sourceRow[map.Venue] || "")
    };
  }

  return {
    success: true,
    programme: programme,
    counts: counts,
    rows: rows,
    isStaging: typeof IS_STAGING !== "undefined" ? Boolean(IS_STAGING) : false,
    stagingEmail: typeof STAGING_EMAIL !== "undefined" ? String(STAGING_EMAIL || "") : ""
  };
}

function getManualCertificateParticipantsSheet_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName("Participants");

  if (!sheet) {
    throw new Error('Sheet "Participants" was not found.');
  }

  let lastColumn = sheet.getLastColumn();
  let headers = lastColumn > 0
    ? sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (h) {
        return String(h || "").trim();
      })
    : [];

  MANUAL_CERTIFICATE_REQUIRED_HEADERS.forEach(function (header) {
    if (headers.indexOf(header) === -1) {
      sheet.getRange(1, headers.length + 1).setValue(header);
      headers.push(header);
    }
  });

  const headerMap = {};
  headers.forEach(function (header, index) {
    if (header) headerMap[header] = index;
  });

  return {
    sheet: sheet,
    headers: headers,
    headerMap: headerMap
  };
}

function setManualCertificateRowValue_(row, headerMap, header, value) {
  if (headerMap[header] !== undefined) {
    row[headerMap[header]] = value;
  }
}

function assertManualCertificateHeaders_(headerMap, required) {
  const missing = required.filter(function (header) {
    return headerMap[header] === undefined;
  });

  if (missing.length) {
    throw new Error("Missing participant header(s): " + missing.join(", "));
  }
}

function createManualCertificateBatchId_() {
  const now = new Date();
  const stamp = Utilities.formatDate(now, Session.getScriptTimeZone() || "Asia/Kuala_Lumpur", "yyyyMMdd-HHmmss");
  const random = Math.floor(1000 + Math.random() * 9000);
  return "MANUAL-" + stamp + "-" + random;
}

function parseManualCertificateDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return value;
  }

  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("Invalid date: " + text + ". Use YYYY-MM-DD.");
  }

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}

function formatManualCertificateProgramDate_(startDate, endDate) {
  if (typeof formatProgramDate === "function") {
    return formatProgramDate(startDate, endDate);
  }

  const tz = Session.getScriptTimeZone() || "Asia/Kuala_Lumpur";
  const start = new Date(startDate);
  const end = new Date(endDate || startDate);
  const startText = Utilities.formatDate(start, tz, "d MMMM yyyy");
  const endText = Utilities.formatDate(end, tz, "d MMMM yyyy");
  return startText === endText ? startText : startText + " - " + endText;
}

function getManualCertificatePdfBlob_(certificateUrl) {
  const text = String(certificateUrl || "").trim();
  if (!text) {
    throw new Error("Certificate URL is missing.");
  }

  const match = text.match(/\/d\/([a-zA-Z0-9_-]+)/) || text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const fileId = match ? match[1] : (/^[a-zA-Z0-9_-]{20,}$/.test(text) ? text : "");

  if (!fileId) {
    throw new Error("Invalid certificate URL.");
  }

  return DriveApp.getFileById(fileId).getBlob();
}

function safeManualCertificateRecipient_(email) {
  return typeof getSafeEmail === "function" ? getSafeEmail(email) : email;
}

function safeManualCertificateCc_(email) {
  return typeof getSafeCc === "function" ? getSafeCc(email || "") : (email || "");
}

function safeManualCertificateSubject_(subject) {
  return typeof getEmailSubject === "function" ? getEmailSubject(subject) : subject;
}

function cleanManualCertificateText_(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}
