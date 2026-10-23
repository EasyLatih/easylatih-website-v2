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
function bdMarker_(type){return type==='QUOTATION'?'[[DRAFT_QUOTATION_NUMBER]]':type==='INVOICE'?'[[DRAFT_INVOICE_NUMBER]]':'[[DRAFT_RECEIPT_NUMBER]]';}
function bdDraftName_(d){return 'DRAFT - '+bdDocTitle_(d.type)+' - '+String(d.documentId).slice(0,8);}
function bdParentFolder_(){return vdFolder(VD_INVOICE_TEMPLATE);}
function bdLineRows_(payload,type){
 const rows=Array.isArray(payload.lines)?payload.lines:[];
 const head=type==='QUOTATION'?['No.','Description','Fee (RM)','Total (RM)']:['No.','Description','Total (RM)'];
 return [head].concat(rows.map((line,i)=>{
  const q=Number(line.quantity)||0,r=Number(line.unit_price)||0;
  return type==='QUOTATION'?[String(i+1),bdText_(line.description),bdCash_(r),bdCash_(q*r)]:[String(i+1),bdText_(line.description),bdCash_(q*r)];
 }));
}
function bdBuild_(d){
 const p=d.payload||{},doc=DocumentApp.create(bdDraftName_(d)),file=DriveApp.getFileById(doc.getId()),folder=bdParentFolder_();
 folder.addFile(file);DriveApp.getRootFolder().removeFile(file);
 const body=doc.getBody();body.setMarginTop(42).setMarginBottom(42).setMarginLeft(48).setMarginRight(48);
 const title=body.appendParagraph('EASY LATIH CONSULTANCY');title.setBold(true).setFontSize(18).setForegroundColor('#000000');
 body.appendParagraph('202503030373 (JR0173505-K)\nB-62, TKT 1, JLN IM 7/1, BDR INDERA MAHKOTA 6,\n25200, KUANTAN, PAHANG\n\nTel: 09-560 4273 / 010-920 2811\nEmail: admin@easylatih.my\nWebsite: www.easylatih.my').setFontSize(9);
 body.appendParagraph(bdDocTitle_(d.type)).setHeading(DocumentApp.ParagraphHeading.HEADING1).setForegroundColor('#003e6f');
 const meta=body.appendTable([
  ['Document No.',bdMarker_(d.type)],
  ['Date',bdDate_(d.type==='RECEIPT'?p.payment_date:(d.type==='INVOICE'?p.invoice_date:p.quotation_date))],
  ['Client',bdText_(p.client_name)||'-'],
  ['Attention',bdText_(p.contact_name)||'-'],
  ['Email / Phone',(bdText_(p.client_email)||(bdText_(p.client_phone)))?bdText_(p.client_email)+' '+bdText_(p.client_phone):'-']
 ]);meta.setBorderWidth(0.5);
 if(bdText_(p.client_address))body.appendParagraph(bdText_(p.client_address)).setFontSize(9);
 body.appendParagraph(bdDocTitle_(d.type)).setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER).setSpacingBefore(14);
 body.appendParagraph(d.type==='QUOTATION'?'With reference to the above, Easy Latih Consultancy (EasyLatih) is pleased to provide you with our quotation for the following service:':d.type==='INVOICE'?'Enclosed herewith is the invoice as follows:':'Received with thanks from the client for the following payment:');
 body.appendParagraph('Title: '+(bdText_(p.project_title)||'-')).setBold(true).setSpacingBefore(12);
 if(d.type==='QUOTATION'&&p.valid_until)body.appendParagraph('Valid until: '+bdDate_(p.valid_until)).setItalic(true);
 if(bdText_(p.scope)){body.appendParagraph('Scope of work').setHeading(DocumentApp.ParagraphHeading.HEADING2);body.appendParagraph(bdText_(p.scope));}
 body.appendParagraph('Charges').setHeading(DocumentApp.ParagraphHeading.HEADING2);
 const charges=body.appendTable(bdLineRows_(p,d.type));charges.setBorderWidth(0.5);
 const calc=body.appendTable([
  ['Subtotal',bdCash_(p.subtotal)],
  ['Discount',bdCash_(p.discount)],
  ['Tax / SST',bdCash_(p.tax)],
  ['TOTAL',bdCash_(p.total)]
 ]);calc.setBorderWidth(0.5);
 if(d.type==='INVOICE')body.appendParagraph('NOTE:\n1. Please make payment with cheque or transfer to:\n\nEASY LATIH CONSULTANCY\nMAYBANK : 5562 2647 8218').setSpacingBefore(14).setBold(false);
 if(d.type==='RECEIPT'){
  body.appendParagraph('Received from: '+(bdText_(p.client_name)||'-')).setSpacingBefore(14);
  body.appendParagraph('Invoice reference: '+(bdText_(p.invoice_number)||'-'));
  body.appendParagraph('Payment reference: '+(bdText_(p.payment_reference)||'-'));
  body.appendParagraph('Amount received: '+bdCash_(p.amount_received)).setBold(true);
 }
 if(bdText_(p.notes)){body.appendParagraph('Notes').setHeading(DocumentApp.ParagraphHeading.HEADING2);body.appendParagraph(bdText_(p.notes));}
 if(d.type==='QUOTATION'){
  body.appendPageBreak();body.appendParagraph('ACCEPTANCE OF QUOTATION').setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  body.appendParagraph('We hereby confirm acceptance of this quotation and agree to the terms and conditions stipulated above.');
  const acceptance=body.appendTable([['Name:','','Designation:',''],['Signature:','','Date:',''],['Company Stamp:','','','']]);acceptance.setBorderWidth(0.5);
 }
 body.appendParagraph('Easy Latih Consultancy').setFontSize(8).setForegroundColor('#63788b').setSpacingBefore(24);
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
