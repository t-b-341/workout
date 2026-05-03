import { describe, expect, it } from 'vitest';
import { normalizeGoals } from '../src/lib/goals';

describe('goals meta normalization', () => {
  it('returns defaults when storage is empty', () => {
    expect(normalizeGoals(undefined).length).toBeGreaterThan(0);
    expect(normalizeGoals(null).length).toBeGreaterThan(0);
    expect(normalizeGoals([]).length).toBeGreaterThan(0);
  });

  it('does not re-append defaults after a default goal is removed', () => {
    const kept = {
      id: 'goal-quality-life',
      text: 'Better quality of life',
      category: 'long-term' as const,
    };
    const out = normalizeGoals([kept]);
    expect(out).toEqual([kept]);
    expect(out.some((g) => g.id === 'goal-weight-200')).toBe(false);
  });
});
