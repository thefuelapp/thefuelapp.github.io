-- v86 (20 Oct 2026). One addition to growth.sql: what kind of code is this?
-- The app asks once for the code a device arrived with (?c=CODE). A creator's code gives 14 free days instead of 7, and the
-- first screen can say whose code it is. Answers only "creator" or "mate" plus a first name for creators; never emails, never counts.
-- Run after growth.sql: paste into the Supabase SQL editor (tools/growth-2-setup.sh does the clipboard and the check).
create or replace function public.code_kind(p_code text) returns json language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select code, kind, name, active into r from ref_codes where code = upper(trim(coalesce(p_code, ''))) limit 1;
  if not found or not r.active then return json_build_object('ok', false); end if;
  return json_build_object('ok', true, 'kind', r.kind, 'name', case when r.kind = 'creator' then split_part(coalesce(r.name, ''), ' ', 1) else null end);
end $$;
revoke all on function public.code_kind(text) from public;
grant execute on function public.code_kind(text) to anon, authenticated;
notify pgrst, 'reload schema';
