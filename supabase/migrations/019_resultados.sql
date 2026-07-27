-- Resultados reales de cada publicacion. Con instagram_business_basic ya se
-- pueden leer likes, comentarios y permalink de los medios propios; no hace
-- falta el permiso de insights (que sigue pendiente de App Review).
alter table generated_posts add column if not exists ig_like_count integer;
alter table generated_posts add column if not exists ig_comments_count integer;
alter table generated_posts add column if not exists ig_permalink text;
alter table generated_posts add column if not exists ig_stats_at timestamptz;

create index if not exists generated_posts_media_idx
  on generated_posts (brand_id, ig_media_id)
  where ig_media_id is not null;
