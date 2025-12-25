import { directus, directusUrl } from "./directus";
import { readItems } from "@directus/sdk";
import { PastorPersona, ChatMessage, BibleReference } from "../types";

// ID потока Directus, который будет проксировать запросы в n8n
const AI_FLOW_ID = process.env.NEXT_PUBLIC_DIRECTUS_AI_FLOW_ID || "ai-service";

/**
 * Универсальная функция для вызова ИИ через Directus Flow -> n8n
 */
async function callAiFlow(action: string, payload: any): Promise<string> {
  try {
    // Используем сконфигурированный directusUrl (который включает /api/directus на клиенте)
    const url = `${directusUrl}/flows/trigger/${AI_FLOW_ID}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action,
        ...payload
      })
    });

    if (!response.ok) {
      throw new Error(`Flow error: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Ожидаем, что n8n вернет объект с одним из этих полей
    // Добавляем data.data, так как ваш n8n присылает ответ именно в нем
    return data.data || data.result || data.answer || data.text || JSON.stringify(data);
  } catch (error) {
    console.error(`AI Flow error [${action}]:`, error);
    return "Произошла ошибка при связи с сервером ИИ. Попробуйте позже.";
  }
}

export const getBibleText = async (reference: BibleReference): Promise<string> => {
  return callAiFlow("get_bible_text", { reference });
};

export const chatWithPastor = async (
  currentMessage: string, 
  history: ChatMessage[], 
  persona: PastorPersona
): Promise<string> => {
  return callAiFlow("chat", {
    message: currentMessage,
    history: history.map(h => ({ role: h.role, text: h.text })),
    persona: {
      id: persona.id,
      name: persona.name,
      systemInstruction: persona.systemInstruction
    }
  });
};

export const getReferenceInfo = async (query: string, context?: string): Promise<string> => {
  return callAiFlow("get_reference", { query, context });
};
