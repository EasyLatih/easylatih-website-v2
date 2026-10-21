import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
const url=Deno.env.get("SUPABASE_URL")||"";
const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const scriptUrl=Deno.env.get("VENUE_DOCS_SCRIPT_URL")||"";
const scriptSecret=Deno.env.get("VENUE_DOCS_SECRET")||"";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const res=(s:number,v:Record<string,unknown>)=>new Response(JSON.stringify(v),{status:s,headers:CORS});
const isUuid=(s:unknown)=>typeof s==="string"&&/^[0-9a-f-]{36}$/i.test(s);
function cleanMessage(e:unknown){return e instanceof Error?e.message:String(e);}
async function googleBridge(action:string,body:Record<string,unknown>) {
 if(!scriptUrl||!scriptSecret)throw new Error("Google Docs connection is not configured. Set VENUE_DOCS_SCRIPT_URL and VENUE_DOCS_SECRET, and deploy the Apps Script bridge.");
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(scriptUrl))throw new Error("Invalid configured Google Apps Script URL.");
 const form=new URLSearchParams({action:"venueDocs"+action,token:scriptSecret,payload:JSON.stringify(body)});
 const response=await fetch(scriptUrl,{method:"POST",body:form,redirect:"follow",signal:AbortSignal.timeout(50000)});
 const txt=await response.text();
 if(!response.ok)throw new Error("Google Apps Script returned HTTP "+response.status);
 let value:Record<string,unknown>;
 try{value=JSON.parse(txt);}catch{throw new Error("Google Apps Script returned an invalid response. Check the deployed Web App routing.");}
 if(!value.ok)throw new Error(String(value.error||"Google document action failed"));
 return value;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(req.method!=="POST")return res(405,{ok:false,error:"Method not allowed"});
 try{
  const auth=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");
  if(!auth)return res(401,{ok:false,error:"Admin login required"});
  const client=createClient(url,anon);
  const userResult=await client.auth.getUser(auth);
  const user=userResult.data.user;
  if(userResult.error||!user||user.app_metadata?.role!=="admin")return res(403,{ok:false,error:"Admin access required"});
  const db=createClient(url,serviceKey);
  const input=await req.json();
  const id=input?.documentId,action=String(input?.action||"");
  if(action==="connection_status")return res(200,{
   ok:true,templatesReady:true,bridgeConfigured:Boolean(scriptUrl&&scriptSecret),
   message:(scriptUrl&&scriptSecret)?"Google Apps Script credentials configured (requires live test).":
     "Google Apps Script not yet activated. Draft preview remains available."
  });
  if(!isUuid(id))return res(400,{ok:false,error:"Invalid document ID"});
  const rr=await db.from("venue_documents").select("*,venue_bookings(*)").eq("id",id).single();
  if(rr.error||!rr.data)return res(404,{ok:false,error:"Invoice or receipt draft not found"});
  const doc=rr.data,booking=doc.venue_bookings;
  if(!booking)return res(404,{ok:false,error:"Related booking not found"});
  const isReceipt=doc.document_type==="RECEIPT";
  const ids:string[]=Array.isArray(doc.booking_ids)&&doc.booking_ids.length?doc.booking_ids:[doc.booking_id];
  if(ids.length>31||new Set(ids).size!==ids.length||!ids.includes(doc.booking_id))
   return res(400,{ok:false,error:"Invalid list of dates"});
  const linkedResult=await db.from("venue_bookings").select("*").in("id",ids);
  if(linkedResult.error||linkedResult.data?.length!==ids.length)
   return res(409,{ok:false,error:"Some booking dates are missing"});
  const linked=(linkedResult.data||[]).sort((a:any,b:any)=>String(a.booking_date).localeCompare(String(b.booking_date)));
  const anchor=linked.find((v:any)=>v.id===doc.booking_id);
  const dayMillis=(s:string)=>Date.parse(s+"T12:00:00Z");
  if(!anchor||linked.some((v:any,i:number)=>v.room_id!==anchor.room_id||
     String(v.applicant_email).toLowerCase()!==String(anchor.applicant_email).toLowerCase()||
     ["REJECTED","CANCELLED"].includes(v.status)||
     (i>0&&dayMillis(v.booking_date)-dayMillis(linked[i-1].booking_date)!==86400000)))
   return res(409,{ok:false,error:"Bookings must be consecutive dates for one customer and room."});
  if(!isReceipt&&linked.length>1){
   const lines=doc.payload?.lines;
   if(!Array.isArray(lines)||lines.length!==linked.length)
    return res(400,{ok:false,error:"Every selected date needs its own rental line."});
   for(let i=0;i<linked.length;i++){
    const b=linked[i],line=lines[i];
    if(!line||line.booking_id!==b.id||line.booking_date!==b.booking_date||
      String(line.start_time).slice(0,5)!==String(b.start_time).slice(0,5)||
      String(line.end_time).slice(0,5)!==String(b.end_time).slice(0,5)||
      !Number.isFinite(Number(line.rate))||Number(line.rate)<0)
     return res(400,{ok:false,error:"Date, time or daily charge does not match the saved booking."});
   }
   const rounded=(n:number)=>Math.round((n+Number.EPSILON)*100);
   const rateSum=lines.reduce((n:number,l:any)=>n+Number(l.rate),0);
   const fullTotal=rateSum+Number(doc.payload.add_ons||0)-Number(doc.payload.discount||0)+Number(doc.payload.tax||0);
   if(rounded(rateSum)!==rounded(Number(doc.payload.rate))||
      rounded(Math.max(0,fullTotal))!==rounded(Number(doc.payload.total)))
    return res(400,{ok:false,error:"Invoice total does not match the daily rental breakdown."});
  }
  let invoice:any=null;
  if(isReceipt){
   const q=await db.from("venue_documents").select("*").eq("booking_id",doc.booking_id).eq("document_type","INVOICE").single();
   if(q.error||!q.data||q.data.status!=="FINAL")return res(409,{ok:false,error:"Finalize the invoice before preparing a receipt"});
   invoice=q.data;
   if(!invoice.payment_verified_at)return res(409,{ok:false,error:"Full payment must be verified before issuing a receipt"});
  }
  const shared={documentId:doc.id,bookingId:doc.booking_id,bookingIds:ids,type:doc.document_type,payload:doc.payload,booking,bookings:linked,invoice};
  if(action==="draft"){
   if(doc.status!=="DRAFT")return res(409,{ok:false,error:"Finalized documents cannot be regenerated"});
   if(doc.google_doc_id)return res(200,{ok:true,googleDocId:doc.google_doc_id,googleDocUrl:doc.google_doc_url});
   const r=await googleBridge("MakeDraft",shared);
   const q=await db.from("venue_documents").update({google_doc_id:r.googleDocId,google_doc_url:r.googleDocUrl,updated_at:new Date().toISOString()})
    .eq("id",id).eq("status","DRAFT").select().single();
   if(q.error)throw q.error;
   return res(200,{ok:true,googleDocId:r.googleDocId,googleDocUrl:r.googleDocUrl});
  }
  if(action==="finalize"){
   if(doc.status==="FINAL")return res(200,{ok:true,number:doc.document_number,pdfUrl:doc.pdf_url,googleDocUrl:doc.google_doc_url});
   if(doc.status!=="DRAFT")return res(409,{ok:false,error:"Invalid invoice status"});
   let draftId=doc.google_doc_id;
   if(!draftId){
    const d=await googleBridge("MakeDraft",shared);
    draftId=String(d.googleDocId);
    const saved=await db.from("venue_documents").update({google_doc_id:draftId,google_doc_url:d.googleDocUrl}).eq("id",id).eq("status","DRAFT");
    if(saved.error)throw saved.error;
   }
   const r=await googleBridge("Finalize",{...shared,googleDocId:draftId});
   if(!r.number||!r.pdfFileId)throw new Error("Google Docs did not return a finalized PDF.");
   const saved=await db.from("venue_documents").update({
    status:"FINAL",document_number:r.number,google_doc_id:r.googleDocId,
    google_doc_url:r.googleDocUrl,pdf_file_id:r.pdfFileId,pdf_url:r.pdfUrl,
    finalized_at:new Date().toISOString(),finalized_by:user.id,updated_at:new Date().toISOString()
   }).eq("id",id).eq("status","DRAFT").select().single();
   if(saved.error)throw saved.error;
   return res(200,{ok:true,number:r.number,pdfUrl:r.pdfUrl,googleDocUrl:r.googleDocUrl});
  }
  if(action==="verify_payment"){
   if(isReceipt||doc.status!=="FINAL")return res(409,{ok:false,error:"Finalize the invoice first."});
   const amount=Number(input.amount),total=Number(doc.payload?.total);
   const reference=String(input.reference||"").trim();
   if(!Number.isFinite(total)||total<=0||!Number.isFinite(amount)||amount<total||!reference||reference.length>180)
    return res(400,{ok:false,error:"Verify a valid reference and full payment equal to or greater than the invoice total."});
   if(doc.payment_verified_at)return res(409,{ok:false,error:"Payment has already been verified."});
   const saved=await db.from("venue_documents").update({payment_verified_at:new Date().toISOString(),payment_reference:reference,payment_amount:amount,updated_at:new Date().toISOString()}).eq("id",id).eq("status","FINAL").is("payment_verified_at",null).select().single();
   if(saved.error)throw saved.error;
   return res(200,{ok:true,paid:true});
  }
  if(action==="send"){
   if(doc.status!=="FINAL"||!doc.pdf_file_id||!doc.document_number)return res(409,{ok:false,error:"Finalize the PDF before sending."});
   const recipient=String(booking.applicant_email||"");
   if(!recipient)return res(400,{ok:false,error:"Customer email is missing"});
   await googleBridge("Send",{...shared,to:recipient,pdfFileId:doc.pdf_file_id,number:doc.document_number,clientName:doc.payload?.client_name||booking.applicant_name});
   const saved=await db.from("venue_documents").update({sent_at:new Date().toISOString()}).eq("id",id);
   if(saved.error)throw saved.error;
   return res(200,{ok:true,sentTo:recipient});
  }
  return res(400,{ok:false,error:"Unsupported action"});
 }catch(err){return res(400,{ok:false,error:cleanMessage(err)});}
});