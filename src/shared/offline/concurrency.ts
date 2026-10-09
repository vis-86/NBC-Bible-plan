/**
 * Вызывает `fn` для каждого элемента, держа в полёте не больше `limit` вызовов.
 *
 * Семантика ошибки — как у последовательного цикла `for … await`, который он заменяет:
 * первый сбой отклоняет результат, новые вызовы после него не запускаются (уже начатые
 * доработают сами — отменять fetch нечем). Порядок завершения не гарантирован.
 */
export async function forEachWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let next = 0;
  let failed = false;

  const worker = async (): Promise<void> => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };

  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker);
  await Promise.all(workers);
}
