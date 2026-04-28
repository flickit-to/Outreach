-- =============================================================================
-- Production migration: v2 (Sequences / Broadcasts / Automations)
-- =============================================================================
-- Paste this entire file into the PRODUCTION Supabase SQL editor and click Run.
--
-- This migration is PURELY ADDITIVE:
--   • 5 new tables   (sequences, sequence_steps, enrollments, broadcasts, automations)
--   • 4 new columns on `sends` (all nullable)
--   • 1 backfill of sends.user_id from campaigns.user_id
--   • 1 additional RLS policy on `sends` (existing policy left alone)
--
-- Nothing existing is dropped, modified, or moved. Existing campaigns flow is
-- untouched. Idempotent — safe to re-run.
-- =============================================================================

-- uuid-ossp + update_updated_at() already exist from the initial prod migration.
-- We rely on them being present.

-- =============================================================================
-- 5 new tables
-- =============================================================================

create table if not exists sequences (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'active', 'paused', 'archived')),
  list_id uuid references contact_lists(id) on delete set null,
  from_email_id uuid references sender_emails(id) on delete set null,
  send_days integer[] default '{1,2,3,4,5}',
  scheduled_at timestamptz,
  legacy_campaign_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sequences_user_idx on sequences(user_id);
create index if not exists sequences_status_idx on sequences(status);
create index if not exists sequences_legacy_idx on sequences(legacy_campaign_id);
drop trigger if exists sequences_updated_at on sequences;
create trigger sequences_updated_at before update on sequences
  for each row execute function update_updated_at();

create table if not exists sequence_steps (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  step_order integer not null,
  type text not null check (type in ('email', 'wait', 'condition')),
  subject text,
  subject_b text,
  body text,
  send_as_reply boolean default false,
  delay_days numeric,
  delay_hours integer,
  triggers text[],
  within_days integer,
  on_true_step_id uuid,
  on_false_step_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(sequence_id, step_order)
);
create index if not exists sequence_steps_seq_idx on sequence_steps(sequence_id, step_order);
drop trigger if exists sequence_steps_updated_at on sequence_steps;
create trigger sequence_steps_updated_at before update on sequence_steps
  for each row execute function update_updated_at();

create table if not exists enrollments (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  current_step_id uuid references sequence_steps(id) on delete set null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'completed', 'exited', 'unsubscribed')),
  next_run_at timestamptz,
  enrolled_at timestamptz default now(),
  completed_at timestamptz,
  exit_reason text,
  unique(sequence_id, contact_id)
);
create index if not exists enrollments_seq_idx on enrollments(sequence_id);
create index if not exists enrollments_contact_idx on enrollments(contact_id);
create index if not exists enrollments_active_run_idx
  on enrollments(status, next_run_at) where status = 'active';

create table if not exists broadcasts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  list_id uuid references contact_lists(id) on delete set null,
  segment_filter jsonb default '{}',
  from_email_id uuid references sender_emails(id) on delete set null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists broadcasts_user_idx on broadcasts(user_id);
create index if not exists broadcasts_status_idx on broadcasts(status);
drop trigger if exists broadcasts_updated_at on broadcasts;
create trigger broadcasts_updated_at before update on broadcasts
  for each row execute function update_updated_at();

create table if not exists automations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),
  trigger_type text not null check (trigger_type in (
    'list_joined', 'stage_changed', 'tag_added',
    'email_opened', 'email_clicked', 'email_not_opened',
    'replied', 'manual', 'schedule'
  )),
  trigger_config jsonb default '{}',
  action_type text not null check (action_type in (
    'enroll_in_sequence', 'enroll_in_broadcast',
    'set_lead_stage', 'add_tag', 'remove_tag',
    'add_to_list', 'remove_from_list',
    'exit_sequence', 'notify_user'
  )),
  action_config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists automations_user_idx on automations(user_id);
create index if not exists automations_active_idx
  on automations(status, trigger_type) where status = 'active';
drop trigger if exists automations_updated_at on automations;
create trigger automations_updated_at before update on automations
  for each row execute function update_updated_at();

-- =============================================================================
-- 4 new columns on `sends` (nullable, additive)
-- =============================================================================

alter table sends add column if not exists user_id uuid;
alter table sends add column if not exists sequence_id uuid;
alter table sends add column if not exists sequence_step_id uuid;
alter table sends add column if not exists broadcast_id uuid;

-- Foreign keys (run after columns exist; idempotent via DO blocks)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sends_user_fk') then
    alter table sends add constraint sends_user_fk
      foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sends_sequence_fk') then
    alter table sends add constraint sends_sequence_fk
      foreign key (sequence_id) references sequences(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sends_sequence_step_fk') then
    alter table sends add constraint sends_sequence_step_fk
      foreign key (sequence_step_id) references sequence_steps(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sends_broadcast_fk') then
    alter table sends add constraint sends_broadcast_fk
      foreign key (broadcast_id) references broadcasts(id) on delete cascade;
  end if;
end $$;

create index if not exists sends_user_idx on sends(user_id);
create index if not exists sends_sequence_idx on sends(sequence_id);
create index if not exists sends_seq_step_idx on sends(sequence_step_id);
create index if not exists sends_broadcast_idx on sends(broadcast_id);

-- =============================================================================
-- Backfill sends.user_id from campaigns.user_id (existing rows)
-- =============================================================================

update sends
set user_id = c.user_id
from campaigns c
where sends.campaign_id = c.id
  and sends.user_id is null;

-- =============================================================================
-- RLS for new tables (per-user)
-- =============================================================================

alter table sequences enable row level security;
drop policy if exists "users own sequences" on sequences;
create policy "users own sequences" on sequences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table sequence_steps enable row level security;
drop policy if exists "users own sequence_steps" on sequence_steps;
create policy "users own sequence_steps" on sequence_steps
  for all using (
    exists (select 1 from sequences where sequences.id = sequence_steps.sequence_id and sequences.user_id = auth.uid())
  );

alter table enrollments enable row level security;
drop policy if exists "users own enrollments" on enrollments;
create policy "users own enrollments" on enrollments
  for all using (
    exists (select 1 from sequences where sequences.id = enrollments.sequence_id and sequences.user_id = auth.uid())
  );

alter table broadcasts enable row level security;
drop policy if exists "users own broadcasts" on broadcasts;
create policy "users own broadcasts" on broadcasts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table automations enable row level security;
drop policy if exists "users own automations" on automations;
create policy "users own automations" on automations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- Additional RLS on `sends` so sequence/broadcast sends are readable too.
-- The original "Users can read own sends" policy (campaign-based) is left in
-- place; this new policy is OR'd with it.
-- =============================================================================

drop policy if exists "users read sequence and broadcast sends" on sends;
create policy "users read sequence and broadcast sends" on sends
  for select using (
    user_id is not null and user_id = auth.uid()
  );

-- =============================================================================
-- Done. Verify with:
--   select table_name from information_schema.tables
--   where table_schema='public'
--   and table_name in ('sequences','sequence_steps','enrollments','broadcasts','automations')
--   order by table_name;
-- Expect 5 rows.
-- =============================================================================
