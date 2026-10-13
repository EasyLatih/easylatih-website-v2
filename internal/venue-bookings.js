(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
  let rooms=[], bookings=[], busy=false;
  function banner(message,type='info'){const el=$('adminMessage');el.textContent=message;el.dataset.type=type;el.hidden=!message;}
  function readableDate(s){return s?new Date(s+'T00:00:00').toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'}):'';}
  async function load(){
    const [roomResult,bookingResult]=await Promise.all([
      db.from('venue_rooms').select('id,name,capacity,is_active').order('created_at'),
      db.from('venue_bookings').select('*,venue_rooms(name)').order('created_at',{ascending:false}).limit(500)
    ]);
    if(roomResult.error||bookingResult.error)throw roomResult.error||bookingResult.error;
    rooms=roomResult.data||[];bookings=bookingResult.data||[];
    $('roomCount').textContent=rooms.filter(r=>r.is_active).length;
    $('requestCount').textContent=bookings.length;
    $('pendingCount').textContent=bookings.filter(b=>b.status==='PENDING').length;
    $('confirmedCount').textContent=bookings.filter(b=>b.status==='CONFIRMED').length;
    const roomFilter=$('roomFilter'),chosen=roomFilter.value;
    roomFilter.innerHTML='<option value="">All rooms</option>'+rooms.map(r=>'<option value="'+escape(r.id)+'">'+escape(r.name)+'</option>').join('');
    roomFilter.value=rooms.some(r=>r.id===chosen)?chosen:'';
    renderBookings();renderRooms();
  }
  function renderBookings(){
    const term=$('findBooking').value.toLowerCase().trim(),stat=$('statusFilter').value,room=$('roomFilter').value;
    const shown=bookings.filter(b=>(!stat||b.status===stat)&&(!room||b.room_id===room)&&
      (!term||[b.applicant_name,b.company_name,b.programme_title,b.applicant_email,b.applicant_phone].some(x=>String(x||'').toLowerCase().includes(term))));
    $('bookingRows').innerHTML=shown.map(b=>{
      const buttons=b.status==='PENDING'?'<button data-book="'+escape(b.id)+'" data-status="CONFIRMED" class="primary">Confirm</button><button data-book="'+escape(b.id)+'" data-status="REJECTED">Reject</button>':
      b.status==='CONFIRMED'?'<button data-book="'+escape(b.id)+'" data-status="CANCELLED">Cancel</button>':
      '<button data-book="'+escape(b.id)+'" data-status="PENDING">Reopen</button>';
      return '<tr><td><strong>'+escape(b.programme_title)+'</strong><small>'+escape(b.company_name||'—')+'</small><span class="chip '+escape(b.status.toLowerCase())+'">'+escape(b.status)+'</span></td>'+
      '<td>'+escape(b.venue_rooms?.name||'Room')+'<small>'+readableDate(b.booking_date)+'</small><small>'+escape(b.start_time?.slice(0,5))+' – '+escape(b.end_time?.slice(0,5))+'</small></td>'+
      '<td>'+escape(b.applicant_name)+'<small>'+escape(b.applicant_email)+'</small><small>'+escape(b.applicant_phone)+'</small></td>'+
      '<td>'+escape(b.participants)+' pax <small>'+escape(b.notes||'—')+'</small></td>'+
      '<td class="actions">'+buttons+'</td></tr>';
    }).join('')||'<tr><td colspan="5" class="empty">No bookings match this filter.</td></tr>';
  }
  function renderRooms(){
    $('roomCards').innerHTML=rooms.map(r=>'<div class="room-card"><div><strong>'+escape(r.name)+'</strong><small>Capacity: '+escape(r.capacity)+' pax · '+(r.is_active?'Active':'Inactive')+'</small></div>'+
      '<div class="room-actions"><button data-room="'+escape(r.id)+'" data-room-action="rename">Rename</button><button data-room="'+escape(r.id)+'" data-room-action="capacity">Capacity</button><button data-room="'+escape(r.id)+'" data-room-action="toggle" class="'+(r.is_active?'danger':'primary')+'">'+(r.is_active?'Deactivate':'Reactivate')+'</button></div></div>').join('')||'<p>No rooms added.</p>';
  }
  async function changeStatus(id,status){
    const record=bookings.find(b=>b.id===id);
    if(!record||busy)return;
    if(!confirm((status==='CONFIRMED'?'Confirm this reservation?':'Change this booking status to '+status+'?')))return;
    busy=true;banner('Updating booking…');
    const {error}=await db.from('venue_bookings').update({status,updated_at:new Date().toISOString()}).eq('id',id);
    busy=false;
    if(error){banner(error.code==='23P01'?'Booking conflict: another confirmed reservation occupies this slot.':('Update failed: '+error.message),'danger');return;}
    banner('Booking updated successfully.','success');await load();
  }
  async function changeRoom(id,action){
    if(busy)return;
    const r=rooms.find(x=>x.id===id);if(!r)return;
    let values={};
    if(action==='rename'){const s=prompt('New room name',r.name);if(s===null)return;if(s.trim().length<2)return banner('Room name is too short.','danger');values={name:s.trim()};}
    if(action==='capacity'){const s=prompt('Room capacity',r.capacity);if(s===null)return;const n=Number(s);if(!Number.isInteger(n)||n<1||n>200)return banner('Capacity must be 1 to 200.','danger');values={capacity:n};}
    if(action==='toggle'){if(r.is_active&&!confirm('Deactivate this room? Existing reservations will remain in records.'))return;values={is_active:!r.is_active};}
    busy=true;
    const {error}=await db.from('venue_rooms').update(values).eq('id',id);
    busy=false;
    if(error)return banner('Unable to update room: '+error.message,'danger');
    banner('Room updated.','success');await load();
  }
  async function setup(){
    if(!cfg.supabaseUrl||!cfg.supabasePublishableKey){$('loginState').textContent='Supabase configuration is missing.';return;}
    const {data,error}=await db.auth.getUser();
    if(error||!data?.user||data.user.app_metadata?.role!=='admin'){
      $('loginState').innerHTML='Admin access required. <a href="../trainer/index.html">Sign in with your EasyLatih admin account</a>.';
      return;
    }
    $('loggedUser').textContent=data.user.email||'Admin';
    $('loginState').hidden=true;$('adminApp').hidden=false;
    try{await load();}catch(e){banner('Unable to load booking data. '+e.message,'danger');}
    $('refreshData').addEventListener('click',()=>load().catch(e=>banner(e.message,'danger')));
    ['statusFilter','roomFilter','findBooking'].forEach(id=>$(id).addEventListener(id==='findBooking'?'input':'change',renderBookings));
    $('bookingRows').addEventListener('click',e=>{const btn=e.target.closest('button[data-book]');if(btn)changeStatus(btn.dataset.book,btn.dataset.status);});
    $('roomCards').addEventListener('click',e=>{const btn=e.target.closest('button[data-room]');if(btn)changeRoom(btn.dataset.room,btn.dataset.roomAction);});
    $('addRoomForm').addEventListener('submit',async e=>{
      e.preventDefault();if(busy)return;
      const name=$('newRoom').value.trim(),capacity=Number($('newCapacity').value);
      if(name.length<2||!Number.isInteger(capacity)||capacity<1||capacity>200)return banner('Enter a valid room name and capacity.','danger');
      busy=true;const {error}=await db.from('venue_rooms').insert({name,capacity,is_active:true});busy=false;
      if(error)return banner('Unable to add room: '+error.message,'danger');
      $('addRoomForm').reset();banner('Room added.','success');await load();
    });
  }
  setup();
})();