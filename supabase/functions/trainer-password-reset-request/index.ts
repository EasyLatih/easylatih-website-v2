import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const PRIMARY_FROM = Deno.env.get("EASYLATIH_EMAIL_FROM") ?? "EasyLatih <no-reply@easylatih.my>";
const REPLY_TO = Deno.env.get("EASYLATIH_EMAIL_REPLY_TO") ?? "admin@easylatih.my";
const FALLBACK_FROM = "EasyLatih Trainer Portal <no-reply@rapat.my>";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const recent = new Map<string, number>();

function allowedOrigin(value: string | null) {
  if (!value) return "https://www.easylatih.my";
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    if (u.protocol !== "https:") return "https://www.easylatih.my";
    if (host === "www.easylatih.my" || host === "easylatih.my") return u.origin;
    if (host.endsWith(".vercel.app") && host.startsWith("easylatih-trainer-")) return u.origin;
  } catch (_) {}
  return "https://www.easylatih.my";
}

function cors(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Vary": "Origin",
  };
}

function json(body: unknown, status = 200, origin = "https://www.easylatih.my") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sendResend(from: string, email: string, resetUrl: string) {
  return await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [email],
      reply_to: REPLY_TO,
      subject: "Reset your EasyLatih Trainer Portal password",
      html: `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#f7f9fc;padding:24px;color:#1f2937"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px"><tr><td style="padding:28px"><h2 style="margin:0 0 12px;color:#0d3b66">Reset your password</h2><p style="font-size:15px;line-height:1.6">We received a request to reset the password for your EasyLatih Trainer Portal account.</p><p style="margin:24px 0"><a href="${resetUrl}" style="display:inline-block;background:#f95f01;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:9px">Set New Password</a></p><p style="font-size:13px;line-height:1.6;color:#6b7280">This link is single-use and expires according to EasyLatih's authentication settings. If you did not request a reset, you can ignore this email.</p><p style="font-size:13px;color:#6b7280">Easy Latih Consultancy</p></td></tr></table></td></tr></table></body></html>`,
      text: `Reset your EasyLatih Trainer Portal password:\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`,
    }),
  });
}

Deno.serve(async (req) => {
  const origin = allowedOrigin(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });

  if (req.method === "GET") {
    return json({
      ok: true,
      configured: Boolean(SUPABASE_URL && SERVICE_ROLE_KEY && RESEND_API_KEY),
      primaryFrom: PRIMARY_FROM.replace(/<[^>]+>/, "<configured>"),
      version: 1,
    }, 200, origin);
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  let email = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch (_) {
    return json({ ok: true, message: "If the account exists, a reset email will be sent." }, 200, origin);
  }

  const generic = { ok: true, message: "If the account exists, a reset email will be sent." };
  if (!email || !email.includes("@") || email.length > 254) return json(generic, 200, origin);

  const now = Date.now();
  const last = recent.get(email) ?? 0;
  if (now - last < 60_000) return json(generic, 200, origin);
  recent.set(email, now);

  if (!RESEND_API_KEY || !SERVICE_ROLE_KEY) {
    console.error("Password reset provider is not configured");
    return json(generic, 200, origin);
  }

  try {
    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email });
    if (error || !data?.properties) {
      console.log("Recovery link not generated", error?.message ?? "no properties");
      return json(generic, 200, origin);
    }

    const actionLink = data.properties.action_link ?? "";
    let tokenHash = data.properties.hashed_token ?? "";
    if (!tokenHash && actionLink) {
      try { tokenHash = new URL(actionLink).searchParams.get("token") ?? ""; } catch (_) {}
    }
    if (!tokenHash) {
      console.error("Recovery token hash missing");
      return json(generic, 200, origin);
    }

    const resetUrl = `${origin}/trainer/reset-password.html?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;

    let res = await sendResend(PRIMARY_FROM, email, resetUrl);
    if (!res.ok && !PRIMARY_FROM.includes("@rapat.my")) {
      console.warn("Primary sender failed, retrying temporary verified fallback sender", res.status, await res.text());
      res = await sendResend(FALLBACK_FROM, email, resetUrl);
    }
    if (!res.ok) {
      console.error("Resend failed", res.status, await res.text());
      return json(generic, 200, origin);
    }
    console.log("Password recovery email accepted for delivery");
    return json(generic, 200, origin);
  } catch (err) {
    console.error("Password reset error", err);
    return json(generic, 200, origin);
  }
});
