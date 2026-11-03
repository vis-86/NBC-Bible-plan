'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { PageHeader } from '@/shared/components/layout/PageHeader';
import { ErrorMessage } from '@/shared/components/ui/ErrorMessage';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';
import { SearchBar } from '@/shared/components/ui/SearchBar';
import { useCatalog } from '@/features/songs/hooks/useCatalog';
import { filterCatalog } from '@/features/songs/lib/catalogSearch';
import { SongCatalogList } from '@/features/songs/components/SongCatalogList';
import { SongCatalogPreview } from '@/features/songs/components/SongCatalogPreview';

/**
 * Общий каталог песен: список (без параметров) и предпросмотр (`?id=`). Параметр в query,
 * а не в сегменте — static export. Online-only: данные каталога в IDB не кладутся.
 */
function CatalogList() {
  const { state, retry } = useCatalog();
  const [query, setQuery] = useState('');

  if (state.status === 'loading') {
    return (
      <div data-song-catalog-loading className="flex justify-center pt-16">
        <LoadingSpinner size={32} />
      </div>
    );
  }
  if (state.status === 'offline' || state.status === 'error') {
    return (
      <div data-song-catalog-offline>
        <ErrorMessage
          title={state.status === 'offline' ? 'Нет интернета' : 'Не удалось загрузить'}
          message={
            state.status === 'offline'
              ? 'Каталог доступен только с интернетом.'
              : 'Каталог доступен только с интернетом. Проверьте соединение и повторите.'
          }
          onRetry={retry}
          retryLabel="Повторить"
        />
      </div>
    );
  }
  if (state.status === 'forbidden') {
    return <ErrorMessage title="Нет доступа" message="Каталог доступен редакторам песен." />;
  }
  return (
    <>
      <div className="px-4 pt-3">
        <SearchBar onSearch={setQuery} initialValue={query} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-nav">
        <SongCatalogList songs={filterCatalog(state.songs, query)} />
      </div>
    </>
  );
}

function CatalogPageContent() {
  const router = useRouter();
  const id = useSearchParams().get('id');
  const leave = () => (id ? router.push('/dashboard/catalog') : router.push('/dashboard/songs'));

  return (
    <div data-song-catalog-page className="flex min-h-0 flex-1 flex-col">
      <PageHeader variant="page" title={id ? 'Песня из каталога' : 'Каталог песен'} onBack={leave} backAriaLabel="Назад" />
      {id ? <SongCatalogPreview id={id} /> : <CatalogList />}
    </div>
  );
}

export default function CatalogPage() {
  return (
    <DashboardLayout onChangeView={() => {}}>
      <Suspense fallback={null}>
        <CatalogPageContent />
      </Suspense>
    </DashboardLayout>
  );
}
