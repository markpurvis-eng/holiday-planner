-- Holiday Planner database schema: CURRENT STATE (generated file, do not edit by hand)
--
-- Regenerate from the live database:   node scripts/gen-schema.mjs
-- Check it is up to date:              node scripts/gen-schema.mjs --check
-- (needs HPA_DB_URL in .env and psql on PATH; see docs/backup-and-restore.md)
--
-- This file shows what is live; it is not how to change it. Schema changes use
-- migration files in supabase/migrations/:
--   1. Back up first:  node scripts/backup.mjs pre-v<N>   (or: go backup hpa pre-v<N>)
--   2. Write supabase/migrations/<yyyymmddhhmmss>_<name>.sql and apply it with
--      apply_migration. The migration inserts its own schema_version row (next number)
--      and, for a new table, its Data API grants (from 30 Oct 2026 Supabase no longer
--      grants them automatically).
--   3. Regenerate this file:  node scripts/gen-schema.mjs
--
-- Current schema_version: 8
-- Safe to run against an empty Supabase project (idempotent). Row data is not in this
-- file: restore it from a backup dump (docs/backup-and-restore.md).

-- --- extensions ------------------------------------------------------------

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- --- tables ----------------------------------------------------------------

create table if not exists public.booking (
  id uuid not null default gen_random_uuid(),
  trip_id uuid not null,
  provider_name text not null,
  confirmation_ref text,
  start_date date,
  end_date date,
  cost numeric,
  payment_status text not null default 'unpaid'::text,
  extracted_details text,
  created_at timestamp with time zone not null default now(),
  currency text default 'GBP'::text,
  cancelled boolean not null default false,
  destination_name text,
  destination_lat numeric,
  destination_lng numeric,
  start_time time without time zone,
  end_time time without time zone,
  fx_rate_to_gbp numeric,
  fx_rate_locked_at timestamp with time zone,
  notes text,
  address text,
  pin_lat double precision,
  pin_lng double precision,
  type text,
  details jsonb,
  parent_booking_id uuid,
  constraint booking_pkey PRIMARY KEY (id),
  constraint booking_payment_status_check CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'partially_paid'::text, 'paid'::text])))
);

create table if not exists public.document (
  id uuid not null default gen_random_uuid(),
  type text not null,
  file_url text not null,
  title text,
  note text,
  trip_id uuid,
  booking_id uuid,
  day_date date,
  created_at timestamp with time zone not null default now(),
  itinerary_item_id uuid,
  drive_file_id text,
  storage_path text,
  migrated_at timestamp with time zone,
  expense_id uuid,
  constraint document_pkey PRIMARY KEY (id),
  constraint document_type_check CHECK ((type = ANY (ARRAY['confirmation'::text, 'photo'::text, 'receipt'::text, 'guide'::text])))
);

create table if not exists public.expense (
  id uuid not null default gen_random_uuid(),
  trip_id uuid not null,
  booking_id uuid,
  itinerary_item_id uuid,
  label text not null,
  amount numeric not null,
  currency text not null,
  paid_on date not null default CURRENT_DATE,
  fx_rate_to_gbp numeric,
  fx_rate_locked_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  constraint expense_pkey PRIMARY KEY (id)
);

create table if not exists public.itinerary_item (
  id uuid not null default gen_random_uuid(),
  trip_id uuid not null,
  type text not null,
  date date not null,
  time time without time zone,
  venue text,
  reference text,
  extracted_details text,
  created_at timestamp with time zone not null default now(),
  cost numeric(10,2),
  cancelled boolean not null default false,
  currency text default 'GBP'::text,
  destination_name text,
  destination_lat numeric,
  destination_lng numeric,
  payment_status text not null default 'unpaid'::text,
  fx_rate_to_gbp numeric,
  fx_rate_locked_at timestamp with time zone,
  notes text,
  address text,
  pin_lat double precision,
  pin_lng double precision,
  constraint itinerary_item_pkey PRIMARY KEY (id)
);

