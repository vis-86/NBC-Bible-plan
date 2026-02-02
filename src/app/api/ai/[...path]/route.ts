import { NextRequest, NextResponse } from 'next/server';
import { proxyToDirectus } from '@/lib/directus-proxy';

const AI_FLOW_ID = process.env.DIRECTUS_AI_FLOW_ID || 'ai-service';

/**
 * Маппинг путей к action для Directus Flow
 */
const PATH_TO_ACTION: Record<string, string> = {
  'chat': 'chat',
  'bible-text': 'get_bible_text',
  'reference': 'get_reference',
};

/**
 * Валидация и формирование payload для разных actions
 */
function validateAndBuildPayload(path: string, body: any): { payload: any; error?: string } {
  switch (path) {
    case 'chat': {
      const { message, history, persona } = body;
      if (!message || !persona) {
        return { payload: null, error: 'Missing required fields: message, persona' };
      }
      return {
        payload: {
          action: 'chat',
          message,
          history: history || [],
          persona: {
            id: persona.id,
            name: persona.name,
            systemInstruction: persona.systemInstruction
          }
        }
      };
    }
    
    case 'bible-text': {
      const { reference } = body;
      if (!reference || !reference.book || !reference.chapter) {
        return { payload: null, error: 'Missing required fields: reference with book and chapter' };
      }
      return {
        payload: {
          action: 'get_bible_text',
          reference
        }
      };
    }
    
    case 'reference': {
      const { query, context } = body;
      if (!query) {
        return { payload: null, error: 'Missing required field: query' };
      }
      return {
        payload: {
          action: 'get_reference',
          query,
          context: context || undefined
        }
      };
    }
    
    default:
      return { payload: null, error: `Unknown AI endpoint: ${path}` };
  }
}

/**
 * Универсальный handler для всех AI endpoints
 * POST /api/ai/chat - чат с пастором
 * POST /api/ai/bible-text - получение текста Библии
 * POST /api/ai/reference - получение информации о ссылке
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Проверяем, включена ли функциональность ИИ
  const aiEnabled = process.env.NEXT_PUBLIC_AI_ENABLE === 'true' || process.env.NEXT_PUBLIC_AI_ENABLE === '1';
  if (!aiEnabled) {
    return NextResponse.json(
      { error: 'Функциональность ИИ отключена' },
      { status: 403 }
    );
  }

  try {
    const { path } = await params;
    const endpoint = path[0]; // Первый элемент пути (chat, bible-text, reference)
    
    if (!endpoint || !PATH_TO_ACTION[endpoint]) {
      return NextResponse.json(
        { error: `Unknown endpoint: ${endpoint}. Available: ${Object.keys(PATH_TO_ACTION).join(', ')}` },
        { status: 404 }
      );
    }
    
    const body = await request.json();
    const { payload, error } = validateAndBuildPayload(endpoint, body);
    
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    
    // Создаем запрос для прокси с телом запроса
    const proxyRequest = new NextRequest(request.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });
    
    // Используем общую функцию прокси с admin token
    const response = await proxyToDirectus(
      `flows/trigger/${AI_FLOW_ID}`,
      proxyRequest,
      true // useAdminToken = true
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[AI ${endpoint}] Flow error: ${response.status} ${response.statusText}`, errorText);
      return NextResponse.json(
        { error: `AI service error: ${response.statusText}` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    // Проверяем наличие ошибки в ответе
    if (data.error) {
      console.error(`[AI ${endpoint}] Error in response:`, data.error);
      return NextResponse.json(
        { error: data.error },
        { status: 500 }
      );
    }
    
    // Функция для извлечения текста из различных форматов ответа
    const extractResult = (obj: any): string | null => {
      // Прямые поля (строки)
      if (typeof obj.output === 'string') return obj.output;
      if (typeof obj.data === 'string') return obj.data;
      if (typeof obj.result === 'string') return obj.result;
      if (typeof obj.answer === 'string') return obj.answer;
      if (typeof obj.text === 'string') return obj.text;
      
      // Вложенные структуры: result.output, data.output и т.д.
      if (obj.result && typeof obj.result === 'object') {
        if (typeof obj.result.output === 'string') return obj.result.output;
        if (typeof obj.result.data === 'string') return obj.result.data;
        if (typeof obj.result.text === 'string') return obj.result.text;
      }
      
      if (obj.data && typeof obj.data === 'object') {
        if (typeof obj.data.output === 'string') return obj.data.output;
        if (typeof obj.data.result === 'string') return obj.data.result;
        if (typeof obj.data.text === 'string') return obj.data.text;
      }
      
      return null;
    };
    
    const resultText = extractResult(data);
    
    if (!resultText) {
      console.error(`[AI ${endpoint}] Unknown response format:`, JSON.stringify(data));
      return NextResponse.json(
        { error: 'Неизвестный формат ответа от сервиса ИИ' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ result: resultText });
  } catch (error) {
    console.error(`[AI] Error:`, error);
    return NextResponse.json(
      { error: 'Произошла ошибка при связи с сервером ИИ. Попробуйте позже.' },
      { status: 500 }
    );
  }
}

