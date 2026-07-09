/**
 * Порт src/app/api/ai/[...path]/* (1:1 по поведению).
 * Диспетчер chat|bible-text|reference → Directus Flow, гейт NEXT_PUBLIC_AI_ENABLE.
 */
import { Hono } from 'hono';
import { proxyToDirectus } from '../../../src/lib/directus-proxy';
import { logger } from '../logger';

const AI_FLOW_ID = process.env.DIRECTUS_AI_FLOW_ID || 'ai-service';

const PATH_TO_ACTION: Record<string, string> = {
  chat: 'chat',
  'bible-text': 'get_bible_text',
  reference: 'get_reference',
};

function validateAndBuildPayload(
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any
): { payload: unknown; error?: string } {
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
            systemInstruction: persona.systemInstruction,
          },
        },
      };
    }

    case 'bible-text': {
      const { reference } = body;
      if (!reference || !reference.book || !reference.chapter) {
        return { payload: null, error: 'Missing required fields: reference with book and chapter' };
      }
      return { payload: { action: 'get_bible_text', reference } };
    }

    case 'reference': {
      const { query, context } = body;
      if (!query) {
        return { payload: null, error: 'Missing required field: query' };
      }
      return { payload: { action: 'get_reference', query, context: context || undefined } };
    }

    default:
      return { payload: null, error: `Unknown AI endpoint: ${path}` };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractResult(obj: any): string | null {
  if (typeof obj.output === 'string') return obj.output;
  if (typeof obj.data === 'string') return obj.data;
  if (typeof obj.result === 'string') return obj.result;
  if (typeof obj.answer === 'string') return obj.answer;
  if (typeof obj.text === 'string') return obj.text;

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
}

export const aiRoutes = new Hono();

/**
 * POST /ai/chat|bible-text|reference
 */
aiRoutes.post('/:path', async (c) => {
  const aiEnabled = process.env.NEXT_PUBLIC_AI_ENABLE === 'true' || process.env.NEXT_PUBLIC_AI_ENABLE === '1';
  if (!aiEnabled) {
    return c.json({ error: 'Функциональность ИИ отключена' }, 403);
  }

  try {
    const endpoint = c.req.param('path');

    if (!endpoint || !PATH_TO_ACTION[endpoint]) {
      return c.json({ error: `Unknown endpoint: ${endpoint}. Available: ${Object.keys(PATH_TO_ACTION).join(', ')}` }, 404);
    }

    const body = await c.req.json();
    const { payload, error } = validateAndBuildPayload(endpoint, body);

    if (error) {
      return c.json({ error }, 400);
    }

    const proxyRequest = new Request(c.req.raw.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await proxyToDirectus(`flows/trigger/${AI_FLOW_ID}`, proxyRequest, true);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[AI ${endpoint}] Flow error: ${response.status} ${response.statusText}`, errorText);
      return c.json({ error: `AI service error: ${response.statusText}` }, response.status as 400 | 500);
    }

    const data = await response.json();

    if (data.error) {
      logger.error(`[AI ${endpoint}] Error in response:`, data.error);
      return c.json({ error: data.error }, 500);
    }

    const resultText = extractResult(data);

    if (!resultText) {
      logger.error(`[AI ${endpoint}] Unknown response format:`, JSON.stringify(data));
      return c.json({ error: 'Неизвестный формат ответа от сервиса ИИ' }, 500);
    }

    return c.json({ result: resultText });
  } catch (error) {
    logger.error('[AI] Error:', error);
    return c.json({ error: 'Произошла ошибка при связи с сервером ИИ. Попробуйте позже.' }, 500);
  }
});
