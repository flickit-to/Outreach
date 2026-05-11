-- Change sends.sender_email_id FK to ON DELETE SET NULL so deleting a sender
-- doesn't fail when historical sends reference it. The send rows survive with
-- sender_email_id = NULL (from_email_address still preserves the address that
-- was used). Matches the staging schema.

alter table public.sends drop constraint if exists sends_sender_email_id_fkey;
alter table public.sends
  add constraint sends_sender_email_id_fkey
  foreign key (sender_email_id)
  references public.sender_emails(id)
  on delete set null;
