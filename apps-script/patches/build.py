import json
SEP = "\n\n--------------------\nEnglish version\n--------------------\n\n"
P = []

# A. Code.gs certificate email
en_cert = """Dear Participant,

Thank you for attending the programme below:

Programme:
${programName}

Date:
${programDate}

Please find attached your Certificate of Attendance.

Thank you.

Easy Latih Consultancy
Easy Learning, Real Results!"""
ms_cert = """Tuan/Puan,

Terima kasih kerana menghadiri program berikut:

Program:
${programName}

Tarikh:
${programDate}

Bersama ini dilampirkan Sijil Kehadiran anda.

Terima kasih.

Easy Latih Consultancy"""
P.append({"file":"const SHEET_ID","old":'''      const subject =
        "Certificate of Attendance - " + programName;

      const body =
`'''+en_cert+'`;', "new":'''      const subject =
        "Sijil Kehadiran / Certificate of Attendance - " + programName;

      const body =
`'''+ms_cert+SEP+en_cert+'`;'})

# B. Code.gs quotation / invoice email
en_doc = """Dear Sir/Madam,

Thank you for your registration with Easy Latih Consultancy.

Please find attached the ${documentType.toLowerCase()} for the programme below:

Programme:
${programName}

Document No:
${documentNo}

Thank you.

Easy Latih Consultancy
Easy Learning, Real Results!"""
ms_doc = """Tuan/Puan,

Terima kasih atas pendaftaran anda dengan Easy Latih Consultancy.

Bersama ini dilampirkan ${documentTypeMs.toLowerCase()} bagi program berikut:

Program:
${programName}

No. Dokumen:
${documentNo}

Terima kasih.

Easy Latih Consultancy"""
P.append({"file":"const SHEET_ID","old":'''  const subject = documentType + " - " + programName;

  const body =
`'''+en_doc+'`;', "new":'''  const documentTypeMs = ({ Quotation: "Sebut Harga", Invoice: "Invois", Receipt: "Resit" })[documentType] || documentType;
  const subject = documentTypeMs + " / " + documentType + " - " + programName;

  const body =
`'''+ms_doc+SEP+en_doc+'`;'})

# C. Programme confirmed (public)
en_conf = """Dear ${picName || "Sir/Madam"},

We are pleased to confirm that the following Easy Latih programme will proceed as scheduled.

Programme:
${programName}

Date:
${programDate}

Delivery Mode:
${deliveryMode || "-"}

Venue:
${venue || "-"}

Registration ID:
${registrationId}

Your registration has been confirmed.

Further programme information will be shared before the programme date.

Thank you.

Easy Latih Consultancy
Easy Learning, Real Results!"""
ms_conf = """Tuan/Puan ${picName},

Sukacita dimaklumkan bahawa program Easy Latih berikut akan diteruskan seperti yang dijadualkan.

Program:
${programName}

Tarikh:
${programDate}

Mod Penyampaian:
${deliveryMode || "-"}

Tempat:
${venue || "-"}

ID Pendaftaran:
${registrationId}

Pendaftaran anda telah disahkan.

Maklumat lanjut program akan dikongsi sebelum tarikh program.

Terima kasih.

Easy Latih Consultancy"""
P.append({"file":"function sendProgrammeConfirmationEmails_(","old":'''    const subject =
      "Programme Confirmed - " +
      programName;

    const body =
`'''+en_conf+'`;', "new":'''    const subject =
      "Program Disahkan / Programme Confirmed - " +
      programName;

    const body =
`'''+ms_conf+SEP+en_conf+'`;'})

