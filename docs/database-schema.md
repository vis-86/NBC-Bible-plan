[← Настройка Directus](DIRECTUS_SETUP_GUIDE.md) · [Back to README](../README.md) · [ИИ-интеграция →](AI_INTEGRATION_GUIDE.md)

# Схема базы данных Directus (PostgreSQL)

СУБД — **PostgreSQL 16** (`postgres:16-alpine`, сервис `postgres` в
`deploy/compose.yml`, том `pgdata`). Directus подключается к ней по `DB_CLIENT: pg`.
SQLite в проекте **не используется**: `better-sqlite3`/`@lucia-auth/adapter-sqlite`
были мёртвыми зависимостями и удалены при миграции на static export + Hono BFF.

Всего в базе 39 таблиц: 29 системных (`directus_*`, ими управляет сам Directus) и 10
прикладных, описанных ниже. Приложение ходит в них только через `@directus/sdk`
admin-клиентом из `src/lib/directus-*.ts` (см. [Аутентификация](authentication.md),
раздел «Доступ к данным»), а не напрямую по SQL.

Посмотреть схему на проде:

```bash
docker exec nbc-bible-postgres-1 psql -U directus -d directus -c '\dt'
docker exec nbc-bible-postgres-1 psql -U directus -d directus -c '\d reading'
```

Типы ниже — как их отдаёт `information_schema.columns`; TS-зеркало схемы живёт в
`src/lib/directus-schema.ts`.

## Прикладные таблицы

### 1. `plan` — График чтения

Что и в какой день нужно читать. Каждая глава — отдельная запись.

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `id` | `integer` | Первичный ключ |
| `numbers` | `integer` NULL | Порядковый номер дня |
| `day` | `varchar` NULL | Дата в формате DD.MM.YYYY |
| `read` | `varchar` NULL | Текст одной главы (например, «Быт. 1») |
| `item` | `integer` NULL | Порядковый номер главы внутри дня (1, 2, 3…) |

**Пример данных:**

| numbers | day | read | item |
| :--- | :--- | :--- | :--- |
| 353 | 19.12.2025 | Езд. 4 | 1 |
| 353 | 19.12.2025 | Езд. 5 | 2 |
| 353 | 19.12.2025 | Пс. 136 | 5 |

### 2. `reading` — Прогресс чтения

Какие дни прочитаны каким пользователем. Пишется через regex-диспетчер
`server/src/routes/graphql.ts` (`updateProgress`/`updateProgressBatch`), читается с
фильтром по `directus_user_id` из сессии.

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `id` | `integer` | Первичный ключ |
| `user_id` | `integer` NULL | Legacy: Telegram-ID из старого Python-бота. Новым кодом не пишется |
| `day` | `integer` NULL | Номер дня из `plan.numbers` |
| `directus_user_id` | `varchar` NULL | UUID пользователя Directus — рабочий ключ владельца записи |
| `count` | `integer` NULL | Количество последовательно прочитанных глав. `NULL` = весь день прочитан |
| `completed_items` | `json` NULL | Массив номеров прочитанных глав (например, `[1, 3, 5]`) |
| `year` | `integer` NULL | Год, к которому относится прогресс |

**Логика поля `count`:**
- `count = NULL` — весь день прочитан (совместимо с Python-ботом)
- `count = N` — максимальный последовательный номер прочитанной главы (обратная совместимость)
- `count = 0` — запись удаляется (ничего не прочитано)

**Логика поля `completed_items`:**
- `NULL` — весь день прочитан или используется старая логика
- `[1, 3, 5]` — прочитаны главы 1, 3 и 5 (не обязательно по порядку)
- Позволяет отмечать главы в любом порядке, не требуя последовательного чтения

**Логика поля `year`:**
- Автоматически проставляется на текущий год при создании/обновлении
- Каждый новый год (1 января) план начинается сначала
- По умолчанию возвращаются только записи текущего года

### 3. `weekly_plan` — Недельные чтения

Отдельный список чтений «на неделю» (например, Притчи), не привязанный к дню.
Читается `src/lib/directus-data.ts` (`getWeeklyPlan`) с фильтрацией по префиксу книги.

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `id` | `integer` | Первичный ключ |
| `numbers` | `integer` NULL | Номер недели |
| `item` | `integer` NULL | Порядковый номер внутри недели |
| `read` | `varchar` NULL | Читаемая строка (например, «Притчи 1») |
| `sort_key` | `integer` NULL | Порядок сортировки |

### 4. `songs` — Каталог песен (ChordPro)

