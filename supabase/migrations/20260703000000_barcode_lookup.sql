-- =============================================================================
-- Barcode lookup + crowdsourced nutrition submissions
-- =============================================================================
-- Barcode scans resolve in three tiers (see the lookup-barcode edge function):
--   1. The global foods library (owner_id is null) — our own cache.
--   2. Open Food Facts — on a hit, the edge function inserts a global foods
--      row (source 'database', verified true) so the next scan is tier 1.
--   3. Crowdsourcing — the user types the label in. That creates a private
--      foods row for them immediately, plus a barcode_submissions row so we
--      can later promote a barcode to the global library once independent
--      submissions agree (the guardrail against fake/malicious labels).
--
-- Conventions follow 20260102000000_nutrition.sql (uuid PKs, timestamptz,
-- numeric(9,2) for kcal/grams, set_updated_at() from the init migration).
-- =============================================================================

-- One global (owner_id is null) foods row per barcode. Private rows are not
-- constrained: many users may have their own submission for the same barcode.
create unique index foods_global_barcode_key
  on foods (barcode)
  where owner_id is null and barcode is not null;

-- barcode_submissions: raw crowdsourced label data, one row per user per
-- barcode (re-submitting replaces your previous answer). This is the audit
-- trail the future consensus/guardrail job reads; it is never shown to other
-- users directly.
create table barcode_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  barcode text not null,
  name text not null,
  brand text,
  serving_qty numeric(9, 2) not null default 1,
  serving_unit food_unit not null default 'serving',
  calories numeric(9, 2) not null default 0,
  protein numeric(9, 2) not null default 0,
  carbs numeric(9, 2) not null default 0,
  fat numeric(9, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, barcode)
);

create index barcode_submissions_barcode_idx on barcode_submissions (barcode);

create trigger set_barcode_submissions_updated_at
  before update on barcode_submissions
  for each row execute function set_updated_at();

-- RLS: users may write and read only their own submissions. Cross-user
-- aggregation (consensus promotion) runs server-side with the service role.
alter table barcode_submissions enable row level security;

create policy "barcode_submissions_select_own"
  on barcode_submissions for select
  using (user_id = auth.uid());

create policy "barcode_submissions_insert_own"
  on barcode_submissions for insert
  with check (user_id = auth.uid());

create policy "barcode_submissions_update_own"
  on barcode_submissions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "barcode_submissions_delete_own"
  on barcode_submissions for delete
  using (user_id = auth.uid());
