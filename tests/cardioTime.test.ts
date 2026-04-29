import { describe, expect, it } from 'vitest';
import { cardioStartedAtFromEnd, resolveCardioTimestamps } from '@/lib/cardioTime';

describe('cardioStartedAtFromEnd', () => {
  it('subtracts duration minutes from end', () => {
    const end = '2026-04-29T14:00:00.000Z';
    expect(cardioStartedAtFromEnd(end, 30)).toBe('2026-04-29T13:30:00.000Z');
  });
});

describe('resolveCardioTimestamps', () => {
  it('uses timer start when valid and before end', () => {
    const end = '2026-04-29T14:00:00.000Z';
    const start = '2026-04-29T13:28:00.000Z';
    expect(resolveCardioTimestamps(end, 30, start)).toEqual({
      startedAt: start,
      endedAt: end,
    });
  });

  it('ignores timer start after end', () => {
    const end = '2026-04-29T14:00:00.000Z';
    const bogusStart = '2026-04-29T15:00:00.000Z';
    expect(resolveCardioTimestamps(end, 30, bogusStart)).toEqual({
      startedAt: '2026-04-29T13:30:00.000Z',
      endedAt: end,
    });
  });

  it('derives start from duration when timer omitted', () => {
    const end = '2026-04-29T14:05:00.000Z';
    expect(resolveCardioTimestamps(end, 5, undefined)).toEqual({
      startedAt: '2026-04-29T14:00:00.000Z',
      endedAt: end,
    });
  });
});
