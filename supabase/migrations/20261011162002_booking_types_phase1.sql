-- Booking types, phase 1 (Missing Features #83): schema only plus a reviewed type backfill.
-- Additive: three nullable columns, no renames, drops or NOT NULL. No app code change.
--   type               text   - booking type; the registry in code owns the valid values
--   details            jsonb  - type-specific fields (registry in code, includes "v": 1)
--   parent_booking_id  uuid   - self-reference, depth capped at one (cruise -> excursion)
-- Left empty in this phase: details and parent_booking_id (excursions are linked in phase 3).

alter table public.booking
  add column if not exists type text,
  add column if not exists details jsonb,
  add column if not exists parent_booking_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'booking_parent_booking_id_fkey' and conrelid = 'public.booking'::regclass) then
    alter table public.booking
      add constraint booking_parent_booking_id_fkey
      FOREIGN KEY (parent_booking_id) REFERENCES public.booking(id) ON DELETE SET NULL;
  end if;
end $$;

create index if not exists booking_parent_booking_id_idx on public.booking (parent_booking_id);

-- Depth-one guard. Fires only on writes to parent_booking_id (and only when it is being set),
-- so ordinary edits of a booking never run it.
create or replace function public.booking_enforce_depth_one()
returns trigger
language plpgsql
set search_path = ''
as $fn$
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
$fn$;

drop trigger if exists booking_depth_one_guard on public.booking;
create trigger booking_depth_one_guard
  before insert or update of parent_booking_id on public.booking
  for each row
  when (new.parent_booking_id is not null)
  execute function public.booking_enforce_depth_one();

-- Backfill type for the 35 existing bookings (mapping reviewed and approved 11 Oct 2026).
update public.booking b set type = v.type
from (values
  -- flight (7)
  ('1beaa952-da34-470f-a8be-bfc937b38604'::uuid, 'flight'),
  ('09d26211-e1f0-46b3-a472-fac97cec9a47', 'flight'),
  ('45730e86-a77b-4949-bf9a-6daf221eca25', 'flight'),
  ('e1a0b102-4c28-4446-a9d4-06b4135b5a56', 'flight'),
  ('cfed3d11-bf59-4f21-a382-438141cd1f38', 'flight'),
  ('577b6d36-d69d-4cbb-b4cb-d014c4b10562', 'flight'),
  ('c23a3469-e288-463f-bd9d-b3fad3804952', 'flight'),
  -- cruise (2)
  ('606182e0-8e3f-42e0-b26a-b5f1228f1fc9', 'cruise'),
  ('67808f97-55ad-4fbb-963c-0181320552a0', 'cruise'),
  -- car_hire (2)
  ('85df37f8-3766-4414-8572-558f4973768b', 'car_hire'),
  ('ba847d39-f549-4291-99c7-93b7d9d2d620', 'car_hire'),
  -- excursion (4)
  ('24bd7501-f24b-45eb-84fa-275757f13769', 'excursion'),
  ('56b99b1c-84ef-4bbe-874d-ea5418a7b17e', 'excursion'),
  ('e17ff580-0848-47d3-909e-4a89a7c6400f', 'excursion'),
  ('c95717c6-c957-4981-a7d9-ace26db779cd', 'excursion'),
  -- other / package (3)
  ('4906e12e-74b3-4782-9ea0-5a9288df0b2e', 'other'),
  ('6030631a-9f75-4a1b-bc93-1a4597fb98f6', 'other'),
  ('c29a3927-e34d-4792-b49d-251f1441dd8d', 'other'),
  -- hotel (17, including Holiday World Polynesia)
  ('1a84ab3f-1392-4bbc-98d5-c50c85cb644d', 'hotel'),
  ('230450e8-4070-49b3-af8a-30f565e55b12', 'hotel'),
  ('7c9a5646-a896-4f12-b14c-2b5636231145', 'hotel'),
  ('6c058bc6-f1ca-4847-bb96-08748c39234e', 'hotel'),
  ('195afa37-2f9b-4e01-8527-78a894ba5892', 'hotel'),
  ('3fd4942c-8709-4e8b-84b3-cd7e3046568e', 'hotel'),
  ('42b464c8-8ea7-44a8-97f3-955d0816185e', 'hotel'),
  ('94d99306-6845-4737-8e94-e8f7cc55a46d', 'hotel'),
  ('0743794f-5444-4675-a98e-e68385e45439', 'hotel'),
  ('354ca5aa-5af2-4087-b6cc-51b6e38f73f9', 'hotel'),
  ('b26f23aa-dd04-4633-b950-5dcfff86793a', 'hotel'),
  ('842f019c-543e-4eb7-8145-8456debe2c9d', 'hotel'),
  ('6e5ed883-b4f8-42d1-a9e1-2f5c8b9f078b', 'hotel'),
  ('377154e1-1cbe-4e97-befc-5f7c73489e00', 'hotel'),
  ('da9bf99a-bca5-4bba-828b-182dcd32b2da', 'hotel'),
  ('bc407a7e-e8a8-4eb3-b7cf-43d41f0a2172', 'hotel'),
  ('4e277000-dc1c-423e-96a1-12d0c09c166c', 'hotel')
) as v(id, type)
where b.id = v.id;

-- Ho Chi Minh City Tour has no dates on the booking; its itinerary item is dated 24 Dec 2026
-- (no time on the item, so the booking times stay null). Decided by Mark, 10-11 Oct 2026.
update public.booking
set start_date = date '2026-12-24', end_date = date '2026-12-24'
where id = 'c95717c6-c957-4981-a7d9-ace26db779cd' and start_date is null and end_date is null;

-- Safety net: if any existing booking was missed, abort and roll everything back.
do $$
begin
  if exists (select 1 from public.booking where type is null) then
    raise exception 'Backfill incomplete: some bookings still have no type';
  end if;
end $$;

insert into public.schema_version (version, description)
values (4, 'Booking types phase 1: booking.type, details (jsonb), parent_booking_id with depth-one guard; type backfilled')
on conflict (version) do nothing;
