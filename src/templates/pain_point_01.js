import { baseDocument, bodySizeClass, hookSizeClass, postCopy } from './utils.js';

export function painPoint01Template(post) {
  const { hook, body, cta } = postCopy(post);

  return baseDocument({
    title: 'Capta pain point post',
    styles: `
      .post {
        position: relative;
        width: 1080px;
        height: 1350px;
        display: grid;
        grid-template-rows: auto 1fr auto;
        padding: 82px 86px 78px;
        color: #f7f2eb;
        background:
          radial-gradient(circle at 86% 14%, rgba(255, 106, 26, 0.28), transparent 24%),
          linear-gradient(135deg, #161616 0%, #080808 56%, #17120e 100%);
        isolation: isolate;
      }

      .post::before {
        content: "";
        position: absolute;
        right: -310px;
        top: 210px;
        width: 520px;
        height: 860px;
        border: 46px solid rgba(255, 106, 26, 0.28);
        border-radius: 260px;
        transform: rotate(19deg);
        z-index: -1;
      }

      .post::after {
        content: "";
        position: absolute;
        left: 86px;
        bottom: 218px;
        width: 120px;
        height: 10px;
        border-radius: 999px;
        background: #ff6a1a;
      }

      .stage {
        display: grid;
        grid-template-columns: 0.95fr 1.05fr;
        gap: 44px;
        align-items: center;
        min-height: 960px;
      }

      .visual {
        position: relative;
        height: 710px;
      }

      .phone {
        position: absolute;
        inset: 20px 34px 24px 0;
        border: 2px solid rgba(255, 255, 255, 0.12);
        border-radius: 46px;
        background: linear-gradient(180deg, #141414, #0b0b0b);
        box-shadow: 0 32px 80px rgba(0, 0, 0, 0.36);
        overflow: hidden;
      }

      .phone::before {
        content: "";
        position: absolute;
        left: 50%;
        top: 24px;
        width: 120px;
        height: 12px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.18);
        transform: translateX(-50%);
      }

      .message {
        position: absolute;
        left: 44px;
        right: 44px;
        height: 86px;
        border-radius: 24px;
        background: rgba(255, 255, 255, 0.08);
      }

      .message:nth-child(1) { top: 96px; right: 96px; }
      .message:nth-child(2) { top: 210px; left: 98px; background: rgba(255, 106, 26, 0.9); }
      .message:nth-child(3) { top: 324px; right: 86px; }
      .message:nth-child(4) { top: 438px; left: 120px; background: rgba(255, 106, 26, 0.18); border: 1px solid rgba(255, 106, 26, 0.5); }

      .alert-card {
        position: absolute;
        left: 38px;
        right: 0;
        bottom: 0;
        padding: 28px;
        border: 1px solid rgba(255, 106, 26, 0.48);
        background: rgba(31, 16, 8, 0.94);
        box-shadow: 0 28px 64px rgba(0, 0, 0, 0.38);
      }

      .alert-card p {
        margin: 0;
        color: #ffb182;
        font-size: 24px;
        line-height: 1.16;
        font-weight: 760;
      }

      .content {
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 26px 0 54px;
      }

      .post .hook {
        max-width: 560px;
        font-size: 76px;
        line-height: 0.98;
      }

      .post .hook-md {
        font-size: 68px;
      }

      .post .hook-sm {
        font-size: 58px;
      }

      .post .hook-xs {
        font-size: 50px;
        line-height: 1.03;
      }

      .post .body {
        max-width: 520px;
        margin: 42px 0 0;
      }
    `,
    body: `
      <main class="post">
        <header class="brand" aria-label="capta">
          <span class="brand-mark"></span>
          <span>capta</span>
        </header>

        <section class="stage">
          <div class="visual" aria-hidden="true">
            <div class="phone">
              <span class="message"></span>
              <span class="message"></span>
              <span class="message"></span>
              <span class="message"></span>
            </div>
            <div class="alert-card">
              <p>Conversaciones sin contexto = oportunidades invisibles.</p>
            </div>
          </div>

          <div class="content">
            <h1 class="${hookSizeClass(hook)}">${hook}</h1>
            <p class="${bodySizeClass(body)}">${body}</p>
          </div>
        </section>

        <footer class="cta">${cta}</footer>
      </main>
    `
  });
}
