import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const url=Deno.env.get("SUPABASE_URL")||"";
const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const scriptUrl=Deno.env.get("VENUE_DOCS_SCRIPT_URL")||"";
const scriptSecret=Deno.env.get("VENUE_DOCS_SECRET")||"";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
const res=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:CORS});
const uuid=(value:unknown)=>typeof value==="string"&&/^[0-9a-f-]{36}$/i.test(value);
const message=(error:unknown)=>error instanceof Error?error.message:String(error);
const totalOf=(doc:any)=>Number(doc?.payload?.total);

async function bridge(action:string,body:Record<string,unknown>){
 if(!scriptUrl||!scriptSecret)throw new Error("Google Docs connection is not configured.");
 const form=new URLSearchParams({action:"businessDocs"+action,token:scriptSecret,payload:JSON.stringify(body)});
 const response=await fetch(scriptUrl,{method:"POST",body:form,redirect:"follow",signal:AbortSignal.timeout(50000)});
 const text=await response.text();if(!response.ok)throw new Error("Google Apps Script returned HTTP "+response.status);
 let data:Record<string,unknown>;try{data=JSON.parse(text)}catch{throw new Error("Google Apps Script returned an invalid response.");}
 if(!data.ok)throw new Error(String(data.error||"Google document action failed"));return data;
}

Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:CORS});
 if(request.method!=="POST")return res(405,{ok:false,error:"Method not allowed"});
 try{
  const token=(request.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"");if(!token)return res(401,{ok:false,error:"Admin login required"});
  const auth=createClient(url,anon);const identity=await auth.auth.getUser(token);const user=identity.data.user;
  if(identity.error||!user||user.app_metadata?.role!=="admin")return res(403,{ok:false,error:"Admin access required"});
  const db=createClient(url,serviceKey);const input=await request.json();const action=String(input?.action||"");
  if(action==="connection_status")return res(200,{ok:true,bridgeConfigured:Boolean(scriptUrl&&scriptSecret)});
  const documentId=input?.documentId;if(!uuid(documentId))return res(400,{ok:false,error:"Invalid document ID"});
  const found=await db.from("billing_documents").select("*").eq("id",documentId).single();if(found.error||!found.data)return res(404,{ok:false,error:"Document not found"});
  const doc=found.data as any;
  const parent=doc.parent_document_id?(await db.from("billing_documents").select("*").eq("id",doc.parent_document_id).single()).data:null;
  const shared={documentId:doc.id,type:doc.document_type,category:doc.service_category,payload:doc.payload,document:doc,parent};
  if(action==="draft"){
   if(doc.status!=="DRAFT")return res(409,{ok:false,error:"Finalized documents cannot be regenerated"});
   if(doc.google_doc_id)return res(200,{ok:true,googleDocId:doc.google_doc_id,googleDocUrl:doc.google_doc_url});
   const made=await bridge("MakeDraft",shared);const saved=await db.from("billing_documents").update({google_doc_id:made.googleDocId,google_doc_url:made.googleDocUrl,updated_at:new Date().toISOString()}).eq("id",doc.id).eq("status","DRAFT");if(saved.error)throw saved.error;
   return res(200,{ok:true,googleDocId:made.googleDocId,googleDocUrl:made.googleDocUrl});
  }
  if(action==="finalize"){
   if(doc.status==="FINAL")return res(200,{ok:true,number:doc.document_number,pdfUrl:doc.pdf_url,googleDocUrl:doc.google_doc_url});
   if(doc.status!=="DRAFT")return res(409,{ok:false,error:"Only a draft can be finalized"});
   let draftId=doc.google_doc_id;if(!draftId){const made=await bridge("MakeDraft",shared);draftId=String(made.googleDocId);const saved=await db.from("billing_documents").update({google_doc_id:draftId,google_doc_url:made.googleDocUrl}).eq("id",doc.id).eq("status","DRAFT");if(saved.error)throw saved.error;}
   const made=await bridge("Finalize",{...shared,googleDocId:draftId});if(!made.number||!made.pdfFileId)throw new Error("Google Docs did not return a finalized PDF.");
   const saved=await db.from("billing_documents").update({status:"FINAL",document_number:made.number,google_doc_id:made.googleDocId,google_doc_url:made.googleDocUrl,pdf_file_id:made.pdfFileId,pdf_url:made.pdfUrl,finalized_at:new Date().toISOString(),finalized_by:user.id,updated_at:new Date().toISOString()}).eq("id",doc.id).eq("status","DRAFT");if(saved.error)throw saved.error;
   return res(200,{ok:true,number:made.number,pdfUrl:made.pdfUrl,googleDocUrl:made.googleDocUrl});
  }
  if(action==="accept"){
   if(doc.document_type!=="QUOTATION"||doc.status!=="FINAL")return res(409,{ok:false,error:"Only a finalized quotation can be accepted"});
   if(doc.accepted_at)return res(200,{ok:true,accepted:true});
   const saved=await db.from("billing_documents").update({accepted_at:new Date().toISOString(),accepted_by:user.id,updated_at:new Date().toISOString()}).eq("id",doc.id).eq("status","FINAL").is("accepted_at",null);if(saved.error)throw saved.error;return res(200,{ok:true,accepted:true});
  }
  if(action==="create_invoice"){
   if(doc.document_type!=="QUOTATION"||doc.status!=="FINAL"||!doc.accepted_at)return res(409,{ok:false,error:"Invoice requires an accepted quotation"});
   const created=await db.from("billing_documents").insert({service_category:doc.service_category,document_type:"INVOICE",parent_document_id:doc.id,payload:{...doc.payload,quotation_number:doc.document_number,invoice_date:new Date().toISOString().slice(0,10)}}).select().single();if(created.error)throw created.error;return res(200,{ok:true,document:created.data});
  }
  if(action==="verify_payment"){
   const amount=Number(input.amount),reference=String(input.reference||"").trim(),total=totalOf(doc);
   if(doc.document_type!=="INVOICE"||doc.status!=="FINAL"||!Number.isFinite(total)||total<=0||!Number.isFinite(amount)||amount<total||reference.length<1||reference.length>180)return res(400,{ok:false,error:"Enter a valid full payment amount and payment reference."});
   if(doc.payment_verified_at)return res(409,{ok:false,error:"Payment already verified"});
   const saved=await db.from("billing_documents").update({payment_verified_at:new Date().toISOString(),payment_reference:reference,payment_amount:amount,updated_at:new Date().toISOString()}).eq("id",doc.id).eq("status","FINAL").is("payment_verified_at",null);if(saved.error)throw saved.error;return res(200,{ok:true,paid:true});
  }
  if(action==="create_receipt"){
   if(doc.document_type!=="INVOICE"||doc.status!=="FINAL"||!doc.payment_verified_at)return res(409,{ok:false,error:"Receipt requires a paid invoice"});
   const created=await db.from("billing_documents").insert({service_category:doc.service_category,document_type:"RECEIPT",parent_document_id:doc.id,payload:{...doc.payload,invoice_number:doc.document_number,amount_received:doc.payment_amount,payment_reference:doc.payment_reference,payment_date:String(doc.payment_verified_at).slice(0,10)}}).select().single();if(created.error)throw created.error;return res(200,{ok:true,document:created.data});
  }
  if(action==="void"){
   const reason=String(input.reason||"").trim();if(doc.document_type!=="INVOICE"||doc.status!=="FINAL"||doc.payment_verified_at)return res(409,{ok:false,error:"Only an unpaid finalized invoice can be voided"});if(reason.length<3||reason.length>500)return res(400,{ok:false,error:"A void reason is required"});
   const saved=await db.from("billing_documents").update({status:"VOID",voided_at:new Date().toISOString(),voided_by:user.id,void_reason:reason,updated_at:new Date().toISOString()}).eq("id",doc.id).eq("status","FINAL").is("payment_verified_at",null);if(saved.error)throw saved.error;return res(200,{ok:true,voided:true});
  }
  if(action==="send"){
   if(doc.status!=="FINAL"||!doc.pdf_file_id||!doc.document_number)return res(409,{ok:false,error:"Finalize the document first"});const email=String(doc.payload?.client_email||"");if(!email)return res(400,{ok:false,error:"Client email is missing"});await bridge("Send",{...shared,to:email,pdfFileId:doc.pdf_file_id,number:doc.document_number,clientName:doc.payload?.contact_name||doc.payload?.client_name});const saved=await db.from("billing_documents").update({sent_at:new Date().toISOString()}).eq("id",doc.id);if(saved.error)throw saved.error;return res(200,{ok:true,sentTo:email});
  }
  return res(400,{ok:false,error:"Unsupported action"});
 }catch(error){return res(400,{ok:false,error:message(error)});}
});
