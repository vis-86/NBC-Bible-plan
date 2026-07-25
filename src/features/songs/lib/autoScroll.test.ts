import { describe, expect, it } from 'vitest';
import { AUTOSCROLL_STEPS, DEFAULT_STEP_INDEX, clampStepIndex, pixelsPerSecond } from './autoScroll';

describe('autoScroll — ступени', () => {
  it('30 монотонно возрастающих ступеней, дефолт в диапазоне', () => {
    expect(AUTOSCROLL_STEPS).toHaveLength(30);
    for (let i = 1; i < AUTOSCROLL_STEPS.length; i++) {
      expect(AUTOSCROLL_STEPS[i]).toBeGreaterThan(AUTOSCROLL_STEPS[i - 1]);
    }
    expect(DEFAULT_STEP_INDEX).toBeGreaterThanOrEqual(0);
    expect(DEFAULT_STEP_INDEX).toBeLessThanOrEqual(AUTOSCROLL_STEPS.length - 1);
  });
});

describe('pixelsPerSecond', () => {
  it('каждая ступень даёт ожидаемый px/сек при известной высоте строки', () => {
    const lineHeightPx = 24; // 1.5 × 16px
    // rowsPerMin/60 * lineHeightPx
    expect(pixelsPerSecond(2, lineHeightPx)).toBeCloseTo(0.8, 5);
    expect(pixelsPerSecond(8, lineHeightPx)).toBeCloseTo(3.2, 5);
    expect(pixelsPerSecond(40, lineHeightPx)).toBeCloseTo(16, 5);
  });

  it('монотонно растёт по ступеням при фиксированной высоте строки', () => {
    const lineHeightPx = 30;
    const speeds = AUTOSCROLL_STEPS.map((rows) => pixelsPerSecond(rows, lineHeightPx));
    for (let i = 1; i < speeds.length; i++) {
      expect(speeds[i]).toBeGreaterThan(speeds[i - 1]);
    }
  });

  it('линейно масштабируется от высоты строки', () => {
    expect(pixelsPerSecond(12, 40)).toBeCloseTo(2 * pixelsPerSecond(12, 20), 5);
  });
});

describe('clampStepIndex', () => {
  it('зажимает границы', () => {
    expect(clampStepIndex(-1)).toBe(0);
    expect(clampStepIndex(30)).toBe(29);
    expect(clampStepIndex(0)).toBe(0);
    expect(clampStepIndex(29)).toBe(29);
    expect(clampStepIndex(10)).toBe(10);
  });

  it('нецелое округляет, NaN/Infinity → дефолт', () => {
    expect(clampStepIndex(2.4)).toBe(2);
    expect(clampStepIndex(2.6)).toBe(3);
    expect(clampStepIndex(Number.NaN)).toBe(DEFAULT_STEP_INDEX);
    expect(clampStepIndex(Number.POSITIVE_INFINITY)).toBe(DEFAULT_STEP_INDEX);
  });
});
