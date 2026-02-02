# Flow для ежедневной рассылки плана чтения в Telegram

Этот документ описывает настройку Flow в Directus для автоматической ежедневной рассылки плана чтения всем пользователям Telegram.

## Предварительные требования

1. Установлено расширение [telegram-send-message-operation](https://github.com/qadez11/telegram-send-message-operation)
2. Настроен Telegram бот и получен токен
3. В базе данных есть таблица `telegram_user_mapping` с маппингом пользователей
4. В базе данных есть таблица `plan` с планом чтения

## Структура Flow

Flow состоит из следующих операций:

1. **Триггер** - Schedule (ежедневно в определенное время)
2. **Операция 1** - Run Script (получение плана и форматирование сообщения)
3. **Операция 2** - Read Data (получение всех пользователей Telegram)
4. **Операция 3** - Run Script (подготовка данных для отправки)
5. **Операция 4** - Webhook / Request URL (отправка сообщений через Telegram Bot API)

**Примечание**: Согласно [официальной документации Directus](https://directus.io/docs/guides/automate/operations), операция Run Script выполняется в изолированном sandbox без доступа к файловой системе и сетевых запросов. Поэтому для отправки сообщений в Telegram API используется операция **Webhook / Request URL**.

## Пошаговая настройка

### Шаг 1: Создание Flow

1. Перейдите в **Settings → Flows**
2. Нажмите **Create Flow**
3. Название: `Ежедневная рассылка плана чтения`
4. Описание: `Отправляет план чтения на сегодня всем пользователям Telegram`

### Шаг 2: Настройка триггера

1. Добавьте операцию **Schedule**
2. Настройки:
   - **Cron**: `0 8 * * *` (каждый день в 8:00 утра)
   - Или используйте интерфейс для выбора времени

### Шаг 4: Операция - Получение плана на сегодня

Добавьте операцию **Read Data** для получения плана:

1. **Collection**: `plan`
2. **Query**: Вставьте следующий JSON в поле Query (замените `'Вычисление дня года'` на имя вашей операции из шага 3):
   ```json
   {
     "filter": {
       "numbers": {
         "_eq": "{{ $('Вычисление дня года').dayOfYear }}"
       }
     },
     "sort": ["item"],
     "limit": -1
   }
   ```
   
   **Важно**: Замените `'Вычисление дня года'` на реальное имя вашей операции из шага 3. Если имя содержит пробелы или специальные символы, используйте точное имя операции.

### Шаг 3a: Операция - Вычисление дня года

Добавьте операцию **Run Script** для вычисления дня года:

```javascript
module.exports = async function(data) {
  // Вычисляем день года (1-365/366)
  // День 1 = 1 января, день 2 = 2 января и т.д.
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  // Форматируем дату в DD.MM.YYYY
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const formattedDate = `${day}.${month}.${year}`;
  
  return {
    dayOfYear,
    formattedDate
  };
};
```

**Альтернатива**: Если вы хотите использовать один скрипт, можно использовать операцию **Read Data** с динамическим фильтром через переменные окружения или использовать Transform Payload для подготовки Query.

### Шаг 3b: Операция - Форматирование сообщения

Добавьте операцию **Run Script** для форматирования сообщения на основе данных из Read Data:

```javascript
module.exports = async function(data) {
  // Получаем данные из предыдущих операций
  const dayData = data["Вычисление дня года"] || {};
  const dayOfYear = dayData.dayOfYear;
  const formattedDate = dayData.formattedDate;
  
  // Получаем план из операции Read Data
  const planItems = data["Получение плана"].items || [];
  
  // Если план на сегодня не найден, формируем сообщение об ошибке
  let message;
  if (!planItems || planItems.length === 0) {
    message = `☀️ Доброе утро!
📆 Сегодня ${formattedDate}, день №${dayOfYear}
📖 План чтения на сегодня не найден`;
  } else {
    // Группируем главы по книгам
    // В БД каждая глава хранится отдельно: "Неем. 11", "Неем. 12", "Неем. 13"
    // Нужно сгруппировать в "Неем. 11-13"
    const groupedByBook = {};
    
    planItems.forEach(item => {
      const readText = item.read || '';
      // Парсим "Книга. Глава" (например, "Неем. 11" или "Пс. 125")
      const match = readText.match(/^(.+?)\s+(\d+)$/);
      
      if (match) {
        const book = match[1].trim();
        const chapter = parseInt(match[2]);
        
        if (!groupedByBook[book]) {
          groupedByBook[book] = [];
        }
        groupedByBook[book].push(chapter);
      } else {
        // Если формат не распознан, добавляем как есть
        if (!groupedByBook[readText]) {
          groupedByBook[readText] = [];
        }
      }
    });
    
    // Форматируем в строку типа "Неем. 11-13, Пс. 125"
    const readingParts = [];
    
    Object.keys(groupedByBook).forEach(book => {
      const chapters = groupedByBook[book].sort((a, b) => a - b);
      
      if (chapters.length === 0) {
        // Случай без глав (только название книги)
        readingParts.push(book);
      } else if (chapters.length === 1) {
        // Одна глава
        readingParts.push(`${book} ${chapters[0]}`);
      } else {
        // Группируем последовательные главы в диапазоны
        // Например: [11, 12, 13] -> "11-13"
        //          [11, 12, 15, 16] -> "11-12, 15-16"
        const ranges = [];
        let start = chapters[0];
        let end = chapters[0];
        
        for (let i = 1; i < chapters.length; i++) {
          if (chapters[i] === end + 1) {
            // Продолжаем диапазон
            end = chapters[i];
          } else {
            // Завершаем текущий диапазон и начинаем новый
            if (start === end) {
              ranges.push(`${start}`);
            } else {
              ranges.push(`${start}-${end}`);
            }
            start = chapters[i];
            end = chapters[i];
          }
        }
        
        // Добавляем последний диапазон
        if (start === end) {
          ranges.push(`${start}`);
        } else {
          ranges.push(`${start}-${end}`);
        }
        
        readingParts.push(`${book} ${ranges.join(', ')}`);
      }
    });
    
    const readingText = readingParts.join(', ');
    
    // Формируем сообщение
    message = `☀️ Доброе утро!
📆 Сегодня ${formattedDate}, день №${dayOfYear}
📖 Читаем ${readingText}`;
  }
  
  return {
    dayOfYear,
    formattedDate,
    message
  };
};
```

**Примечание**: Согласно [официальной документации Directus](https://directus.io/docs/guides/automate/operations), операция Run Script выполняется в изолированном sandbox без доступа к сетевых запросов, поэтому мы не можем отправлять сообщения напрямую из скрипта. Для отправки используем операцию Webhook / Request URL.

### Шаг 4: Операция - Получение пользователей Telegram

Добавьте операцию **Read Data**:

1. **Collection**: `telegram_user_mapping`
2. **Query**: Вставьте следующий JSON в поле Query (замените фильтр по умолчанию):
   ```json
   {
     "limit": -1,
     "fields": ["telegram_user_id"]
   }
   ```
   
   **Важно**: 
   - Удалите фильтр по умолчанию `{"filter": {"status": {"_eq": "active"}}}` - в таблице `telegram_user_mapping` нет поля `status`, и этот фильтр вызовет ошибку
   - `limit: -1` означает получить все записи
   - `fields: ["telegram_user_id"]` указывает, что нужно получить только поле `telegram_user_id`

### Шаг 7: Операция - Подготовка данных для отправки

Добавьте операцию **Run Script** для подготовки массива запросов:

```javascript
module.exports = async function(data) {
  // Получаем сообщение из предыдущей операции
  const message = data["Получение плана на сегодня"].message;
  
  // Получаем пользователей из операции Read Data
  const users = data["Получение пользователей"].items || [];
  
  // Получаем токен бота из переменных окружения
  // Примечание: в Run Script нет доступа к env напрямую,
  // поэтому токен нужно передать через переменную окружения Directus
  // или использовать в Webhook операции
  
  // Подготавливаем массив запросов для отправки
  const requests = users
    .filter(user => user.telegram_user_id)
    .map(user => ({
      chat_id: user.telegram_user_id,
      text: message
    }));
  
  return {
    message: message,
    requests: requests,
    total: requests.length
  };
};
```

### Шаг 8: Операция - Отправка сообщений через telegram-send-message-operation

Для отправки сообщений используем расширение `telegram-send-message-operation`. Так как нужно отправить сообщение каждому пользователю отдельно, создадим два flow:

#### Основной Flow: "Ежедневная рассылка плана чтения"

После шага 7 (Подготовка данных) добавьте операцию **Trigger Flow**:

1. **Flow**: UUID второго flow (см. ниже)
2. **Payload**: 
   ```json
   {
     "users": "{{ $('Получение пользователей').items }}",
     "message": "{{ $('Форматирование сообщения').message }}"
   }
   ```
3. **Iteration Mode**: `Parallel` (для параллельной отправки) или `Serial` (для последовательной)

#### Второй Flow: "Отправка одного сообщения Telegram"

Создайте новый flow:

1. **Триггер**: **Another Flow**
2. **Операция**: **Telegram Send Message** (расширение telegram-send-message-operation)
   - **Chat ID**: `{{ $trigger.users.telegram_user_id }}` или `{{ $trigger.users[0].telegram_user_id }}` (в зависимости от структуры данных)
   - **Message**: `{{ $trigger.message }}`
   - **Disable Notification**: `false` (или `true`, если не хотите звук)

**Альтернативный вариант**: Если расширение не поддерживает итерацию, используйте **Run Script** для подготовки данных и **Trigger Flow** с массивом:

**В шаге 7 измените скрипт**:
```javascript
module.exports = async function(data) {
  const message = data["Форматирование сообщения"].message;
  const users = data["Получение пользователей"].items || [];
  
  // Подготавливаем массив для Trigger Flow
  const payload = users
    .filter(user => user.telegram_user_id)
    .map(user => ({
      chat_id: user.telegram_user_id,
      message: message
    }));
  
  return {
    payload: payload,
    total: payload.length
  };
};
```

**В Trigger Flow используйте**:
- **Payload**: `{{ $("Подготовка данных").payload }}`
- **Iteration Mode**: `Parallel` или `Serial`

**Во втором flow (Another Flow trigger)**:
- **Chat ID**: `{{ $trigger.chat_id }}`
- **Message**: `{{ $trigger.message }}`

## Настройка расширения telegram-send-message-operation

### Установка расширения

1. Установите расширение через npm:
   ```bash
   npm install directus-extension-telegram-send-message-operation
   ```
   Или следуйте инструкциям из [репозитория расширения](https://github.com/qadez11/telegram-send-message-operation)

2. Убедитесь, что в файле `.env` указан путь к расширениям:
   ```
   EXTENSIONS_PATH=./extensions
   ```

3. Перезапустите Directus

### Настройка токена бота

Расширение `telegram-send-message-operation` может использовать токен бота из:
- Переменных окружения Directus (Settings → Environment Variables)
- Настроек расширения (если поддерживается)
- Параметров операции (если поддерживается)

**Рекомендуемый способ**: Настройте переменную окружения:

1. Перейдите в **Settings → Environment Variables** в Directus
2. Добавьте новую переменную:
   - **Key**: `TELEGRAM_BOT_TOKEN`
   - **Value**: Ваш токен Telegram бота (получите у @BotFather)
   - **Type**: `string`
3. Сохраните переменную

**Важно**: Без токена бота расширение не сможет отправлять сообщения.

## Тестирование

1. Создайте тестовый Flow с триггером **Manual**
2. Запустите его вручную
3. Проверьте, что сообщения отправляются корректно
4. После проверки измените триггер на **Schedule**

## Примечания

- Убедитесь, что бот Telegram имеет доступ к пользователям
- Проверьте, что токен бота правильно настроен в расширении
- Если план на день отсутствует, скрипт вернет сообщение об ошибке
- Формат даты: DD.MM.YYYY (например, 30.12.2025)
- Номер дня вычисляется как день года (1-365/366)
- День 1 = 1 января текущего года
- Каждый новый год план начинается сначала (день 1)

## Устранение неполадок

### Проблема: Сообщения не отправляются

1. **Проверьте логи Flow**:
   - Перейдите в **Settings → Flows**
   - Откройте ваш flow
   - Проверьте вкладку **Executions** для просмотра ошибок

2. **Проверьте настройки расширения**:
   - Убедитесь, что расширение telegram-send-message-operation установлено
   - Проверьте, что токен бота правильно настроен
   - Убедитесь, что бот имеет права на отправку сообщений

3. **Проверьте формат Chat ID**:
   - Chat ID должен быть числом (telegram_user_id)
   - Убедитесь, что в таблице `telegram_user_mapping` есть записи
   - Проверьте, что пользователи не заблокировали бота

### Проблема: Неправильный формат плана чтения

1. **Проверьте данные в таблице plan**:
   - Убедитесь, что для дня есть записи
   - Проверьте формат поля `read` (должно быть "Книга. Глава", например "Неем. 11")
   - Убедитесь, что поле `numbers` соответствует дню года

2. **Проверьте логику группировки**:
   - Скрипт группирует главы одной книги в диапазоны
   - Если главы не группируются, проверьте формат данных

### Проблема: Flow не запускается по расписанию

1. **Проверьте настройки триггера Schedule**:
   - Убедитесь, что cron выражение правильное
   - Проверьте часовой пояс сервера
   - Убедитесь, что flow активен (enabled)

2. **Проверьте права доступа**:
   - Убедитесь, что у flow есть права на чтение таблиц `plan` и `telegram_user_mapping`
   - Проверьте права на выполнение операций

## Пример полной структуры Flow

### Вариант 1: С использованием telegram-send-message-operation (рекомендуется)

```
Flow 1: "Ежедневная рассылка плана чтения"
├── Trigger: Schedule (0 8 * * *) - каждый день в 8:00
├── Operation 1: Run Script - "Вычисление дня года"
│   └── Вычисляет день года и форматирует дату
├── Operation 2: Read Data - "Получение плана"
│   └── Collection: plan
│   └── Filter: numbers = день года
├── Operation 3: Run Script - "Форматирование сообщения"
│   └── Форматирует сообщение с планом чтения
├── Operation 4: Read Data - "Получение пользователей"
│   └── Collection: telegram_user_mapping
│   └── Fields: telegram_user_id
├── Operation 5: Run Script - "Подготовка данных"
│   └── Подготавливает массив для отправки
└── Operation 6: Trigger Flow - "Отправка сообщений"
    └── Flow: UUID второго flow
    └── Iteration Mode: Parallel
    └── Payload: {{ $("Подготовка данных").payload }}

Flow 2: "Отправка одного сообщения Telegram"
├── Trigger: Another Flow
└── Operation: Telegram Send Message (telegram-send-message-operation)
    ├── Chat ID: {{ $trigger.chat_id }}
    └── Message: {{ $trigger.message }}
```

**Преимущества этого подхода:**
- Использует официальное расширение для Telegram
- Не требует настройки Webhook / Request URL
- Проще в настройке и поддержке
- Автоматическая обработка ошибок расширением

### Вариант 2: Упрощенный (если расширение поддерживает массив)

```
Flow: "Ежедневная рассылка плана чтения"
├── Trigger: Schedule (0 8 * * *) - каждый день в 8:00
├── Operation 1: Run Script - "Получение плана на сегодня"
├── Operation 2: Read Data - "Получение пользователей"
└── Operation 3: Telegram Send Message (расширение)
    └── Если расширение поддерживает массив пользователей
```

**Примечание**: Согласно [официальной документации Directus](https://directus.io/docs/guides/automate/operations), операция Run Script не имеет доступа к сетевых запросов, поэтому для отправки сообщений необходимо использовать либо операцию **Webhook / Request URL**, либо расширение `telegram-send-message-operation`, либо **Trigger Flow** для итерации по пользователям.

## Альтернативный вариант: Использование операции Read Data

Если вы хотите разделить flow на несколько операций (например, для использования расширения telegram-send-message-operation), можно использовать операцию **Read Data** для получения пользователей.

### Шаг 4: Операция - Получение пользователей Telegram

Добавьте операцию **Read Data**:

1. **Collection**: `telegram_user_mapping`
2. **Query**: Вставьте следующий JSON в поле Query (замените фильтр по умолчанию):
   ```json
   {
     "limit": -1,
     "fields": ["telegram_user_id"]
   }
   ```
   
   **Важно**: 
   - Удалите фильтр по умолчанию `{"filter": {"status": {"_eq": "active"}}}` - в таблице `telegram_user_mapping` нет поля `status`, и этот фильтр вызовет ошибку
   - `limit: -1` означает получить все записи
   - `fields: ["telegram_user_id"]` указывает, что нужно получить только поле `telegram_user_id`

**Полный пример Query для копирования:**
```json
{
  "limit": -1,
  "fields": ["telegram_user_id"]
}
```

После этого вы можете использовать результат этой операции в других операциях flow (например, в расширении telegram-send-message-operation).

## Дополнительные возможности

### Настройка времени рассылки

Измените cron выражение в триггере Schedule:
- `0 8 * * *` - каждый день в 8:00
- `0 7 * * 1-5` - в будние дни в 7:00
- `0 9 * * 0` - только в воскресенье в 9:00

### Добавление фильтрации пользователей

Если нужно отправлять не всем пользователям, добавьте фильтр в Query операции Read Data:
```json
{
  "limit": -1,
  "fields": ["telegram_user_id"],
  "filter": {
    "telegram_user_id": {
      "_neq": null
    }
  }
}
```

### Обработка ошибок

Добавьте операцию Condition после отправки сообщения для обработки ошибок:
- Логирование неудачных отправок
- Повторная попытка отправки
- Уведомление администратора об ошибках

