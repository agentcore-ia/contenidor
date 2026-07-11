-- Instagram publishing: per-brand connected account + token, plus publish
-- tracking on generated posts. Uses the Instagram API with Instagram Login
-- (business login), so no Facebook Page is required.
alter table brands add column if not exists ig_user_id text;
alter table brands add column if not exists ig_username text;
alter table brands add column if not exists ig_access_token text;
alter table brands add column if not exists ig_token_expires_at timestamptz;
alter table brands add column if not exists ig_connected_at timestamptz;
alter table brands add column if not exists auto_publish boolean not null default true;

alter table generated_posts add column if not exists ig_media_id text;
alter table generated_posts add column if not exists posted_at timestamptz;
alter table generated_posts add column if not exists publish_error text;

create index if not exists brands_ig_user_id_idx on brands (ig_user_id);
