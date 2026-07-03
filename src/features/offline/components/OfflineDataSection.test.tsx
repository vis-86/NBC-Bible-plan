// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { downloadBibleTranslationMock, downloadSongsMock, downloadPlanMock, clearAllOfflineDataMock, getManifestMock } =
  vi.hoisted(() => ({
    downloadBibleTranslationMock: vi.fn(),
    downloadSongsMock: vi.fn(),
    downloadPlanMock: vi.fn(),
    clearAllOfflineDataMock: vi.fn(),
    getManifestMock: vi.fn(),
  }));

vi.mock('@/shared/offline/downloadManager', () => ({
  downloadBibleTranslation: downloadBibleTranslationMock,
  downloadSongs: downloadSongsMock,
  downloadPlan: downloadPlanMock,
  clearAllOfflineData: clearAllOfflineDataMock,
  getManifest: getManifestMock,
}));

vi.mock('@/shared/offline/outbox', () => ({
  getPendingOutbox: vi.fn().mockResolvedValue([]),
}));

import { OfflineDataSection } from './OfflineDataSection';

describe('OfflineDataSection', () => {
  beforeEach(() => {
    downloadBibleTranslationMock.mockReset().mockResolvedValue(undefined);
    downloadSongsMock.mockReset().mockResolvedValue(undefined);
    downloadPlanMock.mockReset().mockResolvedValue(undefined);
    clearAllOfflineDataMock.mockReset().mockResolvedValue({ cleared: true, pendingOutboxCount: 0 });
    getManifestMock.mockReset().mockResolvedValue([]);
  });

  it('показывает «Не скачано» для всех категорий изначально', async () => {
    render(<OfflineDataSection />);

    await waitFor(() => expect(getManifestMock).toHaveBeenCalled());
    expect(screen.getAllByText('Не скачано').length).toBeGreaterThan(0);
  });

  it('клик «Скачать» у перевода вызывает downloadBibleTranslation с id перевода', async () => {
    render(<OfflineDataSection />);
    await waitFor(() => expect(getManifestMock).toHaveBeenCalled());

    const rstRow = screen.getByText('Синодальный').closest('div')!.parentElement!;
    const button = rstRow.querySelector('button')!;
    fireEvent.click(button);

    await waitFor(() => expect(downloadBibleTranslationMock).toHaveBeenCalledWith('rst', expect.any(Function)));
  });

  it('клик «Скачать» у песен вызывает downloadSongs', async () => {
    render(<OfflineDataSection />);
    await waitFor(() => expect(getManifestMock).toHaveBeenCalled());

    const songsHeading = screen.getByText('Песни');
    const button = songsHeading.parentElement!.querySelector('button')!;
    fireEvent.click(button);

    await waitFor(() => expect(downloadSongsMock).toHaveBeenCalled());
  });

  it('очистка: требует подтверждения, затем вызывает clear({ force: false })', async () => {
    render(<OfflineDataSection />);
    await waitFor(() => expect(getManifestMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Очистить оффлайн-данные'));
    expect(screen.getByText('Да, очистить')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Да, очистить'));

    await waitFor(() => expect(clearAllOfflineDataMock).toHaveBeenCalledWith({ force: false }));
  });

  it('если clear возвращает cleared:false — показывает предупреждение и опцию force', async () => {
    clearAllOfflineDataMock.mockResolvedValue({ cleared: false, pendingOutboxCount: 2 });
    render(<OfflineDataSection />);
    await waitFor(() => expect(getManifestMock).toHaveBeenCalled());

    fireEvent.click(screen.getByText('Очистить оффлайн-данные'));
    fireEvent.click(screen.getByText('Да, очистить'));

    await waitFor(() => expect(screen.getByText('Всё равно очистить')).toBeInTheDocument());

    clearAllOfflineDataMock.mockResolvedValue({ cleared: true, pendingOutboxCount: 2 });
    fireEvent.click(screen.getByText('Всё равно очистить'));

    await waitFor(() => expect(clearAllOfflineDataMock).toHaveBeenLastCalledWith({ force: true }));
  });
});
