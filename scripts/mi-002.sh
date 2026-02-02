#!/bin/bash

# Скрипт миграции m-002: Создание коллекции reading_settings в Directus
# Создает коллекцию и добавляет необходимые поля для хранения настроек отображения глав
#
# Использование:
#   ./scripts/m-002.sh
#
# Требования:
#   - Установлен jq (brew install jq или apt-get install jq)
#   - Переменная DIRECTUS_ADMIN_TOKEN в scripts/.env.scripts или окружении
#   - Переменная NEXT_PUBLIC_DIRECTUS_URL в scripts/.env.scripts или окружении
#
# Создаваемые поля:
#   - directus_user_id (UUID) - ID пользователя Directus (уникальный)
#   - font_size (Integer) - Размер шрифта в px (по умолчанию: 20)
#   - line_height (Float) - Межстрочный интервал (по умолчанию: 1.6)
#   - text_align (String) - Выравнивание текста (left, center, justify)
#   - theme (String) - Тема отображения (light, dark, sepia)
#   - verse_numbers_visible (Boolean) - Показывать номера стихов (по умолчанию: true)
#   - date_created (Timestamp) - Дата создания записи
#   - date_updated (Timestamp) - Дата обновления записи

# Получаем путь к директории скрипта
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Загрузка переменных окружения из .env.scripts (если существует)
if [ -f "$SCRIPT_DIR/.env.scripts" ]; then
    export $(cat "$SCRIPT_DIR/.env.scripts" | grep -v '^#' | xargs)
fi

# Проверка обязательных переменных
DIRECTUS_URL=${NEXT_PUBLIC_DIRECTUS_URL:-"http://localhost:8055"}
ADMIN_TOKEN=${DIRECTUS_ADMIN_TOKEN:-""}

if [ -z "$ADMIN_TOKEN" ]; then
    echo "Ошибка: DIRECTUS_ADMIN_TOKEN не установлен."
    echo "Установите переменную окружения DIRECTUS_ADMIN_TOKEN или добавьте её в scripts/.env.scripts"
    exit 1
fi

# Проверка наличия jq
if ! command -v jq &> /dev/null; then
    echo "Ошибка: jq не установлен. Установите jq для работы скрипта."
    echo "macOS: brew install jq"
    echo "Linux: sudo apt-get install jq"
    exit 1
fi

echo "=========================================="
echo "Миграция m-002: Создание коллекции reading_settings"
echo "=========================================="
echo "Подключение к Directus: $DIRECTUS_URL"
echo ""

