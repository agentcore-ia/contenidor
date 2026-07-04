import { baseDocument, bodySizeClass, postCopy } from './utils.js';

export function dailySituation01Template(post) {
  const { hook, body, cta } = postCopy(post);

  return baseDocument({
    title: 'Capta daily situation post',
    styles: `
      .post {
        position: relative;
        width: 1080px;
        height: 1350px;
        display: grid;
        grid-template-rows: auto 1fr auto;
        padding: 80px;
        background:
          radial-gradient(circle at 18% 22%, rgba(255, 106, 26, 0.22), transparent 26%),
          linear-gradient(90deg, rgba(255, 255, 255, 0.035) 0 1px, transparent 1px 100%),
          #0b0b0b;
        background-size: auto, 90px 90px, auto;
        color: #ffffff;
      }

      .scene {
        display: grid;
        grid-template-columns: 1fr 360px;
        gap: 42px;
        justify-content: center;
        align-items: center;
        min-height: 980px;
      }

      .conversation {
        display: grid;
        gap: 24px;
      }

      .bubble {
        width: 620px;
        padding: 34px 38px;
        border-radius: 34px;
        background: #1c1c1c;
        color: #f7f2eb;
        font-size: 38px;
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

      .bubble-text-sm {
        font-size: 34px;
        line-height: 1.12;
      }

      .bubble-text-xs {
        font-size: 30px;
        line-height: 1.14;
      }

      .bubble-text-xxs {
        font-size: 27px;
        line-height: 1.16;
      }

      .ticket {
        position: relative;
        min-height: 650px;
        padding: 32px;
        border: 1px solid rgba(255, 106, 26, 0.54);
        border-radius: 30px;
        background:
          linear-gradient(180deg, rgba(255, 106, 26, 0.16), rgba(255, 255, 255, 0.035));
        box-shadow: 0 32px 90px rgba(0, 0, 0, 0.34);
        overflow: hidden;
      }

      .ticket::before {
        content: "";
        position: absolute;
        inset: 26px;
        border: 1px dashed rgba(255, 255, 255, 0.18);
        border-radius: 22px;
      }

      .ticket-title {
        position: relative;
        margin: 0 0 34px;
        color: #ff6a1a;
        font-size: 26px;
        font-weight: 850;
        text-transform: uppercase;
      }

      .ticket-row {
        position: relative;
        display: flex;
        justify-content: space-between;
        gap: 18px;
        padding: 18px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        color: #fff8ef;
        font-size: 26px;
        font-weight: 760;
      }

      .ticket-row span:last-child {
        color: #ffb182;
      }

      .pulse {
        position: absolute;
        left: 50%;
        bottom: 74px;
        width: 170px;
        height: 170px;
        border-radius: 999px;
        border: 28px solid rgba(255, 106, 26, 0.25);
        transform: translateX(-50%);
      }

      .pulse::after {
        content: "";
        position: absolute;
        inset: 32px;
        border-radius: inherit;
        background: #ff6a1a;
      }
    `,
    body: `
      <main class="post">
        <header class="brand" aria-label="capta">
          <span class="brand-mark"></span>
          <span>capta</span>
        </header>

        <section class="scene">
          <div class="conversation">
            <div class="bubble">${hook}</div>
            <div class="bubble bubble-orange ${bodySizeClass(body, 'bubble-text')}">${body}</div>
          </div>

          <aside class="ticket" aria-hidden="true">
            <p class="ticket-title">Operacion en vivo</p>
            <div class="ticket-row"><span>WhatsApp</span><span>12</span></div>
            <div class="ticket-row"><span>Pedidos</span><span>8</span></div>
            <div class="ticket-row"><span>Mesas</span><span>4</span></div>
            <div class="ticket-row"><span>Clientes</span><span>31</span></div>
            <div class="pulse"></div>
          </aside>
        </section>

        <footer class="cta">${cta}</footer>
      </main>
    `
  });
}
