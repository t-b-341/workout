import { describe, expect, it } from 'vitest';
import { fromRemote, toRemote } from '@/lib/syncCodec';

describe('toRemote', () => {
  it('maps camelCase keys to snake_case', () => {
    expect(
      toRemote({
        sessionLogId: 'a',
        liftId: 'b',
        setIndex: 1,
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toEqual({
      session_log_id: 'a',
      lift_id: 'b',
      set_index: 1,
      updated_at: '2026-01-01T00:00:00.000Z',
    });
  });
});

describe('fromRemote', () => {
  it('maps snake_case to camelCase and drops user_id', () => {
    const row = fromRemote<{ id: string; sessionLogId: string }>({
      id: 'x',
      session_log_id: 'sess',
      user_id: 'should-not-appear',
    });
    expect(row).toEqual({ id: 'x', sessionLogId: 'sess' });
    expect('userId' in row).toBe(false);
    expect('user_id' in row).toBe(false);
  });

  it('omits null optional fields so they stay undefined locally', () => {
    type S = { id: string; side?: 'L' | 'R' };
    const row = fromRemote<S>({
      id: 'set-1',
      side: null,
    });
    expect(row.id).toBe('set-1');
    expect('side' in row).toBe(false);
    expect(row.side).toBeUndefined();
  });

  it('preserves explicit null in JSON sense only via omission — booleans and numbers pass through', () => {
    const row = fromRemote<{ id: string; reps: number; done: boolean }>({
      id: '1',
      reps: 5,
      done: false,
    });
    expect(row).toEqual({ id: '1', reps: 5, done: false });
  });
});
