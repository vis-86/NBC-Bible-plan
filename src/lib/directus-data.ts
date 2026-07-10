// @ts-nocheck - Directus SDK typing issue with custom schema
import { getDirectusAdminClient, getDirectusUserClient } from '@/lib/directus';
import { readItems, createItem, updateItem, deleteItems } from '@directus/sdk';

/**
 * Получает прогресс чтения пользователя.
 * Если передан userAccessToken, запрос идёт от имени пользователя.
 */
export async function getUserProgress(directusUserId: string, userAccessToken?: string) {
  const client = userAccessToken
    ? getDirectusUserClient(userAccessToken)
    : getDirectusAdminClient();

  // Получаем за все время, чтобы корректно отображать прогресс при переходе года
  const progressData = await client.request(
    readItems('reading', {
      filter: {
        directus_user_id: { _eq: directusUserId }
      },
      sort: ['year', 'id'], // Сортируем по году и id, чтобы при deduplication брать более свежие
      limit: -1
    })
  );

  // Убираем дубликаты - оставляем только одну запись на день (берем последнюю по id)
  const progressMap = new Map<number, any>();
  progressData.forEach((record: any) => {
    const day = record.day;
    const existing = progressMap.get(day);
    if (!existing || record.id > existing.id) {
      progressMap.set(day, record);
    }
  });

  const uniqueProgress = Array.from(progressMap.values());

  console.log('getUserProgress: processed progress', {
    directusUserId,
    totalRecords: progressData.length,
    uniqueRecords: uniqueProgress.length,
    duplicatesRemoved: progressData.length - uniqueProgress.length
  });

  return uniqueProgress;
}

/**
 * Получает прогресс чтения пользователя за все годы (для отображения пропущенных дней).
 * Если передан userAccessToken, запрос идёт от имени пользователя.
 */
export async function getUserProgressAllYears(directusUserId: string, userAccessToken?: string) {
  const client = userAccessToken
    ? getDirectusUserClient(userAccessToken)
    : getDirectusAdminClient();

  const progressData = await client.request(
    readItems('reading', {
      filter: {
        directus_user_id: { _eq: directusUserId }
      },
      limit: -1
    })
  );

  // Группируем по годам и убираем дубликаты внутри каждого года
  const progressByYear = new Map<number, Map<number, any>>();
  
  progressData.forEach((record: any) => {
    const year = record.year || new Date().getFullYear();
    const day = record.day;
    
    if (!progressByYear.has(year)) {
      progressByYear.set(year, new Map());
    }
    
    const yearMap = progressByYear.get(year)!;
    const existing = yearMap.get(day);
    if (!existing || record.id > existing.id) {
      yearMap.set(day, record);
    }
  });

  // Преобразуем в объект для удобства
  const result: { [year: number]: any[] } = {};
  progressByYear.forEach((dayMap, year) => {
    result[year] = Array.from(dayMap.values());
  });

  return result;
}

/**
 * Обновляет прогресс чтения пользователя.
 * Если передан userAccessToken, запрос идёт от имени пользователя.
 */
export async function updateUserProgress(
  directusUserId: string,
  day: number,
  count: number | null,
  userAccessToken?: string
) {
  const client = userAccessToken
    ? getDirectusUserClient(userAccessToken)
    : getDirectusAdminClient();

  const currentYear = new Date().getFullYear();

  console.log('updateUserProgress: updating progress', {
    directusUserId,
    day,
    count,
    year: currentYear
  });

  const existingRecords = await client.request(
    readItems('reading', {
      filter: {
        _and: [
          { directus_user_id: { _eq: directusUserId } },
          { day: { _eq: day } },
          { year: { _eq: currentYear } }
        ]
      }
    })
  );

  console.log('updateUserProgress: existing records', {
    day,
    count,
    existingRecordsCount: existingRecords.length,
    existingCount: existingRecords.length > 0 ? (existingRecords[0] as any).count : null
  });

  if (count === 0 && existingRecords.length > 0) {
    // Удаляем все записи если count = 0
    const recordIds = existingRecords.map((r: any) => r.id);
    console.log('updateUserProgress: deleting records', { day, recordIds });
    await client.request(deleteItems('reading', recordIds));
    console.log('updateUserProgress: records deleted successfully', { day });
  } else if (existingRecords.length > 0) {
    // Если есть дубликаты, удаляем все кроме первой, затем обновляем первую
    if (existingRecords.length > 1) {
      console.log('updateUserProgress: found duplicate records, removing duplicates', {
        day,
        totalRecords: existingRecords.length,
        recordIds: existingRecords.map((r: any) => r.id)
      });
      const duplicateIds = existingRecords.slice(1).map((r: any) => r.id);
      await client.request(deleteItems('reading', duplicateIds));
      console.log('updateUserProgress: duplicates removed', { day, removedIds: duplicateIds });
    }
    
    // Обновляем существующую запись
    const recordToUpdate = existingRecords[0];
    console.log('updateUserProgress: updating existing record', {
      day,
      recordId: recordToUpdate.id,
      oldCount: (recordToUpdate as any).count,
      newCount: count
    });
    await client.request(
      updateItem('reading', recordToUpdate.id, {
        count: count,
        year: currentYear
      })
    );
    console.log('updateUserProgress: record updated successfully', { day, count });
  } else {
    // Создаём новую запись (count может быть null для полностью прочитанного дня)
    console.log('updateUserProgress: creating new record', {
      day,
      count,
      directusUserId
    });
    await client.request(
      createItem('reading', {
        directus_user_id: directusUserId,
        day: day,
        count: count,
        year: currentYear
      })
    );
    console.log('updateUserProgress: record created successfully', { day, count });
  }
}

