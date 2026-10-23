(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kuala_Lumpur'});
  const datePlus = days => { const date = new Date(today()+'T12:00:00'); date.setDate(date.getDate()+days); return date.toISOString().slice(0,10); };
  const readableDate = value => value ? new Date(value+'T00:00:00').toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  let items = [], trainings = [], schedules = [], busy = false, editingScheduleId = null;
  function banner(message, type='info') { const el=$('message'); el.textContent=message; el.dataset.type=type; el.hidden=!message; }
  function groupedTrainings(rows) {
    const groups = new Map();
    rows.forEach(row => {
      const key = row.internal_training_group_id || row.id;
      const previous = groups.get(key);
      if (!previous) groups.set(key, {...row, start_date:row.booking_date, end_date:row.booking_date, max_pax:Number(row.participants||0)});
      else { previous.start_date = previous.start_date < row.booking_date ? previous.start_date : row.booking_date; previous.end_date = previous.end_date > row.booking_date ? previous.end_date : row.booking_date; previous.max_pax = Math.max(previous.max_pax, Number(row.participants||0)); }
    });
    return [...groups.values()].sort((a,b) => a.start_date.localeCompare(b.start_date));
  }
  function plannedFor(item) { return trainings.filter(training => training.goodies_required).reduce((total, training) => total + training.max_pax * Number(item.default_per_pax || 0), 0); }
  function render() {
    const total = items.reduce((sum,item) => sum + Number(item.current_stock||0), 0);
    const low = items.filter(item => Number(item.current_stock||0) <= Number(item.reorder_level||0)).length;
    const needed = items.reduce((sum,item) => sum + plannedFor(item), 0);
    const order = items.reduce((sum,item) => sum + Math.max(0, plannedFor(item) + Number(item.reorder_level||0) - Number(item.current_stock||0)), 0);
    $('totalUnits').textContent = total; $('lowStock').textContent = low; $('plannedUnits').textContent = needed; $('orderUnits').textContent = order;
    $('movementItem').innerHTML = items.map(item => '<option value="'+escape(item.id)+'">'+escape(item.name)+'</option>').join('') || '<option value="">No item available</option>';
    $('itemRows').innerHTML = items.map(item => {
      const stock=Number(item.current_stock||0), min=Number(item.reorder_level||0), need=plannedFor(item), suggested=Math.max(0,need+min-stock);
      return '<tr><td><strong>'+escape(item.name)+'</strong><small>'+escape(item.sku)+' · '+escape(item.unit)+'</small></td><td class="'+(stock<=min?'low':'good')+'">'+stock+'</td><td>'+min+'</td><td>'+Number(item.default_per_pax||0)+'</td><td>'+need+'</td><td class="'+(suggested?'low':'good')+'">'+(suggested || '—')+'</td><td class="actions"><button data-adjust="'+escape(item.id)+'" data-name="'+escape(item.name)+'">Adjust</button></td></tr>';
    }).join('') || '<tr><td colspan="7" class="empty">No inventory items found.</td></tr>';
    $('trainingRows').innerHTML = trainings.map(training => {
      const dates=training.start_date===training.end_date ? readableDate(training.start_date) : readableDate(training.start_date)+' – '+readableDate(training.end_date);
      const goodies=training.goodies_required ? (items.filter(item => Number(item.default_per_pax||0)>0).map(item => escape(item.name)+' × '+(training.max_pax*Number(item.default_per_pax||0))).join('<br>') || 'No goodies configured') : 'Not required';
      const source=training.source==='EXTERNAL'?'EXTERNAL VENUE':'TRAINING ROOM';
      const venue=training.source==='EXTERNAL'?training.venue_name:(training.venue_rooms?.name||'Room');
      const actions=training.source==='EXTERNAL'?'<button data-schedule-edit="'+escape(training.id)+'">Edit</button><button data-schedule-cancel="'+escape(training.id)+'">Cancel</button>':'—';
      return '<tr><td><strong>'+escape(training.programme_title)+'</strong><span class="chip">'+source+'</span></td><td>'+dates+'</td><td>'+escape(venue)+'</td><td>'+training.max_pax+'</td><td>'+goodies+'</td><td class="actions">'+actions+'</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">No confirmed EasyLatih training in the next 30 days.</td></tr>';
  }
  async function load() {
    const [itemResult, bookingResult, scheduleResult] = await Promise.all([
      db.from('inventory_items').select('*').eq('is_active',true).order('name'),
      db.from('venue_bookings').select('id,internal_training_group_id,booking_date,programme_title,participants,venue_rooms(name)').eq('booking_source','INTERNAL').eq('status','CONFIRMED').gte('booking_date',today()).lte('booking_date',datePlus(30)).order('booking_date'),
      db.from('training_schedules').select('*').eq('status','CONFIRMED').lte('start_date',datePlus(30)).gte('end_date',today()).order('start_date')
    ]);
    if (itemResult.error || bookingResult.error || scheduleResult.error) throw itemResult.error || bookingResult.error || scheduleResult.error;
    items=itemResult.data||[];
    const roomTrainings=groupedTrainings(bookingResult.data||[]).map(row=>({...row,source:'ROOM',goodies_required:true}));
    schedules=scheduleResult.data||[];
    const externalTrainings=schedules.map(row=>({...row,start_date:row.start_date,end_date:row.end_date,max_pax:Number(row.participants||0),source:'EXTERNAL'}));
    trainings=[...roomTrainings,...externalTrainings].sort((a,b)=>a.start_date.localeCompare(b.start_date)); render();
  }
  function resetScheduleForm() {
    editingScheduleId=null; $('scheduleForm').reset(); $('scheduleGoodies').checked=true; $('scheduleTitle').textContent='Add external EasyLatih training'; $('scheduleSave').textContent='Save external training'; $('scheduleCancelEdit').hidden=true;
  }
  async function saveSchedule(event) {
    event.preventDefault(); if(busy)return;
    const programme_title=$('scheduleProgramme').value.trim(),start_date=$('scheduleStart').value,end_date=$('scheduleEnd').value,start_time=$('scheduleStartTime').value||null,end_time=$('scheduleEndTime').value||null,participants=Number($('schedulePax').value),venue_name=$('scheduleVenue').value.trim(),notes=$('scheduleNotes').value.trim(),goodies_required=$('scheduleGoodies').checked;
    if(programme_title.length<3||venue_name.length<2||!start_date||!end_date||end_date<start_date||!Number.isInteger(participants)||participants<1||participants>5000||(start_time&&end_time&&start_time>=end_time))return banner('Please check programme, venue, date, time and participants.','danger');
    const row={programme_title,venue_type:'EXTERNAL',venue_name,start_date,end_date,start_time,end_time,participants,goodies_required,notes};
    busy=true; $('scheduleSave').disabled=true; banner(editingScheduleId?'Updating external training…':'Saving external training…');
    const result=editingScheduleId?await db.from('training_schedules').update({...row,updated_at:new Date().toISOString()}).eq('id',editingScheduleId):await db.from('training_schedules').insert(row);
    busy=false; $('scheduleSave').disabled=false;
    if(result.error)return banner('Unable to save training: '+result.error.message,'danger');
    resetScheduleForm(); banner('External training saved. Its goodies requirement is now included in the order plan.','success'); await load();
  }
  function editSchedule(id) {
    const row=schedules.find(schedule=>schedule.id===id); if(!row)return;
    editingScheduleId=id; $('scheduleProgramme').value=row.programme_title; $('scheduleStart').value=row.start_date; $('scheduleEnd').value=row.end_date; $('scheduleStartTime').value=row.start_time?.slice(0,5)||''; $('scheduleEndTime').value=row.end_time?.slice(0,5)||''; $('schedulePax').value=row.participants; $('scheduleVenue').value=row.venue_name; $('scheduleNotes').value=row.notes||''; $('scheduleGoodies').checked=row.goodies_required; $('scheduleTitle').textContent='Edit external training'; $('scheduleSave').textContent='Save changes'; $('scheduleCancelEdit').hidden=false; $('scheduleProgramme').focus(); window.scrollTo({top:0,behavior:'smooth'});
  }
  async function cancelSchedule(id) {
    const row=schedules.find(schedule=>schedule.id===id); if(!row||busy||!confirm('Cancel "'+row.programme_title+'"? It will be removed from the goodies plan.'))return;
    busy=true; banner('Cancelling training…'); const {error}=await db.from('training_schedules').update({status:'CANCELLED',updated_at:new Date().toISOString()}).eq('id',id); busy=false;
    if(error)return banner('Unable to cancel training: '+error.message,'danger'); if(editingScheduleId===id)resetScheduleForm(); banner('Training cancelled and removed from the goodies plan.','success'); await load();
  }
  async function saveMovement(event) {
    event.preventDefault(); if (busy) return;
    const item_id=$('movementItem').value, movement_type=$('movementType').value, quantity_change=Number($('movementQty').value), reason=$('movementReason').value.trim();
    if (!item_id || !Number.isInteger(quantity_change) || !quantity_change || reason.length<2) return banner('Please enter an item, whole-number quantity and reason.','danger');
    if (movement_type==='STOCK_IN' && quantity_change<1) return banner('Stock in must be a positive number. Use Adjustment for a decrease.','danger');
    busy=true; $('movementForm').querySelector('button').disabled=true; banner('Saving stock record…');
    const {error}=await db.from('inventory_movements').insert({item_id,quantity_change,movement_type,reason});
    busy=false; $('movementForm').querySelector('button').disabled=false;
    if (error) return banner('Unable to save: '+error.message,'danger');
    $('movementQty').value=''; $('movementReason').value=''; banner('Stock record saved.','success'); await load();
  }
  async function setup() {
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) { $('loginState').textContent='Supabase configuration is missing.'; return; }
    const {data,error}=await db.auth.getUser();
    if (error || !data?.user || data.user.app_metadata?.role!=='admin') { $('loginState').innerHTML='Admin access required. <a href="../trainer/index.html">Sign in with your EasyLatih admin account</a>.'; return; }
    $('loginState').hidden=true; $('adminApp').hidden=false;
    try { await load(); } catch (error) { banner('Unable to load inventory: '+error.message,'danger'); }
    $('refreshData').addEventListener('click',()=>load().catch(error=>banner('Unable to refresh: '+error.message,'danger')));
    $('movementForm').addEventListener('submit',saveMovement);
    $('scheduleForm').addEventListener('submit',saveSchedule);
    $('scheduleCancelEdit').addEventListener('click',resetScheduleForm);
    $('trainingRows').addEventListener('click',event=>{const edit=event.target.closest('button[data-schedule-edit]'),cancel=event.target.closest('button[data-schedule-cancel]');if(edit)editSchedule(edit.dataset.scheduleEdit);if(cancel)cancelSchedule(cancel.dataset.scheduleCancel);});
    $('itemRows').addEventListener('click',event=>{ const button=event.target.closest('button[data-adjust]'); if (!button) return; $('movementItem').value=button.dataset.adjust; $('movementType').value='ADJUSTMENT'; $('movementQty').focus(); $('movementTitle').textContent='Adjust '+button.dataset.name; $('movementHint').textContent='Use a positive or negative quantity after a stock count.'; window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}); });
  }
  setup();
})();
