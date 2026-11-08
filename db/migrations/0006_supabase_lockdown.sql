-- Supabase exposes the "public" schema through its REST API (PostgREST) using the anon / authenticated roles.
-- This portal never uses that API: all access goes through the server with its own role. RLS already denies those
-- roles, and this migration additionally removes Supabase's default privileges so there is no exposure at all.
-- On plain PostgreSQL (no such roles) this is a no-op.
do $$
declare r record;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') and exists (select 1 from pg_roles where rolname = 'authenticated') then
    for r in select tablename from pg_tables where schemaname = 'public' and tablename like 'proj-dashboard-%' loop
      execute format('revoke all on table %I from anon, authenticated', r.tablename);
    end loop;
    revoke all on sequence project_code_seq from anon, authenticated;
    for r in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and (p.proname like 'app\_%' or p.proname like 'trg\_%' or p.proname = 'set_updated_at') loop
      -- Functions get a default EXECUTE grant to PUBLIC, which anon/authenticated inherit: revoke it too,
      -- then give the portal's own role back exactly what it needs.
      execute format('revoke all on function %s from public, anon, authenticated', r.sig);
      execute format('grant execute on function %s to app_authenticated', r.sig);
    end loop;
  end if;
end $$;
