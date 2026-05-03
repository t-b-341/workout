import { describe, expect, it } from 'vitest';
import type { DirtyRow } from '@/lib/db';
import { sortDirtyQueueForFlush } from '@/lib/sync';

function row(partial: Omit<DirtyRow, 'id'> & { id?: string }): DirtyRow {
  const rowId = partial.rowId;
  return {
    id: partial.id ?? `${partial.table}:${rowId}`,
    table: partial.table,
    rowId,
    op: partial.op,
    enqueuedAt: partial.enqueuedAt,
  };
}

describe('sortDirtyQueueForFlush', () => {
  it('runs session_logs upsert before readiness_logs when readiness was enqueued first', () => {
    const sameTime = 1_700_000_000_000;
    const dirty: DirtyRow[] = [
      row({
        table: 'readiness_logs',
        rowId: 'r1',
        op: 'upsert',
        enqueuedAt: sameTime,
      }),
      row({
        table: 'session_logs',
        rowId: 's1',
        op: 'upsert',
        enqueuedAt: sameTime,
      }),
    ];
    const sorted = sortDirtyQueueForFlush(dirty);
    expect(sorted.map((d) => d.table)).toEqual(['session_logs', 'readiness_logs']);
  });

  it('runs all upserts before deletes', () => {
    const dirty: DirtyRow[] = [
      row({
        table: 'session_logs',
        rowId: 's1',
        op: 'delete',
        enqueuedAt: 100,
      }),
      row({
        table: 'readiness_logs',
        rowId: 'r1',
        op: 'upsert',
        enqueuedAt: 50,
      }),
    ];
    const sorted = sortDirtyQueueForFlush(dirty);
    expect(sorted[0].op).toBe('upsert');
    expect(sorted[1].op).toBe('delete');
  });

  it('breaks ties by enqueuedAt within the same tier', () => {
    const dirty: DirtyRow[] = [
      row({
        table: 'set_logs',
        rowId: 'b',
        op: 'upsert',
        enqueuedAt: 20,
      }),
      row({
        table: 'set_logs',
        rowId: 'a',
        op: 'upsert',
        enqueuedAt: 10,
      }),
    ];
    const sorted = sortDirtyQueueForFlush(dirty);
    expect(sorted.map((d) => d.rowId)).toEqual(['a', 'b']);
  });
});
