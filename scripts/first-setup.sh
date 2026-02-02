#!/bin/bash

# Скрипт первоначальной настройки Ubuntu 22.04 LTS x64
# ВНИМАНИЕ: Этот скрипт должен запускаться от root на чистом сервере

set -e  # Остановка при ошибке

# ============================================================================
# КОНФИГУРАЦИЯ
# ============================================================================

# SSH ключ для root (публичная часть)
# ВАЖНО: Замените на свой публичный SSH ключ перед запуском!
ROOT_SSH_KEY="ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC..."

# SSH ключ для пользователя nbc (публичная часть)
# ВАЖНО: Замените на свой публичный SSH ключ перед запуском!
NBC_SSH_KEY="ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC..."

# Новый SSH порт
SSH_PORT=28043

# Имя пользователя
NBC_USER="nbc"

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

# Проверка SSH ключей
if [[ "$ROOT_SSH_KEY" == "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC..." ]] || \
   [[ "$NBC_SSH_KEY" == "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQC..." ]]; then
    echo "ОШИБКА: Необходимо указать ваши SSH ключи в переменных ROOT_SSH_KEY и NBC_SSH_KEY"
    exit 1
fi

echo "=========================================="
echo "Начало первоначальной настройки Ubuntu"
echo "=========================================="

# ============================================================================
# 1. ОБНОВЛЕНИЕ СИСТЕМЫ
# ============================================================================

echo "[1/8] Обновление системы..."
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y \
    curl \
    wget \
    git \
    ufw \
    fail2ban \
    unattended-upgrades \
    apt-listchanges \
    htop \
    nano \
    vim \
    sudo

# ============================================================================
# 2. НАСТРОЙКА SSH ДЛЯ ROOT
# ============================================================================

echo "[2/8] Настройка SSH для root..."

# Создание директории .ssh для root, если не существует
mkdir -p /root/.ssh
chmod 700 /root/.ssh

# Добавление SSH ключа для root
echo "$ROOT_SSH_KEY" > /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

# Резервная копия конфигурации SSH
cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

# Настройка SSH
cat >> /etc/ssh/sshd_config << EOF

# Настройки безопасности SSH (добавлено first-setup.sh)
Port $SSH_PORT
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PermitEmptyPasswords no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
X11Forwarding no
AllowTcpForwarding yes
EOF

# Перезапуск SSH (с проверкой конфигурации)
if sshd -t; then
    systemctl restart sshd
    echo "SSH перезапущен. Новый порт: $SSH_PORT"
    echo "ВАЖНО: Убедитесь, что вы можете подключиться по новому порту перед закрытием текущей сессии!"
else
    echo "ОШИБКА: Неверная конфигурация SSH. Откат изменений..."
    cp /etc/ssh/sshd_config.backup /etc/ssh/sshd_config
    systemctl restart sshd
    exit 1
fi

# ============================================================================
# 3. СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ NBC
# ============================================================================

echo "[3/8] Создание пользователя $NBC_USER..."

# Проверка, существует ли пользователь
if id "$NBC_USER" &>/dev/null; then
    echo "Пользователь $NBC_USER уже существует, пропускаем создание"
else
    # Создание пользователя с домашней директорией
    useradd -m -s /bin/bash "$NBC_USER"
    
    # Добавление в группу sudo
    usermod -aG sudo "$NBC_USER"
    
    # Настройка sudo без пароля (опционально, можно закомментировать)
    echo "$NBC_USER ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/$NBC_USER
    chmod 440 /etc/sudoers.d/$NBC_USER
    
    # Создание директории .ssh для пользователя
    mkdir -p /home/$NBC_USER/.ssh
    chmod 700 /home/$NBC_USER/.ssh
    
    # Добавление SSH ключа
    echo "$NBC_SSH_KEY" > /home/$NBC_USER/.ssh/authorized_keys
    chmod 600 /home/$NBC_USER/.ssh/authorized_keys
    
    # Установка владельца
    chown -R $NBC_USER:$NBC_USER /home/$NBC_USER/.ssh
    
    echo "Пользователь $NBC_USER создан и настроен"
fi

# ============================================================================
# 4. НАСТРОЙКА FIREWALL (UFW)
# ============================================================================

