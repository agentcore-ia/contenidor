import { baseDocument, bodySizeClass, hookSizeClass, postCopy, shortText } from './utils.js';

export function beforeAfter01Template(post) {
  const { hook, body, cta } = postCopy(post);
  const shortHook = shortText(hook, 82);

  return baseDocument({
    title: 'Capta before after post',
    styles: `
      .post {
        position: relative;
        width: 1080px;
        height: 1350px;
        display: flex;
        flex-direction: column;
        padding: 74px 76px 70px;
        background:
          radial-gradient(circle at 86% 18%, rgba(255, 106, 26, 0.22), transparent 28%),
          linear-gradient(90deg, rgba(255, 106, 26, 0.09) 0 1px, transparent 1px 100%),
          linear-gradient(180deg, #090909 0%, #141414 100%);
        background-size: auto, 78px 100%, auto;
        color: #ffffff;
        isolation: isolate;
      }

      .visual {
        position: relative;
        display: grid;
        grid-template-columns: 1fr 110px 1fr;
        gap: 22px;
        align-items: center;
        min-height: 520px;
        margin: 58px 0 34px;
      }

      .panel {
        position: relative;
        min-height: 470px;
        padding: 34px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.035);
        overflow: hidden;
      }

      .panel::after {
        content: "";
        position: absolute;
        left: 34px;
        right: 34px;
        bottom: 30px;
        height: 108px;
        border-radius: 24px;
        background:
          linear-gradient(90deg, rgba(255, 255, 255, 0.14) 0 26%, transparent 26% 36%, rgba(255, 255, 255, 0.1) 36% 60%, transparent 60% 72%, rgba(255, 255, 255, 0.12) 72%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
        opacity: 0.72;
      }

      .panel-after {
        border-color: rgba(255, 106, 26, 0.64);
        background: linear-gradient(180deg, rgba(255, 106, 26, 0.18), rgba(255, 255, 255, 0.04));
        box-shadow: 0 28px 90px rgba(255, 106, 26, 0.12);
      }

      .panel-after::after {
        background:
          linear-gradient(90deg, #ff6a1a 0 34%, rgba(255, 255, 255, 0.22) 34% 46%, #ff6a1a 46% 76%, rgba(255, 255, 255, 0.28) 76%),
          linear-gradient(180deg, rgba(255, 106, 26, 0.22), rgba(255, 255, 255, 0.04));
      }

      .label {
        margin: 0 0 30px;
        color: #ff6a1a;
        font-size: 24px;
        font-weight: 850;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .panel-title {
        margin: 0;
        color: #f7f2eb;
        font-size: 40px;
        line-height: 1.04;
        font-weight: 820;
        letter-spacing: 0;
        overflow-wrap: anywhere;
      }

      .panel-after .panel-title {
        font-size: 42px;
        line-height: 1.02;
      }

      .connector {
        display: grid;
        place-items: center;
        gap: 16px;
      }

      .dot {
        width: 16px;
        height: 16px;
        border-radius: 999px;
        background: rgba(255, 106, 26, 0.92);
        box-shadow: 0 0 0 14px rgba(255, 106, 26, 0.14);
      }

      .line {
        width: 2px;
        height: 300px;
        background: linear-gradient(180deg, transparent, rgba(255, 106, 26, 0.8), transparent);
      }

      .copy-panel {
        position: relative;
        min-height: 370px;
        padding: 36px 40px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background:
          linear-gradient(90deg, rgba(255, 106, 26, 0.14), transparent 3px),
          rgba(8, 8, 8, 0.72);
        overflow: hidden;
      }

      .copy-panel::after {
        content: "";
        position: absolute;
        right: -58px;
        top: 36px;
        width: 190px;
        height: 190px;
        border: 24px solid rgba(255, 106, 26, 0.23);
        border-radius: 999px;
      }

      .copy-panel .hook {
        max-width: 780px;
        font-size: 62px;
        line-height: 0.98;
      }

      .copy-panel .hook-md {
        font-size: 58px;
      }

      .copy-panel .hook-sm {
        font-size: 52px;
      }

      .copy-panel .hook-xs {
        font-size: 46px;
        line-height: 1.03;
      }

      .copy-panel .body {
        max-width: 820px;
        margin-top: 26px;
      }
    `,
    body: `
      <main class="post">
        <header class="brand" aria-label="capta">
          <span class="brand-mark"></span>
          <span>capta</span>
        </header>

        <section class="visual">
          <div class="panel">
            <p class="label">Antes</p>
            <p class="panel-title">Chats sueltos. Notas perdidas. Decisiones a ciegas.</p>
          </div>
          <div class="connector" aria-hidden="true">
            <span class="dot"></span>
            <span class="line"></span>
            <span class="dot"></span>
          </div>
          <div class="panel panel-after">
            <p class="label">Despues</p>
            <p class="panel-title">${shortHook}</p>
          </div>
        </section>

        <section class="copy-panel">
          <h1 class="${hookSizeClass(hook)}">${hook}</h1>
          <p class="${bodySizeClass(body)}">${body}</p>
        </section>
        <footer class="cta">${cta}</footer>
      </main>
    `
  });
}
