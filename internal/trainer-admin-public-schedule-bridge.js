(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const APPS_SCRIPT_URL = cfg.publicTrainingAppsScriptUrl ||
    'https://script.google.com/a/macros/easylatih.my/s/AKfycbw1PRE_G3xUUc9WEAOX6m2bAAJ4yvtY3ghMihC4dxGVfsT6JwPjIyJl_VhPdihGA3c/exec';
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  let currentProgramme = null;
  let timer = null;

  function programmeIdFromCard(card) {
    const el = card.querySelector('[data-unpublish],[data-publish],[data-etris-approved],[data-approve-etris],[data-amend],[data-admin-edit-programme]');
    if (!el) return '';
    return el.dataset.unpublish || el.dataset.publish || el.dataset.etrisApproved || el.dataset.approveEtris || el.dataset.amend || el.dataset.adminEditProgramme || '';
  }

  function isPublishedCard(card) {
    if (card.querySelector('[data-unpublish]')) return true;
    return [...card.querySelectorAll('.badge')].some(b => String(b.textContent || '').trim().toUpperCase() === 'PUBLISHED');
  }

  function ensureDialog() {
    if (document.getElementById('publicScheduleBridgeDialog')) return;
    const style = document.createElement('style');
    style.textContent = `
      #publicScheduleBridgeDialog{width:min(760px,94vw);max-height:90vh;border:0;border-radius:16px;padding:0;box-shadow:0 24px 70px rgba(15,23,42,.28)}
      #publicScheduleBridgeDialog::backdrop{background:rgba(15,23,42,.55)}
      .schedule-bridge-wrap{padding:1.15rem;background:#fff}.schedule-bridge-summary{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:.85rem;margin:.8rem 0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem 1rem;font-size:.83rem}
      .schedule-bridge-summary strong{display:block;color:#334155;font-size:.72rem;text-transform:uppercase;letter-spacing:.03em}.schedule-bridge-actions{display:flex;justify-content:flex-end;gap:.6rem;flex-wrap:wrap;margin-top:1rem}
      @media(max-width:640px){.schedule-bridge-summary{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);

    const dialog = document.createElement('dialog');
    dialog.id = 'publicScheduleBridgeDialog';
    dialog.innerHTML = `
      <div class="schedule-bridge-wrap">
        <div class="panel-header"><div><h2>Schedule via Google Apps Script</h2><div class="muted">Trainer Portal supplies the approved programme details. Google Apps Script remains the master system for the actual public session, registration, attendance and post-training operations.</div></div><button type="button" class="btn btn-soft" data-close-bridge>Close</button></div>
        <div id="publicScheduleBridgeMessage" class="hidden"></div>
        <div id="publicScheduleBridgeSummary" class="schedule-bridge-summary"></div>
        <div class="form-grid">
          <div class="field full"><label>Trainer Profile PDF / Google Drive Link</label><input id="bridgeTrainerProfileUrl" type="url" placeholder="https://drive.google.com/..."><span class="help">Saved against the trainer for reuse the next time you schedule a programme with the same trainer.</span></div>
          <div class="field full"><label>Final Course Content Link</label><input id="bridgeCourseContentUrl" type="url" placeholder="https://docs.google.com/... or PDF link"><span class="help">Prefilled from the latest Course Outline where available. You may replace it with the final client/public PDF link.</span></div>
        </div>
        <div class="alert alert-info" style="margin-top:.9rem"><strong>Bridge behaviour:</strong> the programme details are passed to Apps Script through URL parameters and also copied to your clipboard as a fallback. In Apps Script you only complete session-specific details such as date, venue, fee, capacity and registration deadline.</div>
        <div class="schedule-bridge-actions">
          <button type="button" class="btn btn-outline" id="copyScheduleBridge">Copy Details</button>
          <button type="button" class="btn btn-primary" id="openScheduleBridge">Open Apps Script</button>
        </div>
      </div>`;
    document.body.appendChild(dialog);
    dialog.querySelectorAll('[data-close-bridge]').forEach(btn => btn.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    document.getElementById('copyScheduleBridge').addEventListener('click', copyBridgeDetails);
    document.getElementById('openScheduleBridge').addEventListener('click', openAppsScript);
  }

  function setMessage(text, type='info') {
    const el = document.getElementById('publicScheduleBridgeMessage');
    if (!el) return;
    if (!text) { el.className='hidden'; el.textContent=''; return; }
    el.className=`alert alert-${type}`;
    el.textContent=text;
  }

  function trainerRecord() {
    const p = currentProgramme?.profiles;
    return Array.isArray(p) ? (p[0] || {}) : (p || {});
  }

  function bridgePayload() {
    const trainer = trainerRecord();
    return {
      source: 'trainer-portal',
      bridge: 'public-training-schedule',
      programmeId: currentProgramme?.id || '',
      courseId: currentProgramme?.id || '',
      programName: currentProgramme?.title || '',
      courseTitle: currentProgramme?.title || '',
      category: currentProgramme?.category || '',
      duration: currentProgramme?.duration || '',
      trainingType: currentProgramme?.training_type || '',
      trainerId: currentProgramme?.trainer_id || '',
      trainerName: trainer.full_name || '',
      trainerProfileUrl: String(document.getElementById('bridgeTrainerProfileUrl')?.value || '').trim(),
      courseContentUrl: String(document.getElementById('bridgeCourseContentUrl')?.value || '').trim()
    };
  }

  function summaryText() {
    const p = bridgePayload();
    return [
      'EasyLatih Public Training Schedule Bridge',
      `Programme ID: ${p.programmeId}`,
      `Programme: ${p.programName}`,
      `Category: ${p.category || '-'}`,
      `Duration: ${p.duration || '-'}`,
      `Training Type: ${p.trainingType || '-'}`,
      `Assigned Trainer: ${p.trainerName || '-'}`,
      `Trainer Profile: ${p.trainerProfileUrl || '-'}`,
      `Final Course Content: ${p.courseContentUrl || '-'}`
    ].join('\n');
  }

  async function copyText(text) {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    const ta=document.createElement('textarea');
    ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }

  async function copyBridgeDetails() {
    if (!currentProgramme) return;
    try {
      await copyText(summaryText());
      setMessage('Programme details copied. You can paste them into Apps Script if any field is not prefilled automatically.','success');
    } catch (_) {
      setMessage('Unable to copy automatically. You can still open Apps Script and transfer the displayed details manually.','warning');
    }
  }

  async function saveTrainerProfileLink() {
    const url=String(document.getElementById('bridgeTrainerProfileUrl')?.value || '').trim() || null;
    if (!currentProgramme?.trainer_id) return;
    const trainer=trainerRecord();
    if ((trainer.public_trainer_profile_url || null) === url) return;
    const {error}=await client.from('profiles').update({public_trainer_profile_url:url}).eq('id',currentProgramme.trainer_id);
    if(error) throw error;
    trainer.public_trainer_profile_url=url;
  }

  async function openAppsScript() {
    if (!currentProgramme) return;
    const btn=document.getElementById('openScheduleBridge');
    btn.disabled=true;
    setMessage('Preparing Apps Script bridge…','info');
    try {
      await saveTrainerProfileLink();
      try { await copyText(summaryText()); } catch (_) {}
      const url=new URL(APPS_SCRIPT_URL);
      Object.entries(bridgePayload()).forEach(([key,value]) => {
        if (value !== '') url.searchParams.set(key,value);
      });
      const opened=window.open(url.toString(),'_blank','noopener,noreferrer');
      if (!opened) throw new Error('Popup was blocked. Please allow popups for this beta page and try again.');
      setMessage('Apps Script opened. Programme details were also copied to your clipboard as a fallback.','success');
    } catch (error) {
      setMessage(error.message || 'Unable to open Apps Script bridge.','danger');
    } finally {
      btn.disabled=false;
    }
  }

  async function openBridge(programmeId) {
    ensureDialog();
    currentProgramme=null;
    setMessage('Loading approved programme…','info');
    const dialog=document.getElementById('publicScheduleBridgeDialog');
    dialog.showModal();
    try {
      const {data,error}=await client.from('programmes')
        .select('id,trainer_id,title,category,duration,training_type,publish_status,etris_status,course_outline_doc_url,profiles(full_name,email,public_trainer_profile_url)')
        .eq('id',programmeId)
        .single();
      if(error) throw error;
      if(data.publish_status!=='PUBLISHED') throw new Error('Only published programmes can be bridged to Public Scheduled Training.');
      currentProgramme=data;
      const trainer=trainerRecord();
      document.getElementById('publicScheduleBridgeSummary').innerHTML=`
        <div><strong>Programme</strong>${esc(data.title)}</div>
        <div><strong>Programme ID</strong>${esc(data.id)}</div>
        <div><strong>Category</strong>${esc(data.category || '-')}</div>
        <div><strong>Duration</strong>${esc(data.duration || '-')}</div>
        <div><strong>Original / Assigned Trainer</strong>${esc(trainer.full_name || trainer.email || '-')}</div>
        <div><strong>eTRiS</strong>${esc(data.etris_status || '-')}</div>`;
      document.getElementById('bridgeTrainerProfileUrl').value=trainer.public_trainer_profile_url || '';
      document.getElementById('bridgeCourseContentUrl').value=data.course_outline_doc_url || '';
      setMessage('Ready. Review the two links, then open Apps Script.','success');
    } catch (error) {
      document.getElementById('publicScheduleBridgeSummary').innerHTML='';
      setMessage(error.message || 'Unable to load programme details.','danger');
    }
  }

  function injectButtons() {
    const holder=document.getElementById('adminProgrammeList');
    if(!holder) return;
    holder.querySelectorAll('.list-card').forEach(card=>{
      if(!isPublishedCard(card) || card.querySelector('[data-public-schedule-bridge]')) return;
      const programmeId=programmeIdFromCard(card);
      if(!programmeId) return;
      const rows=card.querySelectorAll('.btn-row');
      const row=rows.length ? rows[rows.length-1] : null;
      if(!row) return;
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='btn btn-primary';
      btn.dataset.publicScheduleBridge=programmeId;
      btn.textContent='Schedule via Apps Script';
      btn.addEventListener('click',()=>openBridge(programmeId));
      row.prepend(btn);
    });
  }

  function scheduleInject(){clearTimeout(timer);timer=setTimeout(injectButtons,120);}

  document.addEventListener('DOMContentLoaded', async () => {
    const {data}=await client.auth.getUser();
    if(data?.user?.app_metadata?.role!=='admin') return;
    ensureDialog();
    injectButtons();
    const holder=document.getElementById('adminProgrammeList');
    if(holder)new MutationObserver(scheduleInject).observe(holder,{childList:true,subtree:true});
  });
})();
