#!/bin/bash

# Скрипт для создания роли "Чтец" в Directus для пользователей Telegram
# Использует статический токен администратора из переменных окружения
# Загружает политику из файла telegram-reader-policy.json

set -e  # Остановка при ошибке

# Получаем путь к директории скрипта
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Путь к файлу политики
POLICY_FILE="$SCRIPT_DIR/telegram-reader-policy.json"

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

# Проверка наличия файла политики
if [ ! -f "$POLICY_FILE" ]; then
    echo "Ошибка: Файл политики не найден: $POLICY_FILE"
    exit 1
fi

echo "Подключение к Directus: $DIRECTUS_URL"
echo "Загрузка политики из: $POLICY_FILE"
echo "Создание роли 'Чтец'..."

# Проверка наличия jq
if ! command -v jq &> /dev/null; then
    echo "Ошибка: jq не установлен. Установите jq для работы скрипта."
    echo "macOS: brew install jq"
    echo "Linux: sudo apt-get install jq"
    exit 1
fi

# Проверка существования роли
EXISTING_ROLE=$(curl -s -X GET "$DIRECTUS_URL/roles?filter[name][_eq]=Чтец" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" | jq -r '.data[0].id // empty')

if [ -n "$EXISTING_ROLE" ]; then
    echo "Роль 'Чтец' уже существует с ID: $EXISTING_ROLE"
    ROLE_ID=$EXISTING_ROLE
else
    # Создание роли
    ROLE_RESPONSE=$(curl -s -X POST "$DIRECTUS_URL/roles" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "Чтец",
            "description": "Роль для пользователей Telegram, которые читают Библию по плану",
            "admin_access": false,
            "app_access": true
        }')

    ROLE_ID=$(echo "$ROLE_RESPONSE" | jq -r '.data.id // empty')

    if [ -z "$ROLE_ID" ] || [ "$ROLE_ID" == "null" ]; then
        echo "Ошибка при создании роли:"
        echo "$ROLE_RESPONSE" | jq '.'
        exit 1
    fi

    echo "Роль 'Чтец' успешно создана с ID: $ROLE_ID"
fi

echo ""
echo "Создание политик и получение их ID..."

# Создаем временное разрешение для получения ID политики "full"
FULL_POLICY_TEMP=$(jq -n \
    --arg role_id "$ROLE_ID" \
    --arg collection "plan" \
    --arg action "read" \
    '{
        role: $role_id,
        collection: $collection,
        action: $action,
        fields: ["*"],
        policy: {"name": "full"}
    }' | jq -c '.')

FULL_POLICY_RESPONSE=$(curl -s -X POST "$DIRECTUS_URL/permissions" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$FULL_POLICY_TEMP")

# Проверяем структуру ответа - policy может быть строкой (ID) или объектом
# Сначала проверяем тип, затем извлекаем ID
FULL_POLICY_ID=$(echo "$FULL_POLICY_RESPONSE" | jq -r '
    if .data.policy then
        if (.data.policy | type) == "string" then
            .data.policy
        elif (.data.policy | type) == "object" and .data.policy.id then
            .data.policy.id
        else
            empty
        end
    else
        empty
    end
')

if [ -z "$FULL_POLICY_ID" ] || [ "$FULL_POLICY_ID" == "null" ]; then
    # Если не получили ID из ответа, попробуем найти существующую политику
    # или используем объект напрямую
    FULL_POLICY_ID=""
    echo "  ⚠ Не удалось получить ID политики 'full', используем объект напрямую"
else
    echo "  ✓ Политика 'full' создана/найдена, ID: $FULL_POLICY_ID"
    # Удаляем временное разрешение
    TEMP_PERM_ID=$(echo "$FULL_POLICY_RESPONSE" | jq -r '.data.id // empty')
    if [ -n "$TEMP_PERM_ID" ] && [ "$TEMP_PERM_ID" != "null" ]; then
        curl -s -X DELETE "$DIRECTUS_URL/permissions/$TEMP_PERM_ID" \
            -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    fi
fi

# Создаем временное разрешение для получения ID политики "custom"
# Используем одинаковые правила для всех custom политик
CUSTOM_POLICY_TEMP=$(jq -n \
    --arg role_id "$ROLE_ID" \
    --arg collection "reading" \
    --arg action "read" \
    '{
        role: $role_id,
        collection: $collection,
        action: $action,
        fields: ["*"],
        policy: {
            "name": "custom",
            "rules": {
                "directus_user_id": {
                    "_eq": "$CURRENT_USER"
                }
            }
        }
    }' | jq -c '.')

CUSTOM_POLICY_RESPONSE=$(curl -s -X POST "$DIRECTUS_URL/permissions" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "$CUSTOM_POLICY_TEMP")

# Проверяем структуру ответа - policy может быть строкой (ID) или объектом
# Сначала проверяем тип, затем извлекаем ID
CUSTOM_POLICY_ID=$(echo "$CUSTOM_POLICY_RESPONSE" | jq -r '
    if .data.policy then
        if (.data.policy | type) == "string" then
            .data.policy
        elif (.data.policy | type) == "object" and .data.policy.id then
            .data.policy.id
        else
            empty
        end
    else
        empty
    end
')

if [ -z "$CUSTOM_POLICY_ID" ] || [ "$CUSTOM_POLICY_ID" == "null" ]; then
    CUSTOM_POLICY_ID=""
    echo "  ⚠ Не удалось получить ID политики 'custom', используем объект напрямую"
else
    echo "  ✓ Политика 'custom' создана/найдена, ID: $CUSTOM_POLICY_ID"
    # Удаляем временное разрешение
    TEMP_PERM_ID=$(echo "$CUSTOM_POLICY_RESPONSE" | jq -r '.data.id // empty')
    if [ -n "$TEMP_PERM_ID" ] && [ "$TEMP_PERM_ID" != "null" ]; then
        curl -s -X DELETE "$DIRECTUS_URL/permissions/$TEMP_PERM_ID" \
            -H "Authorization: Bearer $ADMIN_TOKEN" > /dev/null
    fi
fi

echo ""
echo "Настройка разрешений для роли из файла политики..."

# Функция для создания разрешения
create_permission() {
    local collection=$1
    local action=$2
    local policy_name=$3
    local policy_rules=$4
    local fields=$5

    # Проверяем, существует ли уже разрешение
    local existing=$(curl -s -X GET "$DIRECTUS_URL/permissions?filter[role][_eq]=$ROLE_ID&filter[collection][_eq]=$collection&filter[action][_eq]=$action" \
        -H "Authorization: Bearer $ADMIN_TOKEN" \
        -H "Content-Type: application/json" | jq -r '.data[0].id // empty')

    # Формируем JSON для разрешения
    # Используем ID политики, если он доступен, иначе используем объект
    local permission_json
    if [ "$policy_name" == "full" ]; then
        if [ -n "$FULL_POLICY_ID" ] && [ "$FULL_POLICY_ID" != "null" ]; then
            # Используем ID политики (может быть строкой или объектом)
            # Пробуем сначала как строку, если не работает - как объект
            permission_json=$(jq -n \
                --arg role_id "$ROLE_ID" \
                --arg collection "$collection" \
                --arg action "$action" \
                --argjson fields "$fields" \
                --arg policy_id "$FULL_POLICY_ID" \
                '{
                    role: $role_id,
                    collection: $collection,
                    action: $action,
                    fields: $fields,
                    policy: $policy_id
                }' | jq -c '.')
        else
            # Используем объект напрямую
            permission_json=$(jq -n \
                --arg role_id "$ROLE_ID" \
                --arg collection "$collection" \
                --arg action "$action" \
                --argjson fields "$fields" \
                '{
                    role: $role_id,
                    collection: $collection,
                    action: $action,
                    fields: $fields,
                    policy: {"name": "full"}
                }' | jq -c '.')
        fi
    else
        if [ -n "$CUSTOM_POLICY_ID" ] && [ "$CUSTOM_POLICY_ID" != "null" ]; then
            # Используем ID политики (может быть строкой или объектом)
            # Пробуем сначала как строку, если не работает - как объект
            permission_json=$(jq -n \
                --arg role_id "$ROLE_ID" \
                --arg collection "$collection" \
                --arg action "$action" \
                --argjson fields "$fields" \
                --arg policy_id "$CUSTOM_POLICY_ID" \
                '{
                    role: $role_id,
                    collection: $collection,
                    action: $action,
                    fields: $fields,
                    policy: $policy_id
                }' | jq -c '.')
        else
            # Используем объект напрямую
            local normalized_rules
            if [ "$policy_rules" == "null" ] || [ -z "$policy_rules" ]; then
                normalized_rules="{}"
            else
                normalized_rules=$(echo "$policy_rules" | jq -c '.')
            fi
            
            permission_json=$(jq -n \
                --arg role_id "$ROLE_ID" \
                --arg collection "$collection" \
                --arg action "$action" \
                --argjson fields "$fields" \
                --argjson rules "$normalized_rules" \
                '{
                    role: $role_id,
                    collection: $collection,
                    action: $action,
                    fields: $fields,
                    policy: {
                        "name": "custom",
                        "rules": $rules
                    }
                }' | jq -c '.')
        fi
    fi

    if [ -n "$existing" ]; then
        # Обновляем существующее разрешение
        local response=$(curl -s -X PATCH "$DIRECTUS_URL/permissions/$existing" \
            -H "Authorization: Bearer $ADMIN_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$permission_json")
        
        local updated_id=$(echo "$response" | jq -r '.data.id // empty')
        if [ -n "$updated_id" ] && [ "$updated_id" != "null" ]; then
            echo "  ✓ Разрешение $action для $collection обновлено"
        else
            echo "  ✗ Ошибка при обновлении разрешения $action для $collection"
            echo "$response" | jq '.' 2>/dev/null || echo "$response"
        fi
    else
        # Создаем новое разрешение
        local response=$(curl -s -X POST "$DIRECTUS_URL/permissions" \
            -H "Authorization: Bearer $ADMIN_TOKEN" \
            -H "Content-Type: application/json" \
            -d "$permission_json")

        local permission_id=$(echo "$response" | jq -r '.data.id // empty')
        
        if [ -n "$permission_id" ] && [ "$permission_id" != "null" ]; then
            echo "  ✓ Разрешение $action для $collection создано"
        else
            echo "  ✗ Ошибка при создании разрешения $action для $collection"
            echo "$response" | jq '.' 2>/dev/null || echo "$response"
        fi
    fi
}

# Загружаем политику из JSON файла и создаем разрешения
# Используем jq для итерации по структуре
collections=$(jq -r 'keys[]' "$POLICY_FILE")
for collection in $collections; do
    actions=$(jq -r ".$collection | keys[]" "$POLICY_FILE")
    for action in $actions; do
        policy_name=$(jq -r ".$collection.$action.policy.name" "$POLICY_FILE")
        policy_rules=$(jq -c ".$collection.$action.policy.rules // empty" "$POLICY_FILE")
        fields=$(jq -c ".$collection.$action.fields" "$POLICY_FILE")
        
        create_permission "$collection" "$action" "$policy_name" "$policy_rules" "$fields"
    done
done

echo ""
echo "✓ Роль 'Чтец' успешно настроена!"
echo "  ID роли: $ROLE_ID"
echo ""
echo "Теперь пользователи Telegram могут быть назначены на эту роль при регистрации."
