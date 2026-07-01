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

/**
 * Требуется ли показывать поле «Код церкви» в форме регистрации.
 * Клиентский флаг (build-time инлайнинг), зеркалит серверный isChurchCodeRequired().
 * Default = true (обратная совместимость: билды без переменной показывают поле как раньше).
 * @returns false только если NEXT_PUBLIC_REGISTER_REQUIRE_CODE явно 'false' или '0'
 */
export function isRegisterCodeRequired(): boolean {
  const requireCode = process.env.NEXT_PUBLIC_REGISTER_REQUIRE_CODE;
  return !(requireCode === 'false' || requireCode === '0');
}

