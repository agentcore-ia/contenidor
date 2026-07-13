-- Videos generados con Higgsfield para un post: video de producto (anima la
-- imagen del creativo) o UGC (avatar/guion). Un post puede tener varios.
create table if not exists post_videos (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references generated_posts(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null default 'product' check (kind in ('product', 'ugc')),
  status text not null default 'processing' check (status in ('processing', 'ready', 'error')),
  provider text not null default 'higgsfield',
  job_id text,
  video_url text,
  script text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_videos_post_id_idx on post_videos (post_id);
create index if not exists post_videos_status_idx on post_videos (status);

drop trigger if exists post_videos_set_updated_at on post_videos;
create trigger post_videos_set_updated_at
before update on post_videos
for each row execute function set_updated_at();
