-- Todo el producto pasa a generacion con IA: los templates HTML integrados
-- (pain_point_01, before_after_01, etc.) dejan de usarse como default.
-- Los custom templates (custom_*) se respetan si alguien los configuro.
update brands
  set default_template_id = 'ai_gpt_image_2'
  where default_template_id in ('pain_point_01', 'before_after_01', 'daily_situation_01', 'product_feature_01', 'insight_01');

update content_categories
  set default_template_id = 'ai_gpt_image_2'
  where default_template_id in ('pain_point_01', 'before_after_01', 'daily_situation_01', 'product_feature_01', 'insight_01');