create table if not exists public.link (
  id uuid not null default gen_random_uuid(),
  url text not null,
  label text not null,
  trip_id uuid,
  booking_id uuid,
  day_date date,
  created_at timestamp with time zone not null default now(),
  itinerary_item_id uuid,
  constraint link_pkey PRIMARY KEY (id)
);

create table if not exists public.payment (
  id uuid not null default gen_random_uuid(),
  booking_id uuid not null,
  amount numeric not null,
  due_date date,
  card_used text,
  paid boolean not null default false,
  created_at timestamp with time zone not null default now(),
  constraint payment_pkey PRIMARY KEY (id)
);

create table if not exists public.schema_version (
  version integer not null,
  description text not null,
  applied_at timestamp with time zone not null default now(),
  constraint schema_version_pkey PRIMARY KEY (version)
);

create table if not exists public.todo (
  id uuid not null default gen_random_uuid(),
  trip_id uuid not null,
  text text not null,
  done boolean not null default false,
  created_at timestamp with time zone not null default now(),
  remind_from date,
  constraint todo_pkey PRIMARY KEY (id)
);

create table if not exists public.trip (
  id uuid not null default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  nights integer,
  status text not null default 'upcoming'::text,
  trip_type_id uuid,
  created_at timestamp with time zone not null default now(),
  destination_name text,
  destination_lat numeric,
  destination_lng numeric,
  public_itinerary_generated_at timestamp with time zone,
  total_cost_gbp numeric,
  total_cost_locked_at timestamp with time zone,
  constraint trip_pkey PRIMARY KEY (id),
  constraint trip_status_check CHECK ((status = ANY (ARRAY['upcoming'::text, 'active'::text, 'past'::text, 'cancelled'::text])))
);

create table if not exists public.trip_type (
  id uuid not null default gen_random_uuid(),
  name text not null,
  icon text not null,
  created_at timestamp with time zone not null default now(),
  constraint trip_type_pkey PRIMARY KEY (id),
  constraint trip_type_name_key UNIQUE (name)
);

-- --- indexes ---------------------------------------------------------------

create index if not exists booking_parent_booking_id_idx ON public.booking USING btree (parent_booking_id);
create index if not exists document_itinerary_item_id_idx ON public.document USING btree (itinerary_item_id);
create index if not exists link_itinerary_item_id_idx ON public.link USING btree (itinerary_item_id);

