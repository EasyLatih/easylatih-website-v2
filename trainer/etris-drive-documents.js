(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
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
      <p class="muted">Upload documents required for EasyLatih verification and eTRiS preparation. These files are stored privately in Google Drive and are not published in the trainer catalogue.</p>
      <div id="supportingDocumentsMessage" class="hidden"></div>
      <div class="form-grid">
        ${Object.entries(TYPES).map(([type,opt])=>`
          <div class="field full" data-doc-type="${type}">
            <label>${opt.label}${opt.required?' <span class="muted">(required)</span>':' <span class="muted">(optional)</span>'}</label>
            <input type="file" data-doc-input="${type}" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" ${opt.multiple?'multiple':''}>
            <span class="help">PDF, DOC, DOCX, JPG or PNG. Maximum 10 MB per file.${opt.multiple?' You may select more than one file.':''}</span>
            <div id="docList_${type}" class="list" style="margin-top:.6rem"><div class="empty">No document uploaded yet.</div></div>
          </div>`).join('')}
      </div>`;
    onboardingForm.insertAdjacentElement('afterend',card);

    const panel=onboardingForm.closest('[data-section="onboarding"]');
    if(panel){
      [...panel.querySelectorAll('h3')].forEach(h=>{
        if(h.textContent.trim().startsWith('3. Full Programme Details'))h.textContent='4. Full Programme Details';
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

  async function authHeaders(extra={}){
    const {data}=await client.auth.getSession();
    const token=data.session?.access_token;
    if(!token)throw new Error('Please log in again.');
    return {Authorization:`Bearer ${token}`,apikey:cfg.supabasePublishableKey,...extra};
  }

  async function uploadFiles(type,files){
    const allowed=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png'];
    try{
      for(const file of files){
        if(!allowed.includes(file.type))throw new Error(`${file.name}: unsupported file type.`);
        if(file.size>10*1024*1024)throw new Error(`${file.name}: file must be 10 MB or smaller.`);
        setMessage(`Uploading ${file.name} to EasyLatih Google Drive…`,'info');
        const form=new FormData();
        form.append('document_type',type);
        form.append('file',file,file.name);
        const response=await fetch(`${cfg.supabaseUrl}/functions/v1/trainer-drive-upload`,{method:'POST',headers:await authHeaders(),body:form});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||!result.ok)throw new Error(result.error||'Unable to upload document to Google Drive.');
      }
      setMessage('Document uploaded to Google Drive successfully and sent for EasyLatih verification.','success');
      await loadDocuments();
    }catch(err){setMessage(err.message||'Unable to upload document.','danger')}
  }

  async function viewDocument(id){
    try{
      setMessage('Preparing document…','info');
      const response=await fetch(`${cfg.supabaseUrl}/functions/v1/trainer-drive-upload`,{
        method:'POST',
        headers:await authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({action:'download',document_id:id})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error(result.error||'Unable to open document.');
      const binary=atob(result.base64||'');
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const blob=new Blob([bytes],{type:result.mime_type||'application/octet-stream'});
      const url=URL.createObjectURL(blob);
      window.open(url,'_blank','noopener');
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      setMessage('Document opened from private Google Drive storage.','success');
    }catch(err){setMessage(err.message||'Unable to open document.','danger')}
  }

  function renderDocuments(){
    for(const [type,opt] of Object.entries(TYPES)){
      const holder=$(`docList_${type}`);
      if(!holder)continue;
      let rows=docs.filter(d=>d.document_type===type).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
      if(!opt.multiple&&rows.length>1)rows=rows.slice(0,1);
      holder.innerHTML=rows.length?rows.map(d=>`
        <div class="list-card">
          <div class="list-card-top"><div><strong>${esc(d.file_name)}</strong><div class="muted">Google Drive • Uploaded ${new Date(d.created_at).toLocaleDateString('en-MY')}</div></div>${statusBadge(d.verification_status)}</div>
          <div class="btn-row"><button type="button" class="btn btn-soft" data-view-doc="${d.id}">View Document</button></div>
        </div>`).join(''):`<div class="empty">No ${esc(opt.label.toLowerCase())} uploaded yet.</div>`;
      holder.querySelectorAll('[data-view-doc]').forEach(btn=>btn.addEventListener('click',()=>viewDocument(btn.dataset.viewDoc)));
    }
  }

  async function loadDocuments(){
    if(!user)return;
    const result=await client.from('trainer_documents').select('id,document_type,file_name,file_id,file_url,provider,verification_status,created_at,updated_at').eq('trainer_id',user.id).eq('provider','GOOGLE_DRIVE').order('created_at',{ascending:false});
    if(result.error)return setMessage(result.error.message||'Unable to load supporting documents.','danger');
    docs=result.data||[];
    renderDocuments();
  }

  async function init(){
    const auth=await client.auth.getUser();
    user=auth.data?.user||null;
    if(!user)return;
    buildSection();
    await loadDocuments();
    setTimeout(ensureRaceDropdown,250);
  }

  document.addEventListener('DOMContentLoaded',init);
})();
