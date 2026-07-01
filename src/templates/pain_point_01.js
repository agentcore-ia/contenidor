import { baseDocument, hookSizeClass, postCopy } from './utils.js';

export function painPoint01Template(post) {
  const { hook, body, cta } = postCopy(post);

  return baseDocument({
    title: 'Capta pain point post',
    styles: `
      .post {
        position: relative;
        width: 1080px;
        height: 1350px;
        display: flex;
        flex-direction: column;
        padding: 82px 86px 78px;
        color: #f7f2eb;
        background:
          radial-gradient(circle at 88% 14%, rgba(255, 106, 26, 0.34), transparent 23%),
          linear-gradient(135deg, #161616 0%, #080808 56%, #17120e 100%);
        isolation: isolate;
      }

      .post::before {
        content: "";
        position: absolute;
        right: -190px;
        top: 210px;
        width: 520px;
        height: 860px;
        border: 46px solid rgba(255, 106, 26, 0.72);
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

      .content {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: 34px 0 70px;
      }

      .post .hook {
        max-width: 850px;
      }

      .post .body {
        max-width: 760px;
        margin: 54px 0 0;
      }
    `,
    body: `
      <main class="post">
        <header class="brand" aria-label="capta">
          <span class="brand-mark"></span>
          <span>capta</span>
        </header>

        <section class="content">
          <h1 class="${hookSizeClass(hook)}">${hook}</h1>
          <p class="body">${body}</p>
        </section>

        <footer class="cta">${cta}</footer>
      </main>
    `
  });
}
