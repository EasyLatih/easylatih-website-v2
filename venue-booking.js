(() => {
  'use strict';
  const root = document.getElementById('venueBookingApp');
  if (!root) return;
  const $ = (id) => document.getElementById(id);
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabasePublishableKey) {
    $('vrNotice').textContent = 'Booking system is unavailable. Please contact EasyLatih via WhatsApp.';
    return;
  }
  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Kuala_Lumpur', year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date());
  const getPart = type => Number(parts.find(p=>p.type===type).value);
  const today = new Date(getPart('year'), getPart('month')-1, getPart('day'));
  const iso = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const parse = s => { const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); };
  const tmin = s => Number(s.slice(0,2))*60+Number(s.slice(3,5));
  const pretty = s => s.slice(0,5)==='24:00'?'12:00 AM (next day)':s.slice(0,5);
  // Always validate booking times against Malaysia time, regardless of visitor timezone.
  const malaysiaNow=()=>{
    const parts=new Intl.DateTimeFormat('en-GB',{
      timeZone:'Asia/Kuala_Lumpur',year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',hourCycle:'h23'
    }).formatToParts(new Date());
    const p=key=>Number(parts.find(item=>item.type===key)?.value);
    const day=[p('year'),String(p('month')).padStart(2,'0'),String(p('day')).padStart(2,'0')].join('-');
    return {day,minutes:p('hour')*60+p('minute')};
  };
  const hasStarted=(date,start)=>{
    const now=malaysiaNow();
    return date<now.day||(date===now.day&&tmin(start)<=now.minutes);
  };
  let month = new Date(today.getFullYear(),today.getMonth(),1), selected = iso(today), rooms=[], occupied=[], isSending=false, loadingCalendar=false, calendarReady=false, quoteReady=false, quoteSerial=0, quoteAmount=null, holidays=new Map(), calendarSerial=0;
  function notice(text, kind='info') {
    const el=$('vrNotice'); el.textContent=text; el.dataset.kind=kind; el.hidden=!text;
  }
  function dayBookings(day) { return occupied.filter(b=>b.booking_date===day); }
  function isClash(day,start,end) { return dayBookings(day).some(b=>tmin(b.start_time)<tmin(end) && tmin(b.end_time)>tmin(start)); }
  const SESSION_PERIODS=[
    {key:'am',short:'AM',name:'Morning',from:540,to:780,package:'HALF_MORNING'},
    {key:'pm',short:'PM',name:'Afternoon',from:780,to:1020,package:'HALF_AFTERNOON'},
    {key:'night',short:'Night',name:'Night',from:1200,to:1440,package:'NIGHT'}
  ];
  function coveredMinutes(day,from,to) {
    const ranges=dayBookings(day)
      .map(b=>[Math.max(from,tmin(b.start_time)),Math.min(to,tmin(b.end_time))])
      .filter(([a,b])=>b>a)
      .sort((a,b)=>a[0]-b[0]);
    let covered=0,mergedEnd=from;
    for(const [a,b] of ranges) {
      covered+=Math.max(0,b-Math.max(a,mergedEnd));
      mergedEnd=Math.max(mergedEnd,b);
    }
    return covered;
  }
  function sessionState(day,period) {
    const covered=coveredMinutes(day,period.from,period.to);
    if(covered>=period.to-period.from)return 'full';
    // All rentable hours have already started, even if the period itself ends later.
    const latestStart=String(Math.floor((period.to-60)/60)).padStart(2,'0')+':00';
    if(hasStarted(day,latestStart))return 'past';
    return covered===0?'available':'partial';
  }
  function findFreeHour(day,from,to) {
    for(let start=from;start+60<=to;start+=60) {
      const st=String(Math.floor(start/60)).padStart(2,'0')+':00';
      const en=String(Math.floor((start+60)/60)).padStart(2,'0')+':00';
      if(!hasStarted(day,st)&&!isClash(day,st,en))return st;
    }
    return null;
  }
  const timeDisplay=minutes=>minutes===1440?'12:00 AM (next day)':String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');
  function sessionIsBookable(day,period) {
    return findFreeHour(day,period.from,period.to)!==null;
  }
  function updatePackageAvailability(){
    const kinds={
      HALF_MORNING:!hasStarted(selected,'09:00')&&!isClash(selected,'09:00','13:00'),
      HALF_AFTERNOON:!hasStarted(selected,'13:00')&&!isClash(selected,'13:00','17:00'),
      FULL:!hasStarted(selected,'09:00')&&!isClash(selected,'09:00','17:00'),
      DAY_HOURLY:findFreeHour(selected,540,1020)!==null,
      NIGHT:findFreeHour(selected,1200,1440)!==null
    };
    const pkg=$('vrPackage'),previous=pkg.value;
    for(const option of pkg.options) {
      option.disabled=!kinds[option.value];
    }
    if(!kinds[previous]){
      const preferred=SESSION_PERIODS.find(p=>kinds[p.package])?.package;
      const fallback=preferred||Object.keys(kinds).find(k=>kinds[k]);
      if(fallback) {
        pkg.value=fallback;
        applyPackage();
      } else {
        pkg.selectedIndex=-1;
      }
    } else if(previous==='DAY_HOURLY'||previous==='NIGHT') {
      const from=previous==='DAY_HOURLY'?540:1200;
      const to=previous==='DAY_HOURLY'?1020:1440;
      const st=$('vrStart').value,en=$('vrEnd').value;
      if(hasStarted(selected,st)||isClash(selected,st,en)){
        const next=findFreeHour(selected,from,to);
        if(next){
          $('vrStart').value=next;
          adjustHourlyEnd();
        }
      }
    }
    pkg.disabled=!Object.values(kinds).some(Boolean);
    return kinds;
  }
  function selectSession(period) {
    if(!calendarReady||!sessionIsBookable(selected,period))return;
    const state=sessionState(selected,period);
    const pkg=state==='available'&&period.key!=='night'?period.package:(period.key==='night'?'NIGHT':'DAY_HOURLY');
    $('vrPackage').value=pkg;
    applyPackage();
    if(pkg==='DAY_HOURLY'||pkg==='NIGHT') {
      const first=findFreeHour(selected,period.from,period.to);
      if(first) {
        $('vrStart').value=first;
        adjustHourlyEnd();
        refreshQuote();
      }
    }
    $('vrPackage').scrollIntoView({behavior:'smooth',block:'center'});
  }

  const ringgit=value=>'RM'+Number(value).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
  async function loadRates() {
    const {data,error}=await db.from('venue_rental_rates').select('code,weekday_price,weekend_holiday_price');
    if(error||!data?.length)return;
    const codes={DAY_HOURLY:['vrRateDayWeek','vrRateDayEnd'],HALF_DAY:['vrRateHalfWeek','vrRateHalfEnd'],FULL_DAY:['vrRateFullWeek','vrRateFullEnd'],NIGHT:['vrRateNightWeek','vrRateNightEnd']};
    data.forEach(row=>{
      const ids=codes[row.code];
      if(ids){$(ids[0]).textContent=ringgit(row.weekday_price);$(ids[1]).textContent=ringgit(row.weekend_holiday_price);}
    });
  }
  const hours=(from,to)=>Array.from({length:to-from+1},(_,i)=>String(from+i).padStart(2,'0')+':00');
  function setOptions(el,items,choice){
    el.replaceChildren();
    items.forEach(t=>{
      const op=document.createElement('option');
      op.value=t;op.textContent=t==='24:00'?'12:00 AM (midnight)':t;
      if(t===choice)op.selected=true;
      el.append(op);
    });
  }
  function adjustHourlyEnd(){
    const pkg=$('vrPackage').value;
    if(pkg!=='DAY_HOURLY'&&pkg!=='NIGHT')return;
    const start=tmin($('vrStart').value);
    const maxEnd=pkg==='DAY_HOURLY'?1020:1440;
    const maxHours=pkg==='DAY_HOURLY'?3:4;
    const options=[];
    for(let mins=start+60;mins<=maxEnd&&mins<=start+maxHours*60;mins+=60){
      options.push(String(Math.floor(mins/60)).padStart(2,'0')+':00');
    }
    const current=$('vrEnd').value;
    setOptions($('vrEnd'),options,options.includes(current)?current:options[0]);
  }
  function applyPackage(){
    const pkg=$('vrPackage').value;
    const st=$('vrStart'),en=$('vrEnd');
    if(pkg==='HALF_MORNING'){setOptions(st,['09:00'],'09:00');setOptions(en,['13:00'],'13:00');}
    else if(pkg==='HALF_AFTERNOON'){setOptions(st,['13:00'],'13:00');setOptions(en,['17:00'],'17:00');}
    else if(pkg==='FULL'){setOptions(st,['09:00'],'09:00');setOptions(en,['17:00'],'17:00');}
    else {
      setOptions(st,pkg==='DAY_HOURLY'?hours(9,16):hours(20,23),pkg==='DAY_HOURLY'?'09:00':'20:00');
      adjustHourlyEnd();
    }
    st.disabled=pkg!=='NIGHT'&&pkg!=='DAY_HOURLY';
    en.disabled=pkg!=='NIGHT'&&pkg!=='DAY_HOURLY';
    $('vrTimeHint').textContent='Select a date to check the estimated fee.';
    refreshQuote();
  }
  async function refreshQuote(){
    const thisQuote=++quoteSerial;
    quoteReady=false;quoteAmount=null;
    const start=$('vrStart').value,end=$('vrEnd').value;
    $('vrEstimated').textContent='Checking price…';
    $('vrPriceType').textContent='Subject to confirmation. No online payment.';
    validateTime();
    if(!selected||!start||!end||tmin(end)<=tmin(start)||hasStarted(selected,start)){
      $('vrEstimated').textContent=hasStarted(selected,start)?'Time already passed':'Select a valid time';
      return;
    }
    const {data,error}=await db.rpc('venue_get_quote',{p_date:selected,p_start:start,p_end:end});
    if(thisQuote!==quoteSerial)return;
    if(error||!data||!Number.isFinite(Number(data.estimated_price))){
      $('vrEstimated').textContent='Unable to calculate';
      $('vrPriceType').textContent='Please contact EasyLatih for rates.';
      validateTime();return;
    }
    quoteReady=true;quoteAmount=Number(data.estimated_price);
    $('vrEstimated').textContent=ringgit(quoteAmount);
    const isHoliday=holidays.has(selected);
    $('vrPriceType').textContent=(isHoliday?'Public holiday · ':data.day_type==='WEEKEND_OR_HOLIDAY'?'Weekend / holiday · ':'Weekday · ')+data.hours+' hour(s). Subject to confirmation.';
    validateTime();
  }

  function renderCalendar() {
    const grid=$('vrCalendar');
    grid.replaceChildren();
    $('vrMonth').textContent=month.toLocaleDateString('en-MY',{month:'long',year:'numeric'});
    const offset=(month.getDay()+6)%7,days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    for(let i=0;i<offset;i++){
      const blank=document.createElement('span');blank.className='vr-empty';grid.append(blank);
    }
    for(let day=1;day<=days;day++) {
      const d=new Date(month.getFullYear(),month.getMonth(),day),id=iso(d);
      const statuses=SESSION_PERIODS.map(p=>sessionState(id,p));
      const overall=statuses.every(x=>x==='full')?'full':statuses.every(x=>x==='past')?'past':statuses.every(x=>x==='available')?'available':'partial';
      const btn=document.createElement('button');
      btn.type='button';btn.className='vr-day';
      const number=document.createElement('span');
      number.className='vr-day-number';number.textContent=String(day);btn.append(number);
      const markerRow=document.createElement('span');markerRow.className='vr-day-markers';
      SESSION_PERIODS.forEach((period,i)=>{
        const marker=document.createElement('span');marker.className='vr-day-marker';
        marker.dataset.state=loadingCalendar?'unknown':statuses[i];
        marker.textContent=period.short==='Night'?'N':period.short;
        marker.title=period.name+': '+(loadingCalendar?'Checking':statuses[i]==='past'?'Already passed':statuses[i]==='full'?'Fully booked':statuses[i]==='partial'?'Partially booked':'Available');
        markerRow.append(marker);
      });
      btn.append(markerRow);
      btn.disabled=d<today || d>new Date(today.getFullYear(),today.getMonth(),today.getDate()+365) || loadingCalendar || !calendarReady || !SESSION_PERIODS.some(p=>sessionIsBookable(id,p));
      btn.dataset.state=loadingCalendar||!calendarReady?'unknown':overall;
      btn.classList.toggle('selected',id===selected);
      btn.setAttribute('aria-label',id+'; '+SESSION_PERIODS.map((p,i)=>p.name+' '+(loadingCalendar?'checking':statuses[i])).join(', '));
      btn.setAttribute('aria-pressed',String(id===selected));
      btn.addEventListener('click',()=>{selected=id;renderCalendar();renderSlots();});
      grid.append(btn);
    }
  }
  function renderSlots() {
    $('vrChosenDate').textContent=parse(selected).toLocaleDateString('en-MY',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const slotList=$('vrOccupied');slotList.replaceChildren();
    if(!calendarReady) {
      const empty=document.createElement('p');empty.className='vr-muted';
      empty.textContent=loadingCalendar?'Checking session availability…':'Unable to confirm availability. Please refresh or contact EasyLatih.';
      slotList.append(empty);
      validateTime();return;
    }
    SESSION_PERIODS.forEach(period=>{
      const state=sessionState(selected,period),canBook=sessionIsBookable(selected,period);
      const card=document.createElement('div');card.className='vr-session-card';card.dataset.state=state;
      const row=document.createElement('div');row.className='vr-session-head';
      const title=document.createElement('strong');title.textContent=period.short+' · '+period.name;
      const status=document.createElement('span');status.className='vr-session-status';status.dataset.state=state;
      status.textContent=state==='past'?'Session passed':state==='available'?'Available':state==='full'?'Fully booked':'Partially booked';
      row.append(title,status);card.append(row);
      const hours=document.createElement('span');hours.className='vr-session-hours';
      hours.textContent=timeDisplay(period.from)+' – '+timeDisplay(period.to);
      card.append(hours);
      const b=dayBookings(selected).filter(x=>tmin(x.start_time)<period.to&&tmin(x.end_time)>period.from);
      const details=document.createElement('div');details.className='vr-session-details';
      if(!b.length){details.textContent='No confirmed bookings';}
      else {
        details.textContent='Booked: '+b.map(x=>{
          const from=Math.max(period.from,tmin(x.start_time));
          const to=Math.min(period.to,tmin(x.end_time));
          return timeDisplay(from)+' – '+timeDisplay(to);
        }).join('; ');
      }
      card.append(details);
      const btn=document.createElement('button');btn.type='button';btn.className='vr-session-choose';
      btn.disabled=!canBook||!calendarReady;
      btn.textContent=!canBook?(state==='past'?'Time passed':'No hourly slots'):state==='partial'?'Choose available hour':period.key==='night'?'Choose night hours':'Choose '+period.short;
      btn.addEventListener('click',()=>selectSession(period));
      card.append(btn);
      slotList.append(card);
    });
    updatePackageAvailability();
    refreshQuote();
  }

  function validateTime() {
    const s=$('vrStart').value,e=$('vrEnd').value;
    const clash=isClash(selected,s,e), valid=tmin(e)>tmin(s), past=hasStarted(selected,s);
    const hint=$('vrTimeHint');
    hint.textContent=!valid?'End time must be later than start time.':past?'This start time has already passed in Malaysia. Please choose a future session.':clash?'This time overlaps an existing confirmed booking. Please choose another time.':'Selected time is available for a booking request.';
    hint.dataset.kind=valid&&!clash&&!past?'success':'danger';
    $('vrSubmit').disabled=!valid||clash||past||isSending||loadingCalendar||!calendarReady||!quoteReady;
    return valid&&!clash&&!past;
  }
  async function refreshCalendar() {
    const room=$('vrRoom').value;
    if(!room) return;
    const thisCalendar=++calendarSerial;
    loadingCalendar=true;calendarReady=false;quoteReady=false;renderCalendar();$('vrSubmit').disabled=true;
    notice('Checking available dates…');
    const first=iso(month), last=iso(new Date(month.getFullYear(),month.getMonth()+1,0));
    const [{data,error},{data:holidayData,error:holidayError}]=await Promise.all([
      db.rpc('venue_get_calendar',{p_room_id:room,p_from:first,p_to:last}),
      db.from('venue_public_holidays').select('holiday_date,name').gte('holiday_date',first).lte('holiday_date',last)
    ]);
    if(thisCalendar!==calendarSerial)return;
    holidays=new Map((!holidayError?(holidayData||[]):[]).map(h=>[h.holiday_date,h.name]));
    loadingCalendar=false;
    if(error) { occupied=[];notice('Unable to check availability. Please try again or contact us.', 'danger'); }
    else {occupied=data||[]; calendarReady=true; notice('');}
    renderCalendar();renderSlots();
    if(error)$('vrSubmit').disabled=true;
  }
  async function loadRooms() {
    notice('Loading training room availability…');
    const {data,error}=await db.from('venue_rooms').select('id,name,capacity').eq('is_active',true).order('name');
    if(error || !data?.length){notice('Room booking is temporarily unavailable. Please contact EasyLatih.','danger');return;}
    rooms=data;
    const sel=$('vrRoom');sel.replaceChildren();
    for(const room of rooms) { const op=document.createElement('option');op.value=room.id;op.textContent=room.name+' (up to '+room.capacity+' pax)';sel.append(op);}
    sel.addEventListener('change',()=>{ const room=rooms.find(r=>r.id===sel.value);if(room)$('vrPax').max=room.capacity;refreshCalendar();});
    $('vrPax').max=rooms[0].capacity;
    await loadRates();
    applyPackage();
    await refreshCalendar();
  }
  $('vrPrevious').addEventListener('click',()=>{const prev=new Date(month.getFullYear(),month.getMonth()-1,1);if(prev<new Date(today.getFullYear(),today.getMonth(),1))return;month=prev;selected=iso(month<today?today:month);refreshCalendar();});
  $('vrNext').addEventListener('click',()=>{const next=new Date(month.getFullYear(),month.getMonth()+1,1);if(next>new Date(today.getFullYear(),today.getMonth()+12,1))return;month=next;selected=iso(month);refreshCalendar();});
  $('vrPackage').addEventListener('change',applyPackage);
  $('vrStart').addEventListener('change',()=>{adjustHourlyEnd();refreshQuote();});
  $('vrEnd').addEventListener('change',refreshQuote);
  $('vrForm').addEventListener('submit',async e=>{
    e.preventDefault();
    if(isSending||!calendarReady||!quoteReady||!validateTime())return;
    const r=rooms.find(x=>x.id===$('vrRoom').value);
    const pax=Number($('vrPax').value);
    if(!r||!Number.isInteger(pax)||pax<1||pax>r.capacity){notice('Number of participants exceeds room capacity.','danger');return;}
    if(!$('vrForm').reportValidity())return;
    isSending=true;validateTime();notice('Submitting your request…');
    const payload={p_room_id:r.id,p_date:selected,p_start:$('vrStart').value,p_end:$('vrEnd').value,
      p_name:$('vrName').value.trim(),p_company:$('vrCompany').value.trim(),
      p_email:$('vrEmail').value.trim(),p_phone:$('vrPhone').value.trim(),
      p_title:$('vrTitle').value.trim(),p_participants:pax,
      p_notes:$('vrNotes').value.trim(),p_website:$('vrWebsite').value};
    try {
      const {error}=await db.rpc('venue_submit_request',payload);
      if(error)throw error;
      $('vrForm').reset();
      $('vrRoom').value=r.id;
      applyPackage();
      notice('Your booking request has been received. EasyLatih will review and contact you. This is not yet a confirmed booking.','success');
    } catch(err) {
      const raw=String(err?.message||'');
      const msg=/date or time|already passed|future session/i.test(raw)
        ?'This date or start time has already passed in Malaysia. Please choose a future session.'
        :/already booked/i.test(raw)
        ?'This slot has just been booked. Please choose another time.'
        :/too many requests/i.test(raw)
        ?'Too many booking requests. Please contact EasyLatih to proceed.'
        :/check your booking information/i.test(raw)
        ?'Please check your name, contact details and number of participants.'
        :'Submission could not be completed. Please try again or WhatsApp EasyLatih.';
      await refreshCalendar();
      notice(msg,'danger');
    } finally {isSending=false;validateTime();}
  });
  loadRooms();
})();