Создаётся bootstrap-скриптом, наполняется из `data/songs/*.chordpro`.

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `id` | `integer` | Первичный ключ |
| `title` | `varchar` | Название |
| `subtitle` | `varchar` NULL | Подзаголовок |
| `song_key` | `varchar` NULL | Тональность (директива `{key}`). Названо `song_key`, т.к. `key` зарезервировано |
| `tempo` | `integer` NULL | Темп |
| `time` | `varchar` NULL | Размер |
| `content` | `text` | Сырой ChordPro |
| `slug` | `varchar` | Стабильный slug из имени файла (unique) |
| `status` | `varchar` NULL | Статус публикации Directus |
| `sort` | `integer` NULL | Порядок сортировки |
| `date_created` / `date_updated` | `timestamptz` NULL | Служебные метки Directus |

### 5. `chat_history` — История переписки с ИИ-наставниками

Одна запись на пару (пользователь, пастор).

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `id` | `integer` | Первичный ключ |
| `directus_user_id` | `uuid` | UUID пользователя Directus |
| `pastor_id` | `varchar` | ID пастора (THEOLOGIAN, PRACTICAL, COMFORTER, HISTORIAN) |
| `messages` | `json` | Массив сообщений `[{id, role, text, timestamp}, …]` |
| `date_created` / `date_updated` | `timestamptz` NULL | Служебные метки Directus |

**Структура сообщения:** `id: string`, `role: 'user' \| 'model'`, `text: string`,
`timestamp: number` (миллисекунды).

**Логика:** при отправке сообщения обновляется массив `messages`; при смене пастора
загружается соответствующая запись.

> ⚠️ `src/lib/directus-schema.ts` и `src/lib/directus-chat.ts` объявляют у
> `chat_history` поля `created_at?`/`updated_at?`, которых в базе нет (там
> `date_created`/`date_updated`). Поля опциональные и нигде не читаются, поэтому
> расхождение латентно — но при попытке отсортировать историю по дате оно выстрелит.

### 6. `auth_invites` — Invite/reset токены

Stateful токены (`src/lib/invite.ts`). Подробнее — [Аутентификация](authentication.md).

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `id` | `integer` | Первичный ключ |
| `token` | `varchar` | Секрет ссылки (unique) |
| `kind` | `varchar` | `activate` \| `reset` |
| `label` | `varchar` NULL | Пометка для админа |
| `user` | `uuid` NULL | Целевой пользователь (для reset; для activate — после активации) |
| `expires_at` | `timestamptz` NULL | TTL (по умолчанию 7 дней) |
| `used_at` | `timestamptz` NULL | Одноразовость: непусто ⇒ токен использован |
| `invite_url` | `text` NULL | Готовая ссылка (заполняет Directus Flow) |

### 7. `reading_settings` — Настройки читалки

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `id` | `integer` | Первичный ключ |
| `directus_user_id` | `varchar` NULL | Владелец настроек |
| `font_size` | `integer` NULL | Размер шрифта |
| `line_height` | `real` NULL | Межстрочный интервал |
| `text_align` | `varchar` NULL | Выравнивание |
| `theme` | `varchar` NULL | Тема читалки |
| `verse_numbers_visible` | `boolean` NULL | Показывать номера стихов |

### 8. `user_app_settings` — Настройки приложения

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `id` | `uuid` | Первичный ключ |
| `directus_user_id` | `varchar` NULL | Владелец |
| `theme` | `varchar` NULL | `light` \| `dark` \| `system` |

### 9. `telegram_user_mapping` — Привязка Telegram

Telegram только **привязывает** `tg_id` к существующему аккаунту, не создаёт его.

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `id` | `integer` | Первичный ключ |
| `directus_user_id` | `varchar` NULL | UUID пользователя Directus |
| `telegram_user_id` | `integer` | Telegram-ID |

### 10. `weeks` — Группировка дней по неделям (legacy)

Существует в базе, но **кодом приложения не читается** — осталась от Python-бота.

| Поле | Тип | Описание |
| :--- | :--- | :--- |
| `id` | `integer` | Первичный ключ |
| `num_1` … `num_7` | `integer` NULL | Номера дней (`plan.numbers`), входящих в неделю |

## Чего в базе нет

Прежние версии этого документа описывали таблицы `users`, `reminder`, `plan24` и
`weeks23` — **в текущей базе их нет** (проверено `\dt` на проде 2026-07-10). Учётные
записи живут в системной `directus_users`; напоминания рассылает Directus Flow, а не
таблица `reminder`. Не ищите их.

## Бэкапы

`deploy/backup.sh` (cron, 14 дней) снимает `pg_dump` базы `directus` и том загрузок
Directus в `/opt/nbc/backups`. Проверка дампа:

```bash
gunzip -t /opt/nbc/backups/directus-db-<TS>.sql.gz
```

## See Also

- [Настройка Directus](DIRECTUS_SETUP_GUIDE.md) — настройка коллекций в CMS
- [ИИ-интеграция](AI_INTEGRATION_GUIDE.md) — таблица `chat_history`
- [История чата](CHAT_HISTORY_SETUP.md) — настройка хранения чата
- [Деплой](deployment.md) — сервис `postgres`, тома, бэкапы
