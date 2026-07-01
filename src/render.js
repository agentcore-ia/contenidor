import { chromium } from 'playwright';
import { resolveTemplate } from './templates/index.js';

const WIDTH = 1080;
const HEIGHT = 1350;

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

    const template = resolveTemplate(post.template_id);

    await page.setContent(template(post), {
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
