// @ts-nocheck - Directus SDK typing issue with custom schema
import { getDirectusAdminClient } from '@/lib/directus';
import { readItems, createItem, updateItem, deleteItems } from '@directus/sdk';

/**
 * Получает прогресс чтения пользователя
 */
export async function getUserProgress(directusUserId: string) {
  const adminClient = getDirectusAdminClient();

  // Получаем маппинг для определения telegram_user_id
  const mappings = await adminClient.request(
    readItems('telegram_user_mapping', {
      filter: { directus_user_id: { _eq: directusUserId } },
      limit: 1,
    })
  );

  if (mappings.length === 0) {
    return [];
  }

  const telegramUserId = (mappings[0] as any).telegram_user_id;

  // Получаем прогресс чтения по telegram_user_id (user_id в таблице reading)
  // Получаем за все время, чтобы корректно отображать прогресс при переходе года
  const progressData = await adminClient.request(
    readItems('reading', {
      filter: {
        user_id: { _eq: telegramUserId }
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
    telegramUserId,
    totalRecords: progressData.length,
    uniqueRecords: uniqueProgress.length,
    duplicatesRemoved: progressData.length - uniqueProgress.length
  });

  return uniqueProgress;
}

/**
 * Получает прогресс чтения пользователя за все годы (для отображения пропущенных дней)
 */
export async function getUserProgressAllYears(directusUserId: string) {
  const adminClient = getDirectusAdminClient();

  // Получаем маппинг для определения telegram_user_id
  const mappings = await adminClient.request(
    readItems('telegram_user_mapping', {
      filter: { directus_user_id: { _eq: directusUserId } },
      limit: 1,
    })
  );

  if (mappings.length === 0) {
    return [];
  }

  const telegramUserId = (mappings[0] as any).telegram_user_id;

  // Получаем прогресс чтения за все годы
  const progressData = await adminClient.request(
    readItems('reading', {
      filter: {
        user_id: { _eq: telegramUserId }
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
 * Обновляет прогресс чтения пользователя
 */
export async function updateUserProgress(
  directusUserId: string,
  day: number,
  count: number | null
) {
  const adminClient = getDirectusAdminClient();

  // Получаем маппинг для определения telegram_user_id
  const mappings = await adminClient.request(
    readItems('telegram_user_mapping', {
      filter: { directus_user_id: { _eq: directusUserId } },
      limit: 1,
    })
  );

  if (mappings.length === 0) {
    throw new Error('User mapping not found');
  }

  const telegramUserId = (mappings[0] as any).telegram_user_id;

  // Получаем текущий год
  const currentYear = new Date().getFullYear();

  console.log('updateUserProgress: updating progress', {
    directusUserId,
    telegramUserId,
    day,
    count,
    year: currentYear
  });

  // Проверяем есть ли уже запись для этого дня в текущем году
  const existingRecords = await adminClient.request(
    readItems('reading', {
      filter: {
        _and: [
          { user_id: { _eq: telegramUserId } },
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
    await adminClient.request(deleteItems('reading', recordIds));
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
      await adminClient.request(deleteItems('reading', duplicateIds));
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
    await adminClient.request(
      updateItem('reading', recordToUpdate.id, {
        count: count,
        year: currentYear
      })
    );
    console.log('updateUserProgress: record updated successfully', { day, count });
  } else {
    // Создаём новую запись (count может быть null для полностью прочитанного дня)
    // count !== 0 уже проверено выше, но здесь мы создаем запись для любого count (включая null)
    console.log('updateUserProgress: creating new record', {
      day,
      count,
      telegramUserId,
      directusUserId
    });
    await adminClient.request(
      createItem('reading', {
        user_id: telegramUserId,
        day: day,
        count: count,
        directus_user_id: directusUserId,
        year: currentYear
      })
    );
    console.log('updateUserProgress: record created successfully', { day, count });
  }
}

/**
 * Получает план чтения
 */
export async function getReadingPlan() {
  const adminClient = getDirectusAdminClient();

  const planData = await adminClient.request(
    readItems('plan', {
      sort: ['numbers', 'item'],
      limit: -1
    })
  );

  return planData;
}

/**
 * Получает недельный план чтения по книге
 */
export async function getWeeklyPlanItems(book: string) {
  const adminClient = getDirectusAdminClient();

  // В weekly_plan читаемые строки (например, "Притчи 1"), поэтому фильтруем префиксом.
  // Сейчас поддерживаем только Proverb-ветку, но можно расширить маппинг при добавлении книг.
  const prefixByBook: Record<string, string> = {
    proverbs: 'Притчи',
  };

  const prefix = prefixByBook[book];

  const items = await adminClient.request(
    readItems('weekly_plan', {
      filter: prefix ? { read: { _starts_with: prefix } } : undefined,
      sort: ['numbers', 'item'],
      limit: -1,
    })
  );

  return items;
}

/**
 * Получает настройки чтения пользователя
 */
export async function getReadingSettings(directusUserId: string) {
  const adminClient = getDirectusAdminClient();

  const settings = await adminClient.request(
    readItems('reading_settings', {
      filter: { directus_user_id: { _eq: directusUserId } },
      limit: 1,
    })
  );

  if (settings.length === 0) {
    // Возвращаем настройки по умолчанию
    return {
      font_size: 20,
      line_height: 1.6,
      text_align: 'left',
      theme: 'light',
      verse_numbers_visible: true,
      ot_translation: 'rst',
      nt_translation: 'rst'
    };
  }

  return settings[0];
}

/**
 * Сохраняет настройки чтения пользователя
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
  }
) {
  const adminClient = getDirectusAdminClient();

  // Проверяем, есть ли уже запись
  const existing = await adminClient.request(
    readItems('reading_settings', {
      filter: { directus_user_id: { _eq: directusUserId } },
      limit: 1,
    })
  );

  if (existing.length > 0) {
    // Обновляем существующую запись
    await adminClient.request(
      updateItem('reading_settings', existing[0].id, settings)
    );
  } else {
    // Создаём новую запись
    await adminClient.request(
      createItem('reading_settings', {
        directus_user_id: directusUserId,
        ...settings
      })
    );
  }
}

