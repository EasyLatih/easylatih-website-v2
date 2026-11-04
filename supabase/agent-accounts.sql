-- Agent Portal accounts (Supabase login for sales agents).
-- Agents are invited by the agent-auth-link Edge Function with user metadata
-- account_type = 'agent'. They must not get a trainer profile, otherwise they
-- would show up in the Trainer Library.
create or replace function private.handle_new_trainer()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'auth', 'pg_temp'
as $function$
begin
  if coalesce(new.raw_user_meta_data->>'account_type', '') = 'agent' then
    return new;
  end if;
  insert into public.profiles(id,email,full_name,phone,state,expertise_summary,linkedin_url,privacy_notice_version,privacy_acknowledged_at,marketing_consent)
  values(new.id,coalesce(new.email,''),coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.raw_user_meta_data->>'phone',''),coalesce(new.raw_user_meta_data->>'state',''),coalesce(new.raw_user_meta_data->>'expertise_summary',''),nullif(new.raw_user_meta_data->>'linkedin_url',''),new.raw_user_meta_data->>'privacy_notice_version',nullif(new.raw_user_meta_data->>'privacy_acknowledged_at','')::timestamptz,coalesce((new.raw_user_meta_data->>'marketing_consent')::boolean,false));
  insert into public.trainer_preferences(trainer_id) values(new.id);
  return new;
end $function$;
