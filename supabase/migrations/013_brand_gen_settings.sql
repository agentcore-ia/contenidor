-- Preferencias de generacion por marca: motor de video y calidad de imagen.
-- Aplican a la generacion manual (agenda) y a la automatica (autopilot).
alter table brands add column if not exists video_engine text not null default 'omni'
  check (video_engine in ('omni', 'veo'));

alter table brands add column if not exists image_quality text not null default 'high'
  check (image_quality in ('high', 'medium', 'low'));
