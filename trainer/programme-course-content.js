(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  let user=null;
  let docs=[];

  function setMessage(text,type='info'){
    const el=$('courseContentMessage');
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

  function currentProgrammeId(){
    return String($('fullProgrammeForm')?.dataset?.programmeId||'').trim();
  }

  function buildSection(){
    const form=$('fullProgrammeForm');
    if(!form||$('courseContentBlock'))return;
    const buttons=form.querySelector('.btn-row');
    if(!buttons)return;
    const block=document.createElement('div');
    block.id='courseContentBlock';
    block.className='field full';
    block.style.marginTop='1rem';
    block.innerHTML=`
      <div style="border:1px solid #dfe5ec;border-radius:12px;padding:1rem;background:#fff">
        <h4 style="margin:0 0 .5rem">Full Course Content / Course Outline <span class="muted">(required before review)</span></h4>
        <p class="muted" style="margin:.25rem 0 .75rem">Upload the complete programme content using the EasyLatih Course Outline structure. Save the programme as Draft first, then upload the file before clicking “Submit for EasyLatih Review”.</p>
        <div class="alert alert-info" style="margin:.75rem 0">
          <strong>EasyLatih Course Outline format:</strong> Course Title, Duration, Target Level, Total Contact Hours, Delivery Method, Prerequisite; followed by Programme Overview, Learning Objectives, Learning Outcomes, Target Participants, Duration & Contact Hours, Training Methodology, Prerequisite, Module Outline / Course Content and Assessment Method. Trainer profile and EasyLatih administrative notes are maintained separately in the portal.
        </div>
        <div id="courseContentMessage" class="hidden"></div>
        <div class="field">
          <label>Upload Full Course Content</label>
          <input id="courseContentFile" type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document">
          <span class="help">PDF, DOC or DOCX, maximum 10 MB. Uploading a revised file creates a new version in Google Drive.</span>
        </div>
        <div class="btn-row">
          <button id="uploadCourseContent" type="button" class="btn btn-soft">Upload / Replace Course Content</button>
        </div>
        <div id="courseContentList" class="list" style="margin-top:.75rem"><div class="empty">Save the programme draft first.</div></div>
      </div>`;
    buttons.parentNode.insertBefore(block,buttons);
    $('uploadCourseContent')?.addEventListener('click',uploadCourseContent);
  }

  function updateControlState(){
    const id=currentProgrammeId();
    const titleField=$('fullProgrammeForm')?.elements?.title;
    const locked=Boolean(titleField?.disabled);
    const uploadBtn=$('uploadCourseContent');
    if(uploadBtn)uploadBtn.disabled=!id||locked;
    const file=$('courseContentFile');
    if(file)file.disabled=!id||locked;
    if(!id){
      const holder=$('courseContentList');
      if(holder)holder.innerHTML='<div class="empty">Save the programme draft first, then upload the full Course Content / Course Outline.</div>';
    }
  }

  async function loadCourseContent(){
    buildSection();
    updateControlState();
    const id=currentProgrammeId();
    const holder=$('courseContentList');
    if(!holder||!user)return;
    if(!id){docs=[];return;}
    const {data,error}=await client.from('trainer_documents')
      .select('id,programme_id,document_type,file_name,file_id,provider,verification_status,created_at')
      .eq('trainer_id',user.id)
      .eq('programme_id',id)
      .eq('document_type','COURSE_CONTENT')
      .eq('provider','GOOGLE_DRIVE')
      .order('created_at',{ascending:false});
    if(error){setMessage(error.message||'Unable to load course content.','danger');return;}
    docs=data||[];
    holder.innerHTML=docs.length?docs.map((d,index)=>`
      <div class="list-card">
        <div class="list-card-top">
          <div><strong>${esc(d.file_name)}</strong><div class="muted">${index===0?'Current version':'Previous version'} • Google Drive • ${new Date(d.created_at).toLocaleDateString('en-MY')}</div></div>
          <span class="badge ${String(d.verification_status).toUpperCase()==='VERIFIED'?'green':'amber'}">${esc(String(d.verification_status||'PENDING').replaceAll('_',' '))}</span>
        </div>
        <div class="btn-row"><button type="button" class="btn btn-soft" data-course-doc="${d.id}">View Course Content</button></div>
      </div>`).join(''):'<div class="empty">No full Course Content / Course Outline uploaded yet. This is required before submission for EasyLatih review.</div>';
    holder.querySelectorAll('[data-course-doc]').forEach(btn=>btn.addEventListener('click',()=>viewDocument(btn.dataset.courseDoc)));
  }

  async function uploadCourseContent(){
    const programmeId=currentProgrammeId();
    const file=$('courseContentFile')?.files?.[0];
    try{
      if(!programmeId)throw new Error('Please save the programme draft first.');
      if(!file)throw new Error('Please choose a PDF, DOC or DOCX course content file.');
      const allowed=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if(!allowed.includes(file.type))throw new Error('Full Course Content must be PDF, DOC or DOCX.');
      if(file.size<=0||file.size>10*1024*1024)throw new Error('Course Content file must be 10 MB or smaller.');
      setMessage(`Uploading ${file.name} to Google Drive…`,'info');
      const form=new FormData();
      form.append('document_type','COURSE_CONTENT');
      form.append('programme_id',programmeId);
      form.append('file',file,file.name);
      const response=await fetch(`${cfg.supabaseUrl}/functions/v1/trainer-drive-upload`,{
        method:'POST',headers:await authHeaders(),body:form
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error(result.error||'Unable to upload full Course Content.');
      $('courseContentFile').value='';
      setMessage('Full Course Content uploaded to Google Drive successfully. You may now submit the programme for EasyLatih review.','success');
      await loadCourseContent();
    }catch(err){setMessage(err.message||'Unable to upload full Course Content.','danger')}
  }

  async function viewDocument(id){
    try{
      setMessage('Preparing course content…','info');
      const response=await fetch(`${cfg.supabaseUrl}/functions/v1/trainer-drive-upload`,{
        method:'POST',
        headers:await authHeaders({'Content-Type':'application/json'}),
        body:JSON.stringify({action:'download',document_id:id})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok||!result.ok)throw new Error(result.error||'Unable to open course content.');
      const binary=atob(result.base64||'');
      const bytes=new Uint8Array(binary.length);
      for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
      const blob=new Blob([bytes],{type:result.mime_type||'application/octet-stream'});
      const url=URL.createObjectURL(blob);
      window.open(url,'_blank','noopener');
      setTimeout(()=>URL.revokeObjectURL(url),60000);
      setMessage('Course Content opened from private Google Drive storage.','success');
    }catch(err){setMessage(err.message||'Unable to open course content.','danger')}
  }

  async function refreshAfterProgrammeChange(){
    for(let i=0;i<12;i++){
      await new Promise(r=>setTimeout(r,250));
      if(currentProgrammeId())break;
    }
    await loadCourseContent();
  }

  async function init(){
    const {data}=await client.auth.getUser();
    user=data?.user||null;
    if(!user)return;
    buildSection();
    await loadCourseContent();

    $('programmeProposal')?.addEventListener('change',()=>setTimeout(loadCourseContent,50));
    $('saveProgrammeDraft')?.addEventListener('click',()=>refreshAfterProgrammeChange());
    document.addEventListener('click',e=>{
      if(e.target?.closest?.('[data-edit-programme]'))setTimeout(loadCourseContent,100);
    },true);

    const form=$('fullProgrammeForm');
    if(form){
      const observer=new MutationObserver(()=>{updateControlState();});
      observer.observe(form,{attributes:true,subtree:true,attributeFilter:['disabled','data-programme-id']});
    }
  }

  document.addEventListener('DOMContentLoaded',init);
})();