-- --- foreign keys ----------------------------------------------------------

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'booking_parent_booking_id_fkey' and conrelid = 'public.booking'::regclass) then
    alter table public.booking add constraint booking_parent_booking_id_fkey FOREIGN KEY (parent_booking_id) REFERENCES public.booking(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'booking_trip_id_fkey' and conrelid = 'public.booking'::regclass) then
    alter table public.booking add constraint booking_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trip(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'document_booking_id_fkey' and conrelid = 'public.document'::regclass) then
    alter table public.document add constraint document_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.booking(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'document_expense_id_fkey' and conrelid = 'public.document'::regclass) then
    alter table public.document add constraint document_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expense(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'document_itinerary_item_id_fkey' and conrelid = 'public.document'::regclass) then
    alter table public.document add constraint document_itinerary_item_id_fkey FOREIGN KEY (itinerary_item_id) REFERENCES public.itinerary_item(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'document_trip_id_fkey' and conrelid = 'public.document'::regclass) then
    alter table public.document add constraint document_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trip(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expense_booking_id_fkey' and conrelid = 'public.expense'::regclass) then
    alter table public.expense add constraint expense_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.booking(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expense_itinerary_item_id_fkey' and conrelid = 'public.expense'::regclass) then
    alter table public.expense add constraint expense_itinerary_item_id_fkey FOREIGN KEY (itinerary_item_id) REFERENCES public.itinerary_item(id) ON DELETE SET NULL;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'expense_trip_id_fkey' and conrelid = 'public.expense'::regclass) then
    alter table public.expense add constraint expense_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trip(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'itinerary_item_trip_id_fkey' and conrelid = 'public.itinerary_item'::regclass) then
    alter table public.itinerary_item add constraint itinerary_item_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trip(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'link_booking_id_fkey' and conrelid = 'public.link'::regclass) then
    alter table public.link add constraint link_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.booking(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'link_itinerary_item_id_fkey' and conrelid = 'public.link'::regclass) then
    alter table public.link add constraint link_itinerary_item_id_fkey FOREIGN KEY (itinerary_item_id) REFERENCES public.itinerary_item(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'link_trip_id_fkey' and conrelid = 'public.link'::regclass) then
    alter table public.link add constraint link_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trip(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payment_booking_id_fkey' and conrelid = 'public.payment'::regclass) then
    alter table public.payment add constraint payment_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.booking(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'todo_trip_id_fkey' and conrelid = 'public.todo'::regclass) then
    alter table public.todo add constraint todo_trip_id_fkey FOREIGN KEY (trip_id) REFERENCES public.trip(id) ON DELETE CASCADE;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'trip_trip_type_id_fkey' and conrelid = 'public.trip'::regclass) then
    alter table public.trip add constraint trip_trip_type_id_fkey FOREIGN KEY (trip_type_id) REFERENCES public.trip_type(id) ON DELETE SET NULL;
  end if;
end $$;

-- --- functions -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_trip_photos_link()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  insert into link (trip_id, label, url)
  values (
    new.id,
    'photos',
    'https://photos.google.com/search/%23date_range%3A'
      || to_char(new.start_date, 'YYYYMMDD') || '-' || to_char(new.end_date, 'YYYYMMDD')
  );
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.booking_enforce_depth_one()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.parent_booking_id = new.id then
    raise exception 'A booking cannot be its own parent' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.booking p where p.id = new.parent_booking_id and p.parent_booking_id is not null) then
    raise exception 'Nesting is limited to one level: the chosen parent is already a child' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.booking c where c.parent_booking_id = new.id) then
    raise exception 'Nesting is limited to one level: this booking already has children' using errcode = 'check_violation';
  end if;
  return new;
end
$function$;

-- --- triggers --------------------------------------------------------------

drop trigger if exists booking_depth_one_guard on public.booking;
CREATE TRIGGER booking_depth_one_guard BEFORE INSERT OR UPDATE OF parent_booking_id ON public.booking FOR EACH ROW WHEN ((new.parent_booking_id IS NOT NULL)) EXECUTE FUNCTION public.booking_enforce_depth_one();

drop trigger if exists trg_add_trip_photos_link on public.trip;
CREATE TRIGGER trg_add_trip_photos_link AFTER INSERT ON public.trip FOR EACH ROW EXECUTE FUNCTION public.add_trip_photos_link();

-- --- row level security and policies ---------------------------------------

alter table public.booking enable row level security;

alter table public.document enable row level security;

alter table public.expense enable row level security;

alter table public.itinerary_item enable row level security;

alter table public.link enable row level security;

alter table public.payment enable row level security;

alter table public.schema_version enable row level security;

alter table public.todo enable row level security;

alter table public.trip enable row level security;

alter table public.trip_type enable row level security;

drop policy if exists "allow all for authenticated" on public.booking;
create policy "allow all for authenticated" on public.booking for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on public.document;
create policy "allow all for authenticated" on public.document for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on public.expense;
create policy "allow all for authenticated" on public.expense for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on public.itinerary_item;
create policy "allow all for authenticated" on public.itinerary_item for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on public.link;
create policy "allow all for authenticated" on public.link for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on public.payment;
create policy "allow all for authenticated" on public.payment for all to authenticated using (true) with check (true);

drop policy if exists "read for authenticated" on public.schema_version;
create policy "read for authenticated" on public.schema_version for select to authenticated using (true);

