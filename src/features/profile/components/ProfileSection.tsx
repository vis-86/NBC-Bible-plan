'use client';

import { useEffect, useRef, useState } from 'react';
import { Lock, Pencil, WifiOff } from 'lucide-react';
import { emailToLogin } from '@/lib/local-email';
import { Button } from '@/shared/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useIsOnline } from '@/shared/hooks/useIsOnline';
import { ApiClientError } from '@/shared/services/api/client';
import { userApi } from '@/shared/services/api/endpoints';
import { cn } from '@/shared/utils/cn';

/** Должно совпадать с DISPLAY_NAME_MAX в `server/src/routes/user.ts`. */
const DISPLAY_NAME_MAX = 60;
const SUCCESS_HIDE_MS = 4000;

export interface ProfileSectionProps {
  className?: string;
}

/**
 * Секция «Профиль» в настройках. Логин read-only (это идентификатор входа),
 * отображаемое имя правится инлайн по карандашу.
 *
 * Чтение работает офлайн (данные приходят из `lastKnownUser` через AuthProvider),
 * запись — online-only: осознанное исключение из offline-first, см. `docs/offline-pwa.md`.
 */
export function ProfileSection({ className }: ProfileSectionProps) {
  const { user, refreshAuth } = useAuth();
  const isOnline = useIsOnline();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  /** Выставляется при выходе из режима правки — фокус возвращается в эффекте ниже. */
  const shouldReturnFocus = useRef(false);

  const currentName = user?.first_name ?? '';
  const login = emailToLogin(user?.username);

  // Фокус в поле при входе в режим правки: без этого клавиатурный фокус остаётся
  // на исчезнувшем карандаше и проваливается в начало страницы.
  // Возврат фокуса — только в эффекте: `requestAnimationFrame` сразу после setState
  // успевает сработать ДО коммита React, и `editButtonRef` там ещё null
  // (карандаша нет в DOM, пока открыт режим правки) — фокус молча терялся.
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      return;
    }
    if (shouldReturnFocus.current) {
      shouldReturnFocus.current = false;
      editButtonRef.current?.focus();
    }
  }, [editing]);

  // Успех показываем ограниченное время (toast-dismiss), таймер чистим при размонтировании.
  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(false), SUCCESS_HIDE_MS);
    return () => clearTimeout(timer);
  }, [success]);

  if (!user) return null;

  const startEditing = () => {
    console.debug('[ProfileSection] edit mode entered');
    setDraft(currentName);
    setError(null);
    setSuccess(false);
    setEditing(true);
  };

  const stopEditing = () => {
    shouldReturnFocus.current = true;
    setEditing(false);
    setError(null);
  };

  const trimmed = draft.trim();
  const unchanged = trimmed === currentName;
  const canSave = isOnline && !saving && trimmed.length > 0 && trimmed.length <= DISPLAY_NAME_MAX && !unchanged;

  /** Валидация на blur, не на каждый keystroke — ошибка не мигает во время ввода. */
  const handleBlur = () => {
    if (trimmed.length === 0) {
      setError('Имя не может быть пустым. Введите хотя бы один символ');
    } else if (trimmed.length > DISPLAY_NAME_MAX) {
      setError(`Имя длиннее ${DISPLAY_NAME_MAX} символов. Сократите его`);
    } else {
      setError(null);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    console.debug('[ProfileSection] save start', { len: trimmed.length });
    try {
      await userApi.updateProfile(trimmed);
      console.debug('[ProfileSection] save ok');
      // Обновляет и контекст, и офлайн-копию (`setLastKnownUser`) одним вызовом.
      await refreshAuth();
      setSuccess(true);
      shouldReturnFocus.current = true;
      setEditing(false);
    } catch (err) {
      console.error('[ProfileSection] save failed', err);
      if (ApiClientError.isSessionExpired(err)) {
        // Редирект на /login уже запущен глобальным хуком — своё сообщение не показываем.
        return;
      }
      if (err instanceof ApiClientError) {
        setError(`${err.message}. Попробуйте ещё раз`);
      } else {
        setError('Не удалось сохранить — проверьте связь и попробуйте ещё раз');
      }
    } finally {
      setSaving(false);
    }
  };

  const loginRow = login && (
    <div className="mt-1 flex items-center gap-1.5" data-profile-section-login>
      <Lock className="h-3.5 w-3.5 shrink-0 text-app-text-muted" aria-hidden />
      <span className="font-mono text-sm text-app-text-secondary">{login}</span>
    </div>
  );

  return (
    <section
      data-profile-section
      className={cn('space-y-3', className)}
      aria-labelledby="profile-section-heading"
    >
      <h2 id="profile-section-heading" className="text-sm font-medium text-app-text-secondary">
        Профиль
      </h2>

      <div className="rounded-app-md border border-app-border bg-app-surface px-4 py-3">
        {editing ? (
          <div>
            <label htmlFor="profile-display-name" className="block text-xs text-app-text-muted">
              Отображаемое имя
            </label>
            <input
              id="profile-display-name"
              ref={inputRef}
              data-profile-section-name-input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={handleBlur}
              disabled={saving || !isOnline}
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="nickname"
              aria-invalid={error !== null}
              aria-describedby={error ? 'profile-display-name-error' : undefined}
              className="mt-1.5 min-h-11 w-full rounded-app-sm border border-app-border bg-app-bg px-3 text-base text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary disabled:opacity-50"
            />

            {error && (
              <p
                id="profile-display-name-error"
                role="alert"
                className="mt-2 text-sm text-app-missed-text"
              >
                {error}
              </p>
            )}

            <div className="mt-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-profile-section-cancel
                onClick={stopEditing}
                className="flex-1"
              >
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                data-profile-section-save
                onClick={handleSave}
                disabled={!canSave}
                className="flex-1"
              >
                {saving ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </div>

            {!isOnline && <OfflineHint className="mt-3" />}

            <div className="mt-3 border-t border-app-border pt-3">
              {loginRow}
              <p className="mt-1 text-xs text-app-text-muted">
                Логин не меняется — по нему вы входите
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-lg text-app-text">{currentName || 'Без имени'}</p>
                {loginRow}
              </div>
              <button
                type="button"
                ref={editButtonRef}
                data-profile-section-edit
                onClick={startEditing}
                disabled={!isOnline}
                aria-label="Изменить имя"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-app-text-secondary transition-colors hover:bg-app-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-primary disabled:opacity-50"
              >
                <Pencil className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {login && (
              <p className="mt-1 text-xs text-app-text-muted">
                Логин не меняется — по нему вы входите
              </p>
            )}

            {success && (
              <p role="status" className="mt-2 text-sm text-app-success-dark">
                Имя обновлено
              </p>
            )}

            {!isOnline && <OfflineHint className="mt-3" />}
          </div>
        )}
      </div>
    </section>
  );
}

/** Офлайн-подсказка: иконка + текст, не только цвет (правило `color-not-only`). */
function OfflineHint({ className }: { className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-app-text-secondary', className)}>
      <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      Нужен интернет — имя хранится на сервере
    </p>
  );
}
