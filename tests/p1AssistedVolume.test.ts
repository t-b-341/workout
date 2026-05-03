import { describe, expect, it } from 'vitest';
import {
  bodyweightLbForSessionVolume,
  effectiveP1AssistedConcentricLoadLb,
  latestBodyweightLbOnOrBefore,
  strengthVolumeLbForSet,
} from '@/lib/p1AssistedVolume';
import type { BodyweightLog, Lift, ReadinessLog, SessionLog, SetLog } from '@/lib/types';

const session = (id: string, date: string): SessionLog => ({
  id,
  date,
  templateId: 'U1',
  mode: 'standard',
  deload: false,
  watchFlags: [],
});

const liftAssisted: Lift = {
  id: 'p1_assisted',
  name: 'P1 Assisted',
  equipment: 'bodyweight',
  loadUnit: 'lb',
  repUnit: 'reps',
  increment: 5,
  muscleGroups: ['lats'],
  pattern: 'vert-pull',
};

describe('p1AssistedVolume', () => {
  it('effective load is BW minus assist; negatives add load', () => {
    expect(effectiveP1AssistedConcentricLoadLb(50, 200)).toBe(150);
    expect(effectiveP1AssistedConcentricLoadLb(0, 200)).toBe(200);
    expect(effectiveP1AssistedConcentricLoadLb(-25, 200)).toBe(225);
  });

  it('latestBodyweightLbOnOrBefore picks most recent log on or before date', () => {
    const logs: BodyweightLog[] = [
      { id: 'a', date: '2026-01-10', isoWeek: '2026-W02', bodyweight: 210 },
      { id: 'b', date: '2026-01-03', isoWeek: '2026-W01', bodyweight: 205 },
    ];
    expect(latestBodyweightLbOnOrBefore('2026-01-05', logs)).toBe(205);
    expect(latestBodyweightLbOnOrBefore('2026-01-15', logs)).toBe(210);
  });

  it('bodyweightLbForSessionVolume prefers readiness bodyweight', () => {
    const s = session('s1', '2026-01-05');
    const rw: ReadinessLog = {
      id: 'r1',
      sessionLogId: 's1',
      date: '2026-01-05',
      sleepHours: 7,
      soreness: 2,
      motivation: 4,
      bodyweight: 198,
      createdAt: '2026-01-05T08:00:00.000Z',
    };
    const logs: BodyweightLog[] = [{ id: 'a', date: '2026-01-01', isoWeek: '2026-W01', bodyweight: 200 }];
    expect(bodyweightLbForSessionVolume(s, rw, logs)).toBe(198);
  });

  it('strengthVolumeLbForSet uses moved load for p1_assisted', () => {
    const st: SetLog = {
      id: '1',
      sessionLogId: 's1',
      liftId: 'p1_assisted',
      prescriptionId: 'p',
      setIndex: 0,
      weight: 40,
      reps: 3,
      status: 'completed',
    };
    expect(strengthVolumeLbForSet(st, liftAssisted, 200)).toBe((200 - 40) * 3);
    expect(strengthVolumeLbForSet(st, liftAssisted, undefined)).toBe(0);
  });
});
