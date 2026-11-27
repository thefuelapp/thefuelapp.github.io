-- In-app account deletion (App Review guideline 5.1.1(v)). The app calls this as the signed-in user: cloud.js → rpc('delete_my_account').
--
-- This is a COPY, for reference, of section 1 of supabase/hardening.sql in the private source repo (the one with deploy.sh).
-- Do not run this file on its own: run the whole of hardening.sql there (tools/hardening-setup.sh), because the app also asks
-- fuel_hardening() before it shows "Delete my account" on the website, and this function uses tables made by growth.sql.
--
-- STATUS, checked 27 Nov 2026 with the public key: neither delete_my_account nor fuel_hardening exists on the live project yet
-- (PostgREST answers PGRST202 "could not find the function"). Until hardening.sql is run, deletion does not work for anyone.
--
-- No service-role key is needed and none is stored anywhere: the function is SECURITY DEFINER, so it runs with the owner's rights,
-- and it can only ever delete the caller's own account (auth.uid()).
create or replace function public.delete_my_account() returns json language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); em text;
begin
  if uid is null then return json_build_object('ok', false, 'error', 'Sign in first.'); end if;
  select lower(email) into em from auth.users where id = uid;
  delete from app_owners where lower(email) = em;                 -- an owner who leaves is no longer an owner
  update ref_codes set active = false where owner_user = uid and kind = 'mate';
  delete from auth.users where id = uid;                          -- user_state, entitlements and referrals go with it (on delete cascade)
  return json_build_object('ok', true);
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
