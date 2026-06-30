import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Глобально node (API/логика). Компонентным тестам jsdom задаётся
    // по-файлово докблоком `// @vitest-environment jsdom`, чтобы не переводить
    // весь прогон на jsdom.
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/app/api/**', 'src/lib/**'],
    },
  },
  // JSX-трансформ для .tsx-тестов обеспечивает oxc (vitest 4) с автоматическим
  // рантаймом React 19 из коробки — отдельный плагин не нужен.
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