# D. Public programme cancelled
en_can = """Dear ${picName || "Sir/Madam"},

We regret to inform you that the following Easy Latih programme will not proceed as scheduled.

Programme:
${programName}

Date:
${programDate}

Delivery Mode:
${deliveryMode || "-"}

Venue:
${venue || "-"}

Registration ID:
${registrationId}

Our team will contact you separately if any further action is required regarding your registration.

We apologise for any inconvenience caused.

Thank you.

Easy Latih Consultancy
Easy Learning, Real Results!"""
ms_can = """Tuan/Puan ${picName},

Dukacita dimaklumkan bahawa program Easy Latih berikut tidak akan diteruskan seperti yang dijadualkan.

Program:
${programName}

Tarikh:
${programDate}

Mod Penyampaian:
${deliveryMode || "-"}

Tempat:
${venue || "-"}

ID Pendaftaran:
${registrationId}

Pihak kami akan menghubungi anda secara berasingan sekiranya sebarang tindakan lanjut diperlukan berkaitan pendaftaran anda.

Kami memohon maaf atas sebarang kesulitan yang timbul.

Terima kasih.

Easy Latih Consultancy"""
P.append({"file":"function sendProgrammeConfirmationEmails_(","old":'''    const subject =
      "Programme Cancellation - " +
      programName;

    const body =
`'''+en_can+'`;', "new":'''    const subject =
      "Pembatalan Program / Programme Cancellation - " +
      programName;

    const body =
`'''+ms_can+SEP+en_can+'`;'})

# E. In-house programme cancelled
en_inh = """Dear ${picName || "Sir/Madam"},

We regret to inform you that the following in-house programme will not proceed as scheduled.

Company:
${companyName || "-"}

Programme:
${programName}

Date:
${programDate}

Delivery Mode:
${deliveryMode || "-"}

Venue:
${venue || "-"}

Course ID:
${courseId}

Quotation No:
${quotationNo || "-"}

Our team will contact you separately if any further action or rescheduling is required.

We apologise for any inconvenience caused.

Thank you.

Easy Latih Consultancy
Easy Learning, Real Results!"""
ms_inh = """Tuan/Puan ${picName},

Dukacita dimaklumkan bahawa program dalaman (in-house) berikut tidak akan diteruskan seperti yang dijadualkan.

Syarikat:
${companyName || "-"}

Program:
${programName}

Tarikh:
${programDate}

Mod Penyampaian:
${deliveryMode || "-"}

Tempat:
${venue || "-"}

ID Kursus:
${courseId}

No. Sebut Harga:
${quotationNo || "-"}

Pihak kami akan menghubungi anda secara berasingan sekiranya sebarang tindakan lanjut atau penjadualan semula diperlukan.

Kami memohon maaf atas sebarang kesulitan yang timbul.

Terima kasih.

Easy Latih Consultancy"""
P.append({"file":"function sendProgrammeConfirmationEmails_(","old":'''  const subject =
    "Programme Cancellation - " +
    programName;

  const body =
`'''+en_inh+'`;', "new":'''  const subject =
    "Pembatalan Program / Programme Cancellation - " +
    programName;

  const body =
`'''+ms_inh+SEP+en_inh+'`;'})

# F. Manual certificate batch
P.append({"file":"/**\n * EasyLatih V2 - Manual Certificate","old":'''      const subject = "Certificate of Attendance - " + programName;
      const body =
        "Dear " + participantName + ",\\n\\n" +''', "new":'''      const subject = "Sijil Kehadiran / Certificate of Attendance - " + programName;
      const body =
        "Tuan/Puan " + participantName + ",\\n\\n" +
        "Terima kasih kerana menghadiri program berikut:\\n\\n" +
        "Program:\\n" + programName + "\\n\\n" +
        "Tarikh:\\n" + programDate + "\\n\\n" +
        "Bersama ini dilampirkan Sijil Kehadiran anda.\\n\\n" +
        "Terima kasih.\\n\\n" +
        "Easy Latih Consultancy" +
        "\\n\\n--------------------\\nEnglish version\\n--------------------\\n\\n" +
        "Dear " + participantName + ",\\n\\n" +'''})

json.dump(P, open('bilingual-emails.json','w'), ensure_ascii=False, indent=1)
print(len(P))
