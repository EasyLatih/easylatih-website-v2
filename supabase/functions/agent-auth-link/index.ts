// Agent Portal: makes "set your password" links for sales agents.
//
// Called only by the Agent Portal Apps Script (server to server), which has
// already checked that the email belongs to an ACTIVE agent in the Agents sheet
// and sends the link in its own bilingual email. Supabase sends no email here.
//
// Auth: header x-agent-auth-secret must equal the AGENT_AUTH_SECRET secret
// (also stored as a Script property in Apps Script). Deployed with verify_jwt off.
//
// POST { action: "link", email, name, agent_id }
//   -> { ok, link, existing, shared }  invite link for a new account, or a password
//                               link when the email already has an account
// POST { action: "probe", email }
//   -> { ok, redirect }        where a link for this (existing) account lands,
//                               without the tokens; used to check Redirect URLs.
import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const secret = Deno.env.get('AGENT_AUTH_SECRET') || '';
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

const REDIRECT_TO = 'https://www.easylatih.my/internal/agent-dashboard.html';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function alreadyExists(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === 'email_exists' || /already (been )?registered|already exists/i.test(String(error.message || ''));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  if (secret.length < 32 || !sameSecret(req.headers.get('x-agent-auth-secret') || '', secret)) {
    return json({ ok: false, error: 'Unauthorized.' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'Invalid email.' }, 400);

  if (action === 'probe') {
    const { data, error } = await db.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: REDIRECT_TO } });
    if (error || !data?.properties?.action_link) return json({ ok: false, error: error?.message || 'No link.' }, 400);
    const res = await fetch(data.properties.action_link, { redirect: 'manual' });
    const location = res.headers.get('location') || '';
    return json({ ok: true, redirect: location.split('#')[0].split('?')[0] });
  }

  if (action !== 'link') return json({ ok: false, error: 'Unsupported action.' }, 400);

  const name = String(body?.name || '').trim().slice(0, 120);
  const agentId = String(body?.agent_id || '').trim().slice(0, 60);

  const invite = await db.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: REDIRECT_TO, data: { account_type: 'agent', full_name: name, agent_id: agentId } }
  });
  if (!invite.error && invite.data?.properties?.action_link) {
    return json({ ok: true, link: invite.data.properties.action_link, existing: false, shared: false });
  }
  if (!alreadyExists(invite.error)) {
    return json({ ok: false, error: invite.error?.message || 'Could not create the invite.' }, 400);
  }

  // The email already has an account (for example a trainer): send a password link.
  // Never hand out a link for an admin account through this function.
  const recovery = await db.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: REDIRECT_TO } });
  if (recovery.error || !recovery.data?.properties?.action_link) {
    return json({ ok: false, error: recovery.error?.message || 'Could not create the link.' }, 400);
  }
  if (recovery.data.user?.app_metadata?.role === 'admin') {
    return json({ ok: false, error: 'Admin accounts cannot be reset from the Agent Portal.' }, 403);
  }
  // shared: the account was not created as an agent (e.g. a trainer), so the new
  // password also applies to their other Easy Latih portals.
  const shared = recovery.data.user?.user_metadata?.account_type !== 'agent';
  return json({ ok: true, link: recovery.data.properties.action_link, existing: true, shared });
});
