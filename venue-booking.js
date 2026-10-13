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
  const pretty = s => s.slice(0,5);
  let month = new Date(today.getFullYear(),today.getMonth(),1), selected = iso(today), rooms=[], occupied=[], isSending=false, loadingCalendar=false, calendarReady=false, quoteReady=false, quoteSerial=0, quoteAmount=null, holidays=new Map(), calendarSerial=0;
  function notice(text, kind='info') {
    const el=$('vrNotice'); el.textContent=text; el.dataset.kind=kind; el.hidden=!text;
  }
  function dayBookings(day) { return occupied.filter(b=>b.booking_date===day); }
  function isClash(day,start,end) { return dayBookings(day).some(b=>tmin(b.start_time)<tmin(end) && tmin(b.end_time)>tmin(start)); }
  function coveredMinutes(day) {
    let ranges = dayBookings(day).map(b=>[Math.max(480,tmin(b.start_time)),Math.min(1200,tmin(b.end_time))]).filter(([a,b])=>b>a).sort((a,b)=>a[0]-b[0]);
    let sum=0, end=480;
    for (const [a,b] of ranges) { sum+=Math.max(0,b-Math.max(a,end)); end=Math.max(end,b); }
    return sum;
  }

  const ringgit=value=>'RM'+Number(value).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
  async function loadRates() {
    const {data,error}=await db.from('venue_rental_rates').select('code,weekday_price,weekend_holiday_price');
    if(error||!data?.length)return;
    const codes={HALF_DAY:['vrRateHalfWeek','vrRateHalfEnd'],FULL_DAY:['vrRateFullWeek','vrRateFullEnd'],NIGHT:['vrRateNightWeek','vrRateNightEnd']};
    data.forEach(row=>{
      const ids=codes[row.code];
      if(ids){$(ids[0]).textContent=ringgit(row.weekday_price);$(ids[1]).textContent=ringgit(row.weekend_holiday_price);}
    });
  }
  function applyPackage(){
    const pkg=$('vrPackage').value;
    const st=$('vrStart'),en=$('vrEnd');
    let startTimes=[],endTimes=[];
    if(pkg==='HALF_MORNING'){startTimes=['09:00'];endTimes=['13:00'];}
    else if(pkg==='HALF_AFTERNOON'){startTimes=['13:00'];endTimes=['17:00'];}
    else if(pkg==='FULL'){startTimes=['09:00'];endTimes=['17:00'];}
    else{startTimes=['17:00','18:00','19:00'];endTimes=['18:00','19:00','20:00'];}
    const fill=(el,times,selected)=>{
      el.replaceChildren();
      times.forEach(t=>{const op=document.createElement('option');op.value=t;op.textContent=t;if(t===selected)op.selected=true;el.append(op);});
    };
    fill(st,startTimes,startTimes[0]);fill(en,endTimes,endTimes[0]);
    st.disabled=pkg!=='NIGHT';en.disabled=pkg!=='NIGHT';
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
    if(!selected||!start||!end||tmin(end)<=tmin(start)){
      $('vrEstimated').textContent='Select a valid time';
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
    const offset=(month.getDay()+6)%7, days=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    for(let i=0;i<offset;i++) { const blank=document.createElement('span'); blank.className='vr-empty';grid.append(blank); }
    for(let day=1;day<=days;day++) {
      const d=new Date(month.getFullYear(),month.getMonth(),day);
      const id=iso(d), n=dayBookings(id).length, full=coveredMinutes(id)>=720;
      const btn=document.createElement('button');
      btn.type='button';btn.className='vr-day';
      btn.textContent=String(day);
      btn.disabled=d<today || d>new Date(today.getFullYear(),today.getMonth(),today.getDate()+365) || loadingCalendar;
      btn.dataset.state=n?(full?'full':'partial'):'available';
      btn.classList.toggle('selected',id===selected);
      btn.setAttribute('aria-label', id + (full?' Fully booked':n?' Some slots booked':' Available'));
      btn.setAttribute('aria-pressed',String(id===selected));
      btn.addEventListener('click',()=>{ selected=id;renderCalendar();renderSlots(); });
      grid.append(btn);
    }
  }
  function renderSlots() {
    $('vrChosenDate').textContent=parse(selected).toLocaleDateString('en-MY',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
    const slotList=$('vrOccupied');slotList.replaceChildren();
    let b=dayBookings(selected);
    if(!b.length) {const x=document.createElement('span');x.className='vr-slot-free';x.textContent='No confirmed bookings — all operating hours available.';slotList.append(x);}
    else b.forEach(item=>{const x=document.createElement('span');x.className='vr-slot';x.textContent=pretty(item.start_time)+' – '+pretty(item.end_time);slotList.append(x);});
    refreshQuote();
  }
  function validateTime() {
    const s=$('vrStart').value,e=$('vrEnd').value;
    const clash=isClash(selected,s,e), valid=tmin(e)>tmin(s);
    const hint=$('vrTimeHint');
    hint.textContent=!valid?'End time must be later than start time.':clash?'This time overlaps an existing confirmed booking. Please choose another time.':'Selected time is available for a booking request.';
    hint.dataset.kind=valid&&!clash?'success':'danger';
    $('vrSubmit').disabled=!valid||clash||isSending||loadingCalendar||!calendarReady||!quoteReady;
    return valid&&!clash;
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
    holidays=new Map((!holidayError?holidayData:[]||[]).map(h=>[h.holiday_date,h.name]));
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
  $('vrStart').addEventListener('change',refreshQuote);
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
      const msg=/already booked/i.test(err.message||'')?'This slot has just been booked. Please choose another time.':'Unable to submit right now. Please check the details or contact EasyLatih.';
      await refreshCalendar();
      notice(msg,'danger');
    } finally {isSending=false;validateTime();}
  });
  loadRooms();
})();