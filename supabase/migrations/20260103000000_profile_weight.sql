-- Body weight on the profile, captured during onboarding. NULL means the user
-- has not completed onboarding yet (the app uses this as the gate). The unit is
-- the existing profiles.default_unit.
alter table profiles
  add column weight numeric(6, 2);
