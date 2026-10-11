-- Booking types phase 3: details data and excursion links (Missing Features #83).
-- Data only, no schema change. Fills booking.details (v1) for 25 bookings (17 hotel,
-- 2 car hire, 2 cruise, 4 excursion) from each booking's extracted_details, and
-- links the three Vietnam tours to the Celebrity Solstice cruise through
-- parent_booking_id. The three package bookings (type other) are left empty.
-- Core columns (dates, times, cost, notes, extracted_details) are NOT touched.
-- Each details update only applies while details is still null, and each link
-- only while parent_booking_id is still null, so re-running changes nothing.
-- Plain UPDATE and INSERT statements only. Card numbers, loyalty and
-- insurance policy numbers and lockbox codes stay in extracted_details.

-- The Old Palace Lodge, Lincoln
update public.booking
set details = $j${"v":1,"phone":"+44 1522 581447","cancellation":"Non-refundable"}$j$::jsonb
where id = '1a84ab3f-1392-4bbc-98d5-c50c85cb644d' and type = 'hotel' and details is null;

-- Premier Inn Meridian Point, Cleethorpes
update public.booking
set details = $j${"v":1}$j$::jsonb
where id = '230450e8-4070-49b3-af8a-30f565e55b12' and type = 'hotel' and details is null;

-- Potters Resorts Five Lakes (June)
update public.booking
set details = $j${"v":1,"phone":"0333 3207 407","room_type":"3 rooms, Village Premier Plus (2 Doubles with Patio, 1 Double/Twin Golf Views)","guests":"5 adults in 3 rooms"}$j$::jsonb
where id = '7c9a5646-a896-4f12-b14c-2b5636231145' and type = 'hotel' and details is null;

-- Airbnb Cambridge
update public.booking
set details = $j${"v":1,"phone":"Host Alessa +44 7477 622858, Pedro +44 7426 059359","room_type":"3-bedroom house","guests":"5 adults","parking":"Yes"}$j$::jsonb
where id = '6c058bc6-f1ca-4847-bb96-08748c39234e' and type = 'hotel' and details is null;

-- Manoir Sherbrooke, Montreal
update public.booking
set details = $j${"v":1,"phone":"+1 514-845-0915"}$j$::jsonb
where id = '195afa37-2f9b-4e01-8527-78a894ba5892' and type = 'hotel' and details is null;

-- The Dagny Boston
update public.booking
set details = $j${"v":1,"phone":"+1 617-348-1295","cancel_by":"2026-09-16","cancellation":"Free cancellation until 16 Sep; USD 335.70 penalty after"}$j$::jsonb
where id = '3fd4942c-8709-4e8b-84b3-cd7e3046568e' and type = 'hotel' and details is null;

-- Artful Lodger, Newport RI
update public.booking
set details = $j${"v":1,"phone":"+1 401-847-3132","cancellation":"Pre-charged, non-refundable"}$j$::jsonb
where id = '42b464c8-8ea7-44a8-97f3-955d0816185e' and type = 'hotel' and details is null;

-- Potters Five Lakes (October)
update public.booking
set details = $j${"v":1,"room_type":"Village Premier Plus Double Room with Patio","board_basis":"Fully inclusive (food, drinks from 3pm on arrival day, entertainment, leisure facilities)","guests":"2 adults","cancellation":"Cancellation Protection declined"}$j$::jsonb
where id = '94d99306-6845-4737-8e94-e8f7cc55a46d' and type = 'hotel' and details is null;

-- The Manor Resort, Devon
update public.booking
set details = $j${"v":1,"room_type":"Double Room","board_basis":"Full board","guests":"2 adults","phone":"01837 53053","parking":"Free on-site parking"}$j$::jsonb
where id = '0743794f-5444-4675-a98e-e68385e45439' and type = 'hotel' and details is null;

-- Hotel Angela
update public.booking
set details = $j${"v":1,"cancellation":"Non-refundable"}$j$::jsonb
where id = '354ca5aa-5af2-4087-b6cc-51b6e38f73f9' and type = 'hotel' and details is null;

-- Pickleball Retreat extra night
update public.booking
set details = $j${"v":1}$j$::jsonb
where id = 'b26f23aa-dd04-4633-b950-5dcfff86793a' and type = 'hotel' and details is null;

-- Airbnb Paisley
update public.booking
set details = $j${"v":1,"room_type":"Entire home/apt, 2 beds","guests":"2 travelling (reservation shows 1)","phone":"+44 7825 512428","cancel_by":"2026-11-15","cancellation":"Free before 3pm 15 Nov; partial refund before 3pm 20 Nov; non-refundable after"}$j$::jsonb
where id = '842f019c-543e-4eb7-8145-8456debe2c9d' and type = 'hotel' and details is null;

-- Swissotel The Stamford, Singapore
update public.booking
set details = $j${"v":1,"cancellation":"Non-refundable"}$j$::jsonb
where id = '6e5ed883-b4f8-42d1-a9e1-2f5c8b9f078b' and type = 'hotel' and details is null;

-- Alagon D'Antique HCMC
update public.booking
set details = $j${"v":1}$j$::jsonb
where id = '377154e1-1cbe-4e97-befc-5f7c73489e00' and type = 'hotel' and details is null;

-- Kerry Hotel Hong Kong
update public.booking
set details = $j${"v":1}$j$::jsonb
where id = 'da9bf99a-bca5-4bba-828b-182dcd32b2da' and type = 'hotel' and details is null;

-- Premier Inn Gatwick North
update public.booking
set details = $j${"v":1,"cancellation":"Non-refundable (prepaid)"}$j$::jsonb
where id = 'bc407a7e-e8a8-4eb3-b7cf-43d41f0a2172' and type = 'hotel' and details is null;

-- Holiday World Polynesia
update public.booking
set details = $j${"v":1,"board_basis":"All inclusive","cancel_by":"2027-03-19","cancellation":"Free cancellation until 19 Mar 2027 23:59, then a first-night fee applies"}$j$::jsonb
where id = '4e277000-dc1c-423e-96a1-12d0c09c166c' and type = 'hotel' and details is null;

-- Kendall Cars
update public.booking
set details = $j${"v":1,"supplier":"Kendall Cars","car_class":"Large Automatic Estate","pickup_location":"34 Aldershot Rd, Guildford GU2 8AF","return_location":"34 Aldershot Rd, Guildford GU2 8AF","phone":"+44 1483 574434","excess":"£1,000–£1,500","insurance":"CDW declined","mileage":"Unlimited"}$j$::jsonb
where id = '85df37f8-3766-4414-8572-558f4973768b' and type = 'car_hire' and details is null;

-- Avis Boston to Newport
update public.booking
set details = $j${"v":1,"supplier":"Avis","pickup_location":"Boston","return_location":"Newport RI area","insurance":"CDW & SLI via Bettersafe.com policy"}$j$::jsonb
where id = 'ba847d39-f549-4291-99c7-93b7d9d2d620' and type = 'car_hire' and details is null;

-- Holland America Volendam
update public.booking
set details = $j${"v":1,"cruise_line":"Holland America Line","ship":"Volendam","voyage":"V648","cabin":"7010","category":"Category SA (King bed)","dining":"Main Dining, table for 2","embark_port":"Montréal","embark_time":"19:00","disembark_port":"Boston","disembark_time":"07:00"}$j$::jsonb
where id = '606182e0-8e3f-42e0-b26a-b5f1228f1fc9' and type = 'cruise' and details is null;

-- Celebrity Solstice
update public.booking
set details = $j${"v":1,"cruise_line":"Celebrity Cruises","ship":"Celebrity Solstice","cabin":"9224","category":"C1 Prime Concierge","dining":"6:00pm","embark_port":"Singapore","disembark_port":"Hong Kong"}$j$::jsonb
where id = '67808f97-55ad-4fbb-963c-0181320552a0' and type = 'cruise' and details is null;

-- RESO Underground City tour
update public.booking
set details = $j${"v":1,"operator":"Get Your Guide","meeting_point":"Café Humble Lion, 1204 Av. McGill College, Montréal (arrive by 10:20)"}$j$::jsonb
where id = '24bd7501-f24b-45eb-84fa-275757f13769' and type = 'excursion' and details is null;

-- Ho Chi Minh City Tour
update public.booking
set details = $j${"v":1}$j$::jsonb
where id = 'c95717c6-c957-4981-a7d9-ace26db779cd' and type = 'excursion' and details is null;

-- Da Nang private tour
update public.booking
set details = $j${"v":1,"operator":"Minh Vu Travel","guide_contact":"booking@danangtohoian.com / +84 905 989 702","bring":"Money for entry tickets (not included); VND balance paid on the day"}$j$::jsonb
where id = '56b99b1c-84ef-4bbe-874d-ea5418a7b17e' and type = 'excursion' and details is null;

-- Halong Bay 2D1N
update public.booking
set details = $j${"v":1,"operator":"Indochina Junk (Prince Junk)","duration":"2 days, 1 night","meeting_point":"Starbucks Halong, pick-up 11:15; finish at Halong port","guide_contact":"huong@indochina-junk.com / WhatsApp +84 90 612 6607","bring":"Pre-check-in form due by 26 Dec; $294 balance in cash on boarding"}$j$::jsonb
where id = 'e17ff580-0848-47d3-909e-4a89a7c6400f' and type = 'excursion' and details is null;

-- Vietnam tours become children of the Celebrity Solstice cruise (all three fall within its dates)
update public.booking
set parent_booking_id = '67808f97-55ad-4fbb-963c-0181320552a0'
where id in ('c95717c6-c957-4981-a7d9-ace26db779cd', '56b99b1c-84ef-4bbe-874d-ea5418a7b17e', 'e17ff580-0848-47d3-909e-4a89a7c6400f')
  and type = 'excursion' and parent_booking_id is null;

insert into public.schema_version (version, description)
select 6, 'Booking types phase 3: details filled for hotel, car hire, cruise and excursion bookings; Vietnam tours linked to the Celebrity Solstice'
where not exists (select 1 from public.schema_version where version = 6);
