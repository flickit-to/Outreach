-- Tracking columns for app-composed emails sent via Microsoft Graph.
-- activities was originally a pure log table; with in-app compose we now
-- also use it as the system of record for outbound sends with full tracking
-- (opens, clicks, bounces, replies), the same way Resend sends are tracked
-- on the sends table.

alter table public.activities
  add column if not exists status text not null default 'sent'
    check (status in (
      'draft', 'queued', 'sent', 'delivered', 'opened', 'clicked',
      'replied', 'bounced', 'failed'
    )),
  add column if not exists delivered_at timestamptz,
  add column if not exists opened_at timestamptz,
  add column if not exists clicked_at timestamptz,
  add column if not exists bounced_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists last_open_at timestamptz,
  add column if not exists open_count integer not null default 0,
  add column if not exists click_count integer not null default 0,
  add column if not exists tracking_enabled boolean not null default false;

create index if not exists activities_status_idx on public.activities(status);