# Проверка существования коллекции
HTTP_CODE=$(curl -s -o /tmp/collection_check.json -w "%{http_code}" -X GET "$DIRECTUS_URL/collections/reading_settings" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" 2>/dev/null)

if [ "$HTTP_CODE" = "200" ]; then
    EXISTING_COLLECTION=$(cat /tmp/collection_check.json | jq -r '.data.collection // empty')
else
    EXISTING_COLLECTION=""
fi
rm -f /tmp/collection_check.json

if [ -n "$EXISTING_COLLECTION" ] && [ "$EXISTING_COLLECTION" != "null" ]; then
    echo "⚠ Коллекция 'reading_settings' уже существует."
    read -p "Продолжить и обновить поля? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Отменено."
        exit 0
    fi
    COLLECTION_EXISTS=true
else
    echo "Создание коллекции 'reading_settings'..."
    
    # Создание коллекции
    COLLECTION_RESPONSE=$(curl -s -X POST "$DIRECTUS_URL/collections" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "collection": "reading_settings",
            "meta": {
                "collection": "reading_settings",
                "icon": "settings",
                "note": "Настройки отображения глав для пользователей",
                "display_template": null,
                "hidden": false,
                "singleton": false,
                "translations": null,
                "archive_field": null,
                "archive_app_filter": true,
                "archive_value": null,
                "unarchive_value": null,
                "sort_field": null
            },
            "schema": {
                "name": "reading_settings"
            }
        }')

    COLLECTION_CHECK=$(echo "$COLLECTION_RESPONSE" | jq -r '.data.collection // empty')
    
    if [ -z "$COLLECTION_CHECK" ] || [ "$COLLECTION_CHECK" == "null" ]; then
        echo "✗ Ошибка при создании коллекции:"
        echo "$COLLECTION_RESPONSE" | jq '.' 2>/dev/null || echo "$COLLECTION_RESPONSE"
        exit 1
    fi

    echo "✓ Коллекция 'reading_settings' успешно создана"
    COLLECTION_EXISTS=false
fi

echo ""
echo "Настройка полей коллекции..."

# Функция для создания/обновления поля
create_field() {
    local field_key=$1
    local field_type=$2
    local field_config=$3
    
    # Проверяем, существует ли поле
    local http_code=$(curl -s -o /tmp/field_check.json -w "%{http_code}" -X GET "$DIRECTUS_URL/fields/reading_settings/$field_key" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" 2>/dev/null)
    
    local existing=""
    if [ "$http_code" = "200" ]; then
        existing=$(cat /tmp/field_check.json | jq -r '.data.field // empty')
    fi
    rm -f /tmp/field_check.json
    
    if [ -n "$existing" ] && [ "$existing" != "null" ]; then
        echo "  ⚠ Поле '$field_key' уже существует, пропускаем..."
        return 0
    fi
    
    # Создаем поле
    local response=$(curl -s -X POST "$DIRECTUS_URL/fields/reading_settings" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$field_config")
    
    local field_check=$(echo "$response" | jq -r '.data.field // empty')
    
    if [ -n "$field_check" ] && [ "$field_check" != "null" ]; then
        echo "  ✓ Поле '$field_key' создано"
    else
        echo "  ✗ Ошибка при создании поля '$field_key':"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 1
    fi
}

# 1. Поле directus_user_id (UUID, уникальное)
echo "  Создание поля 'directus_user_id'..."
create_field "directus_user_id" "uuid" '{
    "field": "directus_user_id",
    "type": "uuid",
    "meta": {
        "field": "directus_user_id",
        "special": null,
        "interface": "input",
        "options": null,
        "display": null,
        "display_options": null,
        "readonly": false,
        "hidden": false,
        "sort": 1,
        "width": "full",
        "translations": null,
        "note": "UUID пользователя Directus (уникальный)"
    },
    "schema": {
        "name": "directus_user_id",
        "table": "reading_settings",
        "data_type": "uuid",
        "default_value": null,
        "max_length": null,
        "numeric_precision": null,
        "numeric_scale": null,
        "is_nullable": false,
        "is_unique": true,
        "is_primary_key": false,
        "is_generated": false,
        "generation_expression": null,
        "has_auto_increment": false,
        "foreign_key_table": null,
        "foreign_key_column": null
    }
}'

# 2. Поле font_size (Integer)
echo "  Создание поля 'font_size'..."
create_field "font_size" "integer" '{
    "field": "font_size",
    "type": "integer",
    "meta": {
        "field": "font_size",
        "special": null,
        "interface": "input",
        "options": null,
        "display": null,
        "display_options": null,
        "readonly": false,
        "hidden": false,
        "sort": 2,
        "width": "half",
        "translations": null,
        "note": "Размер шрифта в пикселях"
    },
    "schema": {
        "name": "font_size",
        "table": "reading_settings",
        "data_type": "integer",
        "default_value": 20,
        "max_length": null,
        "numeric_precision": null,
        "numeric_scale": null,
        "is_nullable": true,
        "is_unique": false,
        "is_primary_key": false,
        "is_generated": false,
        "generation_expression": null,
        "has_auto_increment": false,
        "foreign_key_table": null,
        "foreign_key_column": null
    }
}'

# 3. Поле line_height (Float)
echo "  Создание поля 'line_height'..."
create_field "line_height" "float" '{
    "field": "line_height",
    "type": "float",
    "meta": {
        "field": "line_height",
        "special": null,
        "interface": "input",
        "options": null,
        "display": null,
        "display_options": null,
        "readonly": false,
        "hidden": false,
        "sort": 3,
        "width": "half",
        "translations": null,
        "note": "Межстрочный интервал"
    },
    "schema": {
        "name": "line_height",
        "table": "reading_settings",
        "data_type": "float",
        "default_value": 1.6,
        "max_length": null,
        "numeric_precision": null,
        "numeric_scale": null,
        "is_nullable": true,
        "is_unique": false,
        "is_primary_key": false,
        "is_generated": false,
        "generation_expression": null,
        "has_auto_increment": false,
        "foreign_key_table": null,
        "foreign_key_column": null
    }
}'