echo "[4/8] Настройка firewall..."

# Сброс правил (если есть)
ufw --force reset

# Разрешение SSH на новом порту
ufw allow $SSH_PORT/tcp comment 'SSH'

# Разрешение HTTP и HTTPS (для веб-сервера)
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'

# Базовые настройки
ufw default deny incoming
ufw default allow outgoing

# Включение firewall
ufw --force enable

echo "Firewall настроен и включен"

# ============================================================================
# 5. НАСТРОЙКА FAIL2BAN
# ============================================================================

echo "[5/8] Настройка fail2ban..."

# Создание конфигурации для SSH
cat > /etc/fail2ban/jail.local << EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
destemail = root@localhost
sendername = Fail2Ban
action = %(action_)s

[sshd]
enabled = true
port = $SSH_PORT
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 7200
EOF

# Перезапуск fail2ban
systemctl enable fail2ban
systemctl restart fail2ban

echo "Fail2ban настроен и запущен"

# ============================================================================
# 6. АВТОМАТИЧЕСКИЕ ОБНОВЛЕНИЯ БЕЗОПАСНОСТИ
# ============================================================================

echo "[6/8] Настройка автоматических обновлений безопасности..."

# Настройка unattended-upgrades
cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrades::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrades::AutoFixInterruptedDpkg "true";
Unattended-Upgrades::MinimalSteps "true";
Unattended-Upgrades::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrades::Remove-Unused-Dependencies "true";
Unattended-Upgrades::Automatic-Reboot "false";
Unattended-Upgrades::Automatic-Reboot-Time "02:00";
EOF

# Включение автоматических обновлений
cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
EOF

echo "Автоматические обновления безопасности настроены"

# ============================================================================
# 7. ДОПОЛНИТЕЛЬНЫЕ НАСТРОЙКИ БЕЗОПАСНОСТИ
# ============================================================================

echo "[7/8] Применение дополнительных настроек безопасности..."

# Отключение root логина по паролю (только ключ)
passwd -l root 2>/dev/null || true

# Настройка sysctl для безопасности
cat >> /etc/sysctl.conf << 'EOF'

# Настройки безопасности сети (добавлено first-setup.sh)
net.ipv4.ip_forward = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.tcp_syncookies = 1
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
EOF

# Применение настроек sysctl
sysctl -p

# Настройка лимитов для защиты от DoS
cat >> /etc/security/limits.conf << 'EOF'

# Защита от DoS (добавлено first-setup.sh)
* soft nofile 65535
* hard nofile 65535
* soft nproc 4096
* hard nproc 8192
EOF

echo "Дополнительные настройки безопасности применены"

# ============================================================================
# 8. ФИНАЛЬНЫЕ НАСТРОЙКИ
# ============================================================================

echo "[8/8] Финальные настройки..."

# Установка таймзоны (опционально, можно раскомментировать и изменить)
# timedatectl set-timezone Europe/Moscow

# Настройка hostname (опционально)
# hostnamectl set-hostname your-server-name

# Очистка пакетов
apt-get autoremove -y
apt-get autoclean

echo "=========================================="
echo "Настройка завершена!"
echo "=========================================="
echo ""
echo "ВАЖНАЯ ИНФОРМАЦИЯ:"
echo "1. SSH порт изменен на: $SSH_PORT"
echo "2. Root доступ только по SSH ключу"
echo "3. Пользователь $NBC_USER создан с sudo правами"
echo "4. Firewall (UFW) включен и настроен"
echo "5. Fail2ban настроен для защиты от брутфорса"
echo "6. Автоматические обновления безопасности включены"
echo ""
echo "СЛЕДУЮЩИЕ ШАГИ:"
echo "1. Убедитесь, что вы можете подключиться по SSH на порт $SSH_PORT"
echo "2. Проверьте подключение пользователя $NBC_USER"
echo "3. При необходимости добавьте дополнительные правила firewall"
echo "4. Настройте мониторинг и логирование"
echo ""
echo "Для подключения используйте:"
echo "  ssh -p $SSH_PORT root@your-server-ip"
echo "  ssh -p $SSH_PORT $NBC_USER@your-server-ip"
echo ""

