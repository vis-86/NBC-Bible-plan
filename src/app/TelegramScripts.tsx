import Script from "next/script";
import { isWorshipMode } from "@/shared/config/appMode";

/** Telegram SDK и защита mini-app — только в приложении церкви; витрина worship Telegram не использует. */
export function TelegramScripts() {
  if (isWorshipMode()) return null;
  return (
    <>
      {/*
          Telegram SDK is loaded lazily, NOT `beforeInteractive`: telegram.org is
          blocked on most RU networks, and a blocking script from an unreachable
          host stalls hydration → long white screen on cold PWA launches. Inside a
          real Telegram mini-app `window.Telegram.WebApp` is injected natively by
          the client, so this CDN script is only a non-critical fallback.
        */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="lazyOnload"
        />
        <Script
          id="telegram-app-protection"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function setupProtection() {
                  if (window.Telegram && window.Telegram.WebApp) {
                    try {
                      window.Telegram.WebApp.ready();
                      window.Telegram.WebApp.expand();
                      window.Telegram.WebApp.disableVerticalSwipes();
                      window.Telegram.WebApp.enableClosingConfirmation();
                    } catch (e) {
                      console.warn('Telegram protection setup error:', e);
                    }
                  }
                }
                
                // Try immediately
                setupProtection();
                
                // Also try when DOM is ready
                if (document.readyState === 'loading') {
                  document.addEventListener('DOMContentLoaded', setupProtection);
                } else {
                  setupProtection();
                }
                
                // Fallback: check periodically for Telegram WebApp
                let attempts = 0;
                const interval = setInterval(function() {
                  attempts++;
                  if (window.Telegram && window.Telegram.WebApp) {
                    setupProtection();
                    clearInterval(interval);
                  } else if (attempts > 30) {
                    clearInterval(interval);
                  }
                }, 100);
              })();
            `,
          }}
        />
    </>
  );
}
