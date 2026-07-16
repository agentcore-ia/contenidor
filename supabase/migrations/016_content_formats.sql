-- Nuevos formatos de contenido: historia (story 9:16) y carrusel (3-5 placas).
-- Cada formato tiene su estrategia propia en la generacion de ideas.

alter table content_calendar drop constraint if exists content_calendar_content_type_check;
alter table content_calendar add constraint content_calendar_content_type_check
  check (content_type in ('image', 'story', 'carousel', 'product_video', 'ugc_video'));

alter table generated_posts drop constraint if exists generated_posts_content_type_check;
alter table generated_posts add constraint generated_posts_content_type_check
  check (content_type in ('image', 'story', 'carousel', 'product_video', 'ugc_video'));

-- Carrusel: copy de cada placa ({headline, body}[]) y URLs de las imagenes
-- renderizadas en orden. image_url queda como portada (placa 1).
alter table generated_posts add column if not exists slides jsonb;
alter table generated_posts add column if not exists image_urls jsonb;
