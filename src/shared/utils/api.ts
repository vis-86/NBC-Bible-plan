/**
 * Получает basePath из переменной окружения
 */
export function getBasePath(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_BASE_PATH || '';
  }
  return process.env.NEXT_PUBLIC_BASE_PATH || '';
}

/**
 * Формирует путь к API с учетом basePath
 * @param apiPath - путь к API (например, '/api/plan' или 'api/plan')
 * @returns полный путь с учетом basePath (например, '/app/api/plan')
 */
export function getApiPath(apiPath: string): string {
  const basePath = getBasePath();
  const cleanApiPath = apiPath.startsWith('/') ? apiPath.slice(1) : apiPath;
  return basePath ? `${basePath}/${cleanApiPath}` : `/${cleanApiPath}`;
}

