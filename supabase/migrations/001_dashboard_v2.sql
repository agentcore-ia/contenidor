alter table content_calendar drop constraint if exists content_calendar_status_check;
alter table content_calendar add constraint content_calendar_status_check
  check (status in ('pending', 'generated', 'needs_review', 'approved', 'posted', 'rejected', 'skipped'));

update content_calendar set status = 'generated' where status = 'rendered';
update content_calendar set status = 'approved' where status = 'reviewed';

alter table generated_posts drop constraint if exists generated_posts_status_check;
alter table generated_posts add constraint generated_posts_status_check
  check (status in ('generated', 'needs_review', 'approved', 'posted', 'rejected'));

update generated_posts set status = 'needs_review' where status = 'rendered';
update generated_posts set status = 'approved' where status = 'reviewed';
update generated_posts set status = 'posted' where status = 'published';

alter table content_categories add column if not exists objective text;
alter table content_categories add column if not exists hook_examples jsonb not null default '[]'::jsonb;
alter table content_categories add column if not exists avoid_rules jsonb not null default '[]'::jsonb;

create table if not exists inspirations (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  category_id uuid references content_categories(id) on delete set null,
  title text not null,
  image_url text not null,
  notes text,
  why_it_works text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists inspirations_set_updated_at on inspirations;
create trigger inspirations_set_updated_at
before update on inspirations
for each row execute function set_updated_at();

create index if not exists inspirations_brand_id_idx on inspirations (brand_id);
