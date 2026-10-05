'use client';

import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { getBasePath } from '@/lib/utils';
import { cn } from '@/shared/utils/cn';
import type { InstallInstructions } from './installInstructions';

export interface InstallStepsProps {
  instructions: InstallInstructions;
  className?: string;
}

/** Пронумерованные шаги установки крупным текстом — общий вид для лендинга и шторки в приложении. */
export const InstallSteps: React.FC<InstallStepsProps> = ({ instructions, className }) => (
  <div className={className} data-install-steps>
    <ol className="flex flex-col gap-3">
      {instructions.steps.map(({ icon: Icon, title, text }, i) => (
        <li
          key={title}
          className="flex items-start gap-4 rounded-app-xl border border-app-border bg-app-surface px-5 py-4 text-left shadow-app-sm"
        >
          <span className="relative mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-app-md bg-app-primary-light text-app-primary">
            <Icon size={20} strokeWidth={2} />
            <span className="absolute -left-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-app-text text-[11px] font-bold text-app-text-inverse">
              {i + 1}
            </span>
          </span>
          <span>
            <span className="block text-[16px] font-semibold leading-snug text-app-text">{title}</span>
            <span className="mt-1 block text-[14.5px] leading-relaxed text-app-text-secondary">{text}</span>
          </span>
        </li>
      ))}
    </ol>
    {instructions.note && (
      <p className="mt-3 text-center text-sm text-app-text-muted" data-install-steps-note>
        {instructions.note}
      </p>
    )}
  </div>
);

/** Адрес лендинга — там инструкция; во встроенном браузере его вставляют в Safari/Chrome. */
export function getSiteUrl(): string {
  return `${window.location.origin}${getBasePath()}/`;
}

export interface CopySiteLinkProps {
  className?: string;
}

/**
 * Запасной путь из встроенного браузера мессенджера: скопировать адрес и вставить
 * в Safari/Chrome. Если буфер обмена недоступен — показываем адрес текстом для ручного копирования.
 */
export const CopySiteLink: React.FC<CopySiteLinkProps> = ({ className }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getSiteUrl());
      setState('copied');
    } catch (err) {
      console.warn('[pwa] copy site link failed', err);
      setState('failed');
    }
  };

  return (
    <div className={cn('flex flex-col items-center gap-2 text-center', className)} data-copy-site-link>
      <p className="text-sm text-app-text-secondary">Не нашли пункт? Скопируйте адрес и вставьте его в браузер.</p>
      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-app-border bg-app-surface px-5 py-2 text-[15px] font-semibold text-app-text shadow-app-sm transition-colors hover:bg-app-surface-muted"
        data-copy-site-link-btn
      >
        {state === 'copied' ? <Check size={17} strokeWidth={2.2} /> : <Copy size={17} strokeWidth={2.2} />}
        {state === 'copied' ? 'Ссылка скопирована' : 'Скопировать ссылку'}
      </button>
      {state === 'failed' && (
        <p className="select-all break-all text-sm font-medium text-app-text" data-copy-site-link-url>
          {getSiteUrl()}
        </p>
      )}
    </div>
  );
};
