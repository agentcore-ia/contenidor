-- Planes y medicion de consumo.
--
-- Cada imagen y cada segundo de video cuestan plata real. Sin un tope por plan,
-- una sola marca puede quemar el margen de diez. Y sin medicion no hay forma de
-- saber a que precio conviene vender.

alter table brands add column if not exists plan text not null default 'trial';
alter table brands add column if not exists trial_ends_at timestamptz;

-- Las marcas que ya existen no pueden quedar de golpe contra un tope de prueba.
update brands set plan = 'pro' where plan = 'trial';

-- Un evento por cada llamada facturable a un proveedor. `quantity` es la unidad
-- natural de cada tipo: imagenes para 'image', segundos para 'video',
-- generaciones para 'ideas'. `cost_usd` es una ESTIMACION con la tabla de
-- precios de src/plans.js: sirve para comparar marcas entre si y detectar
-- desvios, no para conciliar la factura del proveedor.
create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  kind text not null check (kind in ('image', 'video', 'ideas', 'post')),
  provider text,
  model text,
  quantity numeric not null default 1,
  cost_usd numeric not null default 0,
  post_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_brand_created_idx
  on usage_events (brand_id, created_at desc);

create index if not exists usage_events_kind_idx
  on usage_events (brand_id, kind, created_at desc);
