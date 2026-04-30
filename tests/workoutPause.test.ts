import { describe, expect, it } from 'vitest';
import {
  finalizeWorkoutPauseAtCompletion,
  workoutPausedDurationMs,
  workoutWallClockElapsedMs,
  sessionDurationMs,
} from '@/lib/stats';
import type { SessionLog } from '@/lib/types';

function baseSession(): SessionLog {
  return {
    id: 's1',
    date: '2026-04-30',
    templateId: 'U1',
    mode: 'standard',
    deload: false,
    watchFlags: [],
    startedAt: '2026-04-30T10:00:00.000Z',
  };
}

describe('workout pause / stopwatch', () => {
  it('freezes elapsed while paused', () => {
    const s = {
      ...baseSession(),
      workoutPausedAt: '2026-04-30T10:05:00.000Z',
    };
    const a = workoutWallClockElapsedMs(s, Date.parse('2026-04-30T10:06:00.000Z'));
    const b = workoutWallClockElapsedMs(s, Date.parse('2026-04-30T10:20:00.000Z'));
    expect(a).toBe(5 * 60 * 1000);
    expect(b).toBe(5 * 60 * 1000);
  });

  it('subtracts completed pause segments from elapsed', () => {
    const s = {
      ...baseSession(),
      workoutPausedAccumMs: 120_000,
    };
    const dt = Date.parse('2026-04-30T10:07:00.000Z');
    expect(workoutWallClockElapsedMs(s, dt)).toBe(7 * 60 * 1000 - 120_000);
  });

  it('finalizeWorkoutPauseAtCompletion folds open pause into accum', () => {
    const s = {
      ...baseSession(),
      workoutPausedAccumMs: 60_000,
      workoutPausedAt: '2026-04-30T10:06:00.000Z',
    };
    const done = finalizeWorkoutPauseAtCompletion(s, '2026-04-30T10:08:00.000Z');
    expect(done.workoutPausedAccumMs).toBe(60_000 + 120_000);
    expect(done.workoutPausedAt).toBeUndefined();
  });

  it('sessionDurationMs for completed session excludes paused wall time', () => {
    const started = '2026-04-30T10:00:00.000Z';
    const completed = '2026-04-30T11:00:00.000Z';
    const s: SessionLog = {
      ...baseSession(),
      startedAt: started,
      completedAt: completed,
      workoutPausedAccumMs: 900_000,
    };
    expect(sessionDurationMs(s, [])).toBe(3600_000 - 900_000);
  });

  it('workoutPausedDurationMs sums accum and open segment', () => {
    const s = {
      ...baseSession(),
      workoutPausedAccumMs: 1000,
      workoutPausedAt: '2026-04-30T10:05:00.000Z',
    };
    expect(workoutPausedDurationMs(s, Date.parse('2026-04-30T10:07:00.000Z'))).toBe(1000 + 120_000);
  });
});
