(() => {
  const cfg=window.EASYLATIH_TRAINER_PORTAL||{};
  if(!window.supabase||!cfg.supabaseUrl||!cfg.supabasePublishableKey)return;
  const client=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);

  document.addEventListener('DOMContentLoaded',()=>{
    const button=document.getElementById('acceptTermsButton');
    if(!button)return;
    button.addEventListener('click',async()=>{
      for(let attempt=0;attempt<12;attempt++){
        await new Promise(resolve=>setTimeout(resolve,500));
        const {data:{user}}=await client.auth.getUser();
        if(!user)return;
        const {data}=await client.from('profiles').select('collaboration_status').eq('id',user.id).maybeSingle();
        if(['ONBOARDING','ACTIVE'].includes(data?.collaboration_status)){
          location.reload();
          return;
        }
      }
    });
  });
})();
