-- =============================================================================
-- Outreach Staging — Full schema init
-- =============================================================================
-- Paste this entire file into the staging project's SQL editor and click Run.
-- Idempotent: safe to re-run (uses IF NOT EXISTS / OR REPLACE).
-- =============================================================================

create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------------------------
-- Helper: auto-update updated_at on row update
-- -----------------------------------------------------------------------------
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- =============================================================================
-- EXISTING TABLES (mirrors current production shape)
-- =============================================================================

-- contacts -------------------------------------------------------------------
create table if not exists contacts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  first_name text,
  last_name text,
  company text,
  role text,
  tags text[] default '{}',
  status text default 'not_contacted',
  lead_stage text default 'new_lead',
  notes text,
  assigned_sender_id uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists contacts_user_email_idx
  on contacts(user_id, lower(email));
create index if not exists contacts_user_id_idx on contacts(user_id);
create index if not exists contacts_status_idx on contacts(status);
create index if not exists contacts_lead_stage_idx on contacts(lead_stage);

drop trigger if exists contacts_updated_at on contacts;
create trigger contacts_updated_at before update on contacts
  for each row execute function update_updated_at();

-- sender_emails --------------------------------------------------------------
create table if not exists sender_emails (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text,
  daily_limit integer default 50,
  created_at timestamptz default now(),
  unique(user_id, email)
);

create index if not exists sender_emails_user_idx on sender_emails(user_id);

-- Wire contacts.assigned_sender_id FK now that sender_emails exists
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_assigned_sender_fk'
  ) then
    alter table contacts add constraint contacts_assigned_sender_fk
      foreign key (assigned_sender_id) references sender_emails(id) on delete set null;
  end if;
end $$;

-- contact_lists --------------------------------------------------------------
create table if not exists contact_lists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists contact_lists_user_idx on contact_lists(user_id);

drop trigger if exists contact_lists_updated_at on contact_lists;
create trigger contact_lists_updated_at before update on contact_lists
  for each row execute function update_updated_at();

