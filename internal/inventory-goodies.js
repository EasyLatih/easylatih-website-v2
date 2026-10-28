(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kuala_Lumpur'});
  const datePlus = days => { const date = new Date(today()+'T12:00:00'); date.setDate(date.getDate()+days); return date.toISOString().slice(0,10); };
  const readableDate = value => value ? new Date(value+'T00:00:00').toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  let items = [], trainings = [], schedules = [], issuedTrainingKeys = new Set(), busy = false, editingScheduleId = null;
  function banner(message, type='info') { const el=$('message'); el.textContent=message; el.dataset.type=type; el.hidden=!message; }
  function groupedTrainings(rows) {
    const groups = new Map();
    rows.forEach(row => {
      const key = row.internal_training_group_id || row.id;
      const previous = groups.get(key);
      if (!previous) groups.set(key, {...row, start_date:row.booking_date, end_date:row.booking_date, max_pax:Number(row.participants||0),actual_pax:row.actual_participants==null?null:Number(row.actual_participants)});
      else { previous.start_date = previous.start_date < row.booking_date ? previous.start_date : row.booking_date; previous.end_date = previous.end_date > row.booking_date ? previous.end_date : row.booking_date; previous.max_pax = Math.max(previous.max_pax, Number(row.participants||0)); previous.actual_pax=previous.actual_pax??(row.actual_participants==null?null:Number(row.actual_participants)); }
    });
    return [...groups.values()].sort((a,b) => a.start_date.localeCompare(b.start_date));
  }
  function paxFor(training) { return training.actual_pax==null ? training.max_pax : training.actual_pax; }
  function plannedFor(item) { return trainings.filter(training => training.goodies_required && training.end_date >= today()).reduce((total, training) => total + paxFor(training) * Number(item.default_per_pax || 0), 0); }
  function issueKey(training) { return training.source+':'+(training.source==='ROOM' ? (training.internal_training_group_id || training.id) : training.id); }
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
      const goodies=training.goodies_required ? (items.filter(item => Number(item.default_per_pax||0)>0).map(item => escape(item.name)+' × '+(paxFor(training)*Number(item.default_per_pax||0))).join('<br>') || 'No goodies configured') : 'Not required';
      const source=training.source==='EXTERNAL'?'EXTERNAL VENUE':'TRAINING ROOM';
      const venue=training.source==='EXTERNAL'?training.venue_name:(training.venue_rooms?.name||'Room');
      const actual=training.actual_pax==null?'Not confirmed':training.actual_pax;
      const issued=issuedTrainingKeys.has(issueKey(training));
      const issueAction=!training.goodies_required ? '' : issued ? '<span class="chip">GOODIES ISSUED</span>' : training.end_date>today() ? '<button disabled title="Available after training ends">Issue goodies</button>' : training.actual_pax===null ? '<button disabled title="Set actual pax first">Issue goodies</button>' : '<button class="primary" data-issue-goodies="'+escape(training.id)+'">Issue goodies</button>';
      const actions='<button data-actual-pax="'+escape(training.id)+'">Actual pax</button><button data-goodies-toggle="'+escape(training.id)+'">Goodies: '+(training.goodies_required?'Yes':'No')+'</button>'+issueAction+(training.source==='EXTERNAL'?'<button data-schedule-edit="'+escape(training.id)+'">Edit</button><button data-schedule-cancel="'+escape(training.id)+'">Cancel</button>':'<a href="venue-bookings.html#booking-'+escape(training.id)+'">Edit room booking</a>');
      return '<tr><td><strong>'+escape(training.programme_title)+'</strong><span class="chip">'+source+'</span></td><td>'+dates+'</td><td>'+escape(venue)+'</td><td>Target: '+training.max_pax+'<small>Actual: '+actual+'</small></td><td>'+goodies+'</td><td class="actions">'+actions+'</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty">No confirmed EasyLatih training in the next 30 days.</td></tr>';
  }
  async function load() {
    const [itemResult, bookingResult, scheduleResult, movementResult] = await Promise.all([
      db.from('inventory_items').select('*').eq('is_active',true).order('name'),
      db.from('venue_bookings').select('id,internal_training_group_id,booking_date,programme_title,participants,actual_participants,goodies_required,venue_rooms(name)').eq('booking_source','INTERNAL').eq('status','CONFIRMED').gte('booking_date',datePlus(-30)).lte('booking_date',datePlus(30)).order('booking_date'),
      db.from('training_schedules').select('*').eq('status','CONFIRMED').lte('start_date',datePlus(30)).gte('end_date',datePlus(-30)).order('start_date'),
      db.from('inventory_movements').select('training_source,training_id').eq('movement_type','ISSUE').not('training_id','is',null)
    ]);
    if (itemResult.error || bookingResult.error || scheduleResult.error || movementResult.error) throw itemResult.error || bookingResult.error || scheduleResult.error || movementResult.error;
    items=itemResult.data||[];
    const roomTrainings=groupedTrainings(bookingResult.data||[]).map(row=>({...row,source:'ROOM',goodies_required:row.goodies_required!==false}));
    schedules=scheduleResult.data||[];
    const externalTrainings=schedules.map(row=>({...row,start_date:row.start_date,end_date:row.end_date,max_pax:Number(row.participants||0),actual_pax:row.actual_participants==null?null:Number(row.actual_participants),source:'EXTERNAL'}));
    issuedTrainingKeys=new Set((movementResult.data||[]).map(row=>row.training_source+':'+row.training_id));
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
  async function updateActualPax(id) {
    const training=trainings.find(row=>row.id===id); if(!training||busy)return;
    const entered=prompt('Actual attendance for "'+training.programme_title+'". Leave blank to return to target pax ('+training.max_pax+').',training.actual_pax??'');
    if(entered===null)return;
    const actual_participants=entered.trim()===''?null:Number(entered);
    if(actual_participants!==null&&(!Number.isInteger(actual_participants)||actual_participants<1||actual_participants>5000))return banner('Actual pax must be a whole number from 1 to 5,000.','danger');
    if(!confirm(actual_participants===null?'Use target pax again for goodies planning?':'Use actual pax '+actual_participants+' for goodies planning?'))return;
    busy=true;banner('Updating actual attendance…');
    let result;
    if(training.source==='EXTERNAL') result=await db.from('training_schedules').update({actual_participants,updated_at:new Date().toISOString()}).eq('id',id);
    else if(training.internal_training_group_id) result=await db.from('venue_bookings').update({actual_participants,updated_at:new Date().toISOString()}).eq('internal_training_group_id',training.internal_training_group_id);
    else result=await db.from('venue_bookings').update({actual_participants,updated_at:new Date().toISOString()}).eq('id',id);
    busy=false;
    if(result.error)return banner('Unable to update actual pax: '+result.error.message,'danger');
    banner(actual_participants===null?'Target pax is being used for goodies planning again.':'Actual pax updated. Goodies requirement now uses '+actual_participants+'.','success');await load();
  }
  async function toggleGoodies(id) {
    const training=trainings.find(row=>row.id===id);if(!training||busy)return;
    const goodies_required=!training.goodies_required;
    if(!confirm(goodies_required?'Include this training in goodies planning?':'Remove this training from goodies planning?'))return;
    busy=true;banner('Updating goodies requirement…');
    let result;
    if(training.source==='EXTERNAL')result=await db.from('training_schedules').update({goodies_required,updated_at:new Date().toISOString()}).eq('id',id);
    else if(training.internal_training_group_id)result=await db.from('venue_bookings').update({goodies_required,updated_at:new Date().toISOString()}).eq('internal_training_group_id',training.internal_training_group_id);
    else result=await db.from('venue_bookings').update({goodies_required,updated_at:new Date().toISOString()}).eq('id',id);
    busy=false;
    if(result.error)return banner('Unable to update goodies requirement: '+result.error.message,'danger');
    banner(goodies_required?'Training included in goodies planning.':'Training removed from goodies planning.','success');await load();
  }
  async function issueGoodies(id) {
    const training=trainings.find(row=>row.id===id); if(!training||busy||!training.goodies_required||training.actual_pax===null)return;
    const training_id=training.source==='ROOM'?(training.internal_training_group_id||training.id):training.id;
    if(issuedTrainingKeys.has(training.source+':'+training_id))return banner('Goodies were already issued for this training.','danger');
    const itemSummary=items.filter(item=>Number(item.default_per_pax||0)>0).map(item=>item.name+' × '+(training.actual_pax*Number(item.default_per_pax||0))).join(', ');
    if(!confirm('Issue goodies for "'+training.programme_title+'" based on actual '+training.actual_pax+' pax?\n\n'+itemSummary+'\n\nThis deducts stock and cannot be repeated.'))return;
    busy=true; banner('Issuing goodies and deducting stock…');
    const {error}=await db.rpc('issue_training_goodies',{p_source:training.source,p_training_id:training_id,p_actual_participants:training.actual_pax});
    busy=false;
    if(error)return banner('Unable to issue goodies: '+error.message,'danger');
    banner('Goodies issued using actual '+training.actual_pax+' pax. Stock has been deducted.','success'); await load();
  }
  async function saveMovement(event) {
    event.preventDefault(); if (busy) return;
    const item_id=$('movementItem').value, movement_type=$('movementType').value, enteredQty=Number($('movementQty').value), reason=$('movementReason').value.trim();
    if (!item_id || !Number.isInteger(enteredQty) || !enteredQty || reason.length<2) return banner('Please enter an item, whole-number quantity and reason.','danger');
    if ((movement_type==='STOCK_IN'||movement_type==='ISSUE') && enteredQty<1) return banner('Stock In and Goodies Out must use a positive number. Use Adjustment for a decrease.','danger');
    const quantity_change=movement_type==='ISSUE'?-enteredQty:enteredQty;
    busy=true; $('movementForm').querySelector('button').disabled=true; banner('Saving stock record…');
    const {error}=await db.from('inventory_movements').insert({item_id,quantity_change,movement_type,reason});
    busy=false; $('movementForm').querySelector('button').disabled=false;
    if (error) return banner('Unable to save: '+error.message,'danger');
    $('movementQty').value=''; $('movementReason').value=''; banner('Stock record saved.','success'); await load();
  }
  async function setup() {
    if (!cfg.supabaseUrl || !cfg.supabasePublishableKey) { $('loginState').textContent='Supabase configuration is missing.'; return; }
    const {data,error}=await db.auth.getUser();
    if (error || !data?.user || data.user.app_metadata?.role!=='admin') { location.replace('login.html?next='+encodeURIComponent((location.pathname.split('/').pop()||'admin-dashboard.html')+location.hash)); return; }
    $('loginState').hidden=true; $('adminApp').hidden=false;
    try { await load(); } catch (error) { banner('Unable to load inventory: '+error.message,'danger'); }
    $('refreshData').addEventListener('click',()=>load().catch(error=>banner('Unable to refresh: '+error.message,'danger')));
    $('movementForm').addEventListener('submit',saveMovement);
    $('scheduleForm').addEventListener('submit',saveSchedule);
    $('scheduleCancelEdit').addEventListener('click',resetScheduleForm);
    $('trainingRows').addEventListener('click',event=>{const actual=event.target.closest('button[data-actual-pax]'),goodies=event.target.closest('button[data-goodies-toggle]'),issue=event.target.closest('button[data-issue-goodies]'),edit=event.target.closest('button[data-schedule-edit]'),cancel=event.target.closest('button[data-schedule-cancel]');if(actual)updateActualPax(actual.dataset.actualPax);else if(goodies)toggleGoodies(goodies.dataset.goodiesToggle);else if(issue)issueGoodies(issue.dataset.issueGoodies);else if(edit)editSchedule(edit.dataset.scheduleEdit);else if(cancel)cancelSchedule(cancel.dataset.scheduleCancel);});
    $('itemRows').addEventListener('click',event=>{ const button=event.target.closest('button[data-adjust]'); if (!button) return; $('movementItem').value=button.dataset.adjust; $('movementType').value='ADJUSTMENT'; $('movementQty').focus(); $('movementTitle').textContent='Adjust '+button.dataset.name; $('movementHint').textContent='Use a positive or negative quantity after a stock count.'; window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}); });
  }
  setup();
})();
