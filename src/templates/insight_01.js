import { baseDocument, bodySizeClass, hookSizeClass, postCopy } from './utils.js';

export function insight01Template(post) {
  const { hook, body, cta } = postCopy(post);

  return baseDocument({
    title: 'Capta insight post',
    styles: `
      .post {
        position: relative;
        width: 1080px;
        height: 1350px;
        display: grid;
        grid-template-rows: auto 1fr auto;
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

      .stage {
        position: relative;
        display: grid;
        grid-template-columns: 1fr 350px;
        gap: 50px;
        align-items: center;
        min-height: 960px;
        z-index: 1;
      }

      .rule {
        width: 220px;
        height: 12px;
        margin-bottom: 52px;
        background: #ff6a1a;
      }

      .content {
        position: relative;
      }

      .post .hook {
        max-width: 650px;
      }

      .post .body {
        max-width: 620px;
        margin-top: 48px;
      }

      .chart {
        position: relative;
        min-height: 660px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 34px;
        background:
          linear-gradient(90deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 100%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0 1px, transparent 1px 100%),
          rgba(255, 255, 255, 0.035);
        background-size: 72px 72px;
        overflow: hidden;
      }

      .chart::before {
        content: "";
        position: absolute;
        left: 46px;
        right: 44px;
        bottom: 104px;
        height: 260px;
        background:
          linear-gradient(135deg, transparent 0 18%, rgba(255, 106, 26, 0.35) 18% 34%, transparent 34% 100%),
          linear-gradient(160deg, transparent 0 36%, rgba(255, 106, 26, 0.62) 36% 52%, transparent 52% 100%),
          linear-gradient(145deg, transparent 0 58%, #ff6a1a 58% 74%, transparent 74% 100%);
        clip-path: polygon(0 84%, 22% 58%, 43% 70%, 68% 32%, 100% 8%, 100% 100%, 0 100%);
      }

      .chart::after {
        content: "";
        position: absolute;
        right: 46px;
        top: 64px;
        width: 176px;
        height: 176px;
        border-radius: 999px;
        border: 28px solid rgba(255, 106, 26, 0.72);
        box-shadow: inset 0 0 0 32px rgba(255, 106, 26, 0.12);
      }

      .chart-label {
        position: absolute;
        left: 36px;
        top: 42px;
        margin: 0;
        color: #ff6a1a;
        font-size: 24px;
        line-height: 1.1;
        font-weight: 850;
        text-transform: uppercase;
      }

      .chart-card {
        position: absolute;
        left: 36px;
        right: 36px;
        bottom: 36px;
        padding: 26px;
        border-radius: 24px;
        background: rgba(8, 8, 8, 0.78);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .chart-card p {
        margin: 0;
        color: #fff8ef;
        font-size: 30px;
        line-height: 1.1;
        font-weight: 800;
      }
    `,
    body: `
      <main class="post">
        <div class="number">01</div>
        <header class="brand" aria-label="capta">
          <span class="brand-mark"></span>
          <span>capta</span>
        </header>

        <section class="stage">
          <div class="content">
            <div class="rule"></div>
            <h1 class="${hookSizeClass(hook)}">${hook}</h1>
            <p class="${bodySizeClass(body)}">${body}</p>
          </div>

          <aside class="chart" aria-hidden="true">
            <p class="chart-label">Insight<br />operativo</p>
            <div class="chart-card"><p>Lo que se registra, se puede accionar.</p></div>
          </aside>
        </section>

        <footer class="cta">${cta}</footer>
      </main>
    `
  });
}
