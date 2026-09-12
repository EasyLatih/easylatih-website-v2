import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const appsScriptUrl = Deno.env.get('TRAINER_DRIVE_APPS_SCRIPT_URL') || '';
const bridgeSecret = Deno.env.get('TRAINER_DRIVE_BRIDGE_SECRET') || '';
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

const allowedTypes = new Set([
  'TTT_CERTIFICATE',
  'ACCREDITED_TRAINER_CERTIFICATE',
  'RESUME_CV',
  'OTHER_RELEVANT_CERTIFICATE'
]);
const allowedMime = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png'
]);

async function getUser(req: Request) {
  const auth = req.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function callDriveBridge(params: Record<string, string>) {
  if (!appsScriptUrl || !bridgeSecret) throw new Error('Google Drive bridge is not configured.');
  const body = new URLSearchParams({ ...params, bridgeSecret });
  const response = await fetch(appsScriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body,
    redirect: 'follow'
  });
  const text = await response.text();
  let data: any;
  try { data = JSON.parse(text); } catch { throw new Error('Google Drive bridge returned an invalid response.'); }
  if (!response.ok || !data?.ok) throw new Error(data?.error || `Google Drive bridge failed (${response.status}).`);
  return data;
}

async function getTrainerProfile(userId: string) {
  const { data, error } = await db
    .from('profiles')
    .select('id,full_name,collaboration_status')
    .eq('id', userId)
    .single();
  if (error || !data) throw new Error('Trainer profile not found.');
  if (!['ONBOARDING', 'ACTIVE'].includes(data.collaboration_status)) {
    throw new Error('This action is only available during trainer onboarding or active collaboration.');
  }
  return data;
}

