create table if not exists custom_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  slug text not null,
  html text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, slug)
);

drop trigger if exists custom_templates_set_updated_at on custom_templates;
create trigger custom_templates_set_updated_at
before update on custom_templates
for each row execute function set_updated_at();

create index if not exists custom_templates_brand_id_idx on custom_templates (brand_id);

-- Make AI-generated images (GPT Image 2) the default rendering path.
update brands set default_template_id = 'ai_gpt_image_2';
update content_categories set default_template_id = 'ai_gpt_image_2';
