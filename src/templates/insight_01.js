import { baseDocument, hookSizeClass, postCopy } from './utils.js';

export function insight01Template(post) {
  const { hook, body, cta } = postCopy(post);

  return baseDocument({
    title: 'Capta insight post',
    styles: `
      .post {
        position: relative;
        width: 1080px;
        height: 1350px;
        display: flex;
        flex-direction: column;
        padding: 82px 86px 78px;
        background:
          radial-gradient(circle at 50% 42%, rgba(255, 106, 26, 0.18), transparent 34%),
          linear-gradient(180deg, #080808 0%, #111111 100%);
        color: #ffffff;
      }

      .number {
        position: absolute;
        right: 70px;
        top: 150px;
        color: rgba(255, 106, 26, 0.18);
        font-size: 300px;
        line-height: 1;
        font-weight: 900;
        letter-spacing: 0;
      }

      .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        position: relative;
        z-index: 1;
      }

      .rule {
        width: 220px;
        height: 12px;
        margin-bottom: 52px;
        background: #ff6a1a;
      }

      .post .hook {
        max-width: 890px;
      }

      .post .body {
        max-width: 800px;
        margin-top: 48px;
      }
    `,
    body: `
      <main class="post">
        <div class="number">01</div>
        <header class="brand" aria-label="capta">
          <span class="brand-mark"></span>
          <span>capta</span>
        </header>

        <section class="content">
          <div class="rule"></div>
          <h1 class="${hookSizeClass(hook)}">${hook}</h1>
          <p class="body">${body}</p>
        </section>

        <footer class="cta">${cta}</footer>
      </main>
    `
  });
}
