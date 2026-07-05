import { chromium } from 'playwright';
import { resolveTemplate } from './templates/index.js';
import { escapeHtml } from './templates/utils.js';
import { getCustomTemplateBySlug } from './supabase.js';

const WIDTH = 1080;
const HEIGHT = 1350;
const CUSTOM_PREFIX = 'custom_';

function fillCustomTemplate(html, post) {
  return html
    .replaceAll('{{hook}}', escapeHtml(post.hook || ''))
    .replaceAll('{{body}}', escapeHtml(post.body || ''))
    .replaceAll('{{cta}}', escapeHtml(post.cta || ''));
}

async function resolvePostHtml(post) {
  if (post.template_id?.startsWith(CUSTOM_PREFIX)) {
    const slug = post.template_id.slice(CUSTOM_PREFIX.length);
    const custom = await getCustomTemplateBySlug(post.brand_id, slug);

    if (custom) {
      return fillCustomTemplate(custom.html, post);
    }
  }

  return resolveTemplate(post.template_id)(post);
}

export async function renderPostImage(post) {
  const browser = await chromium.launch({
    headless: true
  });

  try {
    const page = await browser.newPage({
      viewport: {
        width: WIDTH,
        height: HEIGHT
      },
      deviceScaleFactor: 1
    });

    const html = await resolvePostHtml(post);

    await page.setContent(html, {
      waitUntil: 'networkidle'
    });

    return await page.screenshot({
      type: 'png',
      fullPage: false
    });
  } finally {
    await browser.close();
  }
}
