# Инструкция по интеграции ИИ через Directus и n8n

Мы перешли от прямого использования Gemini SDK к проксированию запросов через Directus Flow в n8n. Это позволяет использовать любые модели ИИ, доступные в n8n, и централизованно управлять логикой.

## 1. Настройка переменных окружения (.env)

Добавьте или обновите следующие переменные в вашем `.env.local`:

```env
# URL вашего Directus
NEXT_PUBLIC_DIRECTUS_URL="https://your-directus-url.com"

# ID потока (Flow) в Directus, который вы создадите ниже
NEXT_PUBLIC_DIRECTUS_AI_FLOW_ID="ai-service"
```

## 2. Настройка Directus Flow

1. Зайдите в **Settings** -> **Flows**.
2. Создайте новый Flow:
   - **Name**: AI Service Proxy
   - **Trigger**: Webhook
   - **Method**: POST
   - **Async**: **ВЫКЛЮЧЕНО** (Синхронный режим, чтобы дождаться ответа).
3. Добавьте операцию **Webhook / Fetch HTTP**:
   - **Key**: `n8n_request`
   - **Method**: POST
   - **URL**: URL вашего вебхука n8n (получите в шаге 3).
   - **Body**: `{{$trigger.body}}`
4. Добавьте операцию **Respond to Webhook**:
   - **Response Body**: **Другой (Custom)**.
   - **Custom Body**: `{{n8n_request.data}}` (это вернет чистый ответ от n8n).

## 3. Настройка n8n

1. Создайте новый Workflow.
2. Добавьте узел **Webhook**:
   - **HTTP Method**: POST
   - **Path**: `bible-chat` (или любой другой).
3. Добавьте узел **Switch** или **If**, чтобы разделять действия по полю `action`:
   - `chat`: общение с пастором.
   - `get_bible_text`: получение текста Писания.
   - `get_reference`: справочная информация.
4. Добавьте логику обработки (например, узел **AI Agent** или **HTTP Request** к OpenAI/Anthropic/Gemini).
5. В конце добавьте узел **Respond to Webhook**:
   - **Response Body**: JSON.
   - Убедитесь, что ответ содержит поле `result` или `answer` с текстом ответа.

Пример структуры ответа от n8n:
```json
{
  "result": "Текст ответа от ИИ..."
}
```

## Преимущества этой схемы:
- **Безопасность**: API ключи ИИ хранятся только в n8n.
- **Гибкость**: Вы можете поменять модель ИИ (на GPT-4, Claude или локальную Llama) в n8n, не меняя код приложения.
- **Логика**: Вы можете добавить в n8n проверку по базе знаний (RAG), поиск по вашим файлам или дополнительные API вызовы.
