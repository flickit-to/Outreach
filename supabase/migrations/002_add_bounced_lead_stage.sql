-- Add "bounced" as an allowed lead_stage value.
-- The contacts.lead_stage check constraint exists on prod (from an earlier
-- non-tracked migration). Drop and recreate to include "bounced".

do $$
declare
  has_constraint boolean;
begin
  select exists(
    select 1 from pg_constraint
    where conrelid = 'public.contacts'::regclass
      and conname = 'contacts_lead_stage_check'
  ) into has_constraint;

  if has_constraint then
    alter table public.contacts drop constraint contacts_lead_stage_check;
  end if;
end $$;

alter table public.contacts
  add constraint contacts_lead_stage_check check (
    lead_stage in (
      'new_lead',
      'email_sent',
      'opened',
      'follow_up_needed',
      'follow_up_sent',
      'replied',
      'meeting_booked',
      'closed_won',
      'closed_lost',
      'bounced'
    )
  );
