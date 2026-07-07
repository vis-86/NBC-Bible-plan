'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isTelegramWebApp } from '@/lib/telegram';
import { useAuth } from '@/hooks/useAuth';
import {
  Atmosphere,
  Header,
  Hero,
  About,
  FeatureShowcase,
  HowToStart,
  InstallGuide,
  FinalCta,
  Footer,
} from '@/features/landing';

/**
 * Лендинг — тонкий оркестратор: держит гейт авторизации и редирект входа из
 * Telegram WebApp, а контент рендерит секциями-компонентами из features/landing.
 */
export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Вход из настоящего Telegram mini-app без сессии → сразу на логин (там вход
  // по initData). Гейтим по initData (isTelegramWebApp), а НЕ по факту наличия
  // window.Telegram.WebApp: telegram-web-app.js из layout создаёт WebApp-объект
  // в любом браузере, поэтому проверка объекта уводила бы и обычных посетителей
  // лендинга на /login. У обычного браузера initData пустой → лендинг виден.
  useEffect(() => {
    if (authLoading || user) return;
    if (isTelegramWebApp()) {
      router.replace('/login?redirect=/dashboard');
    }
  }, [authLoading, user, router]);

  return (
    <div className="relative min-h-screen overflow-x-clip bg-app-bg text-app-text">
      <Atmosphere />
      <div className="relative z-[2] mx-auto w-full max-w-[1200px] px-5 sm:px-7">
        <Header />
        <main>
          <Hero />
          <About />
          <FeatureShowcase />
          <HowToStart />
          <InstallGuide />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </div>
  );
}
