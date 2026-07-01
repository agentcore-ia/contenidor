import { baseDocument, hookSizeClass, postCopy } from './utils.js';

export function productFeature01Template(post) {
  const { hook, body, cta } = postCopy(post);

  return baseDocument({
    title: 'Capta product feature post',
    styles: `
      .post {
        position: relative;
        width: 1080px;
        height: 1350px;
        display: flex;
        flex-direction: column;
        padding: 78px 82px;
        background: linear-gradient(155deg, #0b0b0b 0%, #101010 52%, #1b1008 100%);
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

      .content {
        position: relative;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        max-width: 800px;
        z-index: 1;
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
        max-width: 790px;
      }

      .post .body {
        max-width: 730px;
        margin-top: 46px;
      }
    `,
    body: `
      <main class="post">
        <div class="product-line"></div>
        <header class="brand" aria-label="capta">
          <span class="brand-mark"></span>
          <span>capta</span>
        </header>

        <section class="content">
          <p class="kicker">Producto</p>
          <h1 class="${hookSizeClass(hook)}">${hook}</h1>
          <p class="body">${body}</p>
        </section>

        <footer class="cta">${cta}</footer>
      </main>
    `
  });
}
