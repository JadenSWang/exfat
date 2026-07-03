-- Physical attributes for a proper Mifflin–St Jeor calorie estimate. Weight was
-- already captured (20260103); this adds height, sex, and an *approximate* age.
--
-- We deliberately store only birth month + year (not a full date of birth): it
-- is enough to compute age within a year for the BMR formula, and asking for
-- less feels less intrusive. All columns are nullable — a profile predating this
-- migration keeps working and simply falls back to the weight-only heuristic
-- until the user fills them in.

create type biological_sex as enum ('male', 'female');

alter table profiles
  add column height_cm numeric(6, 2),
  add column sex biological_sex,
  add column birth_year int check (birth_year between 1900 and 2100),
  add column birth_month int check (birth_month between 1 and 12);
