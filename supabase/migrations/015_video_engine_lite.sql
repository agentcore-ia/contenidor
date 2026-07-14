-- Suma Veo 3.1 Lite (el mas barato, $0.05/s) como opcion de motor de video.
alter table brands drop constraint if exists brands_video_engine_check;
alter table brands add constraint brands_video_engine_check
  check (video_engine in ('omni', 'veo_lite', 'veo_fast', 'veo'));
