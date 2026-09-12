(() => {
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) return;

  const client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const splitLines = value => String(value || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const errorMessage = e => e instanceof Error ? e.message : (e && typeof e === 'object' ? String(e.message || e.details || e.hint || JSON.stringify(e)) : String(e || 'Unexpected error.'));
  let currentProgramme = null;
  let observerTimer = null;

  const categories = [
    'Human Resource','Finance & Accounting','Leadership','Sales & Marketing','Digital & AI',
    'Customer Service','Quality & Productivity','Safety & Technical','Administration',
    'Communication','Entrepreneurship','Other'
  ];

  function programmeIdFromCard(card) {
    const el = card.querySelector('[data-approve-etris],[data-amend],[data-etris-approved],[data-publish],[data-unpublish]');
    if (!el) return '';
    return el.dataset.approveEtris || el.dataset.amend || el.dataset.etrisApproved || el.dataset.publish || el.dataset.unpublish || '';
  }

  function ensureDialog() {
    if (document.getElementById('adminProgrammeEditDialog')) return;
    const style = document.createElement('style');
    style.textContent = `
      #adminProgrammeEditDialog{width:min(920px,94vw);max-height:90vh;border:0;border-radius:16px;padding:0;box-shadow:0 24px 70px rgba(15,23,42,.25)}
      #adminProgrammeEditDialog::backdrop{background:rgba(15,23,42,.55)}
      .admin-programme-editor{padding:1.2rem;background:#fff}.admin-programme-editor h2{margin:.1rem 0}.admin-editor-actions{display:flex;gap:.65rem;justify-content:flex-end;flex-wrap:wrap;margin-top:1rem}
      .admin-editor-warning{margin:.8rem 0}.admin-programme-editor textarea{min-height:105px}.admin-programme-editor .compact textarea{min-height:80px}
    `;
    document.head.appendChild(style);

    const dialog = document.createElement('dialog');
    dialog.id = 'adminProgrammeEditDialog';
    dialog.innerHTML = `
      <form id="adminProgrammeEditForm" class="admin-programme-editor" method="dialog">
        <div class="panel-header"><div><h2>Edit Programme Data</h2><div class="muted">EasyLatih may correct trainer-submitted data directly. Every saved difference is versioned and shown to the trainer.</div></div><button type="button" class="btn btn-soft" data-close-editor>Close</button></div>
        <div id="adminProgrammeEditWarning" class="alert alert-warning hidden admin-editor-warning"></div>
        <div id="adminProgrammeEditMessage" class="hidden"></div>
        <div class="form-grid">
          <div class="field full"><label>Programme Title</label><input name="title" required maxlength="180"></div>
          <div class="field"><label>Category</label><select name="category" required>${categories.map(x=>`<option>${esc(x)}</option>`).join('')}</select></div>
          <div class="field"><label>Training Type</label><select name="training_type" required><option value="BOTH">Public & In-House</option><option value="PUBLIC">Public Training</option><option value="INHOUSE">In-House Training</option></select></div>
          <div class="field full"><label>Programme Overview</label><textarea name="programme_overview"></textarea></div>
          <div class="field full compact"><label>Learning Objectives</label><textarea name="learning_objectives" placeholder="One objective per line"></textarea></div>
          <div class="field full compact"><label>Learning Outcomes</label><textarea name="learning_outcomes" placeholder="One outcome per line"></textarea></div>
          <div class="field full"><label>Target Participants</label><input name="target_participants" maxlength="350"></div>
          <div class="field full"><label>Prerequisites</label><textarea name="prerequisites"></textarea></div>
          <div class="field"><label>Duration</label><input name="duration" maxlength="80"></div>
          <div class="field"><label>Delivery Method</label><select name="delivery_method"><option value="Physical">Physical</option><option value="Online">Online</option><option value="Both">Both</option><option value="">Not specified</option></select></div>
          <div class="field full"><label>Training Methodology</label><textarea name="training_methodology"></textarea></div>
          <div class="field full compact"><label>Modules / Topics</label><textarea name="modules" placeholder="One module/topic per line"></textarea><span class="help">Existing structured module data is preserved by position where possible.</span></div>
          <div class="field full"><label>Assessment Method</label><textarea name="assessment_method"></textarea></div>
          <div class="field"><label>Maximum Participants</label><input name="maximum_participants" type="number" min="1"></div>
          <div class="field full"><label>Venue / Equipment Requirements</label><textarea name="venue_requirements"></textarea></div>
          <div class="field full"><label>Admin Note to Trainer <span class="muted">(optional)</span></label><textarea name="admin_note" maxlength="1000" placeholder="Example: EasyLatih standardised the title and learning outcomes for market positioning."></textarea><span class="help">The trainer will automatically see the exact before/after fields even if this note is left blank.</span></div>
        </div>
        <div class="alert alert-info" style="margin-top:1rem"><strong>Important:</strong> This updates the portal/database and website catalogue. If the change affects the linked Google Docs Course Outline, update that Google Doc separately as well.</div>
        <div class="admin-editor-actions"><button type="button" class="btn btn-outline" data-close-editor>Cancel</button><button id="adminProgrammeSaveButton" type="submit" class="btn btn-primary">Save EasyLatih Version</button></div>
      </form>`;
    document.body.appendChild(dialog);

    dialog.querySelectorAll('[data-close-editor]').forEach(btn => btn.addEventListener('click', () => dialog.close()));
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    dialog.querySelector('#adminProgrammeEditForm').addEventListener('submit', saveProgramme);
  }

  function setMessage(text, type='info') {
    const el = document.getElementById('adminProgrammeEditMessage');
    if (!el) return;
    if (!text) { el.className='hidden'; el.textContent=''; return; }
    el.className = `alert alert-${type}`;
    el.textContent = text;
  }

  async function openEditor(programmeId) {
    ensureDialog();
    setMessage('Loading programme…','info');
    const dialog = document.getElementById('adminProgrammeEditDialog');
    dialog.showModal();
    try {
      const {data,error} = await client.from('programmes').select('*').eq('id',programmeId).single();
      if (error) throw error;
      currentProgramme = data;
      const form = document.getElementById('adminProgrammeEditForm');
      form.elements.title.value = data.title || '';
      form.elements.category.value = data.category || 'Other';
      form.elements.training_type.value = data.training_type || 'BOTH';
      form.elements.programme_overview.value = data.programme_overview || '';
      form.elements.learning_objectives.value = (data.learning_objectives || []).join('\n');
      form.elements.learning_outcomes.value = (data.learning_outcomes || []).join('\n');
      form.elements.target_participants.value = data.target_participants || '';
      form.elements.prerequisites.value = data.prerequisites || '';
      form.elements.duration.value = data.duration || '';
      form.elements.delivery_method.value = data.delivery_method || '';
      form.elements.training_methodology.value = data.training_methodology || '';
      form.elements.modules.value = (Array.isArray(data.modules) ? data.modules : []).map(m => typeof m === 'string' ? m : (m?.title || m?.name || '')).filter(Boolean).join('\n');
      form.elements.assessment_method.value = data.assessment_method || '';
      form.elements.maximum_participants.value = data.maximum_participants || '';
      form.elements.venue_requirements.value = data.venue_requirements || '';
      form.elements.admin_note.value = '';
      const warning = document.getElementById('adminProgrammeEditWarning');
      const sensitiveStage = data.etris_status === 'APPROVED' || data.publish_status === 'PUBLISHED';
      if (sensitiveStage) {
        warning.className = 'alert alert-warning admin-editor-warning';
        warning.textContent = 'This programme is already eTRiS-approved and/or published. You may still correct it, but make sure any material change is also reflected in eTRiS and the linked Course Outline.';
      } else {
        warning.className = 'hidden';
        warning.textContent = '';
      }
      setMessage('', 'info');
    } catch (e) {
      setMessage(errorMessage(e),'danger');
    }
  }

  async function saveProgramme(e) {
    e.preventDefault();
    if (!currentProgramme) return;
    const form = e.currentTarget;
    const button = document.getElementById('adminProgrammeSaveButton');
    const moduleTitles = splitLines(form.elements.modules.value);
    const existingModules = Array.isArray(currentProgramme.modules) ? currentProgramme.modules : [];
    const modules = moduleTitles.map((title,index) => {
      const base = existingModules[index] && typeof existingModules[index] === 'object' && !Array.isArray(existingModules[index]) ? {...existingModules[index]} : {};
      return {...base, module:index+1, title};
    });
    const changes = {
      title:String(form.elements.title.value || '').trim(),
      category:String(form.elements.category.value || '').trim(),
      training_type:String(form.elements.training_type.value || '').trim(),
      programme_overview:String(form.elements.programme_overview.value || '').trim() || null,
      learning_objectives:splitLines(form.elements.learning_objectives.value),
      learning_outcomes:splitLines(form.elements.learning_outcomes.value),
      target_participants:String(form.elements.target_participants.value || '').trim() || null,
      prerequisites:String(form.elements.prerequisites.value || '').trim() || null,
      duration:String(form.elements.duration.value || '').trim() || null,
      delivery_method:String(form.elements.delivery_method.value || '').trim() || null,
      training_methodology:String(form.elements.training_methodology.value || '').trim() || null,
      modules,
      assessment_method:String(form.elements.assessment_method.value || '').trim() || null,
      maximum_participants:form.elements.maximum_participants.value ? Number(form.elements.maximum_participants.value) : null,
      venue_requirements:String(form.elements.venue_requirements.value || '').trim() || null
    };
    const note = String(form.elements.admin_note.value || '').trim() || null;

    if (!confirm('Save these corrections as the latest EasyLatih programme version? The trainer will be notified of the exact differences.')) return;
    button.disabled = true;
    setMessage('Saving EasyLatih version…','info');
    try {
      const {data,error} = await client.rpc('admin_edit_programme', {
        p_programme_id: currentProgramme.id,
        p_changes: changes,
        p_note: note
      });
      if (error) throw error;
      if (!data?.changed) {
        setMessage('No differences detected. Nothing was changed.','info');
        return;
      }
      setMessage(`Saved as Version ${data.to_version}. Trainer notification and before/after audit created.`, 'success');
      setTimeout(() => location.reload(), 900);
    } catch (err) {
      setMessage(errorMessage(err),'danger');
    } finally {
      button.disabled = false;
    }
  }

  function injectButtons() {
    const holder = document.getElementById('adminProgrammeList');
    if (!holder) return;
    holder.querySelectorAll('.list-card').forEach(card => {
      if (card.querySelector('[data-admin-edit-programme]')) return;
      const programmeId = programmeIdFromCard(card);
      if (!programmeId) return;
      const rows = card.querySelectorAll('.btn-row');
      const row = rows.length ? rows[rows.length - 1] : null;
      if (!row) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-soft';
      btn.dataset.adminEditProgramme = programmeId;
      btn.textContent = 'Edit Programme Data';
      btn.addEventListener('click', () => openEditor(programmeId));
      row.prepend(btn);
    });
  }

  function scheduleInject() {
    clearTimeout(observerTimer);
    observerTimer = setTimeout(injectButtons, 100);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const {data} = await client.auth.getUser();
    if (data?.user?.app_metadata?.role !== 'admin') return;
    ensureDialog();
    injectButtons();
    const holder = document.getElementById('adminProgrammeList');
    if (holder) new MutationObserver(scheduleInject).observe(holder,{childList:true,subtree:true});
  });
})();
