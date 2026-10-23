/**
 * EasyLatih Consultancy / Business Documents bridge.
 * Requires VenueDocumentsBridge.gs in the same Apps Script project because it
 * reuses VD_SHEET_ID, VD_TZ, VD_INVOICE_TEMPLATE, vdFolder_ and vdInvoiceNumber.
 *
 * Add this route to the existing doPost(e), before its normal fallback:
 * if (e && e.parameter && String(e.parameter.action||'').indexOf('businessDocs')===0)
 *   return handleBusinessDocs_(e);
 */
function handleBusinessDocs_(e){
 try{
  const actual=String(e.parameter.token||''),expected=PropertiesService.getScriptProperties().getProperty('VENUE_DOC_BRIDGE_SECRET')||'';
  if(!expected||actual!==expected)throw Error('Unauthorized bridge token');
  const p=JSON.parse(String(e.parameter.payload||'{}'));
  if(!/^[0-9a-f-]{36}$/i.test(String(p.documentId||'')))throw Error('Invalid document ID');
  const a=String(e.parameter.action||'');
  const v=a==='businessDocsMakeDraft'?bdMakeDraft_(p):a==='businessDocsFinalize'?bdFinalize_(p):a==='businessDocsSend'?bdSend_(p):null;
  if(!v)throw Error('Unsupported action');
  return vdJSON(v);
 }catch(err){return vdJSON({ok:false,error:String(err.message||err)});}
}
function bdText_(v){return String(v??'').trim();}
function bdCash_(v){return 'RM '+(Number(v)||0).toFixed(2);}
function bdDate_(v){return vdDate(v)||'-';}
function bdDocTitle_(type){return type==='QUOTATION'?'QUOTATION':type==='INVOICE'?'INVOICE':'OFFICIAL RECEIPT';}
const BD_TEMPLATE_IDS_={
 QUOTATION:'1w2N_noQgkB3QU6Kdx_Bx8jU1Vho_j57O4TFGEkSLC4s',
 INVOICE:'1VlGTpfv5B30GF24Yi29yiqg_d3IUrtjxID68A64GFR4',
 RECEIPT:'1n4oWxH_TTBb3i8zhsk2KxWcbB5FfJmanGL8AJ0QCGBA'
};
function bdTemplateId_(type){
 const custom=PropertiesService.getScriptProperties().getProperty('BD_'+String(type)+'_TEMPLATE_ID');
 const id=custom||BD_TEMPLATE_IDS_[String(type)];if(!/^[\w-]{20,}$/.test(String(id||'')))throw Error('Missing '+type+' master template');return id;
}
function bdMarker_(type){return type==='QUOTATION'?'{{QUOTATION_NO}}':type==='INVOICE'?'{{INVOICE_NO}}':'{{RECEIPT_NO}}';}
function bdDraftName_(d){return 'DRAFT - '+bdDocTitle_(d.type)+' - '+String(d.documentId).slice(0,8);}
function bdParentFolder_(){return vdFolder(VD_INVOICE_TEMPLATE);}
function bdLines_(payload){
 const rows=Array.isArray(payload.lines)?payload.lines.filter(x=>bdText_(x&&x.description)):[];
 return rows.length?rows:[{description:bdText_(payload.project_title)||'Consultancy service',quantity:1,unit_price:Number(payload.total)||0}];
}
function bdChargeTable_(body){
 const tables=body.getTables();
 for(let i=0;i<tables.length;i++)if(tables[i].getNumRows()>=3&&bdText_(tables[i].getCell(0,0).getText())==='No.')return tables[i];
 throw Error('Charges table is missing from the master template');
}
function bdCellText_(cell,value){cell.clear();cell.appendParagraph(String(value||'-'));}
function bdFillChargeTable_(body,p){
 const lines=bdLines_(p),table=bdChargeTable_(body),many=lines.length>1;
 const descriptions=lines.map((line,i)=>{
  const qty=Number(line.quantity)||0,prefix=many?(i+1)+'. ':'';
  return prefix+bdText_(line.description)+'\nQty: '+qty;
 }).join('\n\n');
 const rates=lines.map(line=>bdCash_(line.unit_price)).join('\n\n');
 const amounts=lines.map(line=>bdCash_((Number(line.quantity)||0)*(Number(line.unit_price)||0))).join('\n\n');
 bdCellText_(table.getCell(1,0),lines.map((_,i)=>(i+1)+'.').join('\n\n'));
 vdReplace(body,'{{SERVICE_TITLE}}',bdText_(p.project_title)||'Consultancy service');
 vdReplace(body,'{{SERVICE_DESCRIPTION}}',descriptions);
 vdReplace(body,'{{SERVICE_MODE}}',bdText_(p.mode)||'As agreed with client');
 vdReplace(body,'{{UNIT_FEE}}',rates);
 vdReplace(body,'{{LINE_TOTAL}}',amounts);
 vdReplace(body,'{{TOTAL_AMOUNT}}',bdCash_(p.total));
}
function bdBuild_(d){
 const p=d.payload||{},folder=bdParentFolder_(),template=DriveApp.getFileById(bdTemplateId_(d.type)),file=template.makeCopy(bdDraftName_(d),folder),doc=DocumentApp.openById(file.getId()),body=doc.getBody();
 const date=d.type==='RECEIPT'?p.payment_date:(d.type==='INVOICE'?p.invoice_date:p.quotation_date);
 const values={
  '{{CLIENT_NAME}}':bdText_(p.client_name)||'-',
  '{{CLIENT_ADDRESS}}':bdText_(p.client_address)||'-',
  '{{DATE}}':bdDate_(date),
  '{{SCOPE_OF_WORK}}':bdText_(p.scope)||'The scope of work is as stated in the service description above.',
  '{{NOTES}}':bdText_(p.notes),
  '{{PAYMENT_TERMS}}':bdText_(p.payment_terms)||'Payment is due in accordance with the accepted quotation.',
  '{{PAYMENT_DATE}}':bdDate_(p.payment_date),
  '{{PAYMENT_METHOD}}':bdText_(p.payment_method)||'Bank transfer',
  '{{PAYMENT_REFERENCE}}':bdText_(p.payment_reference)||'-',
  '{{AMOUNT_RECEIVED}}':bdCash_(p.amount_received||p.total)
 };
 Object.keys(values).forEach(key=>vdReplace(body,key,values[key]));bdFillChargeTable_(body,p);
 doc.saveAndClose();return {googleDocId:file.getId(),googleDocUrl:file.getUrl()};
}
function bdMakeDraft_(d){if(!['QUOTATION','INVOICE','RECEIPT'].includes(String(d.type||'')))throw Error('Unknown document type');return {ok:true,...bdBuild_(d)};}
function bdQuoteNumber_(id){
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const book=SpreadsheetApp.openById(VD_SHEET_ID),run=book.getSheetByName('RunningNumbers');if(!run)throw Error('Missing RunningNumbers tab');
  let log=book.getSheetByName('QuotationAllocation');if(!log){log=book.insertSheet('QuotationAllocation');log.appendRow(['DocumentId','QuotationNo','AllocatedAt']);}
  if(log.getLastRow()>1){const vals=log.getRange(2,1,log.getLastRow()-1,2).getValues();for(let row of vals)if(String(row[0])===String(id))return String(row[1]);}
  const vals=run.getRange(1,1,Math.max(2,run.getLastRow()),3).getValues();let idx=vals.findIndex((x,n)=>n>0&&String(x[0]).toUpperCase()==='QUOTATION');
  const month=Number(Utilities.formatDate(new Date(),VD_TZ,'MM')),year=Utilities.formatDate(new Date(),VD_TZ,'yy');
  if(idx<0){run.appendRow(['QUOTATION',0,month]);idx=run.getLastRow()-1;}
  const last=run.getRange(idx+1,2,1,2).getValues()[0],next=(Number(last[1])===month?Number(last[0])||0:0)+1;
  run.getRange(idx+1,2,1,2).setValues([[next,month]]);log.appendRow([id,'QUO'+year+'/'+String(month).padStart(2,'0')+'-'+String(next).padStart(4,'0'),new Date()]);return 'QUO'+year+'/'+String(month).padStart(2,'0')+'-'+String(next).padStart(4,'0');
 }finally{lock.releaseLock();}
}
function bdFinalize_(d){
 const draft=String(d.googleDocId||'');if(!/^[\w-]{20,}$/.test(draft))throw Error('Generate Google Docs draft first');
 const type=String(d.type||''),source=DocumentApp.openById(draft),marker=bdMarker_(type);if(source.getBody().getText().indexOf(marker)<0)throw Error('Draft marker is missing; regenerate the draft.');
 const number=type==='QUOTATION'?bdQuoteNumber_(d.documentId):type==='INVOICE'?vdInvoiceNumber(d.documentId):'RC-'+String(d.parent?.document_number||'');if(number==='RC-')throw Error('Missing invoice number');
 const original=DriveApp.getFileById(draft),final=original.makeCopy(bdDocTitle_(type)+' - '+number,bdParentFolder_()),doc=DocumentApp.openById(final.getId());vdReplace(doc.getBody(),marker,number);doc.saveAndClose();
 const pdf=bdParentFolder_().createFile(final.getAs(MimeType.PDF).setName(bdDocTitle_(type)+' - '+number+'.pdf'));
 return {ok:true,number:number,googleDocId:final.getId(),googleDocUrl:final.getUrl(),pdfFileId:pdf.getId(),pdfUrl:pdf.getUrl()};
}
function bdSend_(d){
 const to=bdText_(d.to),file=bdText_(d.pdfFileId);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||!file)throw Error('Invalid email or PDF');
 const kind=bdDocTitle_(d.type);MailApp.sendEmail({to:to,subject:'EasyLatih '+kind+' - '+bdText_(d.number),body:'Dear '+(bdText_(d.clientName)||'Customer')+',\n\nAttached is your '+kind.toLowerCase()+'.\n\nRegards,\nEasy Latih Consultancy\nadmin@easylatih.my',attachments:[DriveApp.getFileById(file).getBlob()],name:'Easy Latih Consultancy',replyTo:'admin@easylatih.my'});return {ok:true,sent:true};
}
