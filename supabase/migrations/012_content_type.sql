-- Formato de contenido por idea/post: imagen (default), video de producto o
-- video UGC. Las ideas de video generan el video automaticamente tras el render.
alter table content_calendar add column if not exists content_type text not null default 'image'
  check (content_type in ('image', 'product_video', 'ugc_video'));

alter table generated_posts add column if not exists content_type text not null default 'image'
  check (content_type in ('image', 'product_video', 'ugc_video'));
