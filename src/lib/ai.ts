import { PastorPersona, ChatMessage, BibleReference } from "../types";
import { getApiPath } from "./utils";

/**
 * Клиентский API для работы с ИИ через серверные endpoints
 * Все вызовы идут через /api/ai/* routes, которые выполняются на сервере
 */

/**
 * Получить текст Библии по ссылке
 * Использует отдельный API endpoint /api/bible/[book]/[chapter]
 */
export const getBibleText = async (reference: BibleReference): Promise<string> => {
  try {
    // Кодируем название книги для URL
    const encodedBook = encodeURIComponent(reference.book);
    const url = getApiPath(`/api/bible/${encodedBook}/${reference.chapter}`);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include'
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.text || 'Не удалось получить текст Библии.';
  } catch (error) {
    console.error('[Bible] getBibleText error:', error);
    return error instanceof Error ? error.message : 'Произошла ошибка при получении текста Библии. Попробуйте позже.';
  }
};

/**
 * Чат с пастором
 * @throws {Error} При ошибке API выбрасывает ошибку с сообщением
 */
export const chatWithPastor = async (
  currentMessage: string, 
  history: ChatMessage[], 
  persona: PastorPersona
): Promise<string> => {
  const response = await fetch(getApiPath('/api/ai/chat'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      message: currentMessage,
      history: history.map(h => ({ role: h.role, text: h.text })),
      persona: {
        id: persona.id,
        name: persona.name,
        systemInstruction: persona.systemInstruction
      }
    })
  });

  const data = await response.json().catch(() => ({ error: 'Не удалось обработать ответ сервера' }));

  if (!response.ok || data.error) {
    const errorMessage = data.error || `HTTP error: ${response.statusText}`;
    console.error('[AI] chatWithPastor error:', errorMessage);
    throw new Error(errorMessage);
  }

  return data.result || 'Не удалось получить ответ от наставника.';
};

/**
 * Получить информацию о библейской ссылке
 */
export const getReferenceInfo = async (query: string, context?: string): Promise<string> => {
  try {
    const response = await fetch(getApiPath('/api/ai/reference'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ query, context })
    });

    const data = await response.json().catch(() => ({ error: 'Не удалось обработать ответ сервера' }));

    if (!response.ok || data.error) {
      const errorMessage = data.error || `HTTP error: ${response.statusText}`;
      console.error('[AI] getReferenceInfo error:', errorMessage);
      // Возвращаем понятное сообщение об ошибке вместо выбрасывания исключения
      return `Не удалось получить информацию: ${errorMessage}`;
    }

    return data.result || 'Не удалось получить информацию.';
  } catch (error) {
    console.error('[AI] getReferenceInfo error:', error);
    return error instanceof Error 
      ? `Произошла ошибка: ${error.message}` 
      : 'Произошла ошибка при получении информации. Попробуйте позже.';
  }
};

