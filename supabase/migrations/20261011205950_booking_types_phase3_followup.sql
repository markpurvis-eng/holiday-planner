-- Booking types phase 3 follow-up (Missing Features #83). Data only, no schema change.
-- Volendam: boarding (embark) is 11:00 and the ship sails (departure) at 19:00.
-- Alagon hotel (24-25 Dec) is a night taken on a Solstice port day, so it becomes a child of the cruise.
-- Plain UPDATE and INSERT statements only; each update only applies while the row is still as found.

update public.booking
set details = jsonb_set(jsonb_set(details, '{embark_time}', '"11:00"'), '{departure_time}', '"19:00"')
where id = '606182e0-8e3f-42e0-b26a-b5f1228f1fc9' and type = 'cruise' and details->>'embark_time' = '19:00';

update public.booking
set parent_booking_id = '67808f97-55ad-4fbb-963c-0181320552a0'
where id = '377154e1-1cbe-4e97-befc-5f7c73489e00' and type = 'hotel' and parent_booking_id is null;

insert into public.schema_version (version, description)
select 7, 'Booking types phase 3 follow-up: Volendam embark/departure times; Alagon hotel linked to the Solstice'
where not exists (select 1 from public.schema_version where version = 7);
