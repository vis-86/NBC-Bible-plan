import type { Metadata, Viewport } from "next";
import { Inter, Literata, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import ThemeProvider from "@/components/ThemeProvider";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";
import ChunkGuard from "@/components/ChunkGuard";
import PageZoomGuard from "@/components/PageZoomGuard";
import { TelegramScripts } from "./TelegramScripts";
import { UpdateToast } from "@/shared/components/ui/UpdateToast";
import { getAppBrand, getAppIconsPath } from "@/shared/config/appMode";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
const brand = getAppBrand();

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
  title: brand.name,
  description: brand.description,
  applicationName: brand.name,
  manifest: `${basePath}/manifest.webmanifest`,
  appleWebApp: {
    capable: true,
    // black-translucent: статус-бар прозрачный, белый текст поверх контента.
    // Проверяли переход на непрозрачный black (чтобы iOS отодвинул контент от
    // Dynamic Island без cover) — визуально хуже (постоянная чёрная полоса
    // сверху, режет на светлой теме), а под островком по факту ничего важного не
    // перекрывалось. Остаёмся на translucent.
    statusBarStyle: "black-translucent",
    title: brand.shortName,
  },
  icons: {
    icon: `${getAppIconsPath(basePath)}/icon-192.png`,
    apple: `${getAppIconsPath(basePath)}/apple-touch-icon.png`,
  },
};

export const viewport: Viewport = {
  // viewport-fit=auto (НЕ cover) — сознательно. При cover в standalone-PWA на iOS
  // layout viewport растягивается под home-indicator, и под плавающим нижним баром
  // вылезала пустая полоса фона, разной высоты в портрете/ландшафте («растёт при
  // повороте»). Эталон-сосед chordpro тоже без cover и без этой полосы. Замеры с
  // реального iPhone подтвердили: с auto оболочка (`.h-app-viewport`, fixed;inset:0)
  // точно совпадает с visualViewport в обеих ориентациях, полосы нет.
  // Расплата: env(safe-area-inset-*) при auto = 0, поэтому своей «брови» под цвет
  // экрана нет — статус-бар (black-translucent) рисует система. Не возвращать cover
  // без решения проблемы полосы снизу.
  viewportFit: "auto",
  // Нативный зум страницы запрещён: приложение — PWA с фиксированной высотой,
  // после пинча и возврата к 1× layout-viewport оставался смещённым (пустая полоса
  // снизу). Свой зум есть только в режиме пометок песни (useInkStage).
  // Мета работает в Android Chrome и в standalone-PWA; iOS Safari её игнорирует —
  // там гасит жест PageZoomGuard.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
        <TelegramScripts />
      </head>
      <body
        className={`${inter.variable} ${literata.variable} ${geistMono.variable} antialiased font-sans`}
      >
        <ChunkGuard />
        <PageZoomGuard />
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
