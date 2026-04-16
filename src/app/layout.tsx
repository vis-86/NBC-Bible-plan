import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans, Lora } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import ThemeProvider from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "NBC Bible Plan",
  description: "План чтения Библии Нижегородской Библейской Церкви",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
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
        className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} ${lora.variable} antialiased font-sans`}
      >
        <ThemeProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