async function saveDriveFolderMap(trainerId: string, drive: any) {
  const { error } = await db.from('trainer_drive_folders').upsert({
    trainer_id: trainerId,
    root_folder_id: drive.rootFolderId,
    ttt_folder_id: drive.tttFolderId,
    accredited_folder_id: drive.accreditedFolderId,
    resume_folder_id: drive.resumeFolderId,
    other_certificates_folder_id: drive.otherCertificatesFolderId,
    course_content_folder_id: drive.courseContentFolderId || null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'trainer_id' });
  if (error) throw error;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);

  const user = await getUser(req);
  if (!user) return json({ ok: false, error: 'Unauthorized.' }, 401);
  const isAdmin = user.app_metadata?.role === 'admin';

  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await req.json().catch(() => ({}));

    if (body?.action === 'download') {
      const documentId = String(body.document_id || '').trim();
      if (!documentId) return json({ ok: false, error: 'Missing document ID.' }, 400);

      let query = db
        .from('trainer_documents')
        .select('id,trainer_id,file_id,file_name,provider')
        .eq('id', documentId);
      if (!isAdmin) query = query.eq('trainer_id', user.id);
      const { data: doc, error } = await query.single();

      if (error || !doc || doc.provider !== 'GOOGLE_DRIVE' || !doc.file_id) {
        return json({ ok: false, error: 'Document not found.' }, 404);
      }
      try {
        const drive = await callDriveBridge({ action: 'trainerDocumentDownload', fileId: doc.file_id });
        return json({ ok: true, file_name: drive.fileName || doc.file_name, mime_type: drive.mimeType, base64: drive.base64 });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    if (body?.action === 'generate_course_outline') {
      if (isAdmin) return json({ ok: false, error: 'Course Outline generation must be initiated by the trainer submission workflow.' }, 403);
      const programmeId = String(body.programme_id || '').trim();
      if (!programmeId) return json({ ok: false, error: 'Missing programme ID.' }, 400);

      try {
        const profile = await getTrainerProfile(user.id);
        const programmeResult = await db
          .from('programmes')
          .select('*')
          .eq('id', programmeId)
          .eq('trainer_id', user.id)
          .single();
        if (programmeResult.error || !programmeResult.data) throw new Error('Programme not found.');
        const programme = programmeResult.data;
        if (programme.publish_status !== 'DRAFT') throw new Error('Only a Draft programme can be submitted for EasyLatih review.');
        if (!Array.isArray(programme.schedule) || !programme.schedule.length) throw new Error('Training Schedule is required before Course Outline generation.');
        if (!Number(programme.total_contact_hours || 0)) throw new Error('Total contact hours must be greater than 0.');

        const drive = await callDriveBridge({
          action: 'trainerDocumentCourseOutlineGenerate',
          trainerId: user.id,
          trainerName: profile.full_name,
          programmeJson: JSON.stringify(programme)
        });

        await saveDriveFolderMap(user.id, drive);

        const { data: document, error: documentError } = await db.from('trainer_documents').insert({
          trainer_id: user.id,
          programme_id: programme.id,
          document_type: 'COURSE_CONTENT',
          provider: 'GOOGLE_DRIVE',
          file_name: drive.fileName || `Course Outline - ${programme.title}`,
          file_id: drive.fileId,
          file_url: drive.fileUrl || null,
          verification_status: 'PENDING',
          updated_at: new Date().toISOString()
        }).select('id,programme_id,document_type,file_name,file_id,file_url,verification_status,created_at').single();
        if (documentError) throw documentError;

        const now = new Date().toISOString();
        const programmeUpdate = await db.from('programmes').update({
          course_outline_doc_id: drive.fileId,
          course_outline_doc_url: drive.fileUrl || null,
          course_outline_generated_at: now,
          publish_status: 'UNDER_REVIEW',
          updated_at: now
        }).eq('id', programme.id).eq('trainer_id', user.id);
        if (programmeUpdate.error) throw programmeUpdate.error;

        if (programme.proposal_id) {
          const proposalUpdate = await db.from('programme_proposals').update({
            status: 'FULL_DETAILS_SUBMITTED',
            updated_at: now
          }).eq('id', programme.proposal_id).eq('trainer_id', user.id);
          if (proposalUpdate.error) throw proposalUpdate.error;
        }

        return json({
          ok: true,
          document,
          course_outline_doc_url: drive.fileUrl || null,
          publish_status: 'UNDER_REVIEW'
        });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
      }
    }

    return json({ ok: false, error: 'Unsupported action.' }, 400);
  }

  if (isAdmin) return json({ ok: false, error: 'Admin upload is not available from this endpoint.' }, 403);

  let profile: any;
  try {
    profile = await getTrainerProfile(user.id);
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 403);
  }

  const form = await req.formData();
  const documentType = String(form.get('document_type') || '').trim().toUpperCase();
  const file = form.get('file');
  if (!allowedTypes.has(documentType)) return json({ ok: false, error: 'Unsupported document type.' }, 400);
  if (!(file instanceof File)) return json({ ok: false, error: 'Please choose a document to upload.' }, 400);
  if (!allowedMime.has(file.type)) return json({ ok: false, error: 'Unsupported file type.' }, 400);
  if (file.size <= 0 || file.size > 10 * 1024 * 1024) return json({ ok: false, error: 'File must be between 1 byte and 10 MB.' }, 400);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
    }
    const base64 = btoa(binary);
    const drive = await callDriveBridge({
      action: 'trainerDocumentUpload',
      trainerId: user.id,
      trainerName: profile.full_name,
      documentType,
      fileName: file.name,
      mimeType: file.type,
      base64
    });

    await saveDriveFolderMap(user.id, drive);

    const { data: document, error: insertError } = await db.from('trainer_documents').insert({
      trainer_id: user.id,
      programme_id: null,
      document_type: documentType,
      provider: 'GOOGLE_DRIVE',
      file_name: drive.fileName || file.name,
      file_id: drive.fileId,
      file_url: drive.fileUrl || null,
      verification_status: 'PENDING',
      updated_at: new Date().toISOString()
    }).select('id,programme_id,document_type,file_name,file_id,file_url,verification_status,created_at').single();
    if (insertError) throw insertError;

    return json({ ok: true, document });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
