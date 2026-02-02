#!/bin/bash

# Скрипт установки и настройки Nginx на Ubuntu 22.04 LTS
# ВНИМАНИЕ: Этот скрипт должен запускаться от root

set -e  # Остановка при ошибке

# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

# Пользователь для работы nginx (по умолчанию nginx)
NGINX_USER="nginx"

# Группа для работы nginx
NGINX_GROUP="nginx"

# Директория для сайтов
SITES_DIR="/var/www"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"

# ============================================================================
# ПРОВЕРКИ
# ============================================================================

# Проверка, что скрипт запущен от root
if [ "$EUID" -ne 0 ]; then 
    echo "Ошибка: Скрипт должен запускаться от root"
    exit 1
fi

# Проверка, что мы на Ubuntu
if ! grep -q "Ubuntu" /etc/os-release; then
    echo "Предупреждение: Скрипт предназначен для Ubuntu 22.04 LTS"
    read -p "Продолжить? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo "=========================================="
echo "Установка и настройка Nginx"
echo "=========================================="

# ============================================================================
# 1. УСТАНОВКА NGINX
# ============================================================================

echo "[1/7] Установка Nginx..."

# Обновление списка пакетов
export DEBIAN_FRONTEND=noninteractive
apt-get update

# Проверка, установлен ли nginx
if command -v nginx &> /dev/null; then
    echo "Nginx уже установлен. Версия: $(nginx -v 2>&1)"
    read -p "Переустановить? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        apt-get remove --purge nginx nginx-common -y
        apt-get install nginx -y
    fi
else
    apt-get install nginx -y
fi

# Проверка установки
if ! command -v nginx &> /dev/null; then
    echo "ОШИБКА: Nginx не установлен"
    exit 1
fi

echo "Nginx успешно установлен"

# ============================================================================
# 2. ПРОВЕРКА И НАСТРОЙКА ПОЛЬЗОВАТЕЛЯ NGINX
# ============================================================================

echo "[2/7] Настройка пользователя Nginx..."

# Проверка существования пользователя nginx
if ! id "$NGINX_USER" &>/dev/null; then
    echo "Пользователь $NGINX_USER не найден. Создание..."
    # Создание системного пользователя без домашней директории и без shell
    useradd -r -s /bin/false -d /var/cache/nginx -c "nginx user" "$NGINX_USER"
    
    if ! id "$NGINX_USER" &>/dev/null; then
        echo "ОШИБКА: Не удалось создать пользователя $NGINX_USER"
        exit 1
    fi
    echo "Пользователь $NGINX_USER создан"
else
    echo "Пользователь $NGINX_USER уже существует"
fi

# Проверка группы nginx
if ! getent group "$NGINX_GROUP" > /dev/null 2>&1; then
    echo "Группа $NGINX_GROUP не найдена. Создание..."
    groupadd -r "$NGINX_GROUP"
    usermod -aG "$NGINX_GROUP" "$NGINX_USER"
    echo "Группа $NGINX_GROUP создана"
else
    echo "Группа $NGINX_GROUP уже существует"
    # Убеждаемся, что пользователь в группе
    usermod -aG "$NGINX_GROUP" "$NGINX_USER" 2>/dev/null || true
fi

# Проверка текущего пользователя nginx
CURRENT_USER=$(ps aux | grep '[n]ginx: master' | awk '{print $1}' | head -1 || echo "")
if [ -n "$CURRENT_USER" ]; then
    echo "Текущий пользователь nginx: $CURRENT_USER"
    if [ "$CURRENT_USER" != "$NGINX_USER" ]; then
        echo "Предупреждение: Nginx работает от пользователя $CURRENT_USER, а не $NGINX_USER"
    fi
fi

echo "Пользователь и группа настроены"

# ============================================================================
# 3. НАСТРОЙКА БЕЗОПАСНОСТИ NGINX
# ============================================================================

echo "[3/7] Настройка безопасности Nginx..."

# Резервная копия конфигурации
if [ ! -f /etc/nginx/nginx.conf.backup ]; then
    cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.backup
    echo "Создана резервная копия конфигурации"
fi

# Настройка основного конфига nginx.conf
# Проверяем, есть ли уже настройки пользователя
NGINX_CONFIG_CHANGED=false
if ! grep -q "user $NGINX_USER" /etc/nginx/nginx.conf; then
    # Заменяем или добавляем строку user
    if grep -q "^user " /etc/nginx/nginx.conf; then
        sed -i "s/^user .*/user $NGINX_USER;/" /etc/nginx/nginx.conf
    else
        # Добавляем после первой строки, если нет директивы user
        sed -i "1a user $NGINX_USER;" /etc/nginx/nginx.conf
    fi
    echo "Настроен пользователь в nginx.conf: $NGINX_USER"
    NGINX_CONFIG_CHANGED=true
fi

