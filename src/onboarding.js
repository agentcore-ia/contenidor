import { parseInstagramHandle, scrapeInstagramProfile } from './apify.js';
import { analyzeInstagramBrand, fetchRemoteImageBytes } from './openai.js';
import {
  createBrandShell,
  insertCategories,
  insertInspiration,
  updateBrandFields,
  uploadReferenceImage
} from './supabase.js';
import { generateCalendarIdeas } from './contentEngine.js';

const MAX_ANALYSIS_IMAGES = 4;
const MAX_REFERENCE_IMAGES = 3;

// Creates the brand shell immediately (so the client can poll its status)
// and runs the scraping + analysis pipeline in the background: the whole
// flow takes 1-3 minutes, far beyond the proxy's request timeout.
export async function startOnboarding({ user, instagramUrl, answers = {} }) {
  const handle = parseInstagramHandle(instagramUrl);

  const brand = await createBrandShell({
    ownerId: user.id,
    ownerEmail: user.email,
    name: handle,
    instagramHandle: handle
  });

  runOnboarding(brand, handle, answers).catch(async (error) => {
    console.error(`[onboarding:error] brand ${brand.id} (@${handle}):`, error);
    await updateBrandFields(brand.id, {
      onboarding_status: 'error',
      onboarding_error: String(error.message || error).slice(0, 400)
    }).catch(() => {});
  });

  return brand;
}

async function downloadPostImages(posts) {
  const sorted = [...posts].sort((a, b) => (b.likes || 0) - (a.likes || 0));
  const buffers = [];

  for (const post of sorted) {
    if (buffers.length >= MAX_ANALYSIS_IMAGES) break;
    try {
      buffers.push(await fetchRemoteImageBytes(post.image_url));
    } catch (error) {
      console.warn(`[onboarding] no se pudo bajar imagen de post: ${error.message}`);
    }
  }

  return buffers;
}

// The Instagram profile picture is almost always the brand's logo: store it as
// logo_url so image generation can integrate it without a manual upload.
// Instagram CDN URLs expire, so we re-host the bytes in our own storage.
async function importProfileLogo(brand, profile) {
  if (!profile?.profile_pic) return;
  try {
    const buffer = await fetchRemoteImageBytes(profile.profile_pic);
    const url = await uploadReferenceImage(buffer, 'image/jpeg');
    await updateBrandFields(brand.id, { logo_url: url });
    console.log(`[onboarding] logo importado desde la foto de perfil de @${profile.username}`);
  } catch (error) {
    console.warn(`[onboarding] no se pudo importar el logo del perfil: ${error.message}`);
  }
}

async function runOnboarding(brand, handle, answers) {
  // 1. Scrape the public profile (null when APIFY_TOKEN is missing).
  let profile = null;
  try {
    profile = await scrapeInstagramProfile(handle);
  } catch (error) {
    console.warn(`[onboarding] scraping fallo para @${handle}, sigo sin datos de IG: ${error.message}`);
  }

  // 1b. Profile picture -> brand logo (best-effort, never blocks onboarding).
  await importProfileLogo(brand, profile);

  // 2. Download top post images for vision analysis + style references.
  const imageBuffers = profile ? await downloadPostImages(profile.posts || []) : [];
  const imageDataUrls = imageBuffers.map((buffer) => `data:image/jpeg;base64,${buffer.toString('base64')}`);

  // 3. AI analysis -> brand manual + categories.
  const { analysis } = await analyzeInstagramBrand({ handle, profile, answers, imageDataUrls });

  const manual = {
    voice: analysis.voice,
    audience: analysis.audience,
    visual_style: analysis.visual_style,
    render_style: analysis.render_style || null,
    colors: analysis.colors || {},
    design_rules: analysis.design_rules || [],
    content_rules: analysis.content_rules || [],
    avoid_phrases: analysis.avoid_phrases || [],
    image_instructions: '',
    show_logo: false
  };

  await updateBrandFields(brand.id, {
    name: analysis.brand_name || handle,
    description: analysis.description || '',
    brand_manual: manual,
    analysis: {
      rubro: analysis.rubro,
      instagram: profile
        ? { followers: profile.followers, posts_count: profile.posts_count, bio: profile.biography }
        : null,
      answers,
      analyzed_at: new Date().toISOString()
    }
  });

  // 4. Store top images as global brand style references for GPT Image 2.
  for (const buffer of imageBuffers.slice(0, MAX_REFERENCE_IMAGES)) {
    try {
      const url = await uploadReferenceImage(buffer, 'image/jpeg');
      await insertInspiration({
        brand_id: brand.id,
        category_id: null,
        title: `Referencia @${handle}`,
        image_url: url,
        notes: 'Importada automaticamente desde Instagram en el onboarding'
      });
    } catch (error) {
      console.warn(`[onboarding] no se pudo guardar referencia: ${error.message}`);
    }
  }

  // 5. Content categories.
  const categories = (analysis.categories || []).slice(0, 5).map((category, index) => ({
    brand_id: brand.id,
    slug: String(category.slug || `categoria-${index + 1}`).toLowerCase(),
    name: category.name,
    description: category.description,
    objective: category.objective,
    prompt_guidance: category.prompt_guidance,
    default_template_id: 'ai_gpt_image_2',
    sort_order: index
  }));
  await insertCategories(categories);

  // 6. First week of ideas.
  await generateCalendarIdeas({ brandId: brand.id, count: 7 });

  await updateBrandFields(brand.id, { onboarding_status: 'ready', onboarding_error: null });
  console.log(`[onboarding] marca ${brand.id} (@${handle}) lista`);
}
