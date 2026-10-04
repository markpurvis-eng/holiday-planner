-- Read-only catalog query used by scripts/gen-schema.mjs (and scripts/backup.mjs).
-- Returns ONE jsonb document describing the live public schema, the app's
-- storage buckets and policies, and the schema_version history. It changes
-- nothing. scripts/lib/schema-render.mjs turns the document into SQL.
-- Run it with the search_path set to public so definitions print unqualified:
--   psql "$HPA_DB_URL" -X -q -A -t -c "set search_path = public" -f scripts/sql/schema-catalog.sql
select jsonb_build_object(
  'extensions', (
    select coalesce(jsonb_agg(jsonb_build_object('name', e.extname, 'schema', n.nspname) order by e.extname), '[]'::jsonb)
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname not in ('plpgsql', 'supabase_vault', 'pg_stat_statements', 'pg_graphql', 'pgsodium', 'pg_net', 'pg_cron')
  ),
  'tables', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', c.relname,
      'rls', c.relrowsecurity,
      'force_rls', c.relforcerowsecurity,
      'columns', (
        select jsonb_agg(jsonb_build_object(
          'name', a.attname,
          'type', format_type(a.atttypid, a.atttypmod),
          'not_null', a.attnotnull,
          'default', pg_get_expr(d.adbin, d.adrelid),
          'generated', a.attgenerated::text,
          'identity', a.attidentity::text
        ) order by a.attnum)
        from pg_attribute a
        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
      )
    ) order by c.relname), '[]'::jsonb)
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  ),
  'constraints', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'table', cl.relname, 'name', k.conname, 'type', k.contype::text, 'def', pg_get_constraintdef(k.oid)
    ) order by cl.relname, k.conname), '[]'::jsonb)
    from pg_constraint k join pg_class cl on cl.oid = k.conrelid
    where k.connamespace = 'public'::regnamespace
  ),
  'indexes', (
    select coalesce(jsonb_agg(jsonb_build_object('table', i.tablename, 'name', i.indexname, 'def', i.indexdef)
      order by i.tablename, i.indexname), '[]'::jsonb)
    from pg_indexes i
    where i.schemaname = 'public'
      and i.indexname not in (select conname from pg_constraint where connamespace = 'public'::regnamespace)
  ),
  'triggers', (
    select coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'name', t.tgname, 'def', pg_get_triggerdef(t.oid))
      order by c.relname, t.tgname), '[]'::jsonb)
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where not t.tgisinternal and c.relnamespace = 'public'::regnamespace
  ),
  'functions', (
    select coalesce(jsonb_agg(jsonb_build_object('name', p.proname, 'def', replace(pg_get_functiondef(p.oid), E'\r', ''))
      order by p.proname, p.oid), '[]'::jsonb)
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind in ('f', 'p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  ),
  'policies', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'schema', pol.schemaname, 'table', pol.tablename, 'name', pol.policyname, 'permissive', pol.permissive,
      'roles', to_jsonb(pol.roles), 'cmd', pol.cmd, 'using', pol.qual, 'check', pol.with_check
    ) order by pol.schemaname, pol.tablename, pol.policyname), '[]'::jsonb)
    from pg_policies pol
    where pol.schemaname = 'public' or (pol.schemaname = 'storage' and pol.tablename = 'objects')
  ),
  'grants', (
    select coalesce(jsonb_agg(jsonb_build_object('table', c.relname, 'role', x.rolname, 'privileges', x.privs)
      order by c.relname, x.rolname), '[]'::jsonb)
    from pg_class c
    cross join lateral (
      select r.rolname, jsonb_agg(a.privilege_type order by a.privilege_type) as privs
      from aclexplode(c.relacl) a join pg_roles r on r.oid = a.grantee
      where r.rolname in ('anon', 'authenticated', 'service_role')
      group by r.rolname
    ) x
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and c.relacl is not null
  ),
  'buckets', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'public', b.public,
      'file_size_limit', b.file_size_limit, 'allowed_mime_types', to_jsonb(b.allowed_mime_types)
    ) order by b.id), '[]'::jsonb)
    from storage.buckets b
  ),
  'schema_version', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'version', v.version, 'description', v.description,
      'applied_at', to_char(v.applied_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
    ) order by v.version), '[]'::jsonb)
    from public.schema_version v
  ),
  'unsupported', (
    select coalesce(jsonb_agg(u.x order by u.x), '[]'::jsonb) from (
      select 'relation ' || c.relkind::text || ':' || c.relname as x
        from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind not in ('r', 'i')
      union all
      select 'type ' || t.typtype::text || ':' || t.typname
        from pg_type t where t.typnamespace = 'public'::regnamespace and t.typtype in ('e', 'd', 'r', 'm')
      union all
      select 'comment on ' || c.relname
        from pg_description d join pg_class c on c.oid = d.objoid and d.classoid = 'pg_class'::regclass
        where c.relnamespace = 'public'::regnamespace
      union all
      select 'rule on ' || c.relname || ': ' || r.rulename
        from pg_rewrite r join pg_class c on c.oid = r.ev_class
        where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
    ) u
  )
);
