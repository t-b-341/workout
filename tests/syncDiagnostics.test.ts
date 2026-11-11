import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearSyncErrors,
  readSyncErrors,
  recordSyncError,
} from '../src/lib/syncDiagnostics';

class MockStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

// `typeof globalThis` already types `window` as the DOM Window, so a partial
// mock has to replace that property instead of intersecting with it.
type SyncTestGlobal = Omit<typeof globalThis, 'window'> & {
  window?: {
    localStorage: Storage;
    dispatchEvent: (event: Event) => boolean;
  };
};

beforeEach(() => {
  const storage = new MockStorage();
  const g = globalThis as SyncTestGlobal;
  g.window = { localStorage: storage, dispatchEvent: () => true };
  g.localStorage = storage;
});

describe('syncDiagnostics', () => {
  it('records and reads sync errors with timestamps', () => {
    recordSyncError({
      phase: 'push',
      table: 'set_logs',
      rowId: 'abc',
      message: 'rls violation',
      code: 'PGRST116',
    });
    const errors = readSyncErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      phase: 'push',
      table: 'set_logs',
      rowId: 'abc',
      message: 'rls violation',
      code: 'PGRST116',
    });
    expect(typeof errors[0].ts).toBe('number');
  });

  it('returns most recent error first', () => {
    recordSyncError({ phase: 'push', message: 'first' });
    recordSyncError({ phase: 'push', message: 'second' });
    const errors = readSyncErrors();
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toBe('second');
    expect(errors[1].message).toBe('first');
  });

  it('caps the log at 50 entries, keeping most recent', () => {
    for (let i = 0; i < 60; i++) {
      recordSyncError({ phase: 'push', message: `err-${i}` });
    }
    const errors = readSyncErrors();
    expect(errors).toHaveLength(50);
    expect(errors[0].message).toBe('err-59');
    expect(errors[49].message).toBe('err-10');
  });

  it('clears the log', () => {
    recordSyncError({ phase: 'push', message: 'x' });
    expect(readSyncErrors()).toHaveLength(1);
    clearSyncErrors();
    expect(readSyncErrors()).toHaveLength(0);
  });

  it('survives corrupted storage gracefully', () => {
    const g = globalThis as SyncTestGlobal;
    g.localStorage!.setItem('workout:sync-errors', '{not json');
    expect(readSyncErrors()).toEqual([]);
  });
});
