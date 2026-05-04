import { describe, expect, it } from 'vitest';
import {
  aggregateSessionStrategyTags,
  formatTagAggregateSentence,
  normalizeSessionStrategyTags,
} from '@/lib/sessionStrategyTags';

describe('sessionStrategyTags', () => {
  it('normalizes and dedupes', () => {
    expect(normalizeSessionStrategyTags(['conservative-loads', 'conservative-loads', 'bogus'])).toEqual([
      'conservative-loads',
    ]);
    expect(normalizeSessionStrategyTags(undefined)).toBeUndefined();
  });

  it('aggregates across sessions', () => {
    const m = aggregateSessionStrategyTags([
      { tags: ['time-crunched', 'recovery-priority'] },
      { tags: ['recovery-priority'] },
      {},
    ]);
    expect(m.get('recovery-priority')).toBe(2);
    expect(m.get('time-crunched')).toBe(1);
  });

  it('formats aggregate sentence', () => {
    const m = aggregateSessionStrategyTags([{ tags: ['pr-attempt'] }, { tags: ['pr-attempt'] }]);
    expect(formatTagAggregateSentence(m)).toContain('PR / top-set attempt');
    expect(formatTagAggregateSentence(new Map())).toBeNull();
  });
});
