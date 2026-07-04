import { baseDocument, bodySizeClass, hookSizeClass, postCopy } from './utils.js';

export function productFeature01Template(post) {
  const { hook, body, cta } = postCopy(post);

  return baseDocument({
    title: 'Capta product feature post',
    styles: `
      .post {
        position: relative;
        width: 1080px;
        height: 1350px;
        display: grid;
        grid-template-rows: auto 1fr auto;
        padding: 78px 82px;
        background:
          radial-gradient(circle at 74% 28%, rgba(255, 106, 26, 0.24), transparent 30%),
          linear-gradient(155deg, #0b0b0b 0%, #101010 52%, #1b1008 100%);
        color: #ffffff;
        overflow: hidden;
      }

      .product-line {
        position: absolute;
        right: -80px;
        top: 178px;
        width: 320px;
        height: 910px;
        background: #ff6a1a;
        transform: skewX(-16deg);
        opacity: 0.9;
      }

      .stage {
        position: relative;
        display: grid;
        grid-template-columns: 0.95fr 1.05fr;
        gap: 48px;
        align-items: center;
        min-height: 960px;
        z-index: 1;
      }

      .content {
        max-width: 475px;
      }

      .kicker {
        margin: 0 0 28px;
        color: #ff6a1a;
        font-size: 30px;
        font-weight: 850;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .post .hook {
        max-width: 475px;
        font-size: 72px;
        line-height: 0.98;
      }

      .post .hook-md {
        font-size: 64px;
      }

      .post .hook-sm {
        font-size: 56px;
      }

      .post .hook-xs {
        font-size: 48px;
        line-height: 1.03;
      }

      .post .body {
        max-width: 455px;
        margin-top: 34px;
        font-size: 32px;
        line-height: 1.16;
      }

      .post .body-sm {
        font-size: 28px;
      }

      .post .body-xs {
        font-size: 25px;
      }

      .post .body-xxs {
        font-size: 23px;
      }

      .product-ui {
        position: relative;
        min-height: 735px;
        padding: 26px;
        border: 1px solid rgba(255, 255, 255, 0.13);
        border-radius: 34px;
        background: rgba(10, 10, 10, 0.82);
        box-shadow: 0 38px 100px rgba(0, 0, 0, 0.42);
      }

      .ui-top {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 24px;
      }

      .ui-dot {
        width: 14px;
        height: 14px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.28);
      }

      .ui-dot:first-child {
        background: #ff6a1a;
      }

      .ui-card {
        padding: 24px;
        border: 1px solid rgba(255, 255, 255, 0.11);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.045);
        margin-bottom: 18px;
      }

      .ui-label {
        margin: 0 0 12px;
        color: #8b8378;
        font-size: 22px;
        font-weight: 760;
        text-transform: uppercase;
      }

      .ui-value {
        margin: 0;
        color: #fff8ef;
        font-size: 44px;
        line-height: 1;
        font-weight: 880;
      }

      .ui-bars {
        display: grid;
        gap: 14px;
        margin-top: 22px;
      }

      .ui-bar {
        height: 22px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.1);
        overflow: hidden;
      }

      .ui-bar span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: #ff6a1a;
      }

      .ui-stack {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
      }

      .ui-pill {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 88px;
        border-radius: 999px;
        background: rgba(255, 106, 26, 0.15);
        color: #ffb182;
        font-size: 24px;
        font-weight: 800;
      }
    `,
    body: `
      <main class="post">
        <div class="product-line"></div>
        <header class="brand" aria-label="capta">
          <span class="brand-mark"></span>
          <span>capta</span>
        </header>

        <section class="stage">
          <div class="content">
            <p class="kicker">Producto</p>
            <h1 class="${hookSizeClass(hook)}">${hook}</h1>
            <p class="${bodySizeClass(body)}">${body}</p>
          </div>

          <aside class="product-ui" aria-hidden="true">
            <div class="ui-top"><span class="ui-dot"></span><span class="ui-dot"></span><span class="ui-dot"></span></div>
            <div class="ui-card">
              <p class="ui-label">Senales conectadas</p>
              <p class="ui-value">Pedidos + clientes</p>
              <div class="ui-bars">
                <div class="ui-bar"><span style="width:82%"></span></div>
                <div class="ui-bar"><span style="width:62%"></span></div>
                <div class="ui-bar"><span style="width:74%"></span></div>
              </div>
            </div>
            <div class="ui-stack">
              <div class="ui-card"><p class="ui-label">Hoy</p><p class="ui-value">18</p></div>
              <div class="ui-card"><p class="ui-label">Listos</p><p class="ui-value">12</p></div>
            </div>
            <div class="ui-pill">Contexto para vender mejor</div>
          </aside>
        </section>

        <footer class="cta">${cta}</footer>
      </main>
    `
  });
}
