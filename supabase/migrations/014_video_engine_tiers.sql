-- Motor de video con tiers de costo: omni (mas barato), veo_fast (medio),
-- veo (cine/premium, mas caro).
alter table brands drop constraint if exists brands_video_engine_check;
alter table brands add constraint brands_video_engine_check
  check (video_engine in ('omni', 'veo_fast', 'veo'));
