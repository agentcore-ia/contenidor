-- La dupla diaria (post de feed + historia el MISMO dia) necesita dos filas de
-- calendario con la misma fecha. La restriccion unica (brand_id, publish_date)
-- lo impedia y rompia la generacion de ideas completa.
alter table content_calendar drop constraint if exists content_calendar_brand_id_publish_date_key;

-- Guardia mas fina: un solo post de FEED por dia; las historias no compiten.
create unique index if not exists content_calendar_brand_date_feed_key
  on content_calendar (brand_id, publish_date)
  where content_type <> 'story';
