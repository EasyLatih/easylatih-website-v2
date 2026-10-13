import { createClient } from 'npm:@supabase/supabase-js@2.111.0';

type QueueRow = {
  id: string; booking_id: string; notification_kind:
  'NEW_ADMIN' | 'RECEIVED_CUSTOMER' | 'CONFIRMED_CUSTOMER' | 'REJECTED_CUSTOMER' | 'CANCELLED_CUSTOMER';
};
type Booking = {
  id:string; applicant_name:string; company_name:string; applicant_email:string;
  applicant_phone:string; programme_title:string; participants:number;
  booking_date:string; start_time:string; end_time:string; notes:string;
  status:string; booking_package:string|null; estimated_price:number|null; venue_rooms:{name:string} | {name:string}[] | null;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const FROM = Deno.env.get('EASYLATIH_EMAIL_FROM') || 'EasyLatih <noreply@easylatih.my>';
const REPLY_TO = Deno.env.get('EASYLATIH_EMAIL_REPLY_TO') || 'sales@easylatih.my';
const ADMIN_INBOX = 'sales@easylatih.my';
const json = (result:unknown,status=200) => new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json; charset=utf-8'}});
const clean = (x:unknown) => String(x??'').trim();
const escapeHtml=(x:unknown)=>clean(x).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c] || c));
const db=createClient(SUPABASE_URL,SERVICE_ROLE,{auth:{persistSession:false,autoRefreshToken:false}});
const dateMY=(s:string) => {
  const d = new Date(s+'T12:00:00+08:00');
  return isNaN(d.getTime())?s:new Intl.DateTimeFormat('en-MY',{timeZone:'Asia/Kuala_Lumpur',day:'numeric',month:'long',year:'numeric'}).format(d);
};
function emailFor(row:QueueRow, b:Booking) {
  const room=Array.isArray(b.venue_rooms) ? (b.venue_rooms[0]?.name??'Training room') : (b.venue_rooms?.name??'Training room');
  const ref=b.id.slice(0,8).toUpperCase();
  const details=[
    ['Reference',ref],['Applicant',b.applicant_name],['Organisation',b.company_name||'—'],
    ['Programme / event',b.programme_title],['Room',room],['Date',dateMY(b.booking_date)],
    ['Time',clean(b.start_time).slice(0,5)+' – '+clean(b.end_time).slice(0,5)],
    ['Participants',String(b.participants)],
    ['Rental Package',b.booking_package==='HALF_DAY'?'Half Day':b.booking_package==='FULL_DAY'?'Full Day':b.booking_package==='NIGHT'?'Evening (hourly)':'To be confirmed'],
    ['Estimated Rental Fee',b.estimated_price==null?'To be confirmed':'RM'+Number(b.estimated_price).toFixed(2)+' (excluding optional add-ons)']
  ];
  let recipient=b.applicant_email;
  let subject='',heading='',message='';
  if(row.notification_kind==='NEW_ADMIN') {
    recipient=ADMIN_INBOX;
    subject='New venue booking enquiry – '+b.programme_title.slice(0,95);
    heading='New training room enquiry';
    message='A customer has submitted a new booking request. Review it in the EasyLatih Venue Booking Admin Dashboard.';
    details.push(['Email',b.applicant_email],['Phone',b.applicant_phone],['Notes',b.notes||'—']);
  } else if(row.notification_kind==='RECEIVED_CUSTOMER'){
    subject='EasyLatih: Booking request received ('+ref+')';
    heading='We have received your booking request';
    message='Thank you for your interest in our training room. This is an acknowledgement only, NOT a confirmed booking. Our team will contact you after reviewing your request and rental requirements.';
  } else if(row.notification_kind==='CONFIRMED_CUSTOMER'){
    subject='EasyLatih: Training room booking confirmed ('+ref+')';
    heading='Your room booking is confirmed';
    message='We are pleased to confirm your training room reservation. For payment arrangements or any additional requirements, please contact our team.';
  } else if(row.notification_kind==='REJECTED_CUSTOMER'){
    subject='EasyLatih: Update on your booking request ('+ref+')';
    heading='Booking request update';
    message='Unfortunately, we are unable to approve the requested booking. Please contact EasyLatih if you would like to explore alternative dates or arrangements.';
  } else if(row.notification_kind==='CANCELLED_CUSTOMER'){
    subject='EasyLatih: Room booking cancellation ('+ref+')';
    heading='Booking cancellation notice';
    message='Your previously confirmed venue booking has been cancelled. Please contact our team if you need clarification or a new booking date.';
  } else throw new Error('Unsupported notification type');
  const table=details.map(([key,val])=>'<tr><th align="left" style="padding:9px;border-bottom:1px solid #e5ebf1;color:#5c6f7e;width:145px">'+escapeHtml(key)+'</th><td style="padding:9px;border-bottom:1px solid #e5ebf1">'+escapeHtml(val)+'</td></tr>').join('');
  const html='<!doctype html><html lang="en"><body style="margin:0;padding:26px 12px;background:#f1f5f8;font-family:Arial,sans-serif;color:#253b50"><div style="max-width:620px;margin:0 auto;background:white;border-radius:14px;overflow:hidden;border:1px solid #dee6ed"><div style="background:#003e6f;padding:22px 25px;color:white"><strong style="font-size:22px">EasyLatih</strong><div style="font-size:12px;opacity:.85;margin-top:4px">Easy Learning, Real Results!</div></div><div style="padding:26px"><h2 style="margin:0 0 14px;color:#003e6f">'+escapeHtml(heading)+'</h2><p style="line-height:1.7">'+escapeHtml(message)+'</p><table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">'+table+'</table><p style="line-height:1.6">Questions? Email <a href="mailto:sales@easylatih.my">sales@easylatih.my</a> or WhatsApp <a href="https://wa.me/60109202811">+60 10 920 2811</a>.</p><p style="color:#687d8f;font-size:12px;margin-top:25px">Easy Latih Consultancy · Kuantan, Pahang</p></div></div></body></html>';
  const text=[heading,'',message,'',...details.map(([k,v])=>k+': '+v),'','Questions? sales@easylatih.my | +60 10 920 2811','Easy Latih Consultancy'].join('\n');
  return {recipient,subject,html,text};
}

