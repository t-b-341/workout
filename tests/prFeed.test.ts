import { describe, expect, it } from 'vitest';
import { LIFTS } from '@/lib/seed';
import { prFeed } from '@/lib/stats';
import type { SessionLog, SetLog } from '@/lib/types';

describe('prFeed', () => {
  it('tracks unassisted p1_bw PRs by max reps when added load is 0', () => {
    const session2010: SessionLog = {
      id: 's1',
      date: '2010-01-01',
      templateId: 'U3',
      mode: 'standard',
      deload: false,
      watchFlags: [],
      completedAt: '2010-01-01T12:00:00.000Z',
    };
    const session2011: SessionLog = {
      id: 's2',
      date: '2011-01-01',
      templateId: 'U3',
      mode: 'standard',
      deload: false,
      watchFlags: [],
      completedAt: '2011-01-01T12:00:00.000Z',
    };
    const sets: SetLog[] = [
      {
        id: 'a',
        sessionLogId: 's1',
        liftId: 'p1_bw',
        prescriptionId: 'U3-p1_bw',
        setIndex: 0,
        weight: 0,
        reps: 2,
        status: 'completed',
      },
      {
        id: 'b',
        sessionLogId: 's2',
        liftId: 'p1_bw',
        prescriptionId: 'U3-p1_bw',
        setIndex: 0,
        weight: 0,
        reps: 3,
        status: 'completed',
      },
    ];
    const feed = prFeed(sets, [session2010, session2011], LIFTS);
    const pull = feed.filter((x) => x.liftId === 'p1_bw');
    expect(pull.length).toBe(2);
    expect(pull[0].reps).toBe(3);
    expect(pull[0].weight).toBe(0);
    expect(pull[0].previousWeight).toBe(2);
  });

  it('tracks p1 assisted PRs when assistance decreases (lower listed lb is better)', () => {
    const session1: SessionLog = {
      id: 's-a',
      date: '2020-01-01',
      templateId: 'U2',
      mode: 'standard',
      deload: false,
      watchFlags: [],
      completedAt: '2020-01-01T12:00:00.000Z',
    };
    const session2: SessionLog = {
      id: 's-b',
      date: '2020-02-01',
      templateId: 'U2',
      mode: 'standard',
      deload: false,
      watchFlags: [],
      completedAt: '2020-02-01T12:00:00.000Z',
    };
    const sets: SetLog[] = [
      {
        id: 'x1',
        sessionLogId: 's-a',
        liftId: 'p1_assisted',
        prescriptionId: 'U2-p1_assisted',
        setIndex: 0,
        weight: 50,
        reps: 8,
        status: 'completed',
        loggedAt: '2020-01-01T11:00:00.000Z',
      },
      {
        id: 'x2',
        sessionLogId: 's-b',
        liftId: 'p1_assisted',
        prescriptionId: 'U2-p1_assisted',
        setIndex: 0,
        weight: 45,
        reps: 8,
        status: 'completed',
        loggedAt: '2020-02-01T11:00:00.000Z',
      },
    ];
    const feed = prFeed(sets, [session1, session2], LIFTS);
    const rows = feed.filter((x) => x.liftId === 'p1_assisted');
    expect(rows.length).toBe(2);
    expect(rows[0].weight).toBe(45);
    expect(rows[0].previousWeight).toBe(50);
  });
});
