(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  const BUCKET='trainer-supporting-documents';
  const TYPES={
    TTT_CERTIFICATE:{label:'HRD Corp TTT Certificate',required:true,multiple:false},
    ACCREDITED_TRAINER_CERTIFICATE:{label:'HRD Corp Accredited Trainer Certificate',required:false,multiple:false},
    RESUME_CV:{label:'Full Resume / CV',required:true,multiple:false},
    OTHER_RELEVANT_CERTIFICATE:{label:'Other Relevant Certificates',required:false,multiple:true}
  };
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  let user=null;
  let docs=[];

  function normaliseRace(value){
    const v=String(value||'').trim().toLowerCase();
    const map={malay:'Malay',melayu:'Malay',chinese:'Chinese',cina:'Chinese',indian:'Indian',india:'Indian',dayak:'Dayak','other race':'Other Race',other:'Other Race',others:'Other Race'};
    return map[v]||'';
  }

  function ensureRaceDropdown(){
    const current=$('etris_race');
    if(!current||current.tagName==='SELECT')return;
    const value=normaliseRace(current.value);
    const select=document.createElement('select');
    select.id='etris_race';
    select.required=true;
    select.innerHTML='<option value="">Select race</option><option value="Malay">Malay</option><option value="Chinese">Chinese</option><option value="Indian">Indian</option><option value="Dayak">Dayak</option><option value="Other Race">Other Race</option>';
    select.value=value;
    current.replaceWith(select);
  }

  function statusBadge(status){
    const s=String(status||'PENDING').toUpperCase();
    const cls=s==='VERIFIED'?'green':s==='REJECTED'||s==='EXPIRED'?'red':'amber';
    return `<span class="badge ${cls}">${esc(s.replaceAll('_',' '))}</span>`;
  }

  function buildSection(){
    const onboardingForm=$('onboardingForm');
    if(!onboardingForm||$('supportingDocumentsCard'))return;
    const card=document.createElement('div');
    card.id='supportingDocumentsCard';
    card.className='form-card';
    card.style.marginTop='1rem';
    card.innerHTML=`
      <h3>3. Supporting Documents</h3>
      <p class="muted">Upload documents required for EasyLatih verification and eTRiS preparation. Files are private and are not published on the trainer catalogue.</p>
      <div id="supportingDocumentsMessage" class="hidden"></div>
      <div class="form-grid">
        ${Object.entries(TYPES).map(([type,cfg])=>`
          <div class="field full" data-doc-type="${type}">
            <label>${cfg.label}${cfg.required?' <span class="muted">(required)</span>':' <span class="muted">(optional)</span>'}</label>
            <input type="file" data-doc-input="${type}" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" ${cfg.multiple?'multiple':''}>
            <span class="help">PDF, DOC, DOCX, JPG or PNG. Maximum 10 MB per file.${cfg.multiple?' You may select more than one file.':''}</span>
            <div id="docList_${type}" class="list" style="margin-top:.6rem"><div class="empty">No document uploaded yet.</div></div>
          </div>`).join('')}
      </div>`;
    onboardingForm.insertAdjacentElement('afterend',card);

    const onboardingPanel=onboardingForm.closest('[data-section="onboarding"]');
    if(onboardingPanel){
      [...onboardingPanel.querySelectorAll('h3')].forEach(h=>{
        if(h.textContent.trim().startsWith('3. Full Programme Details')) h.textContent='4. Full Programme Details';
      });
    }

    card.querySelectorAll('[data-doc-input]').forEach(input=>input.addEventListener('change',async e=>{
      const type=e.target.dataset.docInput;
      const files=[...(e.target.files||[])];
      if(!files.length)return;
      await uploadFiles(type,files);
      e.target.value='';
    }));
  }

  function setMessage(text,type='info'){
    const el=$('supportingDocumentsMessage');
    if(!el)return;
    el.className=text?`alert alert-${type}`:'hidden';
    el.textContent=text||'';
  }

  function safeFileName(name){
    return String(name||'document').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/-+/g,'-').slice(-140);
  }

  async function uploadFiles(type,files){
    if(!user)return;
    const allowed=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png'];
    try{
      setMessage('Uploading supporting document…','info');
      for(const file of files){
        if(!allowed.includes(file.type)) throw new Error(`${file.name}: unsupported file type.`);
        if(file.size>10*1024*1024) throw new Error(`${file.name}: file must be 10 MB or smaller.`);
        const path=`${user.id}/${type.toLowerCase()}/${Date.now()}-${safeFileName(file.name)}`;
        const upload=await client.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
        if(upload.error)throw upload.error;
        const insert=await client.from('trainer_documents').insert({
          trainer_id:user.id,
          document_type:type,
          provider:'SUPABASE_STORAGE',
          file_name:file.name,
          file_id:path,
          file_url:null,
          verification_status:'PENDING',
          updated_at:new Date().toISOString()
        });
        if(insert.error){
          await client.storage.from(BUCKET).remove([path]);
          throw insert.error;
        }
      }
      setMessage('Document uploaded successfully and sent for EasyLatih verification.','success');
      await loadDocuments();
    }catch(err){
      setMessage(err.message||'Unable to upload document.','danger');
    }
  }

  async function viewDocument(id){
    const doc=docs.find(x=>x.id===id);
    if(!doc?.file_id)return;
    const signed=await client.storage.from(BUCKET).createSignedUrl(doc.file_id,120);
    if(signed.error)return setMessage(signed.error.message||'Unable to open document.','danger');
    window.open(signed.data.signedUrl,'_blank','noopener');
  }

  function renderDocuments(){
    for(const [type,cfg] of Object.entries(TYPES)){
      const holder=$(`docList_${type}`);
      if(!holder)continue;
      let rows=docs.filter(d=>d.document_type===type).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      if(!cfg.multiple && rows.length>1) rows=rows.slice(0,1);
      holder.innerHTML=rows.length?rows.map(d=>`
        <div class="list-card">
          <div class="list-card-top">
            <div><strong>${esc(d.file_name)}</strong><div class="muted">Uploaded ${new Date(d.created_at).toLocaleDateString('en-MY')}</div></div>
            ${statusBadge(d.verification_status)}
          </div>
          <div class="btn-row"><button type="button" class="btn btn-soft" data-view-doc="${d.id}">View Document</button></div>
        </div>`).join(''):`<div class="empty">No ${esc(cfg.label.toLowerCase())} uploaded yet.</div>`;
      holder.querySelectorAll('[data-view-doc]').forEach(btn=>btn.addEventListener('click',()=>viewDocument(btn.dataset.viewDoc)));
    }
  }

  async function loadDocuments(){
    if(!user)return;
    const result=await client.from('trainer_documents').select('id,document_type,file_name,file_id,verification_status,created_at,updated_at').eq('trainer_id',user.id).order('created_at',{ascending:false});
    if(result.error)return setMessage(result.error.message||'Unable to load supporting documents.','danger');
    docs=result.data||[];
    renderDocuments();
  }

  async function init(){
    const auth=await client.auth.getUser();
    user=auth.data?.user||null;
    if(!user)return;
    ensureRaceDropdown();
    buildSection();
    await loadDocuments();
    setTimeout(ensureRaceDropdown,200);
  }

  document.addEventListener('DOMContentLoaded',init);
})();