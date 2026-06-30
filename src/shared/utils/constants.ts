/**
 * Проверяет, включена ли функциональность ИИ
 * @returns true если NEXT_PUBLIC_AI_ENABLE установлен в 'true' или '1'
 */
export function isAIEnabled(): boolean {
  const aiEnabled = process.env.NEXT_PUBLIC_AI_ENABLE;
  return aiEnabled === 'true' || aiEnabled === '1';
}

/**
 * Включён ли UI самостоятельной регистрации (CTA «Зарегистрироваться», шаги по коду церкви).
 * Клиентский флаг (build-time инлайнинг) — серверный секрет REGISTER_CHURCH_CODE наружу не светим.
 * @returns true если NEXT_PUBLIC_REGISTER_ENABLED установлен в 'true' или '1'
 */
export function isRegisterEnabled(): boolean {
  const registerEnabled = process.env.NEXT_PUBLIC_REGISTER_ENABLED;
  return registerEnabled === 'true' || registerEnabled === '1';
}