drop policy if exists "allow all for authenticated" on public.todo;
create policy "allow all for authenticated" on public.todo for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on public.trip;
create policy "allow all for authenticated" on public.trip for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on public.trip_type;
create policy "allow all for authenticated" on public.trip_type for all to authenticated using (true) with check (true);

-- --- data api grants -------------------------------------------------------

grant all on public.booking to anon;
grant all on public.booking to authenticated;
grant all on public.booking to service_role;
grant all on public.document to anon;
grant all on public.document to authenticated;
grant all on public.document to service_role;
grant all on public.expense to anon;
grant all on public.expense to authenticated;
grant all on public.expense to service_role;
grant all on public.itinerary_item to anon;
grant all on public.itinerary_item to authenticated;
grant all on public.itinerary_item to service_role;
grant all on public.link to anon;
grant all on public.link to authenticated;
grant all on public.link to service_role;
grant all on public.payment to anon;
grant all on public.payment to authenticated;
grant all on public.payment to service_role;
grant all on public.schema_version to anon;
grant all on public.schema_version to authenticated;
grant all on public.schema_version to service_role;
grant all on public.todo to anon;
grant all on public.todo to authenticated;
grant all on public.todo to service_role;
grant all on public.trip to anon;
grant all on public.trip to authenticated;
grant all on public.trip to service_role;
grant all on public.trip_type to anon;
grant all on public.trip_type to authenticated;
grant all on public.trip_type to service_role;

-- --- storage buckets and policies ------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', true, null, null),
  ('itineraries', 'itineraries', true, null, null)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents bucket public read" on storage.objects;
create policy "documents bucket public read" on storage.objects for select to anon using ((bucket_id = 'documents'::text));

drop policy if exists "documents bucket read/write for authenticated" on storage.objects;
create policy "documents bucket read/write for authenticated" on storage.objects for all to authenticated using ((bucket_id = 'documents'::text)) with check ((bucket_id = 'documents'::text));

drop policy if exists "itineraries bucket public read" on storage.objects;
create policy "itineraries bucket public read" on storage.objects for select to anon using ((bucket_id = 'itineraries'::text));

drop policy if exists "itineraries bucket read/write for authenticated" on storage.objects;
create policy "itineraries bucket read/write for authenticated" on storage.objects for all to authenticated using ((bucket_id = 'itineraries'::text)) with check ((bucket_id = 'itineraries'::text));

-- --- schema_version history ------------------------------------------------

insert into public.schema_version (version, description, applied_at) values
  (1, 'Baseline: added Data API grants to all tables and the schema_version table', '2026-09-24T20:50:34.710926Z'::timestamptz),
  (2, 'Map pins: address, pin_lat, pin_lng on booking and itinerary_item', '2026-10-01T11:19:31.519883Z'::timestamptz),
  (3, 'Todos: remind_from date (weekly email includes a todo only from this date)', '2026-10-03T08:24:29.804038Z'::timestamptz),
  (4, 'Booking types phase 1: booking.type, details (jsonb), parent_booking_id with depth-one guard; type backfilled', '2026-10-11T16:20:02.159840Z'::timestamptz),
  (5, 'Booking types phase 2: details (legs, passengers) filled for the 7 flight bookings', '2026-10-11T18:32:45.817421Z'::timestamptz),
  (6, 'Booking types phase 3: details filled for hotel, car hire, cruise and excursion bookings; Vietnam tours linked to the Celebrity Solstice', '2026-10-11T19:59:08.334820Z'::timestamptz),
  (7, 'Booking types phase 3 follow-up: Volendam embark/departure times; Alagon hotel linked to the Solstice', '2026-10-11T20:59:50.832677Z'::timestamptz),
  (8, 'Booking types phase 5: flight details filled from confirmations, easyJet seat names, BA2640/41 e-tickets, package details', '2026-10-12T16:39:31.190011Z'::timestamptz)
on conflict (version) do nothing;
