(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);

  function dateLabel(row){
    if(!row.start_date)return '';
    const start=new Date(`${row.start_date}T00:00:00`);
    const end=row.end_date?new Date(`${row.end_date}T00:00:00`):null;
    const fmt=d=>d.toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'});
    const date=end&&row.end_date!==row.start_date?`${fmt(start)} – ${fmt(end)}`:fmt(start);
    const time=[row.start_time?String(row.start_time).slice(0,5):'',row.end_time?String(row.end_time).slice(0,5):''].filter(Boolean).join(' – ');
    return time?`${date} · ${time}`:date;
  }

  function mapRow(row){
    const now=new Date();
    const start=new Date(`${row.start_date}T00:00:00`);
    const deadline=row.registration_deadline?new Date(row.registration_deadline):null;
    const registrationClosed=Boolean(deadline&&deadline<now);
    const isFull=row.status==='FULL';
    const postponed=row.status==='POSTPONED';
    const registrationOpen=row.status==='PUBLISHED'&&!registrationClosed&&!isFull&&!postponed&&Boolean(row.registration_url);
    return {
      source:'trainer-portal-schedule',
      courseId:row.programme_id,
      programName:row.programme_title,
      category:row.category||'Training',
      state:row.state||'',
      venue:row.venue||[row.city,row.state].filter(Boolean).join(', '),
      startDateRaw:row.start_date,
      startDate:dateLabel(row),
      programDate:dateLabel(row),
      programmeStatus:postponed?'POSTPONED':'CONFIRMED',
      programmeStarted:start<new Date(new Date().toDateString()),
      isFull,
      registrationClosed,
      registrationOpen,
      maxPax:Number(row.capacity||0),
      remainingSeats:'',
      registrationLink:row.registration_url||'',
      courseContentUrl:row.final_course_content_url||'',
      trainerProfileUrl:row.trainer_profile_url||'',
      participantFee:row.participant_fee,
      deliveryMode:row.delivery_mode||'',
      hrdClaimable:Boolean(row.hrd_claimable)
    };
  }

  function mergeRows(rows){
    if(typeof events2026==='undefined')return;
    const legacy=events2026.filter(ev=>ev&&ev.source!=='trainer-portal-schedule');
    const portal=(rows||[]).map(mapRow);
    const seen=new Set();
    events2026=[...legacy,...portal].filter(ev=>{
      const key=`${ev.courseId||''}|${ev.startDateRaw||ev.startDate||ev.programDate||''}|${ev.programName||''}`;
      if(seen.has(key))return false;
      seen.add(key);return true;
    });
    if(typeof populateStateFilter==='function')populateStateFilter();
    if(typeof renderCalendar==='function')renderCalendar();
  }

  async function load(){
    const {data,error}=await client.from('scheduled_trainings')
      .select('id,programme_id,programme_title,category,duration,start_date,end_date,start_time,end_time,venue,city,state,delivery_mode,participant_fee,capacity,registration_deadline,trainer_profile_url,final_course_content_url,registration_url,hrd_claimable,status')
      .in('status',['PUBLISHED','FULL','POSTPONED'])
      .order('start_date',{ascending:true})
      .limit(500);
    if(error){console.warn('Unable to load portal scheduled training',error.message);return;}
    mergeRows(data||[]);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load);
  else load();
})();
