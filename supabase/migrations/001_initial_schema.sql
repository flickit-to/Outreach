-- ============================================
-- Outreach App - Initial Schema
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- Function: auto-update updated_at
-- ============================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================
-- Table: contacts
-- ============================================
create table contacts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text,
  company text,
  tags text[] default '{}',
  status text not null default 'not_contacted'
    check (status in ('not_contacted', 'sent', 'delivered', 'opened', 'clicked', 'bounced')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index contacts_user_email_idx on contacts(user_id, lower(email));
create index contacts_user_id_idx on contacts(user_id);
create index contacts_status_idx on contacts(status);

create trigger contacts_updated_at
  before update on contacts
  for each row execute function update_updated_at();

-- ============================================
-- Table: campaigns
-- ============================================
create table campaigns (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null,
  body text not null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index campaigns_user_id_idx on campaigns(user_id);
create index campaigns_status_idx on campaigns(status);
create index campaigns_scheduled_idx on campaigns(status, scheduled_at)
  where status = 'scheduled';

create trigger campaigns_updated_at
  before update on campaigns
  for each row execute function update_updated_at();

-- ============================================
-- Table: campaign_contacts (junction)
-- ============================================
create table campaign_contacts (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  unique(campaign_id, contact_id)
);

create index cc_campaign_id_idx on campaign_contacts(campaign_id);
create index cc_contact_id_idx on campaign_contacts(contact_id);

-- ============================================
-- Table: sends
-- ============================================
create table sends (
  id uuid primary key default uuid_generate_v4(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  resend_id text,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed')),
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  created_at timestamptz default now()
);

create index sends_campaign_id_idx on sends(campaign_id);
create index sends_contact_id_idx on sends(contact_id);
create index sends_status_idx on sends(status);
create index sends_resend_id_idx on sends(resend_id) where resend_id is not null;

-- ============================================
-- Table: events
-- ============================================
create table events (
  id uuid primary key default uuid_generate_v4(),
  send_id uuid not null references sends(id) on delete cascade,
  type text not null
    check (type in ('sent', 'delivered', 'opened', 'clicked', 'bounced')),
  metadata jsonb default '{}',
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create index events_send_id_idx on events(send_id);
create index events_type_idx on events(type);
create index events_created_at_idx on events(created_at);

-- ============================================
-- Table: settings
-- ============================================
create table settings (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resend_api_key text,
  from_email text,
  from_name text,
  daily_send_limit integer default 20,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

create trigger settings_updated_at
  before update on settings
  for each row execute function update_updated_at();

-- ============================================
-- Function: recalculate_contact_status
-- ============================================
create or replace function recalculate_contact_status(p_contact_id uuid)
returns void as $$
declare
  new_status text;
begin
  select
    case
      when exists (select 1 from sends where contact_id = p_contact_id and status = 'clicked') then 'clicked'
      when exists (select 1 from sends where contact_id = p_contact_id and status = 'opened') then 'opened'
      when exists (select 1 from sends where contact_id = p_contact_id and status = 'delivered') then 'delivered'
      when exists (select 1 from sends where contact_id = p_contact_id and status = 'sent') then 'sent'
      when exists (select 1 from sends where contact_id = p_contact_id and status = 'bounced') then 'bounced'
      else 'not_contacted'
    end into new_status;

  update contacts set status = new_status where id = p_contact_id;
end;
$$ language plpgsql security definer;

-- ============================================
-- Row Level Security
-- ============================================

-- Contacts
alter table contacts enable row level security;
create policy "Users can manage own contacts" on contacts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Campaigns
alter table campaigns enable row level security;
create policy "Users can manage own campaigns" on campaigns
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Campaign Contacts
alter table campaign_contacts enable row level security;
create policy "Users can manage own campaign_contacts" on campaign_contacts
  for all using (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_contacts.campaign_id
      and campaigns.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from campaigns
      where campaigns.id = campaign_contacts.campaign_id
      and campaigns.user_id = auth.uid()
    )
  );

-- Sends (read-only for users, writes via service role)
alter table sends enable row level security;
create policy "Users can read own sends" on sends
  for select using (
    exists (
      select 1 from campaigns
      where campaigns.id = sends.campaign_id
      and campaigns.user_id = auth.uid()
    )
  );

-- Events (read-only for users, writes via service role)
alter table events enable row level security;
create policy "Users can read own events" on events
  for select using (
    exists (
      select 1 from sends
      join campaigns on campaigns.id = sends.campaign_id
      where sends.id = events.send_id
      and campaigns.user_id = auth.uid()
    )
  );

-- Settings
alter table settings enable row level security;
create policy "Users can manage own settings" on settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
