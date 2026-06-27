-- =============================================================================
-- Workout app — initial schema
-- =============================================================================
-- Sign-in-with-Apple ONLY. Every domain table is scoped to the authenticated
-- user via Row Level Security; there is no application-level admin role.
--
-- Conventions:
--   * Primary keys are uuid, default gen_random_uuid() (except `profiles`,
--     whose id IS the auth.users id).
--   * `created_at` / `updated_at` are timestamptz, default now().
--   * `updated_at` is maintained by a trigger (see set_updated_at()).
--   * auth.uid() returns the id of the currently authenticated user.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type weight_unit as enum ('kg', 'lb');

create type set_type as enum ('normal', 'warmup', 'dropset', 'failure');

create type muscle_group as enum (
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
  'forearms',
  'full_body'
);

create type equipment as enum (
  'barbell',
  'dumbbell',
  'machine',
  'cable',
  'bodyweight',
  'kettlebell',
  'band',
  'other'
);

create type exercise_category as enum ('compound', 'isolation');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

-- profiles: one row per auth user. id equals auth.users.id (not generated).
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  default_unit weight_unit not null default 'lb',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- exercises: the movement library. A NULL owner_id marks a global/built-in row
-- visible to everyone; a non-null owner_id marks a user's private custom row.
create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  primary_muscle muscle_group not null,
  secondary_muscles muscle_group[] not null default '{}',
  equipment equipment not null,
  category exercise_category not null default 'compound',
  owner_id uuid references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- workouts: a single training session belonging to one user.
create table workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- workout_exercises: an exercise placed into a workout, ordered by `position`.
create table workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references workouts (id) on delete cascade,
  exercise_id uuid not null references exercises (id),
  position int not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

-- sets: one logged set within a workout_exercise.
create table sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references workout_exercises (id) on delete cascade,
  set_index int not null default 0,
  weight numeric(7, 2) not null default 0,
  reps int not null default 0,
  unit weight_unit not null default 'lb',
  type set_type not null default 'normal',
  rpe numeric(3, 1),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Indexes (all foreign keys + frequent filter columns)
-- -----------------------------------------------------------------------------
create index exercises_name_idx on exercises (name);
create index exercises_owner_id_idx on exercises (owner_id);
create index workouts_user_id_idx on workouts (user_id);
create index workout_exercises_workout_id_idx on workout_exercises (workout_id);
create index workout_exercises_exercise_id_idx on workout_exercises (exercise_id);
create index sets_workout_exercise_id_idx on sets (workout_exercise_id);

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
-- Stamps updated_at = now() on every UPDATE for tables that track it.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger set_exercises_updated_at
  before update on exercises
  for each row execute function set_updated_at();

create trigger set_workouts_updated_at
  before update on workouts
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Auto-provision a profile when a new auth user is created
-- -----------------------------------------------------------------------------
-- Runs as the table owner (SECURITY DEFINER) so it can write to `profiles`
-- regardless of the RLS context of whoever triggered the auth signup.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table profiles enable row level security;
alter table exercises enable row level security;
alter table workouts enable row level security;
alter table workout_exercises enable row level security;
alter table sets enable row level security;

-- profiles: a user can only see and edit their own row. Inserts are normally
-- handled by handle_new_user(), but an explicit insert policy lets the client
-- self-heal a missing profile row.
create policy "profiles_select_own"
  on profiles for select
  using (id = auth.uid());

create policy "profiles_insert_own"
  on profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- exercises: everyone may read global rows (owner_id is null) plus their own
-- custom rows. Writes are restricted to the row owner.
create policy "exercises_select_global_or_own"
  on exercises for select
  using (owner_id is null or owner_id = auth.uid());

create policy "exercises_insert_own"
  on exercises for insert
  with check (owner_id = auth.uid());

create policy "exercises_update_own"
  on exercises for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "exercises_delete_own"
  on exercises for delete
  using (owner_id = auth.uid());

-- workouts: full CRUD, scoped to the owning user.
create policy "workouts_select_own"
  on workouts for select
  using (user_id = auth.uid());

create policy "workouts_insert_own"
  on workouts for insert
  with check (user_id = auth.uid());

create policy "workouts_update_own"
  on workouts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "workouts_delete_own"
  on workouts for delete
  using (user_id = auth.uid());

-- workout_exercises: access is allowed only when the parent workout belongs to
-- the current user. Checked with an EXISTS subquery against workouts.
create policy "workout_exercises_select_own"
  on workout_exercises for select
  using (
    exists (
      select 1 from workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  );

create policy "workout_exercises_insert_own"
  on workout_exercises for insert
  with check (
    exists (
      select 1 from workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  );

create policy "workout_exercises_update_own"
  on workout_exercises for update
  using (
    exists (
      select 1 from workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  );

create policy "workout_exercises_delete_own"
  on workout_exercises for delete
  using (
    exists (
      select 1 from workouts w
      where w.id = workout_exercises.workout_id
        and w.user_id = auth.uid()
    )
  );

-- sets: access is allowed only when the set rolls up (set -> workout_exercise
-- -> workout) to a workout owned by the current user.
create policy "sets_select_own"
  on sets for select
  using (
    exists (
      select 1
      from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  );

create policy "sets_insert_own"
  on sets for insert
  with check (
    exists (
      select 1
      from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  );

create policy "sets_update_own"
  on sets for update
  using (
    exists (
      select 1
      from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  );

create policy "sets_delete_own"
  on sets for delete
  using (
    exists (
      select 1
      from workout_exercises we
      join workouts w on w.id = we.workout_id
      where we.id = sets.workout_exercise_id
        and w.user_id = auth.uid()
    )
  );
