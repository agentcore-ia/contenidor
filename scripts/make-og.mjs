// Genera landing/og.png (1200x630), la imagen que se ve al compartir postia.ar
// por WhatsApp, X o LinkedIn. Correr: node scripts/make-og.mjs
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const html = `<!doctype html><meta charset="utf-8">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{
    width:1200px;height:630px;background:#FBFBF9;color:#0B0B0C;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    display:flex;flex-direction:column;justify-content:center;
    padding:0 82px;position:relative;overflow:hidden;
  }
  .brand{display:flex;align-items:center;gap:14px;margin-bottom:38px}
  .dot{width:44px;height:44px;border-radius:13px;background:#0B0B0C;color:#FBFBF9;
       display:flex;align-items:center;justify-content:center;font-size:23px;font-weight:900}
  .name{font-size:30px;font-weight:800;letter-spacing:-.02em}
  h1{font-size:78px;font-weight:800;letter-spacing:-.045em;line-height:1.02;max-width:15em}
  p{font-size:27px;color:#5C5C61;margin-top:26px;max-width:23em;line-height:1.4}
  .chips{display:flex;gap:11px;margin-top:44px}
  .chip{border:1px solid rgba(11,11,12,.14);border-radius:999px;padding:9px 19px;font-size:19px;color:#3F3F45;background:#fff}
  .chip.solid{background:#0B0B0C;color:#fff;border-color:#0B0B0C;font-weight:600}
  .glow{position:absolute;right:-190px;top:50%;transform:translateY(-50%);
        width:620px;height:620px;border-radius:50%;
        background:radial-gradient(circle,rgba(37,211,102,.16),transparent 66%)}
  .rings{position:absolute;right:-60px;top:50%;transform:translateY(-50%);opacity:.13}
</style>
<div class="glow"></div>
<svg class="rings" width="470" height="470" viewBox="0 0 200 200" fill="none" stroke="#0B0B0C">
  <circle cx="100" cy="100" r="58" stroke-width="1.4"/>
  <circle cx="100" cy="100" r="88" stroke-width="1.4" opacity=".65"/>
  <circle cx="158" cy="100" r="6.5" fill="#0B0B0C" stroke="none"/>
  <circle cx="100" cy="12" r="4.5" fill="#0B0B0C" stroke="none"/>
</svg>
<div class="brand"><span class="dot">P</span><span class="name">Postia</span></div>
<h1>Dejá de pensar qué postear.</h1>
<p>Creamos las ideas, las imágenes y los videos de tu Instagram. Vos aprobás desde WhatsApp.</p>
<div class="chips">
  <span class="chip solid">Primera semana gratis</span>
  <span class="chip">Posts, carruseles e historias</span>
  <span class="chip">Se publica solo</span>
</div>`;

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  const buf = await page.screenshot({ type: 'png' });
  const out = resolve('landing/og.png');
  await writeFile(out, buf);
  console.log(`[og] escrito ${out} (${(buf.length / 1024).toFixed(0)} KB)`);
} finally {
  await browser.close();
}
