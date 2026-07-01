create extension if not exists pgcrypto;

create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  brand_manual jsonb not null default '{}'::jsonb,
  default_template_id text not null default 'pain_point_01',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_categories (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  default_template_id text not null default 'pain_point_01',
  prompt_guidance text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, slug)
);

create table if not exists content_calendar (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  category_id uuid not null references content_categories(id) on delete restrict,
  publish_date date not null,
  topic text not null,
  angle text,
  status text not null default 'pending' check (status in ('pending', 'generated', 'rendered', 'reviewed', 'skipped')),
  generated_post_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, publish_date)
);

create table if not exists generated_posts (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  category_id uuid not null references content_categories(id) on delete restrict,
  calendar_id uuid not null references content_calendar(id) on delete cascade,
  template_id text not null default 'pain_point_01',
  hook text not null,
  body text not null,
  cta text not null,
  caption_instagram text not null,
  caption_x text not null,
  caption_linkedin text not null,
  visual_direction text,
  background_idea text,
  image_url text,
  status text not null default 'generated' check (status in ('generated', 'rendered', 'reviewed', 'published')),
  model text,
  raw_generation jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_id)
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'content_calendar_generated_post_id_fkey'
  ) then
    alter table content_calendar
      add constraint content_calendar_generated_post_id_fkey
      foreign key (generated_post_id)
      references generated_posts(id)
      on delete set null;
  end if;
end;
$$;

create table if not exists post_assets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references generated_posts(id) on delete cascade,
  asset_type text not null default 'rendered_image',
  storage_bucket text not null default 'post-assets',
  storage_path text not null,
  public_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (post_id, asset_type)
);

create table if not exists post_reviews (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references generated_posts(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested', 'rejected')),
  reviewer_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists brands_set_updated_at on brands;
create trigger brands_set_updated_at
before update on brands
for each row execute function set_updated_at();

drop trigger if exists content_categories_set_updated_at on content_categories;
create trigger content_categories_set_updated_at
before update on content_categories
for each row execute function set_updated_at();

drop trigger if exists content_calendar_set_updated_at on content_calendar;
create trigger content_calendar_set_updated_at
before update on content_calendar
for each row execute function set_updated_at();

drop trigger if exists generated_posts_set_updated_at on generated_posts;
create trigger generated_posts_set_updated_at
before update on generated_posts
for each row execute function set_updated_at();

drop trigger if exists post_reviews_set_updated_at on post_reviews;
create trigger post_reviews_set_updated_at
before update on post_reviews
for each row execute function set_updated_at();

create index if not exists content_calendar_pending_date_idx
  on content_calendar (publish_date, status);

create index if not exists generated_posts_calendar_id_idx
  on generated_posts (calendar_id);

create index if not exists post_assets_post_id_idx
  on post_assets (post_id);
