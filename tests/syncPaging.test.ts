import { describe, expect, it } from 'vitest';
import { fetchAllPages } from '@/lib/syncPaging';

describe('fetchAllPages', () => {
  it('returns no rows when the table is empty', async () => {
    const calls: Array<[number, number]> = [];
    const { rows, error } = await fetchAllPages(async (from, to) => {
      calls.push([from, to]);
      return { data: [], error: null };
    });
    expect(error).toBeNull();
    expect(rows).toEqual([]);
    expect(calls).toEqual([[0, 999]]);
  });

  it('requests a second page when the first page is exactly full', async () => {
    const all = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const returned: number[] = [];
    const { rows, error } = await fetchAllPages(async (from, to) => {
      const data = all.slice(from, to + 1);
      returned.push(data.length);
      return { data, error: null };
    });
    expect(error).toBeNull();
    expect(returned).toEqual([1000, 0]);
    expect(rows).toEqual(all);
  });

  it('returns 2,500 rows across three pages in order without duplicates', async () => {
    const all = Array.from({ length: 2500 }, (_, i) => ({
      id: `id-${String(i).padStart(4, '0')}`,
    }));
    const spans: Array<[number, number]> = [];
    const { rows, error } = await fetchAllPages(async (from, to) => {
      spans.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    expect(error).toBeNull();
    expect(spans).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
    expect(rows).toEqual(all);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2500);
  });

  it('returns the error and no rows when a later page fails', async () => {
    const pageError = { message: 'page failed', code: '57014' };
    const { rows, error } = await fetchAllPages(async (from) => {
      if (from === 0) {
        return { data: Array.from({ length: 1000 }, (_, i) => i), error: null };
      }
      return { data: [1000, 1001], error: pageError };
    });
    expect(error).toBe(pageError);
    expect(rows).toEqual([]);
  });

  it('does not ask for more than 1,000 rows when a larger page size is given', async () => {
    const calls: Array<[number, number]> = [];
    const { rows, error } = await fetchAllPages(async (from, to) => {
      calls.push([from, to]);
      return { data: [], error: null };
    }, 5_000);
    expect(error).toBeNull();
    expect(rows).toEqual([]);
    expect(calls).toEqual([[0, 999]]);
  });
});
