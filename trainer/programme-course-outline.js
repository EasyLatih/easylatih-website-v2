(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const splitLines=v=>String(v||'').split('\n').map(x=>x.trim()).filter(Boolean);
  let user=null;
  let busy=false;

  const BREAK_RULES={
    MORNING_BREAK:{label:'Morning Break',minutes:15},
    LUNCH:{label:'Lunch',minutes:60},
    AFTERNOON_BREAK:{label:'Afternoon Break',minutes:15}
  };

  function setMessage(text,type='info'){
    const el=$('courseOutlineMessage');
    if(!el)return;
    el.className=text?`alert alert-${type}`:'hidden';
    el.textContent=text||'';
  }

  function currentProgrammeId(){
    return String($('fullProgrammeForm')?.dataset?.programmeId||'').trim();
  }

  function minutesBetween(start,end){
    if(!start||!end)return 0;
    const [sh,sm]=start.split(':').map(Number);
    const [eh,em]=end.split(':').map(Number);
    if([sh,sm,eh,em].some(Number.isNaN))return 0;
    return (eh*60+em)-(sh*60+sm);
  }

  function formatHours(minutes){
    const h=minutes/60;
    return Number.isInteger(h)?String(h):String(Number(h.toFixed(2)));
  }

  function parseDayCount(){
    const duration=String($('fullProgrammeForm')?.elements?.duration?.value||'').trim();
    const match=duration.match(/(\d+)\s*day/i);
    return match?Math.max(1,Math.min(10,Number(match[1]))):1;
  }

  function standardRows(days){
    const rows=[];
    for(let day=1;day<=days;day++){
      rows.push(
        {day,start:'09:00',end:'10:30',type:'SESSION',topic:'',content:''},
        {day,start:'10:30',end:'10:45',type:'MORNING_BREAK',topic:'Morning Break',content:'Break - included in contact hours'},
        {day,start:'10:45',end:'13:00',type:'SESSION',topic:'',content:''},
        {day,start:'13:00',end:'14:00',type:'LUNCH',topic:'Lunch',content:'Lunch - excluded from contact hours'},
        {day,start:'14:00',end:'15:30',type:'SESSION',topic:'',content:''},
        {day,start:'15:30',end:'15:45',type:'AFTERNOON_BREAK',topic:'Afternoon Break',content:'Break - included in contact hours'},
        {day,start:'15:45',end:'17:00',type:'SESSION',topic:'',content:''}
      );
    }
    return rows;
  }

  function buildSection(){
    const form=$('fullProgrammeForm');
    if(!form||$('courseOutlineBlock'))return;
    const buttonRow=[...form.children].find(el=>el.classList?.contains('btn-row'))||form.querySelector('.btn-row');
    if(!buttonRow)return;

    const total=form.elements?.total_contact_hours;
    if(total){
      total.readOnly=true;
      total.step='0.25';
      total.placeholder='Auto-calculated from schedule';
      const help=document.createElement('span');
      help.className='help';
      help.textContent='Automatically calculated from the schedule. Only the 1-hour lunch break is excluded; the 15-minute morning and afternoon breaks remain within contact hours.';
      if(!total.parentElement.querySelector('[data-contact-hours-help]')){
        help.dataset.contactHoursHelp='1';
        total.parentElement.appendChild(help);
      }
    }

    const modules=form.elements?.modules;
    if(modules?.parentElement){
      const oldHelp=modules.parentElement.querySelector('.help');
      if(oldHelp)oldHelp.textContent='List the main module/topic titles here. Detailed timing and learning activities are completed in the Training Schedule below.';
    }

    const block=document.createElement('div');
    block.id='courseOutlineBlock';
    block.className='field full';
    block.innerHTML=`
      <div style="border:1px solid #dfe5ec;border-radius:12px;padding:1rem;background:#fff;margin-top:1rem">
        <h4 style="margin:0 0 .4rem">Training Schedule & Detailed Course Content</h4>
        <p class="muted" style="margin:.25rem 0 .75rem">Complete the schedule below. When you submit the programme, EasyLatih will automatically generate an editable Google Docs Course Outline for internal review and finalisation.</p>
        <div class="alert alert-warning" style="margin:.75rem 0">
          <strong>EasyLatih break allocation:</strong> Morning break is <strong>15 minutes only, once per training day</strong>; lunch is <strong>1 hour</strong>; afternoon break is <strong>15 minutes only, once per training day</strong>. <strong>Only lunch is excluded from contact hours.</strong> Morning and afternoon breaks remain within the programme contact hours.
        </div>
        <div class="alert alert-info" style="margin:.75rem 0">For a normal full training day, use <strong>9:00 AM - 5:00 PM</strong>. The standard schedule produces <strong>7 contact hours</strong> by excluding only the 1-hour lunch break.</div>
        <div id="courseOutlineMessage" class="hidden"></div>
        <div class="btn-row" style="margin-bottom:.75rem">
          <button id="applyStandardSchedule" type="button" class="btn btn-soft">Apply Standard Full-Day Schedule</button>
          <button id="addScheduleSession" type="button" class="btn btn-soft">+ Add Schedule Row</button>
        </div>
        <div id="scheduleRows"></div>
        <div class="alert alert-info" style="margin-top:.75rem"><strong>Total Contact Hours:</strong> <span id="scheduleContactHours">0</span> hour(s). Only lunch is excluded automatically; morning and afternoon breaks are included.</div>
        <div id="generatedCourseOutlineStatus" class="muted" style="margin-top:.5rem">Google Docs Course Outline will be generated automatically when the programme is submitted for EasyLatih review.</div>
      </div>`;
    buttonRow.parentNode.insertBefore(block,buttonRow);

    $('applyStandardSchedule')?.addEventListener('click',()=>{
      const holder=$('scheduleRows');
      if(holder?.querySelector('[data-schedule-row]')&&!confirm('Replace the current schedule with the EasyLatih standard full-day schedule?'))return;
      renderRows(standardRows(parseDayCount()));
      setMessage('Standard schedule applied. Fill in the module/topic and detailed content for each training session.','success');
    });
    $('addScheduleSession')?.addEventListener('click',()=>appendRow({day:1,start:'',end:'',type:'SESSION',topic:'',content:''}));
  }

  function rowTemplate(row={}){
    const type=String(row.type||'SESSION');
    return `
      <div data-schedule-row style="border:1px solid #dfe5ec;border-radius:12px;padding:1rem;margin:.65rem 0;background:#fff">
        <div class="form-grid">
          <div class="field"><label>Day</label><input data-field="day" type="number" min="1" max="10" value="${esc(row.day||1)}"></div>
          <div class="field"><label>Type</label><select data-field="type">
            <option value="SESSION" ${type==='SESSION'?'selected':''}>Training Session</option>
            <option value="MORNING_BREAK" ${type==='MORNING_BREAK'?'selected':''}>Morning Break</option>
            <option value="LUNCH" ${type==='LUNCH'?'selected':''}>Lunch</option>
            <option value="AFTERNOON_BREAK" ${type==='AFTERNOON_BREAK'?'selected':''}>Afternoon Break</option>
          </select></div>
          <div class="field"><label>Start Time</label><input data-field="start" type="time" value="${esc(row.start||'')}"></div>
          <div class="field"><label>End Time</label><input data-field="end" type="time" value="${esc(row.end||'')}"></div>
          <div class="field full"><label>Module / Topic</label><input data-field="topic" maxlength="220" value="${esc(row.topic||'')}" placeholder="e.g. Module 1: Understanding Employment Contracts"></div>
          <div class="field full"><label>Detailed Content / Learning Activity</label><textarea data-field="content" maxlength="1800" placeholder="Key sub-topics, exercise, case study, discussion, practical activity, etc.">${esc(row.content||'')}</textarea></div>
        </div>
        <div class="meta"><span>Contact hours for this row: <strong data-row-hours>0</strong></span></div>
        <div class="btn-row" style="margin-top:.5rem"><button type="button" class="btn btn-soft" data-remove-schedule>Remove</button></div>
      </div>`;
  }

  function appendRow(row){
    const holder=$('scheduleRows');if(!holder)return;
    const wrap=document.createElement('div');
    wrap.innerHTML=rowTemplate(row).trim();
    const node=wrap.firstElementChild;
    holder.appendChild(node);
    wireRow(node);
    normalizeBreakRow(node);
    recalc();
  }

  function renderRows(rows){
    const holder=$('scheduleRows');if(!holder)return;
    holder.innerHTML='';
    (Array.isArray(rows)?rows:[]).forEach(appendRow);
    recalc();
  }

  function wireRow(node){
    node.querySelectorAll('input,select,textarea').forEach(el=>el.addEventListener('input',()=>{
      if(el.dataset.field==='type')normalizeBreakRow(node);
      recalc();
    }));
    node.querySelector('[data-remove-schedule]')?.addEventListener('click',()=>{node.remove();recalc()});
  }

  function normalizeBreakRow(node){
    const type=node.querySelector('[data-field="type"]')?.value||'SESSION';
    const topic=node.querySelector('[data-field="topic"]');
    const content=node.querySelector('[data-field="content"]');
    const rule=BREAK_RULES[type];
    if(rule){
      if(topic)topic.value=rule.label;
      if(content)content.value=type==='LUNCH'?'Lunch - excluded from contact hours':'Break - included in contact hours';
      if(topic)topic.readOnly=true;
      if(content)content.readOnly=true;
    }else{
      if(topic)topic.readOnly=false;
      if(content)content.readOnly=false;
    }
  }

  function collectRows(){
    return [...($('scheduleRows')?.querySelectorAll('[data-schedule-row]')||[])].map(node=>({
      day:Number(node.querySelector('[data-field="day"]')?.value||1),
      type:String(node.querySelector('[data-field="type"]')?.value||'SESSION'),
      start:String(node.querySelector('[data-field="start"]')?.value||''),
      end:String(node.querySelector('[data-field="end"]')?.value||''),
      topic:String(node.querySelector('[data-field="topic"]')?.value||'').trim(),
      content:String(node.querySelector('[data-field="content"]')?.value||'').trim()
    }));
  }

  function recalc(){
    const nodes=[...($('scheduleRows')?.querySelectorAll('[data-schedule-row]')||[])];
    let total=0;
    nodes.forEach(node=>{
      const type=node.querySelector('[data-field="type"]')?.value||'SESSION';
      const start=node.querySelector('[data-field="start"]')?.value||'';
      const end=node.querySelector('[data-field="end"]')?.value||'';
      const mins=Math.max(0,minutesBetween(start,end));
      const contact=type==='LUNCH'?0:mins;
      total+=contact;
      const out=node.querySelector('[data-row-hours]');if(out)out.textContent=formatHours(contact);
    });
    if($('scheduleContactHours'))$('scheduleContactHours').textContent=formatHours(total);
    const input=$('fullProgrammeForm')?.elements?.total_contact_hours;
    if(input)input.value=total?formatHours(total):'';
    return total;
  }

  function validateRows(){
    const rows=collectRows();
    if(!rows.length)throw new Error('Please complete the Training Schedule before submission.');
    if(!rows.some(r=>r.type==='SESSION'))throw new Error('Training Schedule must contain at least one training session.');

    const byDay={};
    rows.forEach((r,index)=>{
      if(!Number.isInteger(r.day)||r.day<1)throw new Error(`Schedule row ${index+1}: please enter a valid training day.`);
      const mins=minutesBetween(r.start,r.end);
      if(!r.start||!r.end||mins<=0)throw new Error(`Schedule row ${index+1}: end time must be later than start time.`);
      if(r.type==='SESSION'&&(!r.topic||!r.content))throw new Error(`Schedule row ${index+1}: module/topic and detailed content are required for training sessions.`);
      const rule=BREAK_RULES[r.type];
      if(rule&&mins!==rule.minutes)throw new Error(`${rule.label} must be exactly ${rule.minutes===60?'1 hour':rule.minutes+' minutes'}.`);
      (byDay[r.day]||(byDay[r.day]=[])).push({...r,_start:Number(r.start.slice(0,2))*60+Number(r.start.slice(3)),_end:Number(r.end.slice(0,2))*60+Number(r.end.slice(3))});
    });

    Object.entries(byDay).forEach(([day,list])=>{
      const sorted=[...list].sort((a,b)=>a._start-b._start);
      for(let i=1;i<sorted.length;i++){
        if(sorted[i]._start<sorted[i-1]._end)throw new Error(`Day ${day}: schedule rows overlap. Please check the start and end times.`);
      }
      Object.entries(BREAK_RULES).forEach(([type,rule])=>{
        if(list.filter(r=>r.type===type).length>1)throw new Error(`Day ${day}: ${rule.label} can only be scheduled once.`);
      });
      const span=Math.max(...list.map(r=>r._end))-Math.min(...list.map(r=>r._start));
      if(span>=360){
        if(!list.some(r=>r.type==='MORNING_BREAK'))throw new Error(`Day ${day}: full-day training requires one 15-minute morning break.`);
        if(!list.some(r=>r.type==='LUNCH'))throw new Error(`Day ${day}: full-day training requires a 1-hour lunch break.`);
        if(!list.some(r=>r.type==='AFTERNOON_BREAK'))throw new Error(`Day ${day}: full-day training requires one 15-minute afternoon break.`);
      }
    });

    const contactMinutes=rows.reduce((sum,r)=>sum+(r.type==='LUNCH'?0:Math.max(0,minutesBetween(r.start,r.end))),0);
    if(!contactMinutes)throw new Error('Total contact hours must be greater than 0.');
    return {rows,contactHours:Number((contactMinutes/60).toFixed(2))};
  }

  async function loadSchedule(){
    const id=currentProgrammeId();
    if(!id){renderRows([]);recalc();return;}
    const {data,error}=await client.from('programmes').select('schedule,course_outline_doc_url,course_outline_generated_at').eq('id',id).eq('trainer_id',user.id).single();
    if(error){setMessage(error.message||'Unable to load training schedule.','danger');return;}
    renderRows(Array.isArray(data?.schedule)?data.schedule:[]);
    const status=$('generatedCourseOutlineStatus');
    if(status&&data?.course_outline_generated_at){
      status.textContent=`Latest Google Docs Course Outline generated on ${new Date(data.course_outline_generated_at).toLocaleString('en-MY')}. EasyLatih will review and edit the document before finalisation.`;
    }
  }

  async function saveScheduleOnly(){
    const id=currentProgrammeId();
    if(!id)return;
    const {rows,contactHours}=validateRows();
    const {error}=await client.from('programmes').update({schedule:rows,total_contact_hours:contactHours,updated_at:new Date().toISOString()}).eq('id',id).eq('trainer_id',user.id);
    if(error)throw error;
  }

  function formProgrammePayload(){
    const form=$('fullProgrammeForm');
    const f=new FormData(form);
    const proposalId=String(f.get('proposal_id')||'').trim();
    const {rows,contactHours}=validateRows();
    const row={
      proposal_id:proposalId,
      trainer_id:user.id,
      title:String(f.get('title')||'').trim(),
      category:String(f.get('category')||'').trim(),
      training_type:String(f.get('training_type')||'BOTH').trim(),
      programme_overview:String(f.get('programme_overview')||'').trim(),
      learning_objectives:splitLines(f.get('learning_objectives')),
      learning_outcomes:splitLines(f.get('learning_outcomes')),
      target_participants:String(f.get('target_participants')||'').trim(),
      prerequisites:String(f.get('prerequisites')||'').trim(),
      duration:String(f.get('duration')||'').trim(),
      total_contact_hours:contactHours,
      delivery_method:String(f.get('delivery_method')||'').trim(),
      training_methodology:String(f.get('training_methodology')||'').trim(),
      modules:splitLines(f.get('modules')).map((title,index)=>({module:index+1,title})),
      assessment_method:String(f.get('assessment_method')||'').trim(),
      maximum_participants:Number(f.get('maximum_participants')||0)||null,
      venue_requirements:String(f.get('venue_requirements')||'').trim(),
      schedule:rows,
      updated_at:new Date().toISOString()
    };
    if(!proposalId)throw new Error('Please select an approved programme proposal.');
    const required=[row.title,row.category,row.programme_overview,row.target_participants,row.duration,row.delivery_method,row.training_methodology];
    if(!required.every(Boolean)||!row.learning_objectives.length||!row.learning_outcomes.length||!row.modules.length){
      throw new Error('Please complete the programme overview, objectives, outcomes, modules and delivery details before submission.');
    }
    return row;
  }

  async function saveProgrammeForSubmission(){
    const form=$('fullProgrammeForm');
    const row=formProgrammePayload();
    let id=currentProgrammeId();
    if(id){
      const {error}=await client.from('programmes').update(row).eq('id',id).eq('trainer_id',user.id);
      if(error)throw error;
    }else{
      const {data,error}=await client.from('programmes').insert({...row,publish_status:'DRAFT',etris_status:'NOT_SUBMITTED'}).select('id').single();
      if(error)throw error;
      id=data.id;
      form.dataset.programmeId=id;
    }
    return id;
  }

  async function generateCourseOutline(programmeId){
    const {data}=await client.auth.getSession();
    const token=data.session?.access_token;
    if(!token)throw new Error('Please log in again.');
    const response=await fetch(`${cfg.supabaseUrl}/functions/v1/trainer-drive-upload`,{
      method:'POST',
      headers:{Authorization:`Bearer ${token}`,apikey:cfg.supabasePublishableKey,'Content-Type':'application/json'},
      body:JSON.stringify({action:'generate_course_outline',programme_id:programmeId})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(result.error||'Unable to generate Google Docs Course Outline.');
    return result;
  }

  async function submitWithGeneratedOutline(e){
    e.preventDefault();
    e.stopImmediatePropagation();
    if(busy)return;
    const form=$('fullProgrammeForm');
    if(!form||!form.reportValidity())return;
    if(!confirm('Submit this full programme to EasyLatih for review? An editable Google Docs Course Outline will be generated automatically.'))return;
    busy=true;
    const btn=$('submitProgrammeReview');
    if(btn)btn.disabled=true;
    try{
      setMessage('Saving programme details and training schedule…','info');
      const programmeId=await saveProgrammeForSubmission();
      setMessage('Generating editable EasyLatih Course Outline in Google Docs…','info');
      await generateCourseOutline(programmeId);
      setMessage('Programme submitted successfully. EasyLatih has received the programme and an editable Google Docs Course Outline has been generated for internal review and finalisation.','success');
      const msg=$('programmeFormMessage');
      if(msg){msg.className='alert alert-success';msg.textContent='Full programme submitted. EasyLatih will review the generated Google Docs Course Outline before eTRiS registration and publication.';}
      form.querySelectorAll('input,select,textarea,button').forEach(el=>{el.disabled=true});
    }catch(err){
      setMessage(err.message||'Unable to submit programme.','danger');
      if(btn)btn.disabled=false;
    }finally{busy=false;}
  }

  async function saveAfterDraftClick(){
    for(let i=0;i<30;i++){
      await new Promise(r=>setTimeout(r,200));
      if(currentProgrammeId())break;
    }
    if(!currentProgrammeId())return;
    try{
      await saveScheduleOnly();
      setMessage('Training schedule saved with the programme draft.','success');
    }catch(err){
      setMessage(err.message||'Programme draft was saved, but the training schedule needs attention.','warning');
    }
  }

  async function init(){
    const {data}=await client.auth.getUser();
    user=data?.user||null;
    if(!user)return;
    buildSection();

    const submit=$('submitProgrammeReview');
    if(submit)submit.addEventListener('click',submitWithGeneratedOutline,true);
    $('saveProgrammeDraft')?.addEventListener('click',()=>{setTimeout(saveAfterDraftClick,50)});
    $('programmeProposal')?.addEventListener('change',()=>setTimeout(loadSchedule,100));
    document.addEventListener('click',ev=>{
      if(ev.target?.closest?.('[data-edit-programme]'))setTimeout(loadSchedule,150);
    },true);

    const form=$('fullProgrammeForm');
    if(form){
      const observer=new MutationObserver(mutations=>{
        if(mutations.some(m=>m.attributeName==='data-programme-id'))loadSchedule();
      });
      observer.observe(form,{attributes:true,attributeFilter:['data-programme-id']});
    }
    await loadSchedule();
  }

  document.addEventListener('DOMContentLoaded',init);
})();