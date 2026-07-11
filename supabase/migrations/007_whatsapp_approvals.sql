-- WhatsApp approval flow: per-brand recipient number that receives each new
-- post (image + copy) with Approve/Reject buttons via WhatsApp Cloud API.
alter table brands add column if not exists whatsapp_number text;

-- Records the outbound approval message so an inbound button reply can be
-- correlated (and so we don't re-notify the same post twice).
alter table generated_posts add column if not exists wa_notified_at timestamptz;
