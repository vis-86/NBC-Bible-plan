// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { SearchBar } from './SearchBar';

describe('SearchBar', () => {
  it('крестик очищает запрос и возвращает фокус в поле', () => {
    const { container } = render(<SearchBar onSearch={vi.fn()} initialValue="алли" />);
    const input = container.querySelector('[data-song-search-input]') as HTMLInputElement;
    input.blur();

    fireEvent.click(container.querySelector('[data-song-search-clear]') as HTMLElement);

    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('пустой запрос — крестика нет', () => {
    const { container } = render(<SearchBar onSearch={vi.fn()} />);
    expect(container.querySelector('[data-song-search-clear]')).toBeNull();
  });
});
