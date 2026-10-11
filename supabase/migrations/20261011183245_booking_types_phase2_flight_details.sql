-- Booking types phase 2: flight details data (Missing Features #83).
-- Data only, no schema change. Fills booking.details (v1, legs, passengers) for
-- the 7 flight bookings, from each booking's extracted_details. Core columns
-- (dates, times, cost, notes, extracted_details) are NOT touched. Each update
-- only applies while details is still null, so re-running changes nothing.
-- Plain UPDATE and INSERT statements only.

-- Air Canada AC889/AC8018 (LHR→YOW→YUL)
update public.booking
set details = $j${"v":1,"legs":[{"airline":"Air Canada","flight_number":"AC889","operated_by":null,"from_terminal":null,"to_terminal":null,"dep_time":"14:10","arr_date":"2026-09-09","arr_time":"17:05","seats":[{"passenger":"Andi","seat":"01G"},{"passenger":"Mark","seat":"01D"}],"cabin":"Business","baggage":null,"aircraft":"A330-300","duration":"7h55m","id":"l1","from":"LHR","to":"YOW","dep_date":"2026-09-09"},{"airline":"Air Canada","flight_number":"AC8018","operated_by":"Jazz","from_terminal":null,"to_terminal":null,"dep_time":"21:25","arr_date":"2026-09-09","arr_time":"22:13","seats":[{"passenger":"Andi","seat":"03D"},{"passenger":"Mark","seat":"03F"}],"cabin":"Business","baggage":null,"aircraft":null,"duration":"48m","id":"l2","from":"YOW","to":"YUL","dep_date":"2026-09-09"}],"passengers":[{"name":"Andi","eticket":"0142336309497"},{"name":"Mark","eticket":"0142336337289"}]}$j$::jsonb
where id = '1beaa952-da34-470f-a8be-bfc937b38604' and type = 'flight' and details is null;

-- Virgin Atlantic VS158 (BOS→LHR)
update public.booking
set details = $j${"v":1,"legs":[{"airline":"Virgin Atlantic","flight_number":"VS158","operated_by":null,"from_terminal":null,"to_terminal":null,"dep_time":"21:30","arr_date":"2026-09-24","arr_time":"08:00","seats":[{"passenger":"Andi","seat":"26H"},{"passenger":"Mark","seat":"26K"}],"cabin":"Premium Economy","baggage":null,"aircraft":null,"duration":null,"id":"l1","from":"BOS","to":"LHR","dep_date":"2026-09-23"}],"passengers":[{"name":"Andi","eticket":"9327417519448"},{"name":"Mark","eticket":"9327417519449"}]}$j$::jsonb
where id = '09d26211-e1f0-46b3-a472-fac97cec9a47' and type = 'flight' and details is null;

-- British Airways BA422/BA423 (LHR↔AGP)
update public.booking
set details = $j${"v":1,"legs":[{"airline":"British Airways","flight_number":"BA422","operated_by":null,"from_terminal":"5","to_terminal":null,"dep_time":"07:55","arr_date":"2026-11-10","arr_time":"11:50","seats":[],"cabin":"Club Europe","baggage":null,"aircraft":null,"duration":null,"id":"l1","from":"LHR","to":"AGP","dep_date":"2026-11-10"},{"airline":"British Airways","flight_number":"BA423","operated_by":null,"from_terminal":null,"to_terminal":"5","dep_time":"12:20","arr_date":"2026-11-18","arr_time":"14:25","seats":[],"cabin":"Club Europe","baggage":null,"aircraft":null,"duration":null,"id":"l2","from":"AGP","to":"LHR","dep_date":"2026-11-18"}],"passengers":[{"name":"Mark","eticket":null},{"name":"Andi","eticket":null}]}$j$::jsonb
where id = '45730e86-a77b-4949-bf9a-6daf221eca25' and type = 'flight' and details is null;

-- easyJet
update public.booking
set details = $j${"v":1,"legs":[{"airline":"easyJet","flight_number":"EZY865","operated_by":null,"from_terminal":"N","to_terminal":null,"dep_time":"12:25","arr_date":"2026-11-20","arr_time":"13:55","seats":[{"passenger":null,"seat":"17B"},{"passenger":null,"seat":"17C"}],"cabin":null,"baggage":"2 x 23kg hold bags","aircraft":null,"duration":null,"id":"l1","from":"LGW","to":"GLA","dep_date":"2026-11-20"},{"airline":"easyJet","flight_number":"EZY868","operated_by":null,"from_terminal":null,"to_terminal":"N","dep_time":"14:40","arr_date":"2026-11-22","arr_time":"16:10","seats":[{"passenger":null,"seat":"11D"},{"passenger":null,"seat":"11E"}],"cabin":null,"baggage":"2 x 23kg hold bags","aircraft":null,"duration":null,"id":"l2","from":"GLA","to":"LGW","dep_date":"2026-11-22"}],"passengers":[{"name":"Mark","eticket":null},{"name":"Andi","eticket":null}]}$j$::jsonb
where id = 'c23a3469-e288-463f-bd9d-b3fad3804952' and type = 'flight' and details is null;

-- Singapore Airlines SQ321 (LHR→SIN)
update public.booking
set details = $j${"v":1,"legs":[{"airline":"Singapore Airlines","flight_number":"SQ321","operated_by":null,"from_terminal":null,"to_terminal":null,"dep_time":null,"arr_date":"2026-12-16","arr_time":null,"seats":[{"passenger":"Andi","seat":"31H"},{"passenger":"Mark","seat":"31K"}],"cabin":"Premium Economy","baggage":"1 personal item, 1 cabin bag 7kg, 1 checked bag 35kg each","aircraft":null,"duration":null,"id":"l1","from":"LHR","to":"SIN","dep_date":"2026-12-15"}],"passengers":[{"name":"Andi","eticket":"6182477435803"},{"name":"Mark","eticket":"6182477435804"}]}$j$::jsonb
where id = 'e1a0b102-4c28-4446-a9d4-06b4135b5a56' and type = 'flight' and details is null;

-- British Airways BA032 (HKG→LHR)
update public.booking
set details = $j${"v":1,"legs":[{"airline":"British Airways","flight_number":"BA032","operated_by":null,"from_terminal":null,"to_terminal":null,"dep_time":null,"arr_date":"2027-01-04","arr_time":null,"seats":[],"cabin":"Premium Economy","baggage":null,"aircraft":"A350","duration":null,"id":"l1","from":"HKG","to":"LHR","dep_date":"2027-01-03"}],"passengers":[{"name":"Andi","eticket":"125-5894171029"},{"name":"Mark","eticket":"125-5894171030"}]}$j$::jsonb
where id = 'cfed3d11-bf59-4f21-a382-438141cd1f38' and type = 'flight' and details is null;

-- British Airways BA2640/BA2641 (LGW↔AGP)
update public.booking
set details = $j${"v":1,"legs":[{"airline":"British Airways","flight_number":"BA2640","operated_by":"BA Euroflyer","from_terminal":"S","to_terminal":null,"dep_time":null,"arr_date":null,"arr_time":null,"seats":[],"cabin":"Club Europe","baggage":null,"aircraft":null,"duration":null,"id":"l1","from":"LGW","to":"AGP","dep_date":"2027-03-16"},{"airline":"British Airways","flight_number":"BA2641","operated_by":"BA Euroflyer","from_terminal":null,"to_terminal":"S","dep_time":null,"arr_date":null,"arr_time":null,"seats":[],"cabin":"Club Europe","baggage":null,"aircraft":null,"duration":null,"id":"l2","from":"AGP","to":"LGW","dep_date":"2027-03-24"}],"passengers":[{"name":"Mark","eticket":null},{"name":"Andi","eticket":null}]}$j$::jsonb
where id = '577b6d36-d69d-4cbb-b4cb-d014c4b10562' and type = 'flight' and details is null;

insert into public.schema_version (version, description)
select 5, 'Booking types phase 2: details (legs, passengers) filled for the 7 flight bookings'
where not exists (select 1 from public.schema_version where version = 5);
