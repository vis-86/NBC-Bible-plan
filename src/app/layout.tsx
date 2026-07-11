import type { Metadata, Viewport } from "next";
import { Inter, Literata, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import ThemeProvider from "@/components/ThemeProvider";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import ChunkGuard from "@/components/ChunkGuard";
import { UpdateToast } from "@/shared/components/ui/UpdateToast";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NBC Bible Plan",
  description: "План чтения Библии Нижегородской Библейской Церкви",
  applicationName: "NBC Bible Plan",
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    // black-translucent: контент уходит под статус-бар, фон брови красят сами
    // шапки через pt-safe (см. globals.css) — инвариант «бровь = цвет шапки».
    statusBarStyle: "black-translucent",
    title: "Bible Plan",
  },
  icons: {
    icon: `${basePath}/icons/icon-192.png`,
    apple: `${basePath}/icons/apple-touch-icon.png`,
  },
};

export const viewport: Viewport = {
  // env(safe-area-inset-*) наполняются только при viewport-fit=cover.
  viewportFit: "cover",
  // themeColor здесь не задаём: он динамический — цвет брови текущего экрана,
  // управляется ThemeProvider + useStatusBarColor (src/shared/utils/statusBarColor.ts).
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
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
      </head>
      <body
        className={`${inter.variable} ${literata.variable} ${geistMono.variable} antialiased font-sans`}
      >
        <ChunkGuard />
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
        {/* OfflineIndicator живёт только на главной (/dashboard) — по фидбеку
            он не должен висеть в ридере и других разделах. */}
        <ServiceWorkerRegistrar />
        <UpdateToast />
      </body>
    </html>
  );
}
