(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const cfg = window.EASYLATIH_TRAINER_PORTAL || {};
  const db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const today = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Kuala_Lumpur'});
  const datePlus = days => { const date = new Date(today()+'T12:00:00'); date.setDate(date.getDate()+days); return date.toISOString().slice(0,10); };
  const readableDate = value => value ? new Date(value+'T00:00:00').toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  let items = [], trainings = [], busy = false;
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
  function plannedFor(item) { return trainings.reduce((total, training) => total + training.max_pax * Number(item.default_per_pax || 0), 0); }
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
      const goodies=items.filter(item => Number(item.default_per_pax||0)>0).map(item => escape(item.name)+' × '+(training.max_pax*Number(item.default_per_pax||0))).join('<br>') || 'No goodies configured';
      return '<tr><td><strong>'+escape(training.programme_title)+'</strong><span class="chip">INTERNAL TRAINING</span></td><td>'+dates+'</td><td>'+escape(training.venue_rooms?.name||'Room')+'</td><td>'+training.max_pax+'</td><td>'+goodies+'</td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty">No confirmed EasyLatih training in the next 30 days.</td></tr>';
  }
  async function load() {
    const [itemResult, bookingResult] = await Promise.all([
      db.from('inventory_items').select('*').eq('is_active',true).order('name'),
      db.from('venue_bookings').select('id,internal_training_group_id,booking_date,programme_title,participants,venue_rooms(name)').eq('booking_source','INTERNAL').eq('status','CONFIRMED').gte('booking_date',today()).lte('booking_date',datePlus(30)).order('booking_date')
    ]);
    if (itemResult.error || bookingResult.error) throw itemResult.error || bookingResult.error;
    items=itemResult.data||[]; trainings=groupedTrainings(bookingResult.data||[]); render();
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
    $('itemRows').addEventListener('click',event=>{ const button=event.target.closest('button[data-adjust]'); if (!button) return; $('movementItem').value=button.dataset.adjust; $('movementType').value='ADJUSTMENT'; $('movementQty').focus(); $('movementTitle').textContent='Adjust '+button.dataset.name; $('movementHint').textContent='Use a positive or negative quantity after a stock count.'; window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'}); });
  }
  setup();
})();
