const fetch = require('node-fetch');

exports.handler = async (event) => {
  try {
    const data = JSON.parse(event.body);
    const { payorName, payorEmail, payorPhone, participants } = data;

    const pricePerPax = 5000; // RM50 dalam sen
    const totalAmount = participants.length * pricePerPax;

    const formData = new URLSearchParams();
    formData.append('userSecretKey', process.env.TOYYIB_SECRET);
    formData.append('categoryCode', process.env.TOYYIB_CATEGORY);
    formData.append('billName', 'Webinar Duti Setem');
    formData.append('billDescription', 'Yuran pendaftaran webinar duti setem');
    formData.append('billPriceSetting', 1);
    formData.append('billPayorInfo', 1);
    formData.append('billAmount', totalAmount.toString());
    formData.append('billReturnUrl', process.env.RETURN_URL);
    formData.append('billCallbackUrl', process.env.CALLBACK_URL);
    formData.append('billExternalReferenceNo', 'WEBINAR-' + Date.now());
    formData.append('billTo', payorName);
    formData.append('billEmail', payorEmail);
    formData.append('billPhone', payorPhone);
    formData.append('billContentEmail', 'Terima kasih kerana mendaftar. Pautan webinar akan dihantar sebelum acara.');
    formData.append('billAdditionalField', JSON.stringify({ participants }));

    const response = await fetch('https://toyyibpay.com/index.php/api/createBill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });
    const result = await response.json();
    const billCode = result[0].BillCode;
    const paymentUrl = `https://toyyibpay.com/${billCode}`;

    return {
      statusCode: 200,
      body: JSON.stringify({ paymentUrl })
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