Deno.serve(async (req:Request)=>{
  if(req.method!=='POST')return json({ok:false,error:'Method not allowed'},405);
  if(!SUPABASE_URL||!SERVICE_ROLE)return json({ok:false,error:'Storage not configured'},503);
  const token=clean(req.headers.get('x-venue-mailer-token'));
  if(!token)return json({ok:false,error:'Unauthorized'},401);
  const {data:valid,error:authError}=await db.rpc('venue_verify_mailer_token',{p_token:token});
  if(authError||valid!==true)return json({ok:false,error:'Unauthorized'},401);
  if(!RESEND_API_KEY||!FROM)return json({ok:false,error:'Email provider not configured'},503);
  let input:unknown=null;
  try{input=await req.json();}catch{return json({ok:false,error:'Invalid JSON'},400);}
  const bookingId=typeof input==='object' && input!==null && 'booking_id' in input ? (input as {booking_id:unknown}).booking_id : null;
  if(bookingId!==null && (typeof bookingId!=='string'||!/^[a-f0-9-]{36}$/i.test(bookingId))){
    return json({ok:false,error:'Invalid booking id'},400);
  }
  const {data:queue,error:claimError}=await db.rpc('venue_claim_mail_queue',{p_booking_id:bookingId,p_limit:20});
  if(claimError)return json({ok:false,error:'Unable to claim notifications'},503);
  let sent=0,failed=0;
  for(const row of (queue??[]) as QueueRow[]){
    try{
      const {data:booking,error:bookingError}=await db.from('venue_bookings')
        .select('id,applicant_name,company_name,applicant_email,applicant_phone,programme_title,participants,booking_date,start_time,end_time,notes,status,booking_package,estimated_price,venue_rooms(name)')
        .eq('id',row.booking_id).single();
      if(bookingError||!booking)throw new Error('Booking information unavailable');
      const msg=emailFor(row,booking as Booking);
      const response=await fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{'Authorization':'Bearer '+RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'easylatih-venue-'+row.id},
        body:JSON.stringify({from:FROM,to:[msg.recipient],reply_to:REPLY_TO,subject:msg.subject,html:msg.html,text:msg.text})
      });
      const out=await response.json().catch(()=>({})) as {message?:string};
      if(!response.ok)throw new Error('Email provider HTTP '+response.status+': '+clean(out.message).slice(0,160));
      const {error:finishError}=await db.rpc('venue_finish_mail',{p_id:row.id,p_success:true,p_error:null});
      if(finishError)throw new Error('Queue status update failed');
      sent++;
    }catch(e){
      const errorMessage=e instanceof Error?e.message:'Email delivery failed';
      await db.rpc('venue_finish_mail',{p_id:row.id,p_success:false,p_error:errorMessage});
      console.error('Venue notification delivery failed (no personal details logged):',row.id,errorMessage);
      failed++;
    }
  }
  return json({ok:true,processed:queue?.length||0,sent,failed});
});