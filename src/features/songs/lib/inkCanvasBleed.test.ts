import { describe, expect, it } from 'vitest';
import { canvasBleed } from './inkCanvasBleed';

describe('canvasBleed', () => {
  it('холст вылетает до краёв поверхности: шапка сверху, поля по бокам, пустота снизу', () => {
    const flow = { left: 16, top: 120, right: 1008, bottom: 500 };
    const surface = { left: 0, top: 0, right: 1024, bottom: 768 };
    expect(canvasBleed(flow, surface, 1)).toEqual({ left: 16, top: 120, right: 16, bottom: 268 });
  });

  it('экранные px переводит в px слоя: холст живёт в увеличенной сцене', () => {
    const flow = { left: 32, top: 200, right: 2016, bottom: 1000 };
    const surface = { left: 0, top: 0, right: 2048, bottom: 1600 };
    expect(canvasBleed(flow, surface, 2)).toEqual({ left: 16, top: 100, right: 16, bottom: 300 });
  });

  it('поток шире поверхности (зум) — вылета нет, отрицательным он не бывает', () => {
    const flow = { left: -300, top: -50, right: 1500, bottom: 2000 };
    const surface = { left: 0, top: 0, right: 1024, bottom: 768 };
    expect(canvasBleed(flow, surface, 1.5)).toEqual({ left: 0, top: 0, right: 0, bottom: 0 });
  });
});
