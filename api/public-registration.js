const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw1PRE_G3xUUc9WEAOX6m2bAAJ4yvtY3ghMihC4dxGVfsT6JwPjIyJl_VhPdihGA3c/exec";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed." });
  }

  try {
    const body = req.body || {};
    const params = new URLSearchParams();

    const fields = [
      "courseId",
      "companyName",
      "companyAddress",
      "picName",
      "picPosition",
      "picEmail",
      "picPhone",
      "paymentMethod",
      "requestedPax",
      "discountCode",
      "discountAmount",
      "participantsJson"
    ];

    fields.forEach((key) => {
      const value = body[key];
      params.set(key, value === undefined || value === null ? "" : String(value));
    });

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: params.toString(),
      redirect: "follow"
    });

    const text = await response.text();

    return res.status(response.ok ? 200 : 502).json({
      ok: response.ok && !/^ERROR:/i.test(text.trim()),
      message: text || "No response received from Apps Script."
    });
  } catch (error) {
    console.error("Public registration proxy error:", error);
    return res.status(502).json({
      ok: false,
      message: "Unable to submit registration. Please try again."
    });
  }
}
