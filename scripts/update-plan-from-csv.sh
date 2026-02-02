#!/bin/bash

# Скрипт для обновления коллекции plan из CSV файла через Directus API
# Использование: ./scripts/update-plan-from-csv.sh

set -e

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
CSV_FILE="${CSV_FILE:-$PROJECT_ROOT/csv/csv-plan.csv}"

if [ -z "$ADMIN_TOKEN" ]; then
    echo "Ошибка: DIRECTUS_ADMIN_TOKEN не установлен."
    echo "Установите переменную окружения DIRECTUS_ADMIN_TOKEN или добавьте её в scripts/.env.scripts"
    exit 1
fi

# Проверка наличия зависимостей
if ! command -v jq &> /dev/null; then
    echo "Ошибка: jq не установлен. Установите jq для работы скрипта."
    echo "macOS: brew install jq"
    echo "Linux: sudo apt-get install jq"
    exit 1
fi

if ! command -v python3 &> /dev/null; then
    echo "Ошибка: python3 не установлен."
    exit 1
fi

# Проверка наличия файлов
if [ ! -f "$CSV_FILE" ]; then
    echo "Ошибка: CSV файл $CSV_FILE не найден."
    exit 1
fi

echo "=========================================="
echo "Обновление плана чтения из CSV файла"
echo "=========================================="
echo "CSV файл: $CSV_FILE"
echo "Подключение к Directus: $DIRECTUS_URL"
echo ""

# Функция для вычисления даты на основе номера дня
# День 1 = 1 января текущего года, день 2 = 2 января и т.д.
calculate_date() {
    local day_num="$1"
    python3 <<EOF
from datetime import datetime, timedelta
day_num = int("$day_num")
start_date = datetime(datetime.now().year, 1, 1)
target_date = start_date + timedelta(days=day_num - 1)
print(target_date.strftime("%d.%m.%Y"))
EOF
}

# Функция для парсинга диапазона глав используя Python
# Примеры: "Мф. 1-3" → "Мф. 1", "Мф. 2", "Мф. 3"
#          "Пс.1-2" → "Пс. 1", "Пс. 2"
#          "Быт. 1" → "Быт. 1"
#          "Пс.118 (1)" → "Пс.118 (1)"
parse_chapters() {
    local reading_str="$1"
    
    if [ -z "$reading_str" ] || [ "$reading_str" = "" ]; then
        return
    fi
    
    python3 <<EOF
import re
import sys

reading = "$reading_str".strip()

if not reading:
    sys.exit(0)

# 1. Попытка распарсить диапазон или одну главу с возможным суффиксом (1)
# Группы: 1-книга, 2-начальная глава, 3-конечная глава (опц), 4-суффикс (опц)
# Пример: "Пс. 118 (1)", "Пс.1-2", "Мф. 1-3"
pattern = r'^(.+?)(?:\.|\s+)\s*(\d+)(?:-(\d+))?(\s*\(\d+\))?$'
match = re.match(pattern, reading)

if match:
    book_part = match.group(1).strip()
    start_chapter = int(match.group(2))
    end_chapter_str = match.group(3)
    suffix = match.group(4) or ""
    
    # Нормализуем название книги: добавляем точку и пробел если нужно
    # Но так как у нас в BOOK_ABBREVIATIONS в TS есть разные варианты, 
    # здесь мы просто гарантируем формат "Имя. Глава"
    formatted_book = book_part
    if not formatted_book.endswith('.'):
        formatted_book += "."
    
    if end_chapter_str:
        # Есть диапазон (суффиксы в диапазонах обычно не встречаются, но на всякий случай)
        end_chapter = int(end_chapter_str)
        for i in range(start_chapter, end_chapter + 1):
            print(f"{formatted_book} {i}{suffix}")
    else:
        # Одна глава
        print(f"{formatted_book} {start_chapter}{suffix}")
else:
    # Если сложный формат не подошел, пробуем простую нормализацию пробелов
    # для случаев типа "Иуд." (без глав)
    if reading.endswith('.'):
        print(reading)
    elif ' ' not in reading and '.' not in reading:
        print(f"{reading}.")
    else:
        print(reading)
EOF
}

# Шаг 1: Очистка существующих записей
echo "Шаг 1: Очистка существующих записей из коллекции plan..."

# Пытаемся удалить все записи одним запросом
DELETE_RESPONSE=$(curl -s --max-time 60 -X DELETE "$DIRECTUS_URL/items/plan" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -w "\nHTTP_CODE:%{http_code}" 2>&1)