-- list_contacts (junction) ---------------------------------------------------
create table if not exists list_contacts (
  id uuid primary key default uuid_generate_v4(),
  list_id uuid not null references contact_lists(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  unique(list_id, contact_id)
);

create index if not exists list_contacts_list_idx on list_contacts(list_id);
create index if not exists list_contacts_contact_idx on list_contacts(contact_id);

-- tags -----------------------------------------------------------------------
create table if not exists tags (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz default now(),
  unique(user_id, name)
);

create index if not exists tags_user_idx on tags(user_id);

-- campaigns (legacy — kept so the old UI can still run on staging) ----------
create table if not exists campaigns (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  subject_b text,
  body text not null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  status text default 'draft',
  send_days integer[] default '{1,2,3,4,5}',
  parent_campaign_id uuid references campaigns(id) on delete set null,
  trigger_engagement text,
  send_as_reply boolean default false,
  list_id uuid references contact_lists(id) on delete set null,
  from_email_id uuid references sender_emails(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists campaigns_user_id_idx on campaigns(user_id);
create index if not exists campaigns_status_idx on campaigns(status);
create index if not exists campaigns_parent_idx on campaigns(parent_campaign_id);

drop trigger if exists campaigns_updated_at on campaigns;
create trigger campaigns_updated_at before update on campaigns
  for each row execute function update_updated_at();

-- campaign_contacts ----------------------------------------------------------
create table if not exists campaign_contacts (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  unique(campaign_id, contact_id)
);

create index if not exists cc_campaign_idx on campaign_contacts(campaign_id);
create index if not exists cc_contact_idx on campaign_contacts(contact_id);

-- =============================================================================
-- NEW TABLES (the v2 model)
-- =============================================================================

-- sequences ------------------------------------------------------------------
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
  legacy_campaign_id uuid, -- nullable; set during prod migration to map old → new
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists sequences_user_idx on sequences(user_id);
create index if not exists sequences_status_idx on sequences(status);
create index if not exists sequences_legacy_idx on sequences(legacy_campaign_id);

drop trigger if exists sequences_updated_at on sequences;
create trigger sequences_updated_at before update on sequences
  for each row execute function update_updated_at();

-- sequence_steps -------------------------------------------------------------
create table if not exists sequence_steps (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references sequences(id) on delete cascade,
  step_order integer not null,
  type text not null check (type in ('email', 'wait', 'condition')),

  -- email step fields
  subject text,
  subject_b text,
  body text,
  send_as_reply boolean default false,

  -- wait step fields
  delay_days numeric,
  delay_hours integer,

  -- condition step fields
  triggers text[],         -- e.g. {opened}, {opened,clicked}, {not_opened}
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

-- enrollments (per-contact position in a sequence) ---------------------------
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

-- broadcasts (one-off newsletters / announcements) ---------------------------
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

-- automations ("when X then Y") ----------------------------------------------
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
-- sends + events (one row per email sent — usable by both old campaigns AND
-- new sequences/broadcasts. Exactly one of campaign_id, sequence_step_id, or
-- broadcast_id is set per row.)
-- =============================================================================

create table if not exists sends (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,

  -- Source: exactly one of these is set
  campaign_id uuid references campaigns(id) on delete cascade,
  sequence_step_id uuid references sequence_steps(id) on delete set null,
  sequence_id uuid references sequences(id) on delete set null,
  broadcast_id uuid references broadcasts(id) on delete cascade,

  resend_id text,
  message_id text, -- for reply threading
  variant text,
  sender_email_id uuid references sender_emails(id) on delete set null,
  from_email_address text,

  status text not null default 'pending'
    check (status in ('pending','sent','delivered','opened','clicked','bounced','failed','replied')),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists sends_contact_idx on sends(contact_id);
create index if not exists sends_user_idx on sends(user_id);
create index if not exists sends_campaign_idx on sends(campaign_id);
create index if not exists sends_seq_step_idx on sends(sequence_step_id);
create index if not exists sends_seq_idx on sends(sequence_id);
create index if not exists sends_broadcast_idx on sends(broadcast_id);
create index if not exists sends_status_idx on sends(status);
create index if not exists sends_resend_idx on sends(resend_id) where resend_id is not null;

create table if not exists events (
  id uuid primary key default uuid_generate_v4(),
  send_id uuid not null references sends(id) on delete cascade,
  type text not null check (type in ('sent','delivered','opened','clicked','bounced','replied')),
  metadata jsonb default '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists events_send_idx on events(send_id);
create index if not exists events_type_idx on events(type);
create index if not exists events_created_idx on events(created_at);

-- =============================================================================
-- settings (per-user)
-- =============================================================================
create table if not exists settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  resend_api_key text,
  from_email text,
  from_name text,
  daily_send_limit integer default 50,
  signature_html text,
  signature_image_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

drop trigger if exists settings_updated_at on settings;
create trigger settings_updated_at before update on settings
  for each row execute function update_updated_at();

-- =============================================================================
-- Row Level Security
-- =============================================================================

alter table contacts enable row level security;
drop policy if exists "users own contacts" on contacts;
create policy "users own contacts" on contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table sender_emails enable row level security;
drop policy if exists "users own sender_emails" on sender_emails;
create policy "users own sender_emails" on sender_emails
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table contact_lists enable row level security;
drop policy if exists "users own contact_lists" on contact_lists;
create policy "users own contact_lists" on contact_lists
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table list_contacts enable row level security;
drop policy if exists "users own list_contacts" on list_contacts;
create policy "users own list_contacts" on list_contacts
  for all using (
    exists (select 1 from contact_lists where contact_lists.id = list_contacts.list_id and contact_lists.user_id = auth.uid())
  );

alter table tags enable row level security;
drop policy if exists "users own tags" on tags;
create policy "users own tags" on tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table campaigns enable row level security;
drop policy if exists "users own campaigns" on campaigns;
create policy "users own campaigns" on campaigns
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table campaign_contacts enable row level security;
drop policy if exists "users own campaign_contacts" on campaign_contacts;
create policy "users own campaign_contacts" on campaign_contacts
  for all using (
    exists (select 1 from campaigns where campaigns.id = campaign_contacts.campaign_id and campaigns.user_id = auth.uid())
  );

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

alter table sends enable row level security;
drop policy if exists "users read own sends" on sends;
create policy "users read own sends" on sends
  for select using (auth.uid() = user_id);

alter table events enable row level security;
drop policy if exists "users read own events" on events;
create policy "users read own events" on events
  for select using (
    exists (select 1 from sends where sends.id = events.send_id and sends.user_id = auth.uid())
  );

alter table settings enable row level security;
drop policy if exists "users own settings" on settings;
create policy "users own settings" on settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =============================================================================
-- Done.
-- =============================================================================
