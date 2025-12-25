# Настройка переменных окружения

Для работы приложения необходимо создать файл `.env.local` в корне проекта и добавить в него следующие переменные:

```env
# API ключ Gemini (обязательно для работы ИИ)
# Получить можно здесь: https://aistudio.google.com/app/apikey
NEXT_PUBLIC_GEMINI_API_KEY=AIzaSyDPGLLWuIq3UFRr1Vaflb7usAXK8WkIIzA

# URL вашего Directus (опционально, по умолчанию http://localhost:8055)
# NEXT_PUBLIC_DIRECTUS_URL=http://localhost:8055

# Токен Telegram Бота (обязательно для серверной проверки данных Mini App)
TELEGRAM_BOT_TOKEN=ваш_токен_бота
```