HTTP_CODE=$(echo "$DELETE_RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2 || echo "")
DELETE_RESPONSE=$(echo "$DELETE_RESPONSE" | sed '/HTTP_CODE:/d')

if [ -n "$HTTP_CODE" ] && ([ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 204 ]); then
    echo "  ✓ Все записи удалены"
elif [ $? -eq 0 ]; then
    # Если HTTP код не получен, но curl успешен, проверяем ответ
    if echo "$DELETE_RESPONSE" | jq -e '.errors' >/dev/null 2>&1; then
        echo "  ✗ Ошибка при удалении:"
        echo "$DELETE_RESPONSE" | jq '.errors'
        exit 1
    else
        echo "  ✓ Записи удалены"
    fi
else
    echo "  ⚠ Не удалось удалить записи одним запросом, продолжаем..."
fi

echo ""

# Шаг 2: Загрузка данных из CSV файла
echo "Шаг 2: Загрузка данных из CSV файла..."

# Счетчики для статистики
TOTAL_DAYS=0
TOTAL_ITEMS=0

# Создаем временный файл для batch операций
BATCH_FILE=$(mktemp)
echo "[" > "$BATCH_FILE"
FIRST_ITEM=true

# Читаем CSV файл построчно
while IFS= read -r line || [ -n "$line" ]; do
    # Пропускаем пустые строки
    if [ -z "$line" ] || [ "$line" = "" ]; then
        continue
    fi
    
    # Парсим CSV строку с учетом кавычек
    CSV_PARSE=$(python3 -c "
import csv
import sys
from io import StringIO

line = sys.stdin.read().strip()
if not line:
    sys.exit(1)

reader = csv.reader(StringIO(line))
try:
    row = next(reader)
    for i, col in enumerate(row):
        print(col if i < len(row) else '')
except:
    sys.exit(1)
" <<< "$line")
    
    if [ $? -ne 0 ]; then
        continue
    fi
    
    # Извлекаем колонки
    DAY_NUM=$(echo "$CSV_PARSE" | sed -n '1p')
    MAIN_READING=$(echo "$CSV_PARSE" | sed -n '2p')
    PSALMS=$(echo "$CSV_PARSE" | sed -n '3p')
    PROVERBS=$(echo "$CSV_PARSE" | sed -n '4p')
    
    # Пропускаем строки без номера дня
    if [ -z "$DAY_NUM" ] || ! echo "$DAY_NUM" | grep -qE '^[0-9]+$'; then
        continue
    fi
    
    TOTAL_DAYS=$((TOTAL_DAYS + 1))
    
    # Вычисляем дату для текущего дня
    DAY_DATE=$(calculate_date "$DAY_NUM")
    
    # Счетчик item для текущего дня
    ITEM_COUNTER=1
    
    # Обрабатываем основное чтение
    if [ -n "$MAIN_READING" ] && [ "$MAIN_READING" != "" ]; then
        while IFS= read -r chapter; do
            if [ -n "$chapter" ] && [ "$chapter" != "" ]; then
                if [ "$FIRST_ITEM" = true ]; then
                    FIRST_ITEM=false
                else
                    echo "," >> "$BATCH_FILE"
                fi
                
                chapter_json=$(echo -n "$chapter" | jq -Rs .)
                day_date_json=$(echo -n "$DAY_DATE" | jq -Rs .)
                
                echo "  {\"numbers\": $DAY_NUM, \"day\": $day_date_json, \"read\": $chapter_json, \"item\": $ITEM_COUNTER}" >> "$BATCH_FILE"
                ITEM_COUNTER=$((ITEM_COUNTER + 1))
                TOTAL_ITEMS=$((TOTAL_ITEMS + 1))
            fi
        done <<< "$(parse_chapters "$MAIN_READING")"
    fi
    
    # Обрабатываем псалмы
    if [ -n "$PSALMS" ] && [ "$PSALMS" != "" ]; then
        while IFS= read -r chapter; do
            if [ -n "$chapter" ] && [ "$chapter" != "" ]; then
                if [ "$FIRST_ITEM" = true ]; then
                    FIRST_ITEM=false
                else
                    echo "," >> "$BATCH_FILE"
                fi
                
                chapter_json=$(echo -n "$chapter" | jq -Rs .)
                day_date_json=$(echo -n "$DAY_DATE" | jq -Rs .)
                
                echo "  {\"numbers\": $DAY_NUM, \"day\": $day_date_json, \"read\": $chapter_json, \"item\": $ITEM_COUNTER}" >> "$BATCH_FILE"
                ITEM_COUNTER=$((ITEM_COUNTER + 1))
                TOTAL_ITEMS=$((TOTAL_ITEMS + 1))
            fi
        done <<< "$(parse_chapters "$PSALMS")"
    fi
    
    # Обрабатываем притчи
    if [ -n "$PROVERBS" ] && [ "$PROVERBS" != "" ]; then
        while IFS= read -r chapter; do
            if [ -n "$chapter" ] && [ "$chapter" != "" ]; then
                if [ "$FIRST_ITEM" = true ]; then
                    FIRST_ITEM=false
                else
                    echo "," >> "$BATCH_FILE"
                fi
                
                chapter_json=$(echo -n "$chapter" | jq -Rs .)
                day_date_json=$(echo -n "$DAY_DATE" | jq -Rs .)
                
                echo "  {\"numbers\": $DAY_NUM, \"day\": $day_date_json, \"read\": $chapter_json, \"item\": $ITEM_COUNTER}" >> "$BATCH_FILE"
                ITEM_COUNTER=$((ITEM_COUNTER + 1))
                TOTAL_ITEMS=$((TOTAL_ITEMS + 1))
            fi
        done <<< "$(parse_chapters "$PROVERBS")"
    fi
    
done < "$CSV_FILE"

# Завершаем JSON массив
echo "" >> "$BATCH_FILE"
echo "]" >> "$BATCH_FILE"

echo "  Обработано дней: $TOTAL_DAYS"
echo "  Подготовлено записей для вставки: $TOTAL_ITEMS"
echo ""

# Шаг 3: Вставка данных в Directus
echo "Шаг 3: Вставка данных в Directus..."

BATCH_RESPONSE=$(curl -s --max-time 120 -X POST "$DIRECTUS_URL/items/plan" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d @"$BATCH_FILE" 2>&1)

if [ $? -ne 0 ]; then
    echo "  ✗ Ошибка при отправке запроса к Directus API"
    echo "  Ответ: $BATCH_RESPONSE"
    rm -f "$BATCH_FILE"
    exit 1
fi

# Проверяем, что ответ валидный JSON
if ! echo "$BATCH_RESPONSE" | jq empty 2>/dev/null; then
    echo "  ✗ Неверный ответ от Directus API"
    echo "  Ответ: $BATCH_RESPONSE"
    rm -f "$BATCH_FILE"
    exit 1
fi

# Проверяем наличие ошибок
if echo "$BATCH_RESPONSE" | jq -e '.errors' >/dev/null 2>&1; then
    echo "  ✗ Ошибка при вставке данных:"
    echo "$BATCH_RESPONSE" | jq '.errors'
    rm -f "$BATCH_FILE"
    exit 1
fi

BATCH_RESULT=$(echo "$BATCH_RESPONSE" | jq -r '.data // empty')
if [ -n "$BATCH_RESULT" ] && [ "$BATCH_RESULT" != "null" ]; then
    INSERTED_COUNT=$(echo "$BATCH_RESPONSE" | jq -r '.data | length // 0')
    echo "  ✓ Вставлено записей: $INSERTED_COUNT"
else
    echo "  ✗ Ошибка при вставке данных:"
    echo "$BATCH_RESPONSE" | jq '.' 2>/dev/null || echo "$BATCH_RESPONSE"
    rm -f "$BATCH_FILE"
    exit 1
fi

# Получаем статистику из Directus
echo ""
echo "Шаг 4: Проверка данных в Directus..."
STATS_RESPONSE=$(curl -s --max-time 30 -X GET "$DIRECTUS_URL/items/plan?aggregate[count]=*&aggregate[countDistinct][numbers]=numbers&aggregate[min][numbers]=numbers&aggregate[max][numbers]=numbers" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" 2>&1)

TOTAL_COUNT=$(echo "$STATS_RESPONSE" | jq -r '.data[0].count // 0')
DISTINCT_DAYS=$(echo "$STATS_RESPONSE" | jq -r '.data[0].countDistinct.numbers // 0')
MIN_DAY=$(echo "$STATS_RESPONSE" | jq -r '.data[0].min.numbers // 0')
MAX_DAY=$(echo "$STATS_RESPONSE" | jq -r '.data[0].max.numbers // 0')

echo ""
echo "=========================================="
echo "✓ Обновление завершено успешно!"
echo "=========================================="
echo ""
echo "Статистика:"
echo "  - Обработано дней: $TOTAL_DAYS"
echo "  - Вставлено записей (глав): $INSERTED_COUNT"
echo ""
echo "Проверка Directus:"
echo "  - Дней в коллекции: $DISTINCT_DAYS"
echo "  - Всего записей: $TOTAL_COUNT"
echo "  - Минимальный день: $MIN_DAY"
echo "  - Максимальный день: $MAX_DAY"
echo ""

# Удаляем временный файл
rm -f "$BATCH_FILE"
