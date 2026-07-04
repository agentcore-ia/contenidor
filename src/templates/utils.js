export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function postField(post, keys, fallback) {
  for (const key of keys) {
    if (post?.[key]) {
      return post[key];
    }
  }

  return fallback;
}

export function postCopy(post) {
  return {
    hook: escapeHtml(postField(post, ['hook', 'title', 'headline'], 'Tu equipo no necesita mas leads.')),
    body: escapeHtml(postField(post, ['body', 'content', 'caption'], 'Necesita detectar antes que nadie cuales tienen intencion real de compra.')),
    cta: escapeHtml(postField(post, ['cta', 'call_to_action'], 'Converti conversaciones en oportunidades.'))
  };
}

export function hookSizeClass(value) {
  const length = String(value ?? '').length;

  if (length > 115) return 'hook hook-xs';
  if (length > 82) return 'hook hook-sm';
  if (length > 58) return 'hook hook-md';

  return 'hook';
}

export function bodySizeClass(value, baseClass = 'body') {
  const length = String(value ?? '').length;

  if (length > 230) return `${baseClass} ${baseClass}-xxs`;
  if (length > 175) return `${baseClass} ${baseClass}-xs`;
  if (length > 125) return `${baseClass} ${baseClass}-sm`;

  return baseClass;
}

export function shortText(value, maxLength = 96) {
  const text = String(value ?? '').trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1).trim()}...`;
}

export function baseDocument({ title = 'Capta post', styles, body }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 1080px;
        height: 1350px;
        margin: 0;
        overflow: hidden;
        background: #080808;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 16px;
        color: #ffffff;
        font-size: 44px;
        font-weight: 850;
        letter-spacing: 0;
      }

      .brand-mark {
        width: 24px;
        height: 24px;
        border-radius: 999px;
        background: #ff6a1a;
        box-shadow: 0 0 0 10px rgba(255, 106, 26, 0.16);
        flex: 0 0 auto;
      }

      .hook {
        margin: 0;
        color: #fff8ef;
        font-size: 94px;
        line-height: 0.94;
        font-weight: 900;
        letter-spacing: 0;
        text-wrap: balance;
        overflow-wrap: anywhere;
      }

      .hook-md {
        font-size: 78px;
        line-height: 0.98;
      }

      .hook-sm {
        font-size: 66px;
        line-height: 1.02;
      }

      .hook-xs {
        font-size: 56px;
        line-height: 1.05;
      }

      .body {
        margin: 0;
        color: #d8d0c5;
        font-size: 40px;
        line-height: 1.15;
        font-weight: 540;
        letter-spacing: 0;
        white-space: pre-line;
        overflow-wrap: anywhere;
      }

      .body-sm {
        font-size: 34px;
        line-height: 1.18;
      }

      .body-xs {
        font-size: 30px;
        line-height: 1.2;
      }

      .body-xxs {
        font-size: 26px;
        line-height: 1.22;
      }

      .cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 82px;
        max-width: 860px;
        padding: 0 34px;
        border: 2px solid rgba(255, 106, 26, 0.78);
        border-radius: 999px;
        background: rgba(255, 106, 26, 0.12);
        color: #ffffff;
        font-size: 29px;
        line-height: 1.12;
        font-weight: 780;
        letter-spacing: 0;
        overflow-wrap: anywhere;
      }

      ${styles}
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}
