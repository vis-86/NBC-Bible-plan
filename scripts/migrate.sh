#!/bin/bash

# Скрипт для миграции базы данных SQLite на сервере
# Добавляет Primary Keys и создает таблицу маппинга для Directus

DB_PATH=${1:-"database/data.db"}

if [ ! -f "$DB_PATH" ]; then
    echo "Ошибка: Файл базы данных $DB_PATH не найден."
    exit 1
fi

echo "Начинаю миграцию базы данных: $DB_PATH"

# Создаем временный SQL файл
SQL_FILE=$(mktemp)

cat <<EOF > "$SQL_FILE"
-- 1. Создание таблицы маппинга
CREATE TABLE IF NOT EXISTS telegram_user_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    directus_user_id TEXT NOT NULL,
    telegram_user_id INTEGER NOT NULL UNIQUE
);

-- 2. Миграция таблицы users
CREATE TABLE IF NOT EXISTS users_new (
    user_id INTEGER PRIMARY KEY,
    nick TEXT
);
INSERT OR IGNORE INTO users_new (user_id, nick) SELECT user_id, CAST(nick AS TEXT) FROM users;
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 3. Миграция таблицы plan (с полем item для отдельных глав)
CREATE TABLE IF NOT EXISTS plan_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numbers INTEGER,
    day TEXT,
    read TEXT,
    item INTEGER
);
INSERT OR IGNORE INTO plan_new (id, numbers, day, read, item) 
SELECT id, numbers, day, read, item FROM plan;
DROP TABLE plan;
ALTER TABLE plan_new RENAME TO plan;

-- 4. Миграция таблицы reading (с полем count для частичного прогресса)
-- count = NULL означает весь день прочитан
-- count = N означает прочитано N items из дня
CREATE TABLE IF NOT EXISTS reading_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    day INTEGER,
    directus_user_id TEXT,
    count INTEGER
);
INSERT OR IGNORE INTO reading_new (user_id, day, directus_user_id, count) 
SELECT user_id, day, directus_user_id, count FROM reading;
DROP TABLE reading;
ALTER TABLE reading_new RENAME TO reading;

-- 5. Миграция таблицы weeks
CREATE TABLE IF NOT EXISTS weeks_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num_1 INTEGER,
    num_2 INTEGER,
    num_3 INTEGER,
    num_4 INTEGER,
    num_5 INTEGER,
    num_6 INTEGER,
    num_7 INTEGER
);
INSERT OR IGNORE INTO weeks_new (num_1, num_2, num_3, num_4, num_5, num_6, num_7) 
SELECT num_1, num_2, num_3, num_4, num_5, num_6, num_7 FROM weeks;
DROP TABLE weeks;
ALTER TABLE weeks_new RENAME TO weeks;

-- 6. Миграция таблицы reminder
CREATE TABLE IF NOT EXISTS reminder_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    msg_id INTEGER
);
INSERT OR IGNORE INTO reminder_new (user_id, msg_id) SELECT user_id, msg_id FROM reminder;
DROP TABLE reminder;
ALTER TABLE reminder_new RENAME TO reminder;
EOF

# Выполняем миграцию
sqlite3 "$DB_PATH" < "$SQL_FILE"

if [ $? -eq 0 ]; then
    echo "Миграция $DB_PATH завершена успешно."
    
    # Синхронизация directus_user_id на основе существующих маппингов (если они есть)
    echo "Синхронизация directus_user_id..."
    sqlite3 "$DB_PATH" <<EOF
UPDATE reading 
SET directus_user_id = (
    SELECT directus_user_id 
    FROM telegram_user_mapping 
    WHERE telegram_user_mapping.telegram_user_id = reading.user_id
)
WHERE directus_user_id IS NULL 
  AND EXISTS (
    SELECT 1 
    FROM telegram_user_mapping 
    WHERE telegram_user_mapping.telegram_user_id = reading.user_id
  );
EOF
    echo "Синхронизация завершена."
else
    echo "Ошибка при выполнении миграции $DB_PATH."
fi

# Удаляем временный файл
rm "$SQL_FILE"