# 4. Поле text_align (String с выбором)
echo "  Создание поля 'text_align'..."
create_field "text_align" "string" '{
    "field": "text_align",
    "type": "string",
    "meta": {
        "field": "text_align",
        "special": null,
        "interface": "select-dropdown",
        "options": {
            "choices": [
                {
                    "text": "По левому краю",
                    "value": "left"
                },
                {
                    "text": "По центру",
                    "value": "center"
                },
                {
                    "text": "По ширине",
                    "value": "justify"
                }
            ]
        },
        "display": null,
        "display_options": null,
        "readonly": false,
        "hidden": false,
        "sort": 4,
        "width": "half",
        "translations": null,
        "note": "Выравнивание текста"
    },
    "schema": {
        "name": "text_align",
        "table": "reading_settings",
        "data_type": "varchar",
        "default_value": "left",
        "max_length": 20,
        "numeric_precision": null,
        "numeric_scale": null,
        "is_nullable": true,
        "is_unique": false,
        "is_primary_key": false,
        "is_generated": false,
        "generation_expression": null,
        "has_auto_increment": false,
        "foreign_key_table": null,
        "foreign_key_column": null
    }
}'

# 5. Поле theme (String с выбором)
echo "  Создание поля 'theme'..."
create_field "theme" "string" '{
    "field": "theme",
    "type": "string",
    "meta": {
        "field": "theme",
        "special": null,
        "interface": "select-dropdown",
        "options": {
            "choices": [
                {
                    "text": "Светлая",
                    "value": "light"
                },
                {
                    "text": "Темная",
                    "value": "dark"
                },
                {
                    "text": "Сепия",
                    "value": "sepia"
                }
            ]
        },
        "display": null,
        "display_options": null,
        "readonly": false,
        "hidden": false,
        "sort": 5,
        "width": "half",
        "translations": null,
        "note": "Тема отображения"
    },
    "schema": {
        "name": "theme",
        "table": "reading_settings",
        "data_type": "varchar",
        "default_value": "light",
        "max_length": 20,
        "numeric_precision": null,
        "numeric_scale": null,
        "is_nullable": true,
        "is_unique": false,
        "is_primary_key": false,
        "is_generated": false,
        "generation_expression": null,
        "has_auto_increment": false,
        "foreign_key_table": null,
        "foreign_key_column": null
    }
}'

# 6. Поле verse_numbers_visible (Boolean)
echo "  Создание поля 'verse_numbers_visible'..."
create_field "verse_numbers_visible" "boolean" '{
    "field": "verse_numbers_visible",
    "type": "boolean",
    "meta": {
        "field": "verse_numbers_visible",
        "special": null,
        "interface": "boolean",
        "options": null,
        "display": null,
        "display_options": null,
        "readonly": false,
        "hidden": false,
        "sort": 6,
        "width": "half",
        "translations": null,
        "note": "Показывать номера стихов"
    },
    "schema": {
        "name": "verse_numbers_visible",
        "table": "reading_settings",
        "data_type": "boolean",
        "default_value": true,
        "max_length": null,
        "numeric_precision": null,
        "numeric_scale": null,
        "is_nullable": true,
        "is_unique": false,
        "is_primary_key": false,
        "is_generated": false,
        "generation_expression": null,
        "has_auto_increment": false,
        "foreign_key_table": null,
        "foreign_key_column": null
    }
}'