/**
 * Получает план чтения.
 * Если передан userAccessToken, запрос идёт от имени пользователя.
 */
export async function getReadingPlan(userAccessToken?: string) {
  const client = userAccessToken
    ? getDirectusUserClient(userAccessToken)
    : getDirectusAdminClient();

  const planData = await client.request(
    readItems('plan', {
      sort: ['numbers', 'item'],
      limit: -1
    })
  );

  return planData;
}

/**
 * Получает недельный план чтения по книге.
 * Если передан accessToken пользователя, запрос идёт от его имени (иначе — через admin-клиент).
 */
export async function getWeeklyPlanItems(book: string, userAccessToken?: string) {
  const client = userAccessToken
    ? getDirectusUserClient(userAccessToken)
    : getDirectusAdminClient();

  // В weekly_plan читаемые строки (например, "Притчи 1"), поэтому фильтруем префиксом.
  // Сейчас поддерживаем только Proverb-ветку, но можно расширить маппинг при добавлении книг.
  const prefixByBook: Record<string, string> = {
    proverbs: 'Притчи',
  };

  const prefix = prefixByBook[book];

  const items = await client.request(
    readItems('weekly_plan', {
      filter: prefix ? { read: { _starts_with: prefix } } : undefined,
      sort: ['numbers', 'item'],
      limit: -1,
    })
  );

  return items;
}

/**
 * Получает настройки чтения пользователя.
 * Если передан userAccessToken, запрос идёт от имени пользователя; иначе — через admin-клиент.
 */
export async function getReadingSettings(directusUserId: string, userAccessToken?: string) {
  const client = userAccessToken
    ? getDirectusUserClient(userAccessToken)
    : getDirectusAdminClient();

  const settings = await client.request(
    readItems('reading_settings', {
      filter: { directus_user_id: { _eq: directusUserId } },
      limit: 1,
    })
  );

  if (settings.length === 0) {
    // Возвращаем настройки по умолчанию.
    // Поля `ot_translation` / `nt_translation` — строки; допустимые значения задаются в приложении (`BibleTranslationId`).
    return {
      font_size: 20,
      line_height: 1.6,
      text_align: 'left',
      theme: 'system',
      verse_numbers_visible: true,
      ot_translation: 'rst',
      nt_translation: 'rst',
      verse_per_line: false
    };
  }

  return settings[0];
}

/**
 * Сохраняет настройки чтения пользователя.
 * Если передан userAccessToken, запрос идёт от имени пользователя; иначе — через admin-клиент.
 */
export async function saveReadingSettings(
  directusUserId: string,
  settings: {
    font_size?: number;
    line_height?: number;
    text_align?: string;
    theme?: string;
    verse_numbers_visible?: boolean;
    ot_translation?: string;
    nt_translation?: string;
    verse_per_line?: boolean;
  },
  userAccessToken?: string
) {
  const client = userAccessToken
    ? getDirectusUserClient(userAccessToken)
    : getDirectusAdminClient();

  // Проверяем, есть ли уже запись
  const existing = await client.request(
    readItems('reading_settings', {
      filter: { directus_user_id: { _eq: directusUserId } },
      limit: 1,
    })
  );

  if (existing.length > 0) {
    // Обновляем существующую запись
    await client.request(
      updateItem('reading_settings', existing[0].id, settings)
    );
  } else {
    // Создаём новую запись
    await client.request(
      createItem('reading_settings', {
        directus_user_id: directusUserId,
        ...settings
      })
    );
  }
}

/**
 * Получает настройки приложения пользователя (тема UI и т.д.).
 * Если записи нет, возвращает { theme: 'system' }.
 */
export async function getAppSettings(directusUserId: string, userAccessToken?: string) {
  const client = userAccessToken
    ? getDirectusUserClient(userAccessToken)
    : getDirectusAdminClient();

  const settings = await client.request(
    readItems('user_app_settings', {
      filter: { directus_user_id: { _eq: directusUserId } },
      limit: 1,
    })
  );

  if (settings.length === 0) {
    return { theme: 'system' as const };
  }

  const raw = settings[0] as { theme?: string };
  const theme = raw.theme === 'light' || raw.theme === 'dark' || raw.theme === 'system'
    ? raw.theme
    : 'system';
  return { theme };
}

/**
 * Сохраняет настройки приложения пользователя.
 */
export async function saveAppSettings(
  directusUserId: string,
  settings: { theme?: 'light' | 'dark' | 'system' },
  userAccessToken?: string
) {
  const client = userAccessToken
    ? getDirectusUserClient(userAccessToken)
    : getDirectusAdminClient();

  const existing = await client.request(
    readItems('user_app_settings', {
      filter: { directus_user_id: { _eq: directusUserId } },
      limit: 1,
    })
  );

  if (existing.length > 0) {
    await client.request(
      updateItem('user_app_settings', existing[0].id, settings)
    );
  } else {
    await client.request(
      createItem('user_app_settings', {
        directus_user_id: directusUserId,
        theme: settings.theme ?? 'system',
      })
    );
  }
}

