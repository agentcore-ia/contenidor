import { baseDocument, hookSizeClass, postCopy } from './utils.js';

export function beforeAfter01Template(post) {
  const { hook, body, cta } = postCopy(post);

  return baseDocument({
    title: 'Capta before after post',
    styles: `
      .post {
        position: relative;
        width: 1080px;
        height: 1350px;
        display: flex;
        flex-direction: column;
        padding: 78px 76px;
        background:
          linear-gradient(90deg, rgba(255, 106, 26, 0.18) 0 2px, transparent 2px 100%),
          linear-gradient(180deg, #090909 0%, #151515 100%);
        background-size: 78px 100%;
        color: #ffffff;
        isolation: isolate;
      }

      .split {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 28px;
        align-items: stretch;
        padding: 70px 0 54px;
      }

      .side {
        position: relative;
        min-height: 610px;
        padding: 34px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.035);
        overflow: hidden;
      }

      .side-after {
        border-color: rgba(255, 106, 26, 0.55);
        background: linear-gradient(180deg, rgba(255, 106, 26, 0.16), rgba(255, 255, 255, 0.04));
      }

      .label {
        margin: 0 0 30px;
        color: #ff6a1a;
        font-size: 24px;
        font-weight: 850;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      .side-text {
        margin: 0;
        color: #f7f2eb;
        font-size: 42px;
        line-height: 1.04;
        font-weight: 820;
        letter-spacing: 0;
        overflow-wrap: anywhere;
      }

      .after-text {
        font-size: 52px;
      }

      .post .hook {
        max-width: 880px;
      }

      .post .body {
        max-width: 840px;
        margin-top: 32px;
      }
    `,
    body: `
      <main class="post">
        <header class="brand" aria-label="capta">
          <span class="brand-mark"></span>
          <span>capta</span>
        </header>

        <section class="split">
          <div class="side">
            <p class="label">Antes</p>
            <p class="side-text">Operacion manual, chats sueltos y decisiones a ciegas.</p>
          </div>
          <div class="side side-after">
            <p class="label">Despues</p>
            <p class="side-text after-text">${hook}</p>
          </div>
        </section>

        <h1 class="${hookSizeClass(body)}">${body}</h1>
        <footer class="cta">${cta}</footer>
      </main>
    `
  });
}
