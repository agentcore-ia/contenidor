import { beforeAfter01Template } from './before_after_01.js';
import { dailySituation01Template } from './daily_situation_01.js';
import { insight01Template } from './insight_01.js';
import { painPoint01Template } from './pain_point_01.js';
import { productFeature01Template } from './product_feature_01.js';

export const templates = {
  pain_point_01: painPoint01Template,
  before_after_01: beforeAfter01Template,
  daily_situation_01: dailySituation01Template,
  product_feature_01: productFeature01Template,
  insight_01: insight01Template
};

export function resolveTemplate(templateId) {
  return templates[templateId] || templates.pain_point_01;
}
