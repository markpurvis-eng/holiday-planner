-- Booking types phase 5 (Missing Features #83). Data only, no schema change.
-- A reviewed pass over existing flight details and the three packages, from the booking
-- confirmation emails (Booking.com/Singapore Airlines, Trip.com, British Airways, Air Canada)
-- and from Mark (easyJet seat names, BA2640/41 e-ticket order).
-- Merge, never replace: each update only fills keys that are missing or null, leaves notes and
-- extracted_details alone, and keeps card numbers and loyalty IDs out of details.
-- Plain UPDATE and INSERT statements only.

-- 1. Flight legs: fill missing times, terminals, aircraft, durations, baggage (existing values win).
update public.booking b
set details = jsonb_set(b.details, '{legs}', x.legs)
from (
  select b2.id, jsonb_agg(case when f.patch is null then t.l else t.l || f.fill end order by t.o) as legs
  from public.booking b2
  cross join lateral jsonb_array_elements(b2.details->'legs') with ordinality as t(l, o)
  left join lateral (
    select p.patch,
           (select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
              from jsonb_each(p.patch) e
             where (t.l->e.key) is null or (t.l->e.key) = 'null'::jsonb) as fill
    from (values
  ('Singapore Airlines SQ321%', 'l1', $j${"from_terminal":"2","dep_time":"21:45","arr_time":"19:00","aircraft":"Boeing 777-300ER","duration":"13h15m"}$j$::jsonb),
  ('British Airways BA032%', 'l1', $j${"from_terminal":"1","to_terminal":"5","dep_time":"22:45","arr_time":"05:35","baggage":"1 personal item, 1 cabin bag, 2 x 23kg checked each"}$j$::jsonb),
  ('British Airways BA2640/BA2641%', 'l1', $j${"dep_time":"07:45","arr_date":"2027-03-16","arr_time":"11:45","duration":"3h","baggage":"1 cabin bag, 1 small handbag, 2 checked bags 32kg"}$j$::jsonb),
  ('British Airways BA2640/BA2641%', 'l2', $j${"dep_time":"11:55","arr_date":"2027-03-24","arr_time":"13:50","duration":"2h55m","baggage":"1 cabin bag, 1 small handbag, 2 checked bags 32kg"}$j$::jsonb),
  ('Air Canada AC889/AC8018%', 'l1', $j${"from_terminal":"2"}$j$::jsonb),
  ('Air Canada AC889/AC8018%', 'l2', $j${"aircraft":"Mitsubishi CRJ900"}$j$::jsonb),
  ('British Airways BA422/BA423%', 'l1', $j${"duration":"2h55m","baggage":"1 hand baggage, 1 cabin bag"}$j$::jsonb),
  ('British Airways BA422/BA423%', 'l2', $j${"duration":"3h05m","baggage":"1 hand baggage, 1 cabin bag"}$j$::jsonb)
) as p(pat, leg_id, patch)
    where b2.provider_name like p.pat and p.leg_id = t.l->>'id'
  ) f on true
  where b2.type = 'flight' and b2.details is not null
  group by b2.id
) x
where b.id = x.id and b.type = 'flight';

-- 2. easyJet seat names (Mark 17B and 11D; Andi the other seat of each pair), only while unnamed.
update public.booking
set details = jsonb_set(details, '{legs}', (
  select jsonb_agg(
    case
      when t.l->>'id' = 'l1' and t.l->'seats' = '[{"seat":"17B","passenger":null},{"seat":"17C","passenger":null}]'::jsonb
        then jsonb_set(t.l, '{seats}', '[{"seat":"17B","passenger":"Mark"},{"seat":"17C","passenger":"Andi"}]'::jsonb)
      when t.l->>'id' = 'l2' and t.l->'seats' = '[{"seat":"11D","passenger":null},{"seat":"11E","passenger":null}]'::jsonb
        then jsonb_set(t.l, '{seats}', '[{"seat":"11D","passenger":"Mark"},{"seat":"11E","passenger":"Andi"}]'::jsonb)
      else t.l
    end order by t.o)
  from jsonb_array_elements(details->'legs') with ordinality as t(l, o)))
where type = 'flight' and provider_name = 'easyJet' and details is not null;

-- 3. BA2640/41 e-tickets (Mark first, then Andi, as confirmed by Mark), only while empty.
update public.booking
set details = jsonb_set(details, '{passengers}', (
  select jsonb_agg(
    case
      when q.p->>'name' = 'Mark' and coalesce(q.p->>'eticket', '') = '' then q.p || '{"eticket":"125-2244103097"}'::jsonb
      when q.p->>'name' = 'Andi' and coalesce(q.p->>'eticket', '') = '' then q.p || '{"eticket":"125-2244103098"}'::jsonb
      else q.p
    end order by q.o)
  from jsonb_array_elements(details->'passengers') with ordinality as q(p, o)))
where type = 'flight' and provider_name like 'British Airways BA2640/BA2641%' and details is not null;

-- 4. Core times for the three flights that had none (the same values deriveFlightCore gives from the legs).
update public.booking set start_time = '21:45', end_time = '19:00'
where type = 'flight' and provider_name like 'Singapore Airlines SQ321%' and start_time is null and end_time is null;
update public.booking set start_time = '22:45', end_time = '05:35'
where type = 'flight' and provider_name like 'British Airways BA032%' and start_time is null and end_time is null;
update public.booking set start_time = '07:45', end_time = '13:50'
where type = 'flight' and provider_name like 'British Airways BA2640/BA2641%' and start_time is null and end_time is null;

-- 5. The three packages (type other): supplier, stay, includes, payments. Only while details is null.
update public.booking set details = $j${"v":1,"supplier":"Golf Holidays Direct","accommodation":"Hotel Angela","includes":["2 green fees (buggies prepaid)","Private transfers"],"payments":"£1,300 total for 2 green fees and private transfers, split with golfing friends. Mark's share £650 (£100 deposit + £550 balance, paid 13 Aug 2026 by bank transfer)."}$j$::jsonb
where type = 'other' and details is null and provider_name like 'Golf package%';

update public.booking set details = $j${"v":1,"supplier":"Pickleball Pro Retreats","accommodation":"Hotel Angela, Calle Jaén 2, 29640 Fuengirola","payments":"£500 deposit + £1,200 balance, paid by bank transfer 10 Jun 2026."}$j$::jsonb
where type = 'other' and details is null and provider_name = 'Pickleball Coaching Retreat';

update public.booking set details = $j${"v":1,"supplier":"Golf Travel People","accommodation":"La Cala Resort, Mijas Costa, Málaga: 6 nights, 1 Twin Classic Deluxe, B&B","includes":["3 golf lessons (9 holes)","7 rounds: Academy Par3 x5, GC Asia x1, GC Europe x1","Buggy included (not at the Academy)"],"payments":"£2,882 total for 2 people. £100 deposit paid; balance £2,782 due about 5 Jan 2027."}$j$::jsonb
where type = 'other' and details is null and provider_name like 'La Cala Resort + Golf Package%';

insert into public.schema_version (version, description)
select 8, 'Booking types phase 5: flight details filled from confirmations, easyJet seat names, BA2640/41 e-tickets, package details'
where not exists (select 1 from public.schema_version where version = 8);
