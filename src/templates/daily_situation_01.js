import { baseDocument, postCopy } from './utils.js';

export function dailySituation01Template(post) {
  const { hook, body, cta } = postCopy(post);

  return baseDocument({
    title: 'Capta daily situation post',
    styles: `
      .post {
        position: relative;
        width: 1080px;
        height: 1350px;
        display: flex;
        flex-direction: column;
        padding: 80px;
        background:
          radial-gradient(circle at 18% 22%, rgba(255, 106, 26, 0.2), transparent 27%),
          #0b0b0b;
        color: #ffffff;
      }

      .conversation {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 26px;
        padding: 42px 0;
      }

      .bubble {
        width: 760px;
        padding: 34px 38px;
        border-radius: 34px;
        background: #1c1c1c;
        color: #f7f2eb;
        font-size: 42px;
        line-height: 1.1;
        font-weight: 750;
        letter-spacing: 0;
        overflow-wrap: anywhere;
      }

      .bubble-orange {
        align-self: flex-end;
        background: #ff6a1a;
        color: #120904;
      }
    `,
    body: `
      <main class="post">
        <header class="brand" aria-label="capta">
          <span class="brand-mark"></span>
          <span>capta</span>
        </header>

        <section class="conversation">
          <div class="bubble">${hook}</div>
          <div class="bubble bubble-orange">${body}</div>
        </section>

        <footer class="cta">${cta}</footer>
      </main>
    `
  });
}
