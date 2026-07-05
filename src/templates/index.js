import { beforeAfter01Template } from './before_after_01.js';
import { dailySituation01Template } from './daily_situation_01.js';
import { insight01Template } from './insight_01.js';
import { painPoint01Template } from './pain_point_01.js';
import { productFeature01Template } from './product_feature_01.js';

// Sentinel template id: posts with this template_id are rendered by
// generatePostImageAsset() (GPT Image 2) instead of an HTML/Playwright
// template. Kept as a truthy, non-function value so the templates map still
// validates `templates[id]` checks used across the dashboard API.
export const AI_TEMPLATE_ID = 'ai_gpt_image_2';

export const templates = {
  pain_point_01: painPoint01Template,
  before_after_01: beforeAfter01Template,
  daily_situation_01: dailySituation01Template,
  product_feature_01: productFeature01Template,
  insight_01: insight01Template,
  [AI_TEMPLATE_ID]: 'ai-generated'
};

export function resolveTemplate(templateId) {
  const found = templates[templateId];
  return typeof found === 'function' ? found : templates.pain_point_01;
}
