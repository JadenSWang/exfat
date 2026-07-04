-- =============================================================================
-- My Pantry: what food the user has at home
-- =============================================================================
-- Populated after a shopping trip by photographing the receipt (AI extraction
-- via the estimator's /receipt/jobs) or rapid-scanning barcodes. The AI coach
-- reads active items to build meal plans. Receipt items usually have no foods
-- match, so name is the only required field; barcode adds link to a foods row.
-- Items are soft-deleted via consumed_at ("used it") so removal is cheap and
-- history can inform future planning.
-- =============================================================================

create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  brand text,
  food_id uuid references foods (id) on delete set null,
  source text not null default 'manual' check (source in ('receipt', 'barcode', 'manual')),
  added_at timestamptz not null default now(),
  consumed_at timestamptz
);

create index pantry_items_user_active_idx on pantry_items (user_id, added_at desc)
  where consumed_at is null;

alter table pantry_items enable row level security;

create policy "pantry_items_select_own"
  on pantry_items for select
  using (user_id = auth.uid());

create policy "pantry_items_insert_own"
  on pantry_items for insert
  with check (user_id = auth.uid());

create policy "pantry_items_update_own"
  on pantry_items for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "pantry_items_delete_own"
  on pantry_items for delete
  using (user_id = auth.uid());
