import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json' }
});

function errorMessage(value: unknown, fallback = 'Unexpected error.') {
  if (value instanceof Error && value.message) return value.message;
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    for (const key of ['message','error_description','details','hint','code']) {
      const item = v[key];
      if (typeof item === 'string' && item.trim()) return item.trim();
    }
  }
  const text = String(value ?? '').trim();
  return text && text !== '[object Object]' ? text : fallback;
}

async function getCaller(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function setBan(userId: string, banned: boolean) {
  if (banned) {
    const { error } = await db.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
    if (error) throw error;
    return;
  }

  let result = await db.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  if (!result.error) return;

  result = await db.auth.admin.updateUserById(userId, { ban_duration: '0s' });
  if (result.error) throw result.error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);

  const caller = await getCaller(req);
  if (!caller) return json({ ok: false, error: 'Unauthorized.' }, 401);
  if (caller.app_metadata?.role !== 'admin') return json({ ok: false, error: 'Admin access required.' }, 403);

  const body = await req.json().catch(() => ({}));
  const trainerId = String(body?.trainer_id || '').trim();
  const action = String(body?.action || '').trim().toLowerCase();
  if (!trainerId) return json({ ok: false, error: 'Missing trainer ID.' }, 400);
  if (!['deactivate','reactivate'].includes(action)) return json({ ok: false, error: 'Unsupported action.' }, 400);
  if (trainerId === caller.id) return json({ ok: false, error: 'You cannot change your own admin access here.' }, 400);

  const targetAuth = await db.auth.admin.getUserById(trainerId);
  if (targetAuth.error || !targetAuth.data.user) return json({ ok: false, error: 'Trainer auth account not found.' }, 404);
  if (targetAuth.data.user.app_metadata?.role === 'admin') return json({ ok: false, error: 'Admin accounts cannot be changed from Trainer Library.' }, 403);

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id,full_name,collaboration_status')
    .eq('id', trainerId)
    .single();
  if (profileError || !profile) return json({ ok: false, error: 'Trainer profile not found.' }, 404);

  const now = new Date().toISOString();

  try {
    if (action === 'deactivate') {
      await setBan(trainerId, true);
      const updated = await db.from('profiles')
        .update({ collaboration_status: 'INACTIVE', updated_at: now })
        .eq('id', trainerId);
      if (updated.error) {
        await setBan(trainerId, false).catch(() => {});
        throw updated.error;
      }
      return json({ ok: true, trainer_id: trainerId, collaboration_status: 'INACTIVE', auth_access: 'BANNED' });
    }

    await setBan(trainerId, false);
    const updated = await db.from('profiles')
      .update({ collaboration_status: 'ACTIVE', updated_at: now })
      .eq('id', trainerId);
    if (updated.error) {
      await setBan(trainerId, true).catch(() => {});
      throw updated.error;
    }

    return json({ ok: true, trainer_id: trainerId, collaboration_status: 'ACTIVE', auth_access: 'ENABLED' });
  } catch (error) {
    return json({ ok: false, error: errorMessage(error, 'Unable to update trainer access.') }, 500);
  }
});
