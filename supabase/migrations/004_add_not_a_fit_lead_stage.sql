-- Add "not_a_fit" as an allowed lead_stage value.
-- Used to mark leads (and their company-mates by email domain) as
-- non-prospects — auto-exits them from sequences and prevents future sends.

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
      'bounced',
      'not_a_fit'
    )
  );
