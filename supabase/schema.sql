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

-- Added after initial release: a single anchor point (used for the
-- pre-trip weather forecast) for trips with one main destination.
-- Multi-city trips also set the same three columns on booking/
-- itinerary_item, which take priority once the trip is under way.
alter table trip add column if not exists destination_name text;
alter table trip add column if not exists destination_lat numeric;
alter table trip add column if not exists destination_lng numeric;

-- Added for the share-itinerary feature: null means no public PDF has been
-- generated yet for this trip, so the Share button stays hidden.
alter table trip add column if not exists public_itinerary_generated_at timestamptz;

-- Locked total cost per trip, shown on the Dashboard trip card with zero
-- extra DB overhead (getTrips() already selects *). See AGENTS.md,
-- "Locked trip total cost" for how/when this gets set.
alter table trip add column if not exists total_cost_gbp numeric;
alter table trip add column if not exists total_cost_locked_at timestamptz;

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
  -- Renamed from check_in_details (16 Sep 2026) for clearer provenance:
  -- this holds text extracted from a confirmation/source document, not
  -- anything Mark writes himself -- see notes below for that.
  extracted_details text,
  created_at timestamptz not null default now()
);

alter table booking add column if not exists currency text default 'GBP';

-- Added after initial release: a cancelled booking still exists as a
-- record (refs, payment history) but shouldn't count towards costs or
-- appear on the Itinerary timeline by default.
alter table booking add column if not exists cancelled boolean not null default false;

-- Per-booking weather anchor (see trip.destination_* above) -- set for
-- accommodation/port-stop bookings on multi-city trips, deliberately left
-- null for cruise ships, flights, car hire and tours, where a single
-- point would mislead.
alter table booking add column if not exists destination_name text;
alter table booking add column if not exists destination_lat numeric;
alter table booking add column if not exists destination_lng numeric;

-- Time-of-day precision for bookings: nullable and additive, so existing
-- bookings keep working with date-only ordering until real times are
-- backfilled (see AGENTS.md, "Bookings on the Itinerary tab").
alter table booking add column if not exists start_time time;
alter table booking add column if not exists end_time time;

-- Costs tab, GBP roll-up: rate locked at the line level once a cost line
-- is paid, so its GBP figure never recalculates. See AGENTS.md,
-- "Costs tab, GBP roll-up".
alter table booking add column if not exists fx_rate_to_gbp numeric;
alter table booking add column if not exists fx_rate_locked_at timestamptz;

-- Ad hoc personal notes, kept deliberately separate from
-- extracted_details above -- a future automated re-extraction (see the
-- Gmail/Drive ingestion design) can safely overwrite extracted_details
-- without ever risking a note Mark wrote himself.
alter table booking add column if not exists notes text;

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
  -- Renamed from status (16 Sep 2026), same reasoning as
  -- booking.extracted_details above.
  extracted_details text,
  created_at timestamptz not null default now(),
  -- Added after initial release: tours/dining/transport items often have
  -- their own cost (a tour deposit, a table fee) worth tracking alongside
  -- the trip's bookings.
  cost numeric
);

alter table itinerary_item add column if not exists cost numeric;

-- Same reasoning as booking.cancelled above.
alter table itinerary_item add column if not exists cancelled boolean not null default false;

-- Same reasoning as booking.currency above.
alter table itinerary_item add column if not exists currency text default 'GBP';

-- Same reasoning as booking.payment_status above -- itinerary items with
-- a cost (a tour, a dinner) need the same paid/partially_paid/unpaid
-- tracking bookings have.
alter table itinerary_item add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'partially_paid', 'paid'));

-- Per-itinerary-item weather anchor (see trip.destination_* above) -- set
-- for day-by-day cruise port stops, where the trip/booking-level anchor
-- can't track a moving ship.
alter table itinerary_item add column if not exists destination_name text;
alter table itinerary_item add column if not exists destination_lat numeric;
alter table itinerary_item add column if not exists destination_lng numeric;

-- Costs tab, GBP roll-up -- same reasoning as booking.fx_rate_* above.
alter table itinerary_item add column if not exists fx_rate_to_gbp numeric;
alter table itinerary_item add column if not exists fx_rate_locked_at timestamptz;

-- Same reasoning as booking.notes above.
alter table itinerary_item add column if not exists notes text;

-- --- expense -----------------------------------------------------------
-- Ad hoc payments made during a trip (tips, souvenirs, taxis, etc.) --
-- distinct from booking/itinerary_item, which represent planned costs.
-- An expense is recorded after it's paid, so it's always "paid" -- there's
-- no outstanding/unpaid state, and the FX rate is locked at entry time
-- rather than on a later transition. See AGENTS.md, "Ad hoc expenses".

create table if not exists expense (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trip(id) on delete cascade,
  booking_id uuid references booking(id) on delete set null,
  itinerary_item_id uuid references itinerary_item(id) on delete set null,
  label text not null,
  amount numeric not null,
  currency text not null,
  paid_on date not null default current_date,
  fx_rate_to_gbp numeric,
  fx_rate_locked_at timestamptz,
  created_at timestamptz not null default now()
);

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

-- Added for ad hoc expenses: links a receipt to the specific expense it
-- belongs to, not just the booking/itinerary item the expense itself is
-- attached to (booking_id/itinerary_item_id above are still set too, so
-- the Documents tab's attachment grouping -- which only knows about
-- booking/itinerary attachment, not expenses -- still works unchanged).
alter table document add column if not exists expense_id uuid references expense(id) on delete set null;

-- Present in the live database but not created by anything in this repo
-- or documented in AGENTS.md -- added here only to keep this file a
-- faithful mirror of what's actually live. Origin unknown; ask before
-- relying on or removing these.
alter table document add column if not exists drive_file_id text;
alter table document add column if not exists storage_path text;
alter table document add column if not exists migrated_at timestamptz;

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

-- Missing Features #24: every new trip automatically gets a trip-level
-- "photos" link, pointed at a Google Photos search scoped to its date
-- range (the same URL pattern already used for city-guide/reference
-- links, just generated instead of typed by hand). A DB trigger rather
-- than app code, since trip rows are created both from the app and
-- directly via Supabase (e.g. Claude's Supabase MCP connector) -- a
-- trigger is the one place that covers every insert path.
create or replace function add_trip_photos_link() returns trigger as $$
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
$$ language plpgsql;

drop trigger if exists trg_add_trip_photos_link on trip;
create trigger trg_add_trip_photos_link
  after insert on trip
  for each row execute function add_trip_photos_link();

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
alter table expense enable row level security;
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

drop policy if exists "allow all for authenticated" on expense;
create policy "allow all for authenticated" on expense for all to authenticated using (true) with check (true);

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
