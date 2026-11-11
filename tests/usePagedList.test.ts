import { describe, expect, it } from 'vitest';
import { pagingSummary, takePaged } from '@/lib/usePagedList';

const fiftyTwo = Array.from({ length: 52 }, (_, i) => i);

describe('takePaged / pagingSummary', () => {
  it('returns the first page', () => {
    expect(takePaged(fiftyTwo, 20, 1)).toEqual(fiftyTwo.slice(0, 20));
    expect(pagingSummary(52, 20, 1)).toEqual({
      shown: 20,
      total: 52,
      hasMore: true,
      nextCount: 20,
    });
  });

  it('shows another page', () => {
    const afterMore = 2;
    expect(takePaged(fiftyTwo, 20, afterMore)).toEqual(fiftyTwo.slice(0, 40));
    expect(pagingSummary(52, 20, afterMore)).toEqual({
      shown: 40,
      total: 52,
      hasMore: true,
      nextCount: 12,
    });
  });

  it('stops when the list is an exact multiple of the page', () => {
    const exact = Array.from({ length: 40 }, (_, i) => i);
    expect(takePaged(exact, 20, 2)).toEqual(exact);
    expect(pagingSummary(40, 20, 2)).toEqual({
      shown: 40,
      total: 40,
      hasMore: false,
      nextCount: 0,
    });
  });

  it('returns every item when there are fewer than a page', () => {
    const few = [1, 2, 3, 4, 5];
    expect(takePaged(few, 20, 1)).toEqual(few);
    expect(pagingSummary(5, 20, 1)).toEqual({
      shown: 5,
      total: 5,
      hasMore: false,
      nextCount: 0,
    });
  });

  it('clamps when the list shrinks below the visible count', () => {
    const pages = 3;
    expect(pagingSummary(52, 20, pages).shown).toBe(52);
    const shrunk = Array.from({ length: 10 }, (_, i) => i);
    expect(takePaged(shrunk, 20, pages)).toEqual(shrunk);
    expect(pagingSummary(shrunk.length, 20, pages)).toEqual({
      shown: 10,
      total: 10,
      hasMore: false,
      nextCount: 0,
    });
  });
});
