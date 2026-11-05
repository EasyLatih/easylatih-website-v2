-- Promo codes with CourseID "ALL" are valid for every programme.
-- A row for the exact course still wins over an ALL row with the same code
-- (so a course-specific early-bird amount overrides an agent's standing code).
CREATE OR REPLACE FUNCTION public.validate_registration_promo_mirror(p_course_id text, p_promo_code text)
 RETURNS TABLE(valid boolean, discount_amount numeric, message text, mirror_ready boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  promo public.registration_promo_mirror%rowtype;
  v_ready boolean;
begin
  select exists(
    select 1
    from public.public_registration_mirror_sync_state
    where mirror_name = 'registration_promo'
  ) into v_ready;

  select * into promo
  from public.registration_promo_mirror
  where upper(promo_code) = upper(trim(p_promo_code))
    and (upper(course_id) = upper(trim(p_course_id)) or upper(course_id) = 'ALL')
  order by case when upper(course_id) = upper(trim(p_course_id)) then 0 else 1 end
  limit 1;

  if not found then
    return query select false, 0::numeric, 'Promo code is not valid.', v_ready;
    return;
  end if;

  if not promo.is_active then
    return query select false, 0::numeric, 'Promo code is inactive.', v_ready;
    return;
  end if;

  if promo.expiry_date is not null and promo.expiry_date < current_date then
    return query select false, 0::numeric, 'Promo code has expired.', v_ready;
    return;
  end if;

  return query select true, promo.discount_amount, 'Promo code applied.', v_ready;
end;
$function$;
