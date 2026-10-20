/**
 * EasyLatih Venue Google Docs bridge. Add this file to the existing EasyLatih
 * Apps Script project connected to V2 STAGING.
 *
 * Put at the TOP of that project's existing doPost(e):
 * if (e && e.parameter && String(e.parameter.action||'').indexOf('venueDocs')===0)
 *   return handleVenueDocs_(e);
 *
 * Script Properties: VENUE_DOC_BRIDGE_SECRET = Supabase VENUE_DOCS_SECRET.
 * Redeploy existing Web App as a new version (execute as Me).
 */
const VD_SHEET_ID='1W6mLl9U2xdlfrlWHTs7VYmmRk34BcfaKTBo7gJatGsc';
const VD_INVOICE_TEMPLATE='1_eLfH-lIwGQaqiwivvpN_GB7FYvx5GAYlKXaST1Qits';
const VD_RECEIPT_TEMPLATE='1NwoQGJNQfP8Xy0ihkgd6z8YqyHSi2Y5J4rkJ-y1GwuM';
const VD_TZ='Asia/Kuala_Lumpur';
function vdJSON(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);}
function handleVenueDocs_(e){
 try{
  const actual=String(e.parameter.token||''),expected=PropertiesService.getScriptProperties().getProperty('VENUE_DOC_BRIDGE_SECRET')||'';
  if(!expected||actual!==expected)throw Error('Unauthorized bridge token');
  const p=JSON.parse(String(e.parameter.payload||'{}'));
  if(!/^[0-9a-f-]{36}$/i.test(String(p.documentId||'')))throw Error('Invalid document ID');
  const a=String(e.parameter.action||'');
  const v=a==='venueDocsMakeDraft'?vdMakeDraft(p):a==='venueDocsFinalize'?vdFinalize(p):a==='venueDocsSend'?vdSend(p):null;
  if(!v)throw Error('Unsupported action');
  return vdJSON({ok:true,...v});
 }catch(err){return vdJSON({ok:false,error:String(err.message||err)});}
}
function vdDate(s){if(!s)return '-';const a=String(s).slice(0,10).split('-').map(Number);return Utilities.formatDate(new Date(a[0],a[1]-1,a[2]),VD_TZ,'dd MMM yyyy');}
function vdDue(s){const a=String(s||'').slice(0,10).split('-').map(Number);return a.length===3?Utilities.formatDate(new Date(a[0],a[1]-1,a[2]-1),VD_TZ,'dd MMM yyyy'):'-';}
function vdCash(x){return (Number(x)||0).toFixed(2);}
function vdFolder(id){const it=DriveApp.getFileById(id).getParents();return it.hasNext()?it.next():DriveApp.getRootFolder();}
function vdReplace(body,k,v){body.replaceText(k.replace(/\{/g,'\\{').replace(/\}/g,'\\}'),String(v??''));}
function vdTokens(d){
 const b=d.booking||{},p=d.payload||{},i=d.invoice||{};
 const paymentDate=String(p.payment_date||i.payment_verified_at||'').slice(0,10);
 const total=Math.max(0,Number(p.rate||0)+Number(p.add_ons||0)-Number(p.discount||0)+Number(p.tax||0));
 const no=d.type==='INVOICE'?'[[DRAFT_INVOICE_NUMBER]]':String(i.document_number||'');
 const rows={
 CLIENT_NAME:p.client_name||b.company_name||b.applicant_name||'-',
 CLIENT_ADDRESS:p.client_address||'-',
 INVOICE_DATE:vdDate(Utilities.formatDate(new Date(),VD_TZ,'yyyy-MM-dd')),
 INVOICE_NO:no,
 RECEIPT_DATE:vdDate(Utilities.formatDate(new Date(),VD_TZ,'yyyy-MM-dd')),
 RECEIPT_NO:'[[DRAFT_RECEIPT_NUMBER]]',
 ROOM_NAME:p.room_name||b.room_name||'EasyLatih Training Room',
 PROGRAMME_TITLE:p.programme_title||b.programme_title||'-',
 BOOKING_REFERENCE:String(d.bookingId||'').slice(0,8).toUpperCase(),
 RENTAL_DATE:vdDate(p.booking_date||b.booking_date),
 SESSION_TYPE:p.session||b.booking_package||'Room Rental',
 RATE_CATEGORY:p.session||'Room Rental',
 START_TIME:p.start_time||String(b.start_time||'').slice(0,5),
 END_TIME:p.end_time||String(b.end_time||'').slice(0,5),
 DURATION_HOURS:p.duration||'-',
 PAX:p.participants||b.participants||'-',
 UNIT_RATE:vdCash(p.rate),QUANTITY:'1',UNIT_LABEL:'booking',
 ADD_ONS_TOTAL:vdCash(p.add_ons),DISCOUNT_AMOUNT:vdCash(p.discount),
 TAX_AMOUNT:vdCash(p.tax),TOTAL_PAYABLE:vdCash(p.total??total),
 DUE_DATE:vdDue(p.booking_date||b.booking_date),
 COMPLIMENTARY_ITEMS:p.complimentary||'Not provided for this booking',
 INVOICE_TOTAL:vdCash(i.payload?.total??p.invoice_total??total),
 AMOUNT_RECEIVED:vdCash(i.payment_amount??p.amount_received??total),
 PAYMENT_DATE:vdDate(paymentDate),
 PAYMENT_METHOD:p.payment_method||'Bank Transfer',
 TRANSACTION_REFERENCE:p.transaction_reference||i.payment_reference||'-',
 RECEIVED_FROM:p.received_from||p.client_name||'-'
 };
 return rows;
}
function vdMakeDraft(d){
 if(!['INVOICE','RECEIPT'].includes(d.type))throw Error('Unknown document type');
 const template=d.type==='INVOICE'?VD_INVOICE_TEMPLATE:VD_RECEIPT_TEMPLATE;
 const name='DRAFT - '+d.type+' - '+String(d.documentId).slice(0,8);
 const file=DriveApp.getFileById(template).makeCopy(name,vdFolder(template));
 const doc=DocumentApp.openById(file.getId());
 const rows=vdTokens(d),body=doc.getBody();
 Object.keys(rows).forEach(k=>vdReplace(body,'{{'+k+'}}',rows[k]));
 doc.saveAndClose();
 return {googleDocId:file.getId(),googleDocUrl:file.getUrl()};
}
function vdInvoiceNumber(id){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const book=SpreadsheetApp.openById(VD_SHEET_ID);
  const run=book.getSheetByName('RunningNumbers');
  if(!run)throw Error('Missing RunningNumbers tab');
  let log=book.getSheetByName('VenueInvoiceAllocation');
  if(!log){log=book.insertSheet('VenueInvoiceAllocation');log.appendRow(['DocumentId','InvoiceNo','AllocatedAt']);}
  const count=log.getLastRow();
  if(count>1){const vals=log.getRange(2,1,count-1,2).getValues();for(let x of vals){if(String(x[0])===id)return String(x[1]);}}
  const values=run.getRange(1,1,Math.max(2,run.getLastRow()),3).getValues();
  const idx=values.findIndex((x,n)=>n>0&&String(x[0]).toUpperCase()==='INVOICE');
  if(idx<0)throw Error('No INVOICE running number row');
  const month=Number(Utilities.formatDate(new Date(),VD_TZ,'MM'));
  const year=Utilities.formatDate(new Date(),VD_TZ,'yy');
  const next=(Number(values[idx][2])===month?Number(values[idx][1])||0:0)+1;
  const number='ELC'+year+'/'+String(month).padStart(2,'0')+'-'+String(next).padStart(4,'0');
  run.getRange(idx+1,2,1,2).setValues([[next,month]]);
  SpreadsheetApp.flush();
  log.appendRow([id,number,new Date()]);
  SpreadsheetApp.flush();
  return number;
 }finally{lock.releaseLock();}
}
function vdFinalize(d){
 const id=String(d.googleDocId||'');
 if(!/^[\w-]{20,}$/.test(id))throw Error('Please generate Google Docs draft first');
 if(d.type==='RECEIPT'&&!d.invoice?.payment_verified_at)throw Error('Full payment not verified');
 const number=d.type==='INVOICE'?vdInvoiceNumber(d.documentId):'RC-'+String(d.invoice?.document_number||'');
 if(number==='RC-')throw Error('Missing related invoice number');
 const source=DriveApp.getFileById(id);
 const template=d.type==='INVOICE'?VD_INVOICE_TEMPLATE:VD_RECEIPT_TEMPLATE;
 const final=source.makeCopy(d.type+' - '+number,vdFolder(template));
 const doc=DocumentApp.openById(final.getId());
 const mark=d.type==='INVOICE'?'[[DRAFT_INVOICE_NUMBER]]':'[[DRAFT_RECEIPT_NUMBER]]';
 if(doc.getBody().getText().indexOf(mark)<0)throw Error('Number placeholder missing in Google Docs Draft');
 vdReplace(doc.getBody(),mark,number);
 doc.saveAndClose();
 const folder=vdFolder(template);
 const pdf=folder.createFile(final.getAs(MimeType.PDF).setName(d.type+' - '+number+'.pdf'));
 return {number,googleDocId:final.getId(),googleDocUrl:final.getUrl(),pdfFileId:pdf.getId(),pdfUrl:pdf.getUrl()};
}
function vdSend(d){
 const to=String(d.to||''),fileId=String(d.pdfFileId||'');
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||!fileId)throw Error('Invalid email or PDF');
 const kind=d.type==='RECEIPT'?'Official Receipt':'Invoice';
 MailApp.sendEmail({
  to,
  subject:'EasyLatih '+kind+' - '+String(d.number||''),
  body:'Dear '+String(d.clientName||'Customer')+',\n\nAttached is your '+kind.toLowerCase()+' for the EasyLatih training room rental.\n\nRegards,\nEasy Latih Consultancy\nadmin@easylatih.my',
  attachments:[DriveApp.getFileById(fileId).getBlob()],
  name:'Easy Latih Consultancy',
  replyTo:'admin@easylatih.my'
 });
 return {sent:true};
}