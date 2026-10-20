/* EasyLatih Training Room - Invoice & Receipt Manager */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
const db=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
const E=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const RM=n=>'RM '+(Number(n)||0).toLocaleString('en-MY',{minimumFractionDigits:2,maximumFractionDigits:2});
const money=n=>Math.max(0,Number(n)||0);
const dateMY=s=>s?new Date(s+'T00:00:00').toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'}):'';
const dueDate=s=>{if(!s)return '';const d=new Date(s+'T12:00:00');d.setDate(d.getDate()-1);return d.toISOString().slice(0,10)};
const fields=[
 ['client_name','Bill To / Client Name','text'],['client_address','Client Address','textarea'],
 ['programme_title','Programme Title','text'],['room_name','Room','text'],
 ['booking_date','Rental Date','date'],['start_time','Start Time','time'],['end_time','End Time','time'],
 ['participants','Participants (pax)','number'],['session','Session / Package','text'],
 ['rate','Rental Rate (RM)','number'],['add_ons','Add-ons (RM)','number'],['discount','Discount (RM)','number'],
 ['tax','Tax (if applicable, RM)','number'],['inclusions','Package Inclusions (one per line)','textarea'],
 ['complimentary','Complimentary Items (leave blank if none)','textarea'],['notes','Remarks','textarea']
];
let bookings=[],docs=[],selected=null,busy=false;
const invoiceFor=b=>docs.find(d=>d.booking_id===b.id&&d.document_type==='INVOICE');
const receiptFor=b=>docs.find(d=>d.booking_id===b.id&&d.document_type==='RECEIPT');
function notify(msg,bad=false){const m=$('vdNotice');m.textContent=msg;m.hidden=false;m.style.background=bad?'#fff0ee':'#eaf6ed';m.style.color=bad?'#9b2823':'#176444';}
function initial(b){return{
 client_name:b.company_name||b.applicant_name,client_address:'',
 programme_title:b.programme_title,room_name:b.venue_rooms?.name||'EasyLatih Training Room',
 booking_date:b.booking_date,start_time:(b.start_time||'').slice(0,5),end_time:(b.end_time||'').slice(0,5),
 participants:b.participants,session:(b.booking_package||'Room Rental').replaceAll('_',' '),
 rate:Number(b.estimated_price||0),add_ons:0,discount:0,tax:0,
 inclusions:'Training room (maximum 26 pax)\nTables & chairs\nAir-conditioned room\nLCD projector & screen\nWhiteboard & markers\nWi-Fi access',
 complimentary:'',notes:'',email:b.applicant_email,phone:b.applicant_phone
};}
const price=p=>money(p.rate)+money(p.add_ons)-money(p.discount)+money(p.tax);
function viewPayload(){const data={};for(const [id] of fields){const el=$('vd_'+id);if(el)data[id]=el.value;}data.total=Math.max(0,price(data));return data;}
function editorMarkup(p,doc,b){
 const disabled=doc?.status==='FINAL'?'disabled':'';
 const cell=([id,label,type])=>{
  let val=p[id]??'';
  const input=type==='textarea'?'<textarea '+disabled+' id="vd_'+id+'" rows="'+(id==='inclusions'?5:2)+'">'+E(val)+'</textarea>':
   '<input '+disabled+' id="vd_'+id+'" type="'+type+'" value="'+E(val)+'" '+(type==='number'?'min="0" step="0.01"':'')+'>';
  return '<label class="vd-field"><span>'+E(label)+'</span>'+input+'</label>';
 };
 const s=doc?.status||'NEW';
 return '<div class="vd-head"><div><strong>INVOICE · '+E(b.programme_title)+'</strong><small>'+E(dateMY(b.booking_date))+' · '+E(b.applicant_name)+'</small></div><span class="vd-pill '+(s==='FINAL'?'final':'')+'">'+E(s)+'</span></div>'+
 '<div class="vd-fields">'+fields.map(cell).join('')+'</div>'+
 '<div class="vd-total">Total Payable: <strong id="vdTotal">'+RM(p.total??price(p))+'</strong><small>Full payment due by '+E(dateMY(dueDate(p.booking_date)))+'</small></div>'+
 '<div class="vd-buttons">'+(s!=='FINAL'?'<button type="button" id="vdSave" class="primary">Save Draft</button><button type="button" id="vdGenerate">Generate / Open Google Docs Draft</button><button type="button" id="vdFinalize" class="primary">Finalize Invoice</button>':'<button type="button" id="vdPayment" class="primary">Verify Full Payment</button>')+
 '<button type="button" id="vdPreview">Preview</button>'+
 (doc?.google_doc_url?'<a class="vd-link" target="_blank" rel="noopener" href="'+E(doc.google_doc_url)+'">Open Google Doc ↗</a>':'')+
 (doc?.pdf_url?'<a class="vd-link" target="_blank" rel="noopener" href="'+E(doc.pdf_url)+'">View Final PDF ↗</a>':'')+
 (s==='FINAL'?'<button type="button" id="vdSend">Send Invoice by Email</button>':'')+'</div>'+
 (s==='FINAL'?'<div class="vd-final">Official invoice no.: <strong>'+E(doc.document_number||'')+'</strong> · '+(doc.payment_verified_at?'PAID IN FULL ('+RM(doc.payment_amount)+')':'Awaiting full payment')+'</div>':'')+
 '<div id="vdLocalPreview" hidden></div>';
}
function renderTable(){
 const sel=$('vdBooking');const chosen=sel.value;
 sel.innerHTML='<option value="">Choose booking...</option>'+bookings.map(b=>'<option value="'+E(b.id)+'">'+E(b.programme_title)+' — '+E(dateMY(b.booking_date))+' — '+E(b.company_name||b.applicant_name)+'</option>').join('');
 if(bookings.some(b=>b.id===chosen))sel.value=chosen;
 $('vdRows').innerHTML=bookings.map(b=>{const i=invoiceFor(b),r=receiptFor(b);return '<tr><td><strong>'+E(b.programme_title)+'</strong><small>'+E(b.company_name||b.applicant_name)+' · '+E(dateMY(b.booking_date))+'</small></td>'+
 '<td>'+E(i?.status||'Not generated')+'<small>'+E(i?.document_number||'')+'</small></td>'+
 '<td>'+E(i?.payment_verified_at?'Paid in full':'Not verified')+'</td>'+
 '<td>'+E(r?.status||'Not generated')+'</td>'+
 '<td><button type="button" data-vd-book="'+E(b.id)+'">Manage</button></td></tr>'}).join('')||'<tr><td colspan="5">No bookings.</td></tr>';
}
async function load(){const [a,b]=await Promise.all([
 db.from('venue_bookings').select('*,venue_rooms(name)').order('created_at',{ascending:false}).limit(500),
 db.from('venue_documents').select('*').order('created_at',{ascending:false}).limit(1000)
]);if(a.error||b.error)throw a.error||b.error;bookings=a.data||[];docs=b.data||[];renderTable();}
function wireEditor(b,d){
 if(!d||d.status!=='FINAL')fields.forEach(([id])=>{const el=$('vd_'+id);el?.addEventListener('input',()=>{const p=viewPayload();$('vdTotal').textContent=RM(p.total);renderPreview(p,true);});});
 $('vdSave')?.addEventListener('click',()=>save(b));
 $('vdGenerate')?.addEventListener('click',()=>generate(b));
 $('vdFinalize')?.addEventListener('click',()=>finalize(b));
 $('vdPreview')?.addEventListener('click',()=>{$('vdLocalPreview').hidden=!$('vdLocalPreview').hidden;renderPreview(viewPayload(),false)});
 $('vdPayment')?.addEventListener('click',()=>verifyPayment(b));
 $('vdSend')?.addEventListener('click',()=>send(b,'INVOICE'));
}
function openBooking(id){const b=bookings.find(x=>x.id===id);if(!b)return;selected=id;$('vdBooking').value=id;const d=invoiceFor(b),p=d?.payload||initial(b);$('vdEditor').hidden=false;$('vdEditor').innerHTML=editorMarkup(p,d,b);wireEditor(b,d);renderPreview(p,true);$('vdEditor').scrollIntoView({block:'nearest',behavior:'smooth'});}
function renderPreview(p,onlyWhenVisible){const root=$('vdLocalPreview');if(!root||(onlyWhenVisible&&root.hidden))return;root.innerHTML='<div class="vd-page"><span class="vd-watermark">PREVIEW ONLY</span><strong class="vd-title">EASY LATIH CONSULTANCY</strong><h2>INVOICE · DRAFT</h2>'+
 '<p><b>Bill to:</b> '+E(p.client_name)+'<br>'+E(p.client_address).replaceAll('\n','<br>')+'</p>'+
 '<table><tr><td>Programme</td><td>'+E(p.programme_title)+'</td></tr><tr><td>Room</td><td>'+E(p.room_name)+'</td></tr>'+
 '<tr><td>Rental date / time</td><td>'+E(dateMY(p.booking_date))+' · '+E(p.start_time)+'–'+E(p.end_time)+'</td></tr>'+
 '<tr><td>Participants</td><td>'+E(p.participants)+' pax</td></tr><tr><td>Package</td><td>'+E(p.session)+'</td></tr></table>'+
 '<p><b>Package inclusions:</b><br>'+E(p.inclusions).replaceAll('\n','<br>')+'</p>'+
 (p.complimentary?'<p><b>Complimentary items (if applicable):</b><br>'+E(p.complimentary).replaceAll('\n','<br>')+'</p>':'')+
 '<p><b>Rental:</b> '+RM(p.rate)+' · <b>Add-ons:</b> '+RM(p.add_ons)+' · <b>Discount:</b> '+RM(p.discount)+' · <b>Tax:</b> '+RM(p.tax)+'</p>'+
 '<h3>Total Payable: '+RM(p.total??price(p))+'</h3><p>Full payment due by '+E(dateMY(dueDate(p.booking_date)))+'.<br><b>MAYBANK:</b> 5562 2647 8218 · EASY LATIH CONSULTANCY</p>'+
 '<p><small>Full Terms & Conditions, including 100% refund for cancellation before the rental date (no refund on the day), are in the approved Google Docs invoice template. This is a quick content preview; use Google Docs Draft for the final layout.</small></p></div>';}
