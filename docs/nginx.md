ИНФОРМАЦИЯ:
1. Nginx установлен и запущен
2. Работает от пользователя: nginx
3. Конфигурация: /etc/nginx/nginx.conf
4. Сайты: /etc/nginx/sites-available
5. Логи: /var/log/nginx/
6. Корневая директория: /var/www

ПРОВЕРКА:
  curl http://localhost
  systemctl status nginx
  nginx -t
м
СОЗДАНИЕ НОВОГО САЙТА:
  1. Создайте конфиг: /etc/nginx/sites-available/your-site
  2. Создайте симлинк: ln -s /etc/nginx/sites-available/your-site /etc/nginx/sites-enabled/
  3. Проверьте: nginx -t
  4. Перезагрузите: systemctl reload nginx