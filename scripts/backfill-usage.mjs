// Reconstruye usage_events a partir de lo que ya existe en la base, para que el
// consumo del mes no arranque en cero el dia que se activa la medicion.
//
//   node scripts/backfill-usage.mjs          -> muestra que haria
//   node scripts/backfill-usage.mjs --apply  -> escribe
//
// Es idempotente: saltea todo post/video que ya tenga eventos registrados.

import 'dotenv/config';
import { supabase } from '../src/supabase.js';
import { imageCostUsd, textCostUsd, videoCostUsd } from '../src/plans.js';

const apply = process.argv.includes('--apply');

const { data: posts, error: postsError } = await supabase
  .from('generated_posts')
  .select('id, brand_id, image_url, image_urls, created_at');
if (postsError) throw postsError;

const { data: videos, error: videosError } = await supabase
  .from('post_videos')
  .select('id, post_id, brand_id, created_at, brand:brands(video_engine)');
if (videosError) throw videosError;

const { data: existing } = await supabase.from('usage_events').select('post_id, kind');
const seen = new Set((existing || []).map((row) => `${row.post_id}:${row.kind}`));

const events = [];

for (const post of posts || []) {
  if (!seen.has(`${post.id}:post`)) {
    events.push({
      brand_id: post.brand_id, kind: 'post', quantity: 1,
      cost_usd: textCostUsd(1), provider: 'openai', post_id: post.id, created_at: post.created_at
    });
  }
  const images = Array.isArray(post.image_urls) && post.image_urls.length
    ? post.image_urls.length
    : (post.image_url ? 1 : 0);
  if (images && !seen.has(`${post.id}:image`)) {
    events.push({
      brand_id: post.brand_id, kind: 'image', quantity: images,
      cost_usd: imageCostUsd() * images, provider: 'openai',
      model: 'gpt-image-2', post_id: post.id, created_at: post.created_at
    });
  }
}

for (const video of videos || []) {
  if (seen.has(`${video.post_id}:video`)) continue;
  const engine = video.brand?.video_engine || 'omni';
  events.push({
    brand_id: video.brand_id, kind: 'video', quantity: 10,
    cost_usd: videoCostUsd(engine, 10), provider: 'gemini', model: engine,
    post_id: video.post_id, created_at: video.created_at
  });
}

const total = events.reduce((acc, event) => acc + event.cost_usd, 0);
const byKind = events.reduce((acc, event) => {
  acc[event.kind] = (acc[event.kind] || 0) + 1;
  return acc;
}, {});

console.log(`${events.length} eventos a insertar`, byKind);
console.log(`costo historico estimado: US$${Math.round(total * 100) / 100}`);

if (!apply) {
  console.log('\n(dry run — corre con --apply para escribir)');
  process.exit(0);
}

for (let i = 0; i < events.length; i += 200) {
  const { error } = await supabase.from('usage_events').insert(events.slice(i, i + 200));
  if (error) throw error;
  console.log(`  insertados ${Math.min(i + 200, events.length)}/${events.length}`);
}
console.log('listo');
