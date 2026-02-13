'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { AppView } from '@/types';
import { useTheme } from '@/components/ThemeProvider';
import type { AppThemePreference } from '@/shared/services/api/endpoints';

const themeOptions: Array<{ value: AppThemePreference; label: string }> = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Как в системе' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { themePreference, setThemePreference } = useTheme();

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 dark:bg-stone-900">
        <div className="text-stone-600 dark:text-stone-400">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  return (
    <DashboardLayout currentView={AppView.SETTINGS} onChangeView={() => {}}>
      <div className="h-full overflow-y-auto bg-stone-50 dark:bg-stone-900">
        <div className="max-w-md mx-auto px-4 py-6">
          <h1 className="text-xl font-semibold text-stone-900 dark:text-stone-100 mb-6">
            Настройки
          </h1>

          <section className="space-y-3">
            <h2 className="text-sm font-medium text-stone-600 dark:text-stone-400">
              Тема интерфейса
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setThemePreference(opt.value)}
                  className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    themePreference === opt.value
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 font-medium'
                      : 'border-stone-200 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-stone-300 dark:hover:border-stone-600'
                  }`}
                >
                  <span>{opt.label}</span>
                  {themePreference === opt.value && (
                    <span className="text-red-500 dark:text-red-400" aria-hidden>✓</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
