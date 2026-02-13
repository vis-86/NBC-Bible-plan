'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getBasePath } from '@/lib/utils';
import { hasTelegramWebAppObject } from '@/lib/telegram';
import { useAuth } from '@/hooks/useAuth';

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const basePath = getBasePath();
  const telegramBotUrl = 'https://t.me/VisTestPsBot';

  // При наличии WebApp (Telegram или браузер со скриптом) без сессии ведём на логин; на логине различаем по initData
  useEffect(() => {
    if (authLoading || user) return;
    if (hasTelegramWebAppObject()) {
      router.replace('/login?redirect=/dashboard');
    }
  }, [authLoading, user, router]);

  const handleStart = () => {
    window.open(telegramBotUrl, '_blank');
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Фоновое изображение */}
      <div className="fixed inset-0 z-0">
        <img
          src={`${basePath}/bg.png`}
          alt="Cosmic background"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Затемнение для читаемости */}
        <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/60 via-purple-950/50 to-indigo-950/70" />
      </div>
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Hero Section */}
        <section className="pt-12 pb-8 sm:pt-16 sm:pb-12 lg:pt-24 lg:pb-16">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 leading-tight drop-shadow-lg">
              План чтения Библии
              <span className="block text-amber-300 mt-2 drop-shadow-md">
                без чувства вины
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-purple-100 mb-6 sm:mb-8 leading-relaxed drop-shadow-md">
              Знакомо, когда начинаешь год с энтузиазмом, а к марту уже на неделю отстаешь? 
              Мы тоже знаем. И мы здесь, чтобы помочь.
            </p>
            <button
              onClick={handleStart}
              className="inline-block px-8 sm:px-12 py-4 sm:py-5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-lg sm:text-xl font-semibold rounded-full shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-purple-300/50"
            >
              Начать
            </button>
          </div>
        </section>

        {/* Problem Section */}
        <section className="py-8 sm:py-12 lg:py-16">
          <div className="max-w-4xl mx-auto">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl sm:rounded-3xl p-6 sm:p-8 lg:p-12 shadow-xl border border-white/20">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 drop-shadow-md">
                Знакомые ситуации?
              </h2>
              <div className="space-y-4 sm:space-y-6">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-amber-500/20 backdrop-blur-sm flex items-center justify-center text-amber-300 text-xl sm:text-2xl border border-amber-400/30">
                    😅
                  </div>
                  <p className="text-base sm:text-lg text-purple-50 pt-1 drop-shadow-sm">
                    Понедельник: "Сегодня точно начну!" Вторник: "Завтра наверстаю..." 
                    Среда: "Ладно, с понедельника точно начну заново"
                  </p>
                </div>
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-purple-500/20 backdrop-blur-sm flex items-center justify-center text-purple-300 text-xl sm:text-2xl border border-purple-400/30">
                    🤔
                  </div>
                  <p className="text-base sm:text-lg text-purple-50 pt-1 drop-shadow-sm">
                    Открываешь план, видишь что отстал на 15 дней, и закрываешь с мыслью 
                    "в следующем году точно начну вовремя"
                  </p>
                </div>
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="flex-shrink-0 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-indigo-500/20 backdrop-blur-sm flex items-center justify-center text-indigo-300 text-xl sm:text-2xl border border-indigo-400/30">
                    😰
                  </div>
                  <p className="text-base sm:text-lg text-purple-50 pt-1 drop-shadow-sm">
                    Читаешь каждый день, но забываешь отмечать прочитанное, и в итоге 
                    не помнишь, где остановился
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Solution Section */}
        <section className="py-8 sm:py-12 lg:py-16">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 drop-shadow-md">
                Мы создали решение
              </h2>
              <p className="text-lg sm:text-xl text-purple-100 drop-shadow-sm">
                Не идеальное, но работающее. Как и мы сами 😊
              </p>
            </div>
            
            <div className="grid gap-6 sm:gap-8 md:grid-cols-2">
              <div className="bg-gradient-to-br from-indigo-500/20 to-blue-500/20 backdrop-blur-md rounded-xl sm:rounded-2xl p-6 sm:p-8 border border-indigo-400/30 shadow-xl">
                <div className="text-3xl sm:text-4xl mb-4">📖</div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 drop-shadow-sm">
                  Удобный план
                </h3>
                <p className="text-base sm:text-lg text-purple-50 drop-shadow-sm">
                  Видишь весь план сразу, но не пугаешься. Отмечаешь прочитанное одним тапом. 
                  Просто и без лишних движений.
                </p>
              </div>

              <div className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 backdrop-blur-md rounded-xl sm:rounded-2xl p-6 sm:p-8 border border-purple-400/30 shadow-xl">
                <div className="text-3xl sm:text-4xl mb-4">💬</div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 drop-shadow-sm">
                  Чат с пастором
                </h3>
                <p className="text-base sm:text-lg text-purple-50 drop-shadow-sm">
                  Застрял на сложном месте? Спроси у ИИ-помощника. Он не заменит живого пастора, 
                  но поможет разобраться в непонятных моментах.
                </p>
              </div>

              <div className="bg-gradient-to-br from-amber-500/20 to-yellow-500/20 backdrop-blur-md rounded-xl sm:rounded-2xl p-6 sm:p-8 border border-amber-400/30 shadow-xl">
                <div className="text-3xl sm:text-4xl mb-4">📊</div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 drop-shadow-sm">
                  Прогресс без давления
                </h3>
                <p className="text-base sm:text-lg text-purple-50 drop-shadow-sm">
                  Видишь свой прогресс, но без красных предупреждений и чувства вины. 
                  Отстал? Ничего страшного, просто продолжай читать.
                </p>
              </div>

              <div className="bg-gradient-to-br from-violet-500/20 to-purple-500/20 backdrop-blur-md rounded-xl sm:rounded-2xl p-6 sm:p-8 border border-violet-400/30 shadow-xl">
                <div className="text-3xl sm:text-4xl mb-4">🔍</div>
                <h3 className="text-xl sm:text-2xl font-bold text-white mb-3 drop-shadow-sm">
                  Справочник
                </h3>
                <p className="text-base sm:text-lg text-purple-50 drop-shadow-sm">
                  Нужно быстро найти стих или понять контекст? Встроенный справочник поможет 
                  без лишних переходов.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-12 sm:py-16 lg:py-20">
          <div className="max-w-3xl mx-auto text-center">
            <div className="bg-gradient-to-r from-purple-600/90 via-indigo-600/90 to-purple-600/90 backdrop-blur-md rounded-2xl sm:rounded-3xl p-8 sm:p-12 lg:p-16 shadow-2xl border border-purple-400/30">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-4 sm:mb-6 drop-shadow-md">
                Готов начать?
              </h2>
              <p className="text-lg sm:text-xl text-purple-50 mb-6 sm:mb-8 drop-shadow-sm">
                Не обещаем, что будет легко, но обещаем, что будет удобно. 
                И без чувства вины за пропущенные дни.
              </p>
              <button
                onClick={handleStart}
                className="inline-block px-8 sm:px-12 py-4 sm:py-5 bg-gradient-to-r from-amber-400 to-yellow-400 hover:from-amber-500 hover:to-yellow-500 text-indigo-900 text-lg sm:text-xl font-semibold rounded-full shadow-xl hover:shadow-2xl transform hover:scale-105 transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-amber-300/50"
              >
                Начать
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 sm:py-12 text-center text-purple-200/80">
          <p className="text-sm sm:text-base drop-shadow-sm">
            Сделано с любовью для Нижегородской Библейской Церкви
          </p>
        </footer>
      </main>
    </div>
  );
}
