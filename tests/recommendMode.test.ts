import { describe, expect, it } from 'vitest';
import { recommendMode } from '../src/lib/recommendMode';

describe('recommendMode', () => {
  it('matches legacy base rules when HRV is omitted', () => {
    expect(recommendMode(8, 2, 4)).toEqual({
      mode: 'standard',
      reason: 'Green across the board — hit it.',
    });
    expect(recommendMode(4, 2, 2)).toEqual({
      mode: 'light',
      reason: 'Drop to a light day; keep the groove without digging the hole deeper.',
    });
    expect(recommendMode(8, 2, 1)).toEqual({
      mode: 'skip',
      reason: 'Energy is in the floor — take the recovery day.',
    });
  });

  it('does not upgrade skip when HRV is strong', () => {
    expect(
      recommendMode(8, 2, 1, { hrvRmssd: 80, hrvSkipped: false }).mode,
    ).toBe('skip');
  });

  it('downgrades standard to light when HRV score is low', () => {
    const rec = recommendMode(8, 2, 4, { hrvRmssd: 28, hrvSkipped: false });
    expect(rec.mode).toBe('light');
    expect(rec.reason).toContain('HRV');
  });

  it('ignores HRV when skipped or missing RMSSD', () => {
    expect(recommendMode(8, 2, 4, { hrvRmssd: 28, hrvSkipped: true }).mode).toBe(
      'standard',
    );
    expect(recommendMode(8, 2, 4, { hrvSkipped: false }).mode).toBe('standard');
  });

  it('downgrades light to skip when sleep is short and HRV is crushed', () => {
    const rec = recommendMode(6, 2, 2, { hrvRmssd: 35, hrvSkipped: false });
    expect(rec.mode).toBe('light');
    const rec2 = recommendMode(6, 2, 2, { hrvRmssd: 15, hrvSkipped: false });
    expect(rec2.mode).toBe('skip');
    expect(rec2.reason).toContain('HRV');
  });
});
