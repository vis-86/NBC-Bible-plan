/**
 * Проверяет, включена ли функциональность ИИ
 * @returns true если NEXT_PUBLIC_AI_ENABLE установлен в 'true' или '1'
 */
export function isAIEnabled(): boolean {
  const aiEnabled = process.env.NEXT_PUBLIC_AI_ENABLE;
  return aiEnabled === 'true' || aiEnabled === '1';
}

