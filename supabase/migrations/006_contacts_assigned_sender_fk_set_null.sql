-- Change contacts.assigned_sender_id FK to ON DELETE SET NULL so deleting a
-- sender doesn't fail when contacts are sticky-locked to it. The contact rows
-- survive with assigned_sender_id = NULL; the engine treats them as fresh and
-- auto-rotates the next time they're sent to.
--
-- Prod has the FK as `contacts_assigned_sender_id_fkey` (default NO ACTION).
-- Staging has it as `contacts_assigned_sender_fk` with SET NULL. Drop whichever
-- exists and add the SET NULL version with a consistent name.

alter table public.contacts drop constraint if exists contacts_assigned_sender_id_fkey;
alter table public.contacts drop constraint if exists contacts_assigned_sender_fk;
alter table public.contacts
  add constraint contacts_assigned_sender_id_fkey
  foreign key (assigned_sender_id)
  references public.sender_emails(id)
  on delete set null;