# Включаем timestamps (created_at и updated_at)
echo "  Включение timestamps (date_created, date_updated)..."
TIMESTAMP_RESPONSE=$(curl -s -X PATCH "$DIRECTUS_URL/collections/reading_settings" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
        "meta": {
            "accountability": "all"
        }
    }' 2>/dev/null)

# Проверяем наличие полей date_created и date_updated
HTTP_CODE=$(curl -s -o /tmp/created_at_check.json -w "%{http_code}" -X GET "$DIRECTUS_URL/fields/reading_settings/date_created" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" 2>/dev/null)

if [ "$HTTP_CODE" = "200" ]; then
    CREATED_AT_EXISTS=$(cat /tmp/created_at_check.json | jq -r '.data.field // empty')
else
    CREATED_AT_EXISTS=""
fi
rm -f /tmp/created_at_check.json

if [ -z "$CREATED_AT_EXISTS" ] || [ "$CREATED_AT_EXISTS" == "null" ]; then
    echo "  Создание поля 'date_created'..."
    create_field "date_created" "timestamp" '{
        "field": "date_created",
        "type": "timestamp",
        "meta": {
            "field": "date_created",
            "special": ["date-created"],
            "interface": "datetime",
            "options": null,
            "display": null,
            "display_options": null,
            "readonly": true,
            "hidden": false,
            "sort": 7,
            "width": "half",
            "translations": null,
            "note": "Дата создания записи"
        },
        "schema": {
            "name": "date_created",
            "table": "reading_settings",
            "data_type": "timestamp",
            "default_value": null,
            "max_length": null,
            "numeric_precision": null,
            "numeric_scale": null,
            "is_nullable": true,
            "is_unique": false,
            "is_primary_key": false,
            "is_generated": false,
            "generation_expression": null,
            "has_auto_increment": false,
            "foreign_key_table": null,
            "foreign_key_column": null
        }
    }'
fi

HTTP_CODE=$(curl -s -o /tmp/updated_at_check.json -w "%{http_code}" -X GET "$DIRECTUS_URL/fields/reading_settings/date_updated" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" 2>/dev/null)

if [ "$HTTP_CODE" = "200" ]; then
    UPDATED_AT_EXISTS=$(cat /tmp/updated_at_check.json | jq -r '.data.field // empty')
else
    UPDATED_AT_EXISTS=""
fi
rm -f /tmp/updated_at_check.json

if [ -z "$UPDATED_AT_EXISTS" ] || [ "$UPDATED_AT_EXISTS" == "null" ]; then
    echo "  Создание поля 'date_updated'..."
    create_field "date_updated" "timestamp" '{
        "field": "date_updated",
        "type": "timestamp",
        "meta": {
            "field": "date_updated",
            "special": ["date-updated"],
            "interface": "datetime",
            "options": null,
            "display": null,
            "display_options": null,
            "readonly": true,
            "hidden": false,
            "sort": 8,
            "width": "half",
            "translations": null,
            "note": "Дата последнего обновления записи"
        },
        "schema": {
            "name": "date_updated",
            "table": "reading_settings",
            "data_type": "timestamp",
            "default_value": null,
            "max_length": null,
            "numeric_precision": null,
            "numeric_scale": null,
            "is_nullable": true,
            "is_unique": false,
            "is_primary_key": false,
            "is_generated": false,
            "generation_expression": null,
            "has_auto_increment": false,
            "foreign_key_table": null,
            "foreign_key_column": null
        }
    }'
fi

echo ""
echo "=========================================="
echo "✓ Миграция m-002 завершена успешно!"
echo "=========================================="
echo ""
echo "Коллекция 'reading_settings' готова к использованию."
echo ""
echo "Следующие шаги:"
echo "1. Настройте права доступа для ролей в Directus"
echo "2. Проверьте коллекцию в админ-панели Directus"
echo ""


