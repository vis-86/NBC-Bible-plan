'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { AppView } from '@/types';
import { useTheme } from '@/components/ThemeProvider';
import type { AppThemePreference } from '@/shared/services/api/endpoints';
import { DashboardReadingSettingsSection } from '@/features/reading/components/DashboardReadingSettingsSection';
import { OfflineDataSection } from '@/features/offline/components/OfflineDataSection';
import { PageHeader } from '@/shared/components/layout/PageHeader';

const themeOptions: Array<{ value: AppThemePreference; label: string }> = [
  { value: 'light', label: 'Светлая' },
  { value: 'dark', label: 'Тёмная' },
  { value: 'system', label: 'Как в системе' },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, logout } = useAuth();
  const { themePreference, setThemePreference } = useTheme();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout();
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-app-bg">
        <div className="text-app-text-muted">Загрузка...</div>
      </div>
    );
  }

  if (!user) {
    router.replace('/login');
    return null;
  }

  return (
    <DashboardLayout currentView={AppView.SETTINGS} onChangeView={() => {}}>
      <div className="flex min-h-0 flex-1 flex-col">
        <PageHeader variant="page" title="Настройки" />
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-app-bg px-4 py-6">
          <section className="space-y-3">
            <h2 className="text-sm font-medium text-app-text-secondary">
              Тема интерфейса
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {themeOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setThemePreference(opt.value)}
                  className={`flex items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition-all ${
                    themePreference === opt.value
                      ? 'border-app-primary bg-app-primary-light text-app-primary font-medium'
                      : 'border-app-border text-app-text-secondary hover:border-app-border-strong'
                  }`}
                >
                  <span>{opt.label}</span>
                  {themePreference === opt.value && (
                    <span className="text-app-primary" aria-hidden>✓</span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <DashboardReadingSettingsSection />
          <OfflineDataSection />

          <section className="mt-8">
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="w-full rounded-lg border-2 border-app-missed-text px-3 py-2.5 text-sm font-medium text-app-missed-text transition-all disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loggingOut ? 'Выход…' : 'Выйти из приложения'}
            </button>
          </section>
        </div>
      </div>
    </DashboardLayout>
  );
}
