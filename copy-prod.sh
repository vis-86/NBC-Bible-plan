#!/bin/bash -eux

export NEXT_TELEMETRY_DISABLED=1
export NODE_ENV=production
export NEXT_PUBLIC_BASE_PATH=/app

# Переменные окружения для Directus и Telegram
# Убедитесь, что эти переменные установлены в вашем .env.local или системе
export NEXT_PUBLIC_DIRECTUS_URL="https://bible.baptistnn.ru/directus"
export DIRECTUS_ADMIN_TOKEN="GN1XLN8cjvk7oi-OGZWE45qcv1MOirE0"
# export TELEGRAM_BOT_TOKEN="6277956560:AAFP_riJxeDi8dpqeVMtVcU_yY9RCkpEOaA"
export TELEGRAM_BOT_TOKEN="5895492925:AAGJ6liJ060OeHS6Syk-LaEiHQEGedsNBGE"
export DIRECTUS_AI_FLOW_ID="0f02aa5e-0725-4957-ac63-fbc8d1b15244"
export PORT=3000

# Проверка обязательных переменных
if [ -z "$DIRECTUS_ADMIN_TOKEN" ]; then
    echo "Предупреждение: DIRECTUS_ADMIN_TOKEN не установлен"
fi

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
    echo "Предупреждение: TELEGRAM_BOT_TOKEN не установлен"
fi

# Определяем менеджер пакетов
if command -v yarn &> /dev/null && [ -f "yarn.lock" ]; then
    BUILD_CMD="yarn build"
elif command -v npm &> /dev/null && [ -f "package-lock.json" ]; then
    BUILD_CMD="npm run build"
else
    echo "Ошибка: не найден yarn или npm, или файлы блокировки"
    exit 1
fi

echo "Запуск сборки: $BUILD_CMD"
$BUILD_CMD

# Проверяем, что сборка прошла успешно
if [ $? -ne 0 ]; then
    echo "Ошибка: сборка не удалась"
    exit 1
fi

# Проверяем наличие standalone директории
if [ ! -d ".next/standalone" ]; then
    echo "Ошибка: директория .next/standalone не найдена. Убедитесь, что в next.config.ts установлен output: 'standalone'"
    exit 1
fi

# see https://nextjs.org/docs/deployment#docker-image
# and https://github.com/vercel/next.js/blob/canary/examples/with-docker/Dockerfile
mkdir -p ./pkg

# Копируем public директорию
if [ -d "./public" ]; then
    cp -R ./public ./pkg/
fi

# Копируем standalone без macOS-специфичных атрибутов
export COPYFILE_DISABLE=1

# Копируем все содержимое standalone директории
# Next.js создает standalone сборку со структурой, включающей полный путь к проекту
cp -R .next/standalone/* ./pkg/

# Находим и копируем .next директорию из standalone структуры
# Она может быть в разных местах в зависимости от структуры проекта
STANDALONE_NEXT=$(find .next/standalone -type d -name ".next" | head -1)
if [ -n "$STANDALONE_NEXT" ] && [ -d "$STANDALONE_NEXT" ]; then
    # Копируем .next из standalone в корень pkg
    cp -R "$STANDALONE_NEXT" ./pkg/
fi

# Копируем static файлы из основной .next директории, если они не были скопированы из standalone
if [ -d ".next/static" ] && [ ! -d "./pkg/.next/static" ]; then
    mkdir -p ./pkg/.next
    cp -R .next/static ./pkg/.next/
fi

# Удаляем кэш, если он был скопирован (не должен быть в продакшене)
rm -rf ./pkg/.next/cache 2>/dev/null || true

# Удаляем лишние директории, если они были скопированы (например, полный путь к проекту)
# Оставляем только необходимые файлы в корне pkg
if [ -d "./pkg/Users" ] || [ -d "./pkg/Projects" ]; then
    # Если есть структура Users/... или Projects/..., перемещаем содержимое проекта в корень
    PROJECT_DIR=$(find ./pkg -type d -name "bible-plan" -o -type d -name "nbc" | head -1)
    if [ -n "$PROJECT_DIR" ] && [ -d "$PROJECT_DIR" ]; then
        # Перемещаем server.js, package.json и другие файлы в корень pkg
        if [ -f "$PROJECT_DIR/server.js" ]; then
            cp "$PROJECT_DIR/server.js" ./pkg/
        fi
        if [ -f "$PROJECT_DIR/package.json" ]; then
            cp "$PROJECT_DIR/package.json" ./pkg/
        fi
        # Перемещаем node_modules, если они есть
        if [ -d "$PROJECT_DIR/node_modules" ]; then
            rm -rf ./pkg/node_modules 2>/dev/null || true
            cp -R "$PROJECT_DIR/node_modules" ./pkg/
        fi
        # Перемещаем .next, если он есть
        if [ -d "$PROJECT_DIR/.next" ] && [ ! -d "./pkg/.next" ]; then
            cp -R "$PROJECT_DIR/.next" ./pkg/
        fi
        # Удаляем структуру после копирования
        find ./pkg -type d -name "Users" -o -type d -name "Projects" | xargs rm -rf 2>/dev/null || true
    fi
fi

# Создаем архив без macOS-специфичных атрибутов
# --format=ustar или --format=gnu для совместимости с Linux tar
# --exclude для исключения кэша на всякий случай
tar --format=ustar --exclude='.next/cache' -czf pkg.tar.gz pkg

# Параметры деплоя
SSH_USER="nbc"
SSH_HOST="194.87.252.17"
SSH_PORT="28043"
SERVER_PATH="/home/nbc/workspace"

echo "Отправка архива на сервер..."
scp -P $SSH_PORT pkg.tar.gz $SSH_USER@$SSH_HOST:$SERVER_PATH

# Очистка временных файлов
rm -rf ./pkg
rm pkg.tar.gz

echo "Деплой завершен успешно!"
echo "На сервере выполните:"
echo "  cd $SERVER_PATH"
echo "  tar -xzf pkg.tar.gz"
echo "  cd pkg"
echo "  NODE_ENV=production node server.js"

