-- Drop NOT NULL constraint on sends.campaign_id.
-- The column was originally not-null because all sends came from campaigns;
-- when sequence_id/sequence_step_id/broadcast_id were added later, the
-- not-null was never relaxed. Sequence and broadcast sends pass null here,
-- which silently breaks them on prod.

alter table public.sends alter column campaign_id drop not null;
