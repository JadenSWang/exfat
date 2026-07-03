-- =============================================================================
-- Nutrition / calorie tracking — schema
-- =============================================================================
-- The app pivot adds calorie and macro tracking on top of the existing
-- Sign-in-with-Apple + RLS model. Every user-owned row is scoped to the
-- authenticated user via Row Level Security; auth.uid() is the current user.
--
-- Conventions (shared with 20260101000000_init.sql):
--   * Primary keys are uuid, default gen_random_uuid().
--   * `created_at` / `updated_at` are timestamptz, default now().
--   * `updated_at` is maintained by the set_updated_at() trigger defined in the
--     init migration — reused here, not redefined.
--   * Nutrition numbers are numeric(9,2): calories (kcal) and macros (grams).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');

create type food_source as enum ('ai_estimate', 'barcode', 'database', 'manual');

create type food_unit as enum ('g', 'oz', 'ml', 'tbsp', 'tsp', 'cup', 'piece', 'serving');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- foods: a reusable food library. A NULL owner_id marks a global/built-in row
-- visible to everyone; a non-null owner_id marks a user's private custom row.
-- Future barcode scans and database imports land here too (see `source`).
create table foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  source food_source not null default 'manual',
  barcode text,
  serving_qty numeric(9, 2) not null default 1,
  serving_unit food_unit not null default 'serving',
  calories numeric(9, 2) not null default 0,
  protein numeric(9, 2) not null default 0,
  carbs numeric(9, 2) not null default 0,
  fat numeric(9, 2) not null default 0,
  owner_id uuid references auth.users (id) on delete cascade,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- diary_entries: one logged food item in a user's daily diary. Denormalized
-- (name/macros copied in) so an entry is stable even if the source food row is
-- edited or deleted. `food_id` optionally links back to the foods library.
create table diary_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  entry_date date not null default current_date,
  meal meal_type not null default 'snack',
  description text not null,
  quantity numeric(9, 2) not null default 1,
  unit food_unit not null default 'serving',
  calories numeric(9, 2) not null default 0,
  protein numeric(9, 2) not null default 0,
  carbs numeric(9, 2) not null default 0,
  fat numeric(9, 2) not null default 0,
  source food_source not null default 'ai_estimate',
  is_estimate boolean not null default true,
  food_id uuid references foods (id) on delete set null,
  created_at timestamptz not null default now()
);

-- nutrition_goals: one row per user holding their daily calorie/macro targets.
create table nutrition_goals (
  user_id uuid primary key references auth.users (id) on delete cascade,
  calories numeric(9, 2) not null default 2000,
  protein numeric(9, 2) not null default 150,
  carbs numeric(9, 2) not null default 200,
  fat numeric(9, 2) not null default 65,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes (frequent filter columns + foreign keys)
-- -----------------------------------------------------------------------------
create index diary_entries_user_date_idx on diary_entries (user_id, entry_date);
create index foods_owner_id_idx on foods (owner_id);
create index foods_barcode_idx on foods (barcode);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
-- set_updated_at() is defined in 20260101000000_init.sql; reuse it here.
create trigger set_foods_updated_at
  before update on foods
  for each row execute function set_updated_at();

create trigger set_nutrition_goals_updated_at
  before update on nutrition_goals
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table foods enable row level security;
alter table diary_entries enable row level security;
alter table nutrition_goals enable row level security;

-- foods: everyone may read global rows (owner_id is null) plus their own custom
-- rows. Writes are restricted to the row owner.
create policy "foods_select_global_or_own"
  on foods for select
  using (owner_id is null or owner_id = auth.uid());

create policy "foods_insert_own"
  on foods for insert
  with check (owner_id = auth.uid());

create policy "foods_update_own"
  on foods for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "foods_delete_own"
  on foods for delete
  using (owner_id = auth.uid());

-- diary_entries: full CRUD, scoped to the owning user.
create policy "diary_entries_select_own"
  on diary_entries for select
  using (user_id = auth.uid());

create policy "diary_entries_insert_own"
  on diary_entries for insert
  with check (user_id = auth.uid());

create policy "diary_entries_update_own"
  on diary_entries for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "diary_entries_delete_own"
  on diary_entries for delete
  using (user_id = auth.uid());

-- nutrition_goals: full CRUD, scoped to the owning user.
create policy "nutrition_goals_select_own"
  on nutrition_goals for select
  using (user_id = auth.uid());

create policy "nutrition_goals_insert_own"
  on nutrition_goals for insert
  with check (user_id = auth.uid());

create policy "nutrition_goals_update_own"
  on nutrition_goals for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "nutrition_goals_delete_own"
  on nutrition_goals for delete
  using (user_id = auth.uid());
