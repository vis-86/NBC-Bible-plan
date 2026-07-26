import { describe, expect, it } from 'vitest';
import { defaultSetlistTitle, nextSundayISO } from './setlistDefaults';

describe('nextSundayISO', () => {
  it('понедельник → ближайшее воскресенье той же недели', () => {
    // 2026-07-27 — понедельник.
    expect(nextSundayISO(new Date(2026, 6, 27))).toBe('2026-08-02');
  });

  it('суббота → завтра', () => {
    // 2026-08-01 — суббота.
    expect(nextSundayISO(new Date(2026, 7, 1))).toBe('2026-08-02');
  });

  it('воскресенье → сегодня, а не через неделю', () => {
    expect(nextSundayISO(new Date(2026, 7, 2))).toBe('2026-08-02');
  });

  it('переход через конец месяца', () => {
    // 2026-07-29 — среда, ближайшее вс уже в августе.
    expect(nextSundayISO(new Date(2026, 6, 29))).toBe('2026-08-02');
  });

  it('переход через конец года', () => {
    // 2026-12-31 — четверг, ближайшее вс — 2027-01-03.
    expect(nextSundayISO(new Date(2026, 11, 31))).toBe('2027-01-03');
  });

  it('не съезжает на день назад в отрицательном смещении от UTC (считаем в локальном времени)', () => {
    // Регресс на `new Date('YYYY-MM-DD')`: тот дал бы UTC-полночь и getDay() на день раньше.
    const sunday = new Date(2026, 7, 2, 0, 30);
    expect(nextSundayISO(sunday)).toBe('2026-08-02');
  });
});

describe('defaultSetlistTitle', () => {
  it('формат dd.mm.yyyy с ведущими нулями', () => {
    expect(defaultSetlistTitle('2026-08-02')).toBe('Вск. Служение 02.08.2026');
  });

  it('двузначные день и месяц не искажаются', () => {
    expect(defaultSetlistTitle('2026-12-27')).toBe('Вск. Служение 27.12.2026');
  });

  it('пустая или битая дата — заголовок без даты', () => {
    expect(defaultSetlistTitle(null)).toBe('Вск. Служение');
    expect(defaultSetlistTitle('')).toBe('Вск. Служение');
    expect(defaultSetlistTitle('2026-08')).toBe('Вск. Служение');
  });
});