async function save(b){if(busy)return null;const p=viewPayload();if(!p.client_name||!p.booking_date||p.total<0)return notify('Complete all required fields.','bad');busy=true;try{
 const old=invoiceFor(b);
 if(old?.status==='FINAL')throw Error('Finalized invoices cannot be edited.');
 const q=old?db.from('venue_documents').update({payload:p,updated_at:new Date().toISOString()}).eq('id',old.id).eq('status','DRAFT').select().single():
 db.from('venue_documents').insert({booking_id:b.id,document_type:'INVOICE',status:'DRAFT',payload:p}).select().single();
 const {data,error}=await q;if(error)throw error;notify('Draft saved. Final invoice number has NOT been allocated.');await load();openBooking(b.id);return data;
 }catch(e){notify('Save error: '+e.message,true);return null;}finally{busy=false}}
async function bridge(action,documentId,more={}){const {data,error}=await db.functions.invoke('venue-documents',{body:{action,documentId,...more}});if(error){let msg=error.message;try{const body=await error.context?.json();msg=body?.error||msg}catch{}throw Error(msg)}if(!data?.ok)throw Error(data?.error||'Document service unavailable.');return data}
async function generate(b){let doc=invoiceFor(b);if(!doc||doc.status!=='DRAFT'){doc=await save(b);if(!doc)return;}else{doc=await save(b);if(!doc)return;}if(busy)return;busy=true;try{notify('Creating Google Docs draft…');const res=await bridge('draft',doc.id);notify('Google Docs draft ready. Open the link to edit it.');await load();openBooking(b.id);if(res.googleDocUrl)window.open(res.googleDocUrl,'_blank','noopener');}catch(e){notify('Google Docs draft: '+e.message,true);}finally{busy=false;}}
async function finalize(b){let doc=invoiceFor(b);if(!doc||doc.status!=='DRAFT'){notify('Save a draft first.');return;}const saved=await save(b);if(!saved)return;if(!confirm('Finalize invoice? A unique INVOICE running number will be taken from EasyLatih V2 STAGING. The official PDF cannot be edited.'))return;busy=true;try{notify('Finalizing invoice…');const r=await bridge('finalize',saved.id);notify('Invoice finalized: '+r.number);await load();openBooking(b.id);}catch(e){notify('Finalize error: '+e.message,true);}finally{busy=false;}}
async function verifyPayment(b){const doc=invoiceFor(b);if(!doc||doc.status!=='FINAL')return;const sum=money(doc.payload?.total);const amount=prompt('Total amount RECEIVED (RM). Must equal or exceed '+RM(sum),String(sum.toFixed(2)));if(amount===null)return;const paymentAmount=Number(amount);if(!Number.isFinite(paymentAmount)||paymentAmount<sum)return notify('Full payment has not been received. No receipt will be issued.',true);const reference=prompt('Bank transaction / receipt reference (required)','');if(reference===null)return;if(!reference.trim())return notify('Payment reference is required.',true);if(!confirm('Confirm bank receipt has actually been verified? This records PAID IN FULL.'))return;try{const r=await bridge('verify_payment',doc.id,{amount:paymentAmount,reference:reference.trim()});notify('Full payment verified. You can now generate a receipt.');await load();openBooking(b.id);}catch(e){notify(e.message,true);}}
async function send(b,type){const doc=type==='INVOICE'?invoiceFor(b):receiptFor(b);if(!doc||doc.status!=='FINAL')return;const email=b.applicant_email||'';if(!confirm('Send '+type+' '+doc.document_number+' to '+email+'?'))return;try{const r=await bridge('send',doc.id);notify('Email submission completed for '+email);await load();openBooking(b.id);}catch(e){notify('Send failed: '+e.message,true);}}
async function makeReceipt(b){const inv=invoiceFor(b);if(!inv||inv.status!=='FINAL'||!inv.payment_verified_at)return notify('Verify full payment of a finalized invoice before issuing a receipt.',true);let doc=receiptFor(b);if(doc){openReceipt(b);return;}const payload={...inv.payload,invoice_number:inv.document_number,invoice_total:inv.payload.total,amount_received:inv.payment_amount,payment_date:inv.payment_verified_at.slice(0,10),payment_method:'Bank Transfer',transaction_reference:inv.payment_reference,received_from:inv.payload.client_name};const q=await db.from('venue_documents').insert({booking_id:b.id,document_type:'RECEIPT',status:'DRAFT',payload}).select().single();if(q.error)return notify('Receipt draft error: '+q.error.message,true);await load();openReceipt(b);}
function openReceipt(b){const d=receiptFor(b);if(!d)return;const inv=invoiceFor(b);$('vdEditor').hidden=false;$('vdEditor').innerHTML='<div class="vd-head"><strong>OFFICIAL RECEIPT · '+E(b.programme_title)+'</strong><span class="vd-pill '+(d.status==='FINAL'?'final':'')+'">'+E(d.status)+'</span></div>'+
 '<p>Invoice: <b>'+E(inv.document_number)+'</b> · Received: <b>'+RM(inv.payment_amount)+'</b> · Payment Reference: '+E(inv.payment_reference)+'</p>'+
 '<p>Receipt template will be populated from the verified payment record. No receipt is issued for partial payment.</p>'+
 '<div class="vd-buttons">'+(d.status==='DRAFT'?'<button class="primary" id="vdReceiptDraft">Generate / Open Google Docs Draft</button><button class="primary" id="vdReceiptFinal">Finalize Receipt</button>':'<button id="vdReceiptSend">Send Receipt by Email</button>')+
 (d.google_doc_url?'<a target="_blank" rel="noopener" class="vd-link" href="'+E(d.google_doc_url)+'">Open Google Doc ↗</a>':'')+
 (d.pdf_url?'<a target="_blank" rel="noopener" class="vd-link" href="'+E(d.pdf_url)+'">View Final PDF ↗</a>':'')+'</div>';
 $('vdReceiptDraft')?.addEventListener('click',async()=>{try{const r=await bridge('draft',d.id);notify('Receipt draft generated.');await load();openReceipt(b);if(r.googleDocUrl)window.open(r.googleDocUrl,'_blank','noopener')}catch(e){notify(e.message,true)}});
 $('vdReceiptFinal')?.addEventListener('click',async()=>{if(!confirm('Finalize official receipt for verified payment?'))return;try{const r=await bridge('finalize',d.id);notify('Receipt finalized: '+r.number);await load();openReceipt(b)}catch(e){notify(e.message,true)}});
 $('vdReceiptSend')?.addEventListener('click',()=>send(b,'RECEIPT'));
}
function refreshActions(){const b=bookings.find(x=>x.id===selected);if(!b)return;const invoice=invoiceFor(b);$('vdReceiptActions').innerHTML='<button type="button" id="vdMakeReceipt" '+(!invoice?.payment_verified_at?'disabled':'')+'>'+(receiptFor(b)?'View Receipt':'Create Receipt Draft')+'</button>'; $('vdMakeReceipt').onclick=()=>makeReceipt(b)}
async function setup(){const app=$('adminApp');if(!app)return;const {data}=await db.auth.getUser();if(data?.user?.app_metadata?.role!=='admin')return;
 const panel=document.createElement('section');panel.className='panel';panel.id='venueDocumentsPanel';panel.innerHTML='<h2>Invoice & Receipt Management</h2><p>Generate a draft, preview and edit it, then finalize. The official invoice number is allocated only at finalization from EasyLatih V2 STAGING.</p>'+
 '<div id="vdNotice" class="notice" hidden></div><div class="vd-toolbar"><select id="vdBooking"><option value="">Choose booking...</option></select><button id="vdRefresh">↻ Refresh Documents</button></div>'+
 '<div id="vdReceiptActions" class="vd-buttons"></div><div id="vdEditor" hidden></div>'+
 '<div class="table-scroll"><table><thead><tr><th>Booking</th><th>Invoice</th><th>Payment</th><th>Receipt</th><th>Action</th></tr></thead><tbody id="vdRows"></tbody></table></div>';
 app.insertBefore(panel,app.querySelector('section.panel')||null);
 $('vdBooking').addEventListener('change',()=>{if($('vdBooking').value){openBooking($('vdBooking').value);refreshActions()}});
 $('vdRows').addEventListener('click',e=>{const el=e.target.closest('[data-vd-book]');if(el){openBooking(el.dataset.vdBook);refreshActions()}});
 $('vdRefresh').addEventListener('click',()=>load().then(()=>{if(selected){openBooking(selected);refreshActions()}}).catch(e=>notify(e.message,true)));
 try{await load()}catch(e){notify('Documents cannot load: '+e.message,true)}
}
document.addEventListener('DOMContentLoaded',setup);
})();