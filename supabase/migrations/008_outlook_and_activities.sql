-- Outlook integration: connected mailbox(es) + a unified activities table.
--
-- outlook_connections stores OAuth tokens per connected Outlook mailbox.
-- Multiple rows per user when they connect more than one account.
--
-- activities is a generic multi-channel log: email (from Outlook sync OR
-- sequence sends), LinkedIn DM/connection/InMail (manual), notes, etc.
-- Joined to contacts so every contact has a single timeline.

create extension if not exists "pgcrypto";

create table if not exists public.outlook_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mailbox_address text not null,
  display_name text,
  access_token text not null,
  refresh_token text not null,
  token_expires_at timestamptz not null,
  last_sync_at timestamptz,
  last_sync_status text,
  status text not null default 'active'
    check (status in ('active', 'disconnected', 'error')),
  scopes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, mailbox_address)
);

create index if not exists outlook_connections_user_idx on public.outlook_connections(user_id);

alter table public.outlook_connections enable row level security;
drop policy if exists "users own outlook_connections" on public.outlook_connections;
create policy "users own outlook_connections" on public.outlook_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================================

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,

  channel text not null
    check (channel in ('email', 'linkedin_dm', 'linkedin_connection', 'linkedin_inmail', 'phone', 'meeting', 'note')),
  direction text not null
    check (direction in ('inbound', 'outbound', 'none')),

  subject text,
  body text,
  occurred_at timestamptz not null,

  -- where the activity came from
  source text,
  source_id text,
  mailbox_address text,
  metadata jsonb default '{}'::jsonb,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- prevents duplicate inserts when re-syncing the same outlook message
  unique (user_id, source, source_id)
);

create index if not exists activities_contact_idx on public.activities(contact_id);
create index if not exists activities_user_occurred_idx on public.activities(user_id, occurred_at desc);
create index if not exists activities_channel_idx on public.activities(channel);

alter table public.activities enable row level security;
drop policy if exists "users own activities" on public.activities;
create policy "users own activities" on public.activities
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
