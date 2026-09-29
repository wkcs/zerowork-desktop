interface CustomAboutDialogHtmlInput {
  applicationName: string;
  appVersion: string;
  copyright: string;
  optimizationLine: string;
  versionLabel: string;
  okButtonLabel: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createCustomAboutDialogHtml(input: CustomAboutDialogHtmlInput): string {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    />
    <title>${escapeHtml(input.applicationName)}</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif;
        --startup-page-bg: #f4f4f5;
        --about-primary: #0a0a0a;
        --about-primary-foreground: #fafafa;
        --about-primary-active: color-mix(in oklab, var(--about-primary) 80%, transparent);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: var(--startup-page-bg);
      }

      body {
        display: grid;
        place-items: center;
        padding: 0;
        user-select: none;
      }

      .about-window {
        width: 100%;
        max-width: 256px;
        height: 280px;
        display: grid;
        place-items: stretch;
        padding: 0;
        background: transparent;
      }

      .about-card {
        width: 100%;
        height: 100%;
        padding: 22px 15px 14px;
        display: flex;
        flex-direction: column;
        border: 0;
        border-radius: 0;
        background: transparent;
        color: #1d1d1f;
        box-shadow: none;
        -webkit-app-region: drag;
      }

      .content {
        width: 100%;
        max-width: 222px;
        margin: 0 auto;
        flex: 1;
        min-height: 0;
      }

      .app-icon {
        width: 52px;
        height: 52px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        background: linear-gradient(180deg, #000000 0%, #151718 100%);
        color: #ffffff;
        box-shadow: 0 10px 13px -3px rgb(0 0 0 / 0.2), 0 4px 5px -3px rgb(0 0 0 / 0.2);
      }

      .app-logo {
        width: 30px;
        height: auto;
        display: block;
      }

      .title {
        margin: 20px 0 0;
        font-size: 13.5px;
        line-height: 1.18;
        font-weight: 700;
        letter-spacing: 0;
      }

      .meta {
        margin-top: 28px;
        display: flex;
        flex-direction: column;
        gap: 17px;
        font-size: 13px;
        line-height: 1.2;
        font-weight: 400;
        letter-spacing: 0;
        color: #303033;
      }


      .ok-button {
        width: 100%;
        height: 36px;
        border: 0;
        border-radius: 18px;
        background: var(--about-primary);
        color: var(--about-primary-foreground);
        font: inherit;
        font-size: 13px;
        font-weight: 500;
        letter-spacing: 0;
        outline: none;
        cursor: default;
        -webkit-app-region: no-drag;
      }

      .ok-button:active {
        background: var(--about-primary-active);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --startup-page-bg: #171717;
          --about-primary: #fafafa;
          --about-primary-foreground: #0a0a0a;
          --about-primary-active: color-mix(in oklab, var(--about-primary) 80%, transparent);
        }

        .about-card {
          color: #e8e8e8;
        }

        .meta {
          color: #e2e2e2;
        }
      }
    </style>
  </head>
  <body>
    <main class="about-window" aria-label="${escapeHtml(input.applicationName)} About Window">
      <section class="about-card" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <div class="content">
          <div class="app-icon" aria-hidden="true">
            <svg class="app-logo" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  
  <defs>
    <clipPath id="safe"><circle cx="256" cy="256" r="240"/></clipPath>
  </defs>
  <!-- soft plate for light backgrounds -->
  <circle cx="256" cy="256" r="248" fill="#F7FFFB"/>
  <g clip-path="url(#safe)">
    <!-- outer ring hint -->
    <circle cx="256" cy="256" r="210" fill="none" stroke="#0F2D26" stroke-width="6" opacity="0.08"/>
    <!-- body arc (clockwise ouroboros) -->
    <path d="M256 62
      C348 62 420 118 438 196
      C452 256 430 322 378 368
      C330 410 268 430 210 418
      C150 404 104 358 90 298
      C78 246 96 190 140 152
      C178 120 220 100 256 96"
      fill="none" stroke="#3DDC97" stroke-width="56" stroke-linecap="round"/>
    <!-- belly highlight arc -->
    <path d="M256 96
      C300 100 340 122 368 156
      C402 198 414 252 400 302
      C386 350 348 386 300 402"
      fill="none" stroke="#B8F2D8" stroke-width="22" stroke-linecap="round" opacity="0.9"/>
    <!-- head block near 1–2 o'clock -->
    <ellipse cx="372" cy="148" rx="58" ry="48" transform="rotate(28 372 148)" fill="#3DDC97" stroke="#0F2D26" stroke-width="6"/>
    <!-- snout -->
    <ellipse cx="418" cy="168" rx="28" ry="20" transform="rotate(28 418 168)" fill="#3DDC97" stroke="#0F2D26" stroke-width="5"/>
    <!-- eye -->
    <circle cx="390" cy="138" r="8" fill="#0F2D26"/>
    <circle cx="392" cy="136" r="2.5" fill="#E8FFF5"/>
    <!-- horn -->
    <path d="M352 112 L348 78 L372 108 Z" fill="#FFB454" stroke="#0F2D26" stroke-width="4" stroke-linejoin="round"/>
    <!-- ear fin -->
    <path d="M340 150 C320 132 318 168 338 172 Z" fill="#FFB454" stroke="#0F2D26" stroke-width="4" stroke-linejoin="round"/>
    <!-- mouth bite on tip of tail -->
    <path d="M430 178 C438 186 436 198 424 202" fill="none" stroke="#0F2D26" stroke-width="5" stroke-linecap="round"/>
    <!-- tail tip entering mouth -->
    <path d="M150 150 C170 128 200 112 230 104" fill="none" stroke="#3DDC97" stroke-width="28" stroke-linecap="round"/>
    <path d="M230 104 C250 98 268 96 280 96" fill="none" stroke="#0F2D26" stroke-width="6" stroke-linecap="round" opacity="0.35"/>
    <!-- small dorsal spikes along upper arc -->
    <path d="M300 78 L308 58 L318 80" fill="#FFB454" stroke="#0F2D26" stroke-width="3" stroke-linejoin="round"/>
    <path d="M340 92 L352 72 L360 98" fill="#FFB454" stroke="#0F2D26" stroke-width="3" stroke-linejoin="round"/>
  </g>
</svg>
          </div>
          <h1 id="about-title" class="title">
            ${escapeHtml(input.applicationName)}<br />
            ${escapeHtml(input.versionLabel)} ${escapeHtml(input.appVersion)}
          </h1>
          <div class="meta">
            ${input.optimizationLine ? `<div>${escapeHtml(input.optimizationLine)}</div>` : ""}
            <div>${escapeHtml(input.copyright)}</div>
          </div>
        </div>
        <div class="spacer"></div>
        <button class="ok-button" type="button" autofocus>${escapeHtml(input.okButtonLabel)}</button>
      </section>
    </main>
    <script>
      const closeWindow = () => window.close();
      document.querySelector(".ok-button")?.addEventListener("click", closeWindow);
      window.addEventListener("keydown", (event) => {
        if (event.key === "Escape" || event.key === "Enter") {
          closeWindow();
        }
      });
    </script>
  </body>
</html>`;
}
