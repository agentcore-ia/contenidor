-- Catalogo por marca: productos/servicios con precio e imagen. Alimenta la
-- generacion de ideas y copies para promocionar items reales (nunca inventados).
create table if not exists brand_products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  description text,
  price text,
  image_url text,
  source text not null default 'manual' check (source in ('manual', 'menu')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brand_products_brand_id_idx on brand_products (brand_id);

drop trigger if exists brand_products_set_updated_at on brand_products;
create trigger brand_products_set_updated_at
before update on brand_products
for each row execute function set_updated_at();