# Если конфиг изменился и nginx уже запущен, перезапускаем
if [ "$NGINX_CONFIG_CHANGED" = true ] && systemctl is-active --quiet nginx 2>/dev/null; then
    echo "Перезапуск Nginx для применения изменений пользователя..."
    systemctl restart nginx
    sleep 2
fi

# Создание необходимых директорий для nginx
mkdir -p /var/log/nginx
mkdir -p /var/cache/nginx
mkdir -p /var/cache/nginx/client_temp
mkdir -p /var/cache/nginx/proxy_temp
mkdir -p /var/cache/nginx/fastcgi_temp
mkdir -p /var/cache/nginx/uwsgi_temp
mkdir -p /var/cache/nginx/scgi_temp
mkdir -p /run/nginx

# Создание директории для сайтов с правильными правами
mkdir -p "$SITES_DIR"
chown -R $NGINX_USER:$NGINX_GROUP "$SITES_DIR"
chmod 755 "$SITES_DIR"

# Настройка прав на директории nginx
chown -R $NGINX_USER:$NGINX_GROUP /var/log/nginx
chown -R $NGINX_USER:$NGINX_GROUP /var/cache/nginx
chown -R $NGINX_USER:$NGINX_GROUP /run/nginx
chown -R $NGINX_USER:$NGINX_GROUP /etc/nginx

