const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbw1PRE_G3xUUc9WEAOX6m2bAAJ4yvtY3ghMihC4dxGVfsT6JwPjIyJl_VhPdihGA3c/exec";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, message: "Method not allowed." });
  }

  const course = String(req.query.course || "").trim();
  if (!course) {
    return res.status(400).json({ ok: false, message: "Course ID is required." });
  }

  try {
    const url = new URL(APPS_SCRIPT_URL);
    url.searchParams.set("action", "getProgramDetails");
    url.searchParams.set("course", course);

    const response = await fetch(url.toString(), { redirect: "follow" });
    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload) {
      throw new Error("Unable to load programme details.");
    }

    // Programme details change infrequently. Availability is checked live again on submit.
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Public registration details error:", error);
    return res.status(502).json({
      ok: false,
      message: "Unable to load programme details. Please refresh and try again."
    });
  }
}
