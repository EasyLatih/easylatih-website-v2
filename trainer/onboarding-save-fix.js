(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const $ = id => document.getElementById(id);
  let saving = false;

  function showMessage(text, type='info') {
    const el = $('onboardingMessage');
    if (!el) return;
    el.className = `alert alert-${type}`;
    el.textContent = text;
    requestAnimationFrame(() => el.scrollIntoView({behavior:'smooth', block:'center'}));
  }

  function errorText(err) {
    if (err instanceof Error) return err.message;
    if (err && typeof err === 'object') return String(err.message || err.details || err.hint || JSON.stringify(err));
    return String(err || 'Unable to save trainer onboarding.');
  }

  function formatIdentityNo(value) {
    const raw = String(value || '').trim();
    if (/[A-Za-z]/.test(raw)) return raw.toUpperCase().replace(/\s+/g,'');
    const digits = raw.replace(/\D/g,'').slice(0,12);
    if (digits.length <= 6) return digits;
    if (digits.length <= 8) return `${digits.slice(0,6)}-${digits.slice(6)}`;
    return `${digits.slice(0,6)}-${digits.slice(6,8)}-${digits.slice(8)}`;
  }

  function collectRows(containerId, fields) {
    const holder = $(containerId);
    if (!holder) return [];
    return [...holder.querySelectorAll('[data-repeat-row]')].map(row => {
      const item = {};
      fields.forEach(field => item[field] = String(row.querySelector(`[data-field="${field}"]`)?.value || '').trim());
      return item;
    }).filter(item => Object.values(item).some(Boolean));
  }

  function requireCompleteRows(rows, fields, label) {
    if (!rows.length) throw new Error(`Please add at least one ${label}.`);
    if (rows.some(row => fields.some(field => !row[field]))) throw new Error(`Please complete all fields for each ${label}.`);
  }

  function validateTttStatus(value) {
    const status = String(value || '').trim();
    if (!status) throw new Error('Please answer Yes or No for HRD Corp TTT / TTT Exemption.');

    if (/^HRD Corp TTT Eligibility:\s*No$/i.test(status) || /^HRD Corp TTT:\s*No$/i.test(status)) return status;

    const current = status.match(/^HRD Corp TTT Eligibility:\s*Yes\s*\|\s*Type:\s*(HRD Corp TTT|HRD Corp TTT Exempted)\s*\|\s*Accreditation:\s*(Accredited|Pre-Accredited|Non-Accredited)\s*\|\s*Reference No:\s*(.+)$/i);
    if (current) return status;

    // Backward compatibility for records saved with the earlier onboarding format.
    if (/^HRD Corp TTT:\s*Yes\s*\|\s*Accreditation:\s*(Accredited|Pre-Accredited|Non-Accredited)\s*\|\s*TTT Certificate No:\s*.+$/i.test(status)) return status;

    throw new Error('Please complete your HRD Corp TTT / Exemption type, trainer status and certificate/reference number.');
  }

  async function uploadPhoto(userId, file) {
    const allowed = ['image/jpeg','image/png','image/webp'];
    if (!allowed.includes(file.type)) throw new Error('Profile photo must be JPG, PNG or WebP.');
    if (file.size > 3 * 1024 * 1024) throw new Error('Profile photo must be 3 MB or smaller.');
    const ext = String(file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${userId}/profile-${Date.now()}.${ext}`;
    const {error} = await client.storage.from('trainer-profile-photos').upload(path, file, {cacheControl:'3600', upsert:false, contentType:file.type});
    if (error) throw error;
    const {data} = client.storage.from('trainer-profile-photos').getPublicUrl(path);
    return {url:data.publicUrl, path};
  }

  async function save(form) {
    if (saving) return;
    saving = true;
    const button = form.querySelector('button[type="submit"]');
    const oldLabel = button?.textContent || 'Save Trainer Onboarding';
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    showMessage('Checking your onboarding details…','info');

    let uploadedNewPath = null;
    try {
      const {data:userData,error:userError} = await client.auth.getUser();
      if (userError) throw userError;
      const user = userData?.user;
      if (!user) throw new Error('Your login session has expired. Please log in again.');

      const [{data:profile,error:profileError},{data:onboarding,error:onboardingError}] = await Promise.all([
        client.from('profiles').select('*').eq('id',user.id).single(),
        client.from('trainer_onboarding').select('*').eq('trainer_id',user.id).maybeSingle()
      ]);
      if (profileError) throw profileError;
      if (onboardingError) throw onboardingError;
      if (!['ONBOARDING','ACTIVE'].includes(profile.collaboration_status)) {
        throw new Error('Please accept the Trainer Collaboration Terms before completing onboarding.');
      }

      if (!$('photoConsent')?.checked) throw new Error('Please tick the photo and marketing consent checkbox.');

      const fullName = String($('etris_full_name')?.value || '').trim();
      const identityNo = formatIdentityNo($('etris_identity_no')?.value || '');
      const race = String($('etris_race')?.value || '').trim();
      const mobile = String($('etris_mobile')?.value || '').trim();
      const email = String($('etris_email')?.value || profile.email || user.email || '').trim();
      if (!fullName || !identityNo || !race || !mobile || !email) throw new Error('Please complete all Personal Details required for eTRiS.');
      if (!/[A-Za-z]/.test(identityNo) && !/^\d{6}-\d{2}-\d{4}$/.test(identityNo)) throw new Error('Malaysian IC number must contain 12 digits.');

      const academic = collectRows('academicQualificationRows',['qualification','year_awarded','institution']);
      const certifications = collectRows('professionalCertificationRows',['certification','certification_body','year_awarded']);
      const career = collectRows('careerExperienceRows',['year_from','year_to','position','company_organization']);
      const training = collectRows('trainingExperienceRows',['year_from','year_to','training_program_conducted']);
      requireCompleteRows(academic,['qualification','year_awarded','institution'],'academic qualification');
      if (certifications.some(row => ['certification','certification_body','year_awarded'].some(field => !row[field]))) throw new Error('Please complete all fields for each professional certification, or remove the incomplete entry.');
      requireCompleteRows(career,['year_from','year_to','position','company_organization'],'career experience');
      requireCompleteRows(training,['year_from','year_to','training_program_conducted'],'training experience');

      const tttStatus = validateTttStatus($('onboarding_ttt')?.value);
      const now = new Date().toISOString();

      let photoUrl = onboarding?.profile_photo_url || null;
      let photoPath = onboarding?.profile_photo_storage_path || null;
      const oldPhotoPath = photoPath;
      const photoFile = $('profilePhoto')?.files?.[0] || null;
      if (photoFile) {
        showMessage('Uploading trainer photo…','info');
        const uploaded = await uploadPhoto(user.id, photoFile);
        photoUrl = uploaded.url;
        photoPath = uploaded.path;
        uploadedNewPath = uploaded.path;
      }
      if (!photoUrl) throw new Error('Please upload a professional trainer profile photo.');

      showMessage('Saving eTRiS trainer profile…','info');
      const profileUpdate = await client.from('profiles').update({full_name:fullName, phone:mobile, updated_at:now}).eq('id',user.id);
      if (profileUpdate.error) throw profileUpdate.error;

      const etrisSave = await client.from('trainer_etris_profiles').upsert({
        trainer_id:user.id,
        identity_no:identityNo,
        race,
        academic_qualifications:academic,
        professional_certifications:certifications,
        career_experience:career,
        training_experience:training,
        updated_at:now
      },{onConflict:'trainer_id'});
      if (etrisSave.error) throw etrisSave.error;

      const consentAt = onboarding?.photo_consent_at || now;
      const onboardingSave = await client.from('trainer_onboarding').upsert({
        trainer_id:user.id,
        academic_qualification:academic.map(x => `${x.qualification} (${x.year_awarded}) - ${x.institution}`).join('\n'),
        professional_certifications:certifications.map(x => `${x.certification} - ${x.certification_body} (${x.year_awarded})`).join('\n'),
        working_experience:career.map(x => `${x.year_from}-${x.year_to}: ${x.position}, ${x.company_organization}`).join('\n'),
        training_experience:training.map(x => `${x.year_from}-${x.year_to}: ${x.training_program_conducted}`).join('\n'),
        industry_experience:onboarding?.industry_experience || '',
        ttt_status:tttStatus,
        profile_photo_url:photoUrl,
        profile_photo_storage_path:photoPath,
        photo_consent_version:cfg.collaborationTermsVersion,
        photo_consent_at:consentAt,
        onboarding_completed_at:onboarding?.onboarding_completed_at || now,
        updated_at:now
      },{onConflict:'trainer_id'});
      if (onboardingSave.error) throw onboardingSave.error;

      if (!onboarding?.photo_consent_at) {
        const {data:existingAgreement,error:agreementReadError} = await client.from('trainer_agreements')
          .select('id').eq('trainer_id',user.id).eq('agreement_type','PHOTO_MARKETING_CONSENT').eq('version',cfg.collaborationTermsVersion).maybeSingle();
        if (agreementReadError) throw agreementReadError;
        if (!existingAgreement) {
          const agreement = await client.from('trainer_agreements').insert({trainer_id:user.id,agreement_type:'PHOTO_MARKETING_CONSENT',version:cfg.collaborationTermsVersion,accepted_at:consentAt});
          if (agreement.error) throw agreement.error;
        }
      }

      if (photoFile && oldPhotoPath && oldPhotoPath !== photoPath) {
        await client.storage.from('trainer-profile-photos').remove([oldPhotoPath]);
      }

      showMessage('Trainer onboarding saved successfully. Your journey status is being refreshed…','success');
      if (button) button.textContent = 'Saved ✓';
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      if (uploadedNewPath) await client.storage.from('trainer-profile-photos').remove([uploadedNewPath]).catch(()=>{});
      showMessage(errorText(err),'danger');
      if (button) { button.disabled = false; button.textContent = oldLabel; }
    } finally {
      saving = false;
    }
  }

  function attach() {
    const form = $('onboardingForm');
    if (!form || form.dataset.reliableSave === '1') return;
    form.dataset.reliableSave = '1';
    form.noValidate = true;
    form.addEventListener('submit', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      save(form);
    }, true);
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(attach, 100);
    setTimeout(attach, 500);
  });
})();