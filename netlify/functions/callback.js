const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  const params = new URLSearchParams(event.body);
  const status = params.get('status');
  const billCode = params.get('billcode');
  const amount = params.get('amount');
  const participantsJson = params.get('billAdditionalField');

  if (status === '1') {
    const participants = participantsJson ? JSON.parse(participantsJson).participants : [];

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
    });

    for (const person of participants) {
      await transporter.sendMail({
        from: 'noreply@easylatih.my',
        to: person.email,
        subject: 'Pengesahan Pendaftaran Webinar',
        html: `<p>Assalamualaikum/Salam sejahtera ${person.name},</p>
               <p>Terima kasih kerana mendaftar ke webinar duti setem.</p>
               <p>Butiran pembayaran: bil ${billCode}, jumlah RM ${(amount/100).toFixed(2)}.</p>
               <p>Kami akan menghantar pautan webinar sebelum tarikh acara.</p>`
      });
    }
  }
  return { statusCode: 200, body: 'OK' };
};
