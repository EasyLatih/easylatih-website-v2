(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  let docMap={};
  let timer=null;

  function programmeIdFromCard(card){
    const el=card.querySelector('[data-approve-etris],[data-amend],[data-etris-approved],[data-publish],[data-unpublish]');
    if(!el)return '';
    return el.dataset.approveEtris||el.dataset.amend||el.dataset.etrisApproved||el.dataset.publish||el.dataset.unpublish||'';
  }

  function injectLinks(){
    const holder=document.getElementById('adminProgrammeList');
    if(!holder)return;
    holder.querySelectorAll('.list-card').forEach(card=>{
      const id=programmeIdFromCard(card);
      const url=docMap[id];
      if(!id||!url||card.querySelector('[data-open-google-course-outline]'))return;
      const old=card.querySelector('[data-view-course-content]');
      if(old){
        const link=document.createElement('a');
        link.href=url;
        link.target='_blank';
        link.rel='noopener';
        link.className='btn btn-soft';
        link.dataset.openGoogleCourseOutline='1';
        link.textContent='Open Editable Google Doc';
        old.replaceWith(link);
        return;
      }
      const rows=card.querySelectorAll('.btn-row');
      const row=rows.length?rows[0]:null;
      if(row){
        const link=document.createElement('a');
        link.href=url;
        link.target='_blank';
        link.rel='noopener';
        link.className='btn btn-soft';
        link.dataset.openGoogleCourseOutline='1';
        link.textContent='Open Editable Google Doc';
        row.prepend(link);
      }
    });
  }

  async function loadMap(){
    const {data,error}=await client.from('programmes').select('id,course_outline_doc_url').not('course_outline_doc_url','is',null).limit(500);
    if(error)return;
    docMap={};
    (data||[]).forEach(p=>{if(p.course_outline_doc_url)docMap[p.id]=p.course_outline_doc_url});
    injectLinks();
  }

  document.addEventListener('DOMContentLoaded',async()=>{
    const {data}=await client.auth.getUser();
    if(data?.user?.app_metadata?.role!=='admin')return;
    await loadMap();
    const holder=document.getElementById('adminProgrammeList');
    if(holder){
      new MutationObserver(()=>{
        clearTimeout(timer);
        timer=setTimeout(()=>{loadMap()},80);
      }).observe(holder,{childList:true,subtree:true});
    }
  });
})();