# Права на конфигурационные файлы
# nginx должен иметь возможность читать конфиги
chmod 644 /etc/nginx/nginx.conf
chmod 644 /etc/nginx/conf.d/*.conf 2>/dev/null || true
chmod 755 /etc/nginx
chmod 755 /etc/nginx/conf.d 2>/dev/null || true
chmod 755 "$NGINX_SITES_AVAILABLE"
chmod 755 "$NGINX_SITES_ENABLED"


echo "Настройки безопасности применены"

# ============================================================================
# 4. ОПТИМИЗАЦИЯ КОНФИГУРАЦИИ NGINX
# ============================================================================

echo "[4/7] Оптимизация конфигурации Nginx..."

# Создание директории для дополнительных конфигов
mkdir -p /etc/nginx/conf.d

# Создание файла с настройками безопасности (включается в http блок)
if [ ! -f /etc/nginx/conf.d/security.conf ]; then
    cat > /etc/nginx/conf.d/security.conf << 'EOF'
# Security headers (можно переопределить в конфигах сайтов)
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;

# Скрытие версии nginx
server_tokens off;

# Ограничение размера тела запроса (защита от DoS)
client_max_body_size 10M;

# Таймауты
client_body_timeout 12;
client_header_timeout 12;
keepalive_timeout 15;
send_timeout 10;
EOF
    chmod 644 /etc/nginx/conf.d/security.conf
    chown $NGINX_USER:$NGINX_GROUP /etc/nginx/conf.d/security.conf
    echo "Создан файл с настройками безопасности: /etc/nginx/conf.d/security.conf"
fi

# Проверка, что в nginx.conf есть include для conf.d
# В стандартной конфигурации Ubuntu обычно уже есть include для conf.d
if ! grep -q "include.*conf\.d" /etc/nginx/nginx.conf; then
    echo "Предупреждение: В nginx.conf не найден include для conf.d"
    echo "Файл security.conf создан, но может не загружаться автоматически"
    echo "Проверьте конфигурацию nginx.conf и при необходимости добавьте:"
    echo "  include /etc/nginx/conf.d/*.conf;"
else
    echo "Проверено: include для conf.d найден в nginx.conf"
fi

# Создание базового конфига для сайта по умолчанию
if [ ! -f "$NGINX_SITES_AVAILABLE/default" ]; then
    cat > "$NGINX_SITES_AVAILABLE/default" << 'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    
    server_name _;
    
    root /var/www/html;
    index index.html index.htm index.nginx-debian.html;
    
    # Логи
    access_log /var/log/nginx/access.log;
    error_log /var/log/nginx/error.log;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # Запрет доступа к скрытым файлам
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF
    echo "Создан базовый конфиг default"
fi

# Создание тестовой страницы
mkdir -p /var/www/html
if [ ! -f /var/www/html/index.html ]; then
    cat > /var/www/html/index.html << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>Nginx работает!</title>
    <meta charset="utf-8">
</head>
<body>
    <h1>Nginx успешно установлен и настроен!</h1>
    <p>Сервер работает от пользователя: nginx</p>
    <p>Время: <span id="time"></span></p>
    <script>
        document.getElementById('time').textContent = new Date().toLocaleString('ru-RU');
    </script>
</body>
</html>
EOF
    chown $NGINX_USER:$NGINX_GROUP /var/www/html/index.html
    chmod 644 /var/www/html/index.html
    echo "Создана тестовая страница"
fi

# Активация сайта по умолчанию
if [ ! -L "$NGINX_SITES_ENABLED/default" ]; then
    ln -s "$NGINX_SITES_AVAILABLE/default" "$NGINX_SITES_ENABLED/default"
    echo "Активирован сайт по умолчанию"
fi

echo "Конфигурация оптимизирована"

# ============================================================================
# 5. ПРОВЕРКА КОНФИГУРАЦИИ И ЗАПУСК
# ============================================================================

echo "[5/7] Проверка конфигурации Nginx..."

# Проверка синтаксиса конфигурации
if nginx -t; then
    echo "Конфигурация Nginx корректна"
else
    echo "ОШИБКА: Конфигурация Nginx содержит ошибки!"
    echo "Восстановление из резервной копии..."
    cp /etc/nginx/nginx.conf.backup /etc/nginx/nginx.conf
    nginx -t
    exit 1
fi

# Включение и запуск nginx
systemctl enable nginx
systemctl restart nginx

# Небольшая задержка для запуска процессов
sleep 2

# Проверка статуса
if systemctl is-active --quiet nginx; then
    echo "Nginx успешно запущен"
    
    # Проверка пользователя master процесса
    NGINX_MASTER_PID=$(pgrep -f "nginx: master" | head -1)
    if [ -n "$NGINX_MASTER_PID" ]; then
        PROCESS_USER=$(ps -o user= -p $NGINX_MASTER_PID | tr -d ' ')
        echo "Nginx master процесс работает от пользователя: $PROCESS_USER"
        
        if [ "$PROCESS_USER" != "$NGINX_USER" ]; then
            echo "ОШИБКА: Процесс работает от $PROCESS_USER, а не $NGINX_USER"
            echo "Проверка конфигурации /etc/nginx/nginx.conf..."
            if grep -q "user $NGINX_USER" /etc/nginx/nginx.conf; then
                echo "Конфигурация содержит 'user $NGINX_USER', но процесс не переключился"
                echo "Попытка принудительного перезапуска..."
                systemctl stop nginx
                sleep 1
                systemctl start nginx
                sleep 2
                NEW_PROCESS_USER=$(ps -o user= -p $(pgrep -f "nginx: master" | head -1) 2>/dev/null | tr -d ' ' || echo "")
                if [ "$NEW_PROCESS_USER" = "$NGINX_USER" ]; then
                    echo "Успешно! Теперь работает от $NGINX_USER"
                else
                    echo "Предупреждение: После перезапуска все еще работает от $NEW_PROCESS_USER"
                fi
            else
                echo "Конфигурация не содержит правильного пользователя!"
            fi
        else
            echo "✓ Nginx работает от правильного пользователя: $NGINX_USER"
        fi
    else
        echo "Предупреждение: Не удалось найти master процесс nginx"
    fi
else
    echo "ОШИБКА: Nginx не запустился"
    systemctl status nginx
    exit 1
fi

# ============================================================================
# 6. НАСТРОЙКА FIREWALL
# ============================================================================

echo "[6/7] Настройка firewall для Nginx..."

# Проверка наличия ufw
if command -v ufw &> /dev/null; then
    # Разрешение HTTP и HTTPS (если еще не разрешено)
    ufw allow 80/tcp comment 'HTTP' 2>/dev/null || true
    ufw allow 443/tcp comment 'HTTPS' 2>/dev/null || true
    
    # Проверка статуса
    if ufw status | grep -q "80/tcp\|443/tcp"; then
        echo "Правила firewall для Nginx настроены"
    else
        echo "Предупреждение: Не удалось настроить правила firewall"
    fi
else
    echo "UFW не установлен, пропускаем настройку firewall"
fi

# ============================================================================
# 7. ФИНАЛЬНАЯ ПРОВЕРКА
# ============================================================================

echo "[7/7] Финальная проверка..."

# Проверка доступности nginx
if curl -s -o /dev/null -w "%{http_code}" http://localhost | grep -q "200\|301\|302"; then
    echo "Nginx отвечает на запросы"
else
    echo "Предупреждение: Nginx не отвечает на localhost"
fi

# Вывод информации о процессах
echo ""
echo "Информация о процессах Nginx:"
ps aux | grep '[n]ginx' | head -5

echo ""
echo "=========================================="
echo "Установка Nginx завершена!"
echo "=========================================="
echo ""
echo "ИНФОРМАЦИЯ:"
echo "1. Nginx установлен и запущен"
echo "2. Работает от пользователя: $NGINX_USER"
echo "3. Конфигурация: /etc/nginx/nginx.conf"
echo "4. Сайты: $NGINX_SITES_AVAILABLE"
echo "5. Логи: /var/log/nginx/"
echo "6. Корневая директория: $SITES_DIR"
echo ""
echo "ПРОВЕРКА:"
echo "  curl http://localhost"
echo "  systemctl status nginx"
echo "  nginx -t"
echo ""
echo "СОЗДАНИЕ НОВОГО САЙТА:"
echo "  1. Создайте конфиг: $NGINX_SITES_AVAILABLE/your-site"
echo "  2. Создайте симлинк: ln -s $NGINX_SITES_AVAILABLE/your-site $NGINX_SITES_ENABLED/"
echo "  3. Проверьте: nginx -t"
echo "  4. Перезагрузите: systemctl reload nginx"
echo ""

