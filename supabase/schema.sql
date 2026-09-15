-- Holiday Planner database schema
-- Run this ONCE in the Supabase SQL editor (Project > SQL Editor > New query)
-- before using the app. This is not applied automatically -- no service-role
-- key or Supabase CLI credentials were available to run migrations
-- programmatically, so paste this file's contents into the SQL editor and
-- run it manually.

create extension if not exists "pgcrypto";

-- --- trip_type -------------------------------------------------------------

create table if not exists trip_type (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  icon text not null,
  created_at timestamptz not null default now()
);

insert into trip_type (name, icon) values
  ('Cruise', '🚢'),
  ('Chillin''', '🏖️'),
  ('Activity', '🎒'),
  ('Default', '🧳')
on conflict (name) do nothing;

-- --- trip --------------------------------------------------------------

create table if not exists trip (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null,
  end_date date not null,
  nights integer,
  status text not null default 'upcoming' check (status in ('upcoming', 'active', 'past', 'cancelled')),
  trip_type_id uuid references trip_type(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Added for the share-itinerary feature: null means no public PDF has been
-- generated yet for this trip, so the Share button stays hidden.
alter table trip add column if not exists public_itinerary_generated_at timestamptz;

-- --- booking -------------------------------------------------------------

create table if not exists booking (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trip(id) on delete cascade,
  provider_name text not null,
  confirmation_ref text,
  start_date date,
  end_date date,
  cost numeric,
  -- Added after initial release: bookings can be in currencies other than
  -- GBP (e.g. a Vietnam tour priced in VND). Defaults to GBP so existing
  -- rows and the common case both work without extra input.
  currency text default 'GBP',
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'partially_paid', 'paid')),
  check_in_details text,
  created_at timestamptz not null default now()
);

alter table booking add column if not exists currency text default 'GBP';

-- --- payment -------------------------------------------------------------

create table if not exists payment (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references booking(id) on delete cascade,
  amount numeric not null,
  due_date date,
  card_used text,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

-- --- itinerary_item --------------------------------------------------------

create table if not exists itinerary_item (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trip(id) on delete cascade,
  type text not null,
  date date not null,
  time time,
  venue text,
  reference text,
  status text,
  created_at timestamptz not null default now(),
  -- Added after initial release: tours/dining/transport items often have
  -- their own cost (a tour deposit, a table fee) worth tracking alongside
  -- the trip's bookings.
  cost numeric
);

alter table itinerary_item add column if not exists cost numeric;

-- --- document ------------------------------------------------------------

create table if not exists document (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('confirmation', 'photo', 'receipt', 'guide')),
  file_url text not null,
  title text,
  note text,
  trip_id uuid references trip(id) on delete cascade,
  booking_id uuid references booking(id) on delete cascade,
  -- Added after initial release: documents (e.g. a restaurant confirmation
  -- screenshot) can be tied to a specific itinerary item, not just a trip
  -- or a booking.
  itinerary_item_id uuid references itinerary_item(id) on delete cascade,
  day_date date,
  created_at timestamptz not null default now()
);

alter table document add column if not exists itinerary_item_id uuid references itinerary_item(id) on delete cascade;

-- --- link ------------------------------------------------------------------

create table if not exists link (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  label text not null,
  trip_id uuid references trip(id) on delete cascade,
  booking_id uuid references booking(id) on delete cascade,
  -- See document.itinerary_item_id above -- same reasoning applies to links
  -- (e.g. a booking-confirmation email permalink for one specific dinner).
  itinerary_item_id uuid references itinerary_item(id) on delete cascade,
  day_date date,
  created_at timestamptz not null default now()
);

alter table link add column if not exists itinerary_item_id uuid references itinerary_item(id) on delete cascade;

-- --- todo --------------------------------------------------------------

create table if not exists todo (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trip(id) on delete cascade,
  text text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists document_itinerary_item_id_idx on document (itinerary_item_id);
create index if not exists link_itinerary_item_id_idx on link (itinerary_item_id);

-- --- Row Level Security ------------------------------------------------
-- Single shared household login: every authenticated user may do everything.
-- There is no per-row ownership model, so the policies are intentionally
-- permissive rather than scoped to a user id.

alter table trip_type enable row level security;
alter table trip enable row level security;
alter table booking enable row level security;
alter table payment enable row level security;
alter table itinerary_item enable row level security;
alter table document enable row level security;
alter table link enable row level security;
alter table todo enable row level security;

drop policy if exists "allow all for authenticated" on trip_type;
create policy "allow all for authenticated" on trip_type for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on trip;
create policy "allow all for authenticated" on trip for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on booking;
create policy "allow all for authenticated" on booking for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on payment;
create policy "allow all for authenticated" on payment for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on itinerary_item;
create policy "allow all for authenticated" on itinerary_item for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on document;
create policy "allow all for authenticated" on document for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on link;
create policy "allow all for authenticated" on link for all to authenticated using (true) with check (true);

drop policy if exists "allow all for authenticated" on todo;
create policy "allow all for authenticated" on todo for all to authenticated using (true) with check (true);

-- --- Storage bucket for uploaded documents/photos --------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

drop policy if exists "documents bucket read/write for authenticated" on storage.objects;
create policy "documents bucket read/write for authenticated"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

-- Public read access, since the bucket is public and file URLs are shared
-- via getPublicUrl() in the frontend.
drop policy if exists "documents bucket public read" on storage.objects;
create policy "documents bucket public read"
  on storage.objects for select
  to anon
  using (bucket_id = 'documents');

-- --- Storage bucket for shared/public itinerary PDFs -----------------------
-- Separate from the documents bucket because these objects are always
-- public by design (that's the point of the feature) at a stable per-trip
-- path (<trip-id>.pdf), rather than the random per-upload paths used for
-- documents.

insert into storage.buckets (id, name, public)
values ('itineraries', 'itineraries', true)
on conflict (id) do nothing;

drop policy if exists "itineraries bucket read/write for authenticated" on storage.objects;
create policy "itineraries bucket read/write for authenticated"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'itineraries')
  with check (bucket_id = 'itineraries');

drop policy if exists "itineraries bucket public read" on storage.objects;
create policy "itineraries bucket public read"
  on storage.objects for select
  to anon
  using (bucket_id = 'itineraries');
