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
      "participantsJson",
      "submissionId"
    ];

    fields.forEach((key) => {
      const value = body[key];
      params.set(key, value === undefined || value === null ? "" : String(value));
    });

    // Free programmes: pending registration, approved later in the Admin Centre.
    if (String(body.paymentMethod || "").toUpperCase() === "FREE") {
      const payload = {};
      fields.forEach((key) => { payload[key] = params.get(key); });
      const freeParams = new URLSearchParams();
      freeParams.set("action", "adminTools.publicFreeRegister");
      freeParams.set("payload", JSON.stringify(payload));
      const freeResponse = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: freeParams.toString(),
        redirect: "follow"
      });
      const freeText = await freeResponse.text();
      let result = null;
      try { result = JSON.parse(freeText); } catch (_) { result = null; }
      if (!result) {
        return res.status(502).json({ ok: false, message: "Free registration is not available yet. Please contact Easy Latih." });
      }
      return res.status(result.success ? 200 : 400).json({
        ok: !!result.success,
        message: result.success ? (result.data && result.data.message) || "Registration received, awaiting confirmation." : result.message || "Registration submission failed."
      });
    }

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
