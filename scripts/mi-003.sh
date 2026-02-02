#!/bin/bash

# Скрипт миграции mi-003: Добавление поля year в таблицу reading
# Добавляет поле year (INTEGER) для отслеживания года прогресса чтения
#
# Использование:
#   ./scripts/mi-003.sh
#
# Требования:
#   - Переменная DIRECTUS_ADMIN_TOKEN в scripts/.env.scripts или окружении
#   - Переменная NEXT_PUBLIC_DIRECTUS_URL в scripts/.env.scripts или окружении
#   - Установлен jq (brew install jq или apt-get install jq)

# Получаем путь к директории скрипта и корню проекта
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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
echo "Миграция mi-003: Добавление поля year в таблицу reading"
echo "=========================================="
echo "Подключение к Directus: $DIRECTUS_URL"
echo ""

# Функция для создания/обновления поля в Directus
create_field() {
    local field_key=$1
    local field_config=$2
    
    # Проверяем, существует ли поле в Directus
    local http_code=$(curl -s -o /tmp/field_check.json -w "%{http_code}" -X GET "$DIRECTUS_URL/fields/reading/$field_key" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" 2>/dev/null)
    
    local existing=""
    if [ "$http_code" = "200" ]; then
        existing=$(cat /tmp/field_check.json | jq -r '.data.field // empty')
    fi
    rm -f /tmp/field_check.json
    
    if [ -n "$existing" ] && [ "$existing" != "null" ]; then
        echo "  ⚠ Поле '$field_key' уже существует в Directus, пропускаем..."
        return 0
    fi
    
    # Создаем поле в Directus
    local response=$(curl -s -X POST "$DIRECTUS_URL/fields/reading" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$field_config")
    
    local field_check=$(echo "$response" | jq -r '.data.field // empty')
    
    if [ -n "$field_check" ] && [ "$field_check" != "null" ]; then
        echo "  ✓ Поле '$field_key' создано в Directus"
    else
        echo "  ✗ Ошибка при создании поля '$field_key' в Directus:"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
        return 1
    fi
}

# Шаг 1: Добавление поля в Directus
echo "Шаг 1: Добавление поля 'year' в Directus..."
create_field "year" '{
    "field": "year",
    "type": "integer",
    "meta": {
        "field": "year",
        "special": null,
        "interface": "input",
        "options": null,
        "display": null,
        "display_options": null,
        "readonly": false,
        "hidden": false,
        "sort": 6,
        "width": "half",
        "translations": null,
        "note": "Год, к которому относится прогресс чтения (например, 2025, 2026)"
    },
    "schema": {
        "name": "year",
        "table": "reading",
        "data_type": "integer",
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

# Шаг 2: Обновление существующих записей
echo ""
echo "Шаг 2: Обновление существующих записей..."
CURRENT_YEAR=$(date +%Y)
CURRENT_DAY_OF_YEAR=$(date +%j | sed 's/^0*//')  # День года (1-365/366), убираем ведущие нули

echo "  Текущий год: $CURRENT_YEAR"
echo "  Текущий день года: $CURRENT_DAY_OF_YEAR"
echo "  Логика: если день плана > $CURRENT_DAY_OF_YEAR → год = $((CURRENT_YEAR - 1))"
echo "          если день плана <= $CURRENT_DAY_OF_YEAR → год = $CURRENT_YEAR"
echo ""

# Получаем все записи, где year IS NULL
echo "  Получение записей для обновления..."
RECORDS_RESPONSE=$(curl -s -X GET "$DIRECTUS_URL/items/reading?filter[year][_null]=true&fields=id,day&limit=-1" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" 2>/dev/null)

RECORDS_COUNT=$(echo "$RECORDS_RESPONSE" | jq -r '.data | length // 0')

if [ "$RECORDS_COUNT" = "0" ] || [ -z "$RECORDS_RESPONSE" ]; then
    echo "  ⚠ Нет записей для обновления (все записи уже имеют значение year)."
else
    echo "  Найдено записей для обновления: $RECORDS_COUNT"
    echo "  Обновление записей..."
    
    UPDATED_COUNT=0
    CURRENT_YEAR_UPDATES=0
    PREV_YEAR_UPDATES=0
    
    # Сохраняем записи во временный файл для обработки
    TEMP_FILE=$(mktemp)
    echo "$RECORDS_RESPONSE" | jq -c '.data[]' > "$TEMP_FILE"
    
    # Обрабатываем каждую запись
    while IFS= read -r record; do
        RECORD_ID=$(echo "$record" | jq -r '.id')
        RECORD_DAY=$(echo "$record" | jq -r '.day')
        
        # Определяем год по логике
        if [ -n "$RECORD_DAY" ] && [ "$RECORD_DAY" != "null" ] && [ "$RECORD_ID" != "null" ]; then
            if [ "$RECORD_DAY" -gt "$CURRENT_DAY_OF_YEAR" ]; then
                YEAR_VALUE=$((CURRENT_YEAR - 1))
                PREV_YEAR_UPDATES=$((PREV_YEAR_UPDATES + 1))
            else
                YEAR_VALUE=$CURRENT_YEAR
                CURRENT_YEAR_UPDATES=$((CURRENT_YEAR_UPDATES + 1))
            fi
            
            # Обновляем запись через Directus API
            UPDATE_RESPONSE=$(curl -s -X PATCH "$DIRECTUS_URL/items/reading/$RECORD_ID" \
                -H "Authorization: Bearer $ADMIN_TOKEN" \
                -H "Content-Type: application/json" \
                -d "{\"year\": $YEAR_VALUE}" 2>/dev/null)
            
            UPDATE_CHECK=$(echo "$UPDATE_RESPONSE" | jq -r '.data.id // empty')
            
            if [ -n "$UPDATE_CHECK" ] && [ "$UPDATE_CHECK" != "null" ]; then
                UPDATED_COUNT=$((UPDATED_COUNT + 1))
            fi
        fi
    done < "$TEMP_FILE"
    
    rm -f "$TEMP_FILE"
    
    # Получаем финальную статистику
    FINAL_CURRENT_YEAR_RESPONSE=$(curl -s -X GET "$DIRECTUS_URL/items/reading?filter[year][_eq]=$CURRENT_YEAR&aggregate[count]=*" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" 2>/dev/null)
    
    FINAL_PREV_YEAR_RESPONSE=$(curl -s -X GET "$DIRECTUS_URL/items/reading?filter[year][_eq]=$((CURRENT_YEAR - 1))&aggregate[count]=*" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" 2>/dev/null)
    
    FINAL_CURRENT_COUNT=$(echo "$FINAL_CURRENT_YEAR_RESPONSE" | jq -r '.data[0].count // 0')
    FINAL_PREV_COUNT=$(echo "$FINAL_PREV_YEAR_RESPONSE" | jq -r '.data[0].count // 0')
    
    echo "  ✓ Обновлено записей: $UPDATED_COUNT"
    echo "    - Год $CURRENT_YEAR: $FINAL_CURRENT_COUNT записей (обновлено: $CURRENT_YEAR_UPDATES)"
    echo "    - Год $((CURRENT_YEAR - 1)): $FINAL_PREV_COUNT записей (обновлено: $PREV_YEAR_UPDATES)"
fi

echo ""
echo "=========================================="
echo "✓ Миграция mi-003 завершена успешно!"
echo "=========================================="
echo ""
echo "Поле 'year' добавлено в Directus."
echo "Записи обновлены с учетом логики:"
echo "  - Дни плана <= $CURRENT_DAY_OF_YEAR → год $CURRENT_YEAR"
echo "  - Дни плана > $CURRENT_DAY_OF_YEAR → год $((CURRENT_YEAR - 1))"
echo ""
echo "Следующие шаги:"
echo "1. Проверьте коллекцию 'reading' в админ-панели Directus"
echo "2. Убедитесь, что поле 'year' отображается корректно"
echo ""

