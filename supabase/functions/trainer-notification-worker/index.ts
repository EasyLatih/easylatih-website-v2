import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

const url=Deno.env.get('SUPABASE_URL')!;
const serviceRole=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db=createClient(url,serviceRole,{auth:{persistSession:false}});
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const clean=(v:unknown)=>String(v??'').trim();

async function authorized(req:Request){
  const token=clean(req.headers.get('x-trainer-worker-token'));
  if(!token)return false;
  const {data,error}=await db.rpc('verify_trainer_worker_token',{candidate:token});
  return !error && data===true;
}

function emailBody(row:any){
  const portal='https://www.easylatih.my/trainer/';
  const type=clean(row.notification_type);
  const title=clean(row.payload?.title);
  const label=title?` (${title})`:'';
  let heading='Trainer Portal Update';
  let detail='There is a new update in your EasyLatih Trainer Portal.';

  if(type==='NEW_TRAINING_OPPORTUNITY'){
    heading='New Training Opportunity';
    detail=`A new training opportunity${label} matching your EasyLatih trainer profile is available.`;
  }else if(type==='OPPORTUNITY_AWARDED'){
    heading='Training Opportunity Awarded';
    detail=`Congratulations. EasyLatih has selected you for the training opportunity${label}. Please log in to the portal for the current status and next steps.`;
  }else if(type==='OPPORTUNITY_CANCELLED'){
    heading='Training Opportunity Cancelled';
    detail=`The training opportunity${label} has been cancelled. No further response is required.`;
  }else if(type==='OPPORTUNITY_CLOSED'){
    heading='Training Opportunity Closed';
    detail=`The training opportunity${label} is now closed. Thank you for your response and interest.`;
  }

  return {
    text:`${heading}\n\n${detail}\n\nPlease log in to your EasyLatih Trainer Portal for authorised details.\n\n${portal}\n\nEasyLatih`,
    html:`<!doctype html><html><body style="margin:0;background:#f5f7fa"><div style="font-family:Arial,sans-serif;max-width:620px;margin:auto;padding:32px"><div style="background:#0d3b66;color:white;padding:18px 22px;border-radius:12px 12px 0 0"><strong style="font-size:22px">EasyLatih</strong></div><div style="background:white;padding:26px 22px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 12px 12px"><h2 style="color:#0d3b66;margin-top:0">${heading}</h2><p>${detail.replace(/[<>]/g,'')}</p><p>Log in to your Trainer Portal for the authorised details.</p><p><a href="${portal}" style="display:inline-block;background:#f95f01;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Open Trainer Portal</a></p><p style="font-size:12px;color:#6b7280;margin-top:26px">Sensitive client information is not included in notification emails. Please refer to the portal for authorised details.</p></div></div></body></html>`
  };
}

Deno.serve(async(req)=>{
  if(req.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
  if(!(await authorized(req)))return json({ok:false,error:'Unauthorized'},401);

  const apiKey=clean(Deno.env.get('RESEND_API_KEY'));
  const from=clean(Deno.env.get('EASYLATIH_EMAIL_FROM'));
  const replyTo=clean(Deno.env.get('EASYLATIH_EMAIL_REPLY_TO'));
  if(!apiKey||!from)return json({ok:false,configured:false,error:'Email provider is not configured'},503);

  const {data:rows,error}=await db.from('notification_outbox').select('*').eq('delivery_status','PENDING').lt('attempts',5).order('created_at',{ascending:true}).limit(50);
  if(error)return json({ok:false,error:error.message},500);
  let sent=0,failed=0;
  for(const row of rows||[]){
    try{
      const body=emailBody(row);
      const payload:any={from,to:[row.recipient_email],subject:row.subject,text:body.text,html:body.html};
      if(replyTo)payload.reply_to=replyTo;
      const rr=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`easylatih-trainer-${row.id}`},body:JSON.stringify(payload)});
      let response:any={};try{response=await rr.json()}catch{}
      if(!rr.ok)throw new Error(clean(response?.message||response?.error)||`Resend failed ${rr.status}`);
      await db.from('notification_outbox').update({delivery_status:'SENT',sent_at:new Date().toISOString(),attempts:Number(row.attempts||0)+1,last_error:null}).eq('id',row.id);
      sent++;
    }catch(e){
      const attempts=Number(row.attempts||0)+1;
      await db.from('notification_outbox').update({delivery_status:attempts>=5?'FAILED':'PENDING',attempts,last_error:e instanceof Error?e.message:String(e)}).eq('id',row.id);
      failed++;
    }
  }
  return json({ok:true,processed:(rows||[]).length,sent,failed});
});
