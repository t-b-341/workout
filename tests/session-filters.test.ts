import { describe, expect, it } from 'vitest';
import { filterSessionsAfterReadiness, sortSetLogsForSession } from '../src/lib/sessionFilters';
import type { Prescription, ReadinessLog, SessionLog, SetLog, TemplateId } from '../src/lib/types';

describe('sortSetLogsForSession', () => {
  it('orders by prescription order then set index then side', () => {
    const rx: Prescription[] = [
      {
        id: 'p-b',
        templateId: 'U1' as TemplateId,
        liftId: 'b',
        order: 2,
        weight: 100,
        sets: 1,
        repMin: 5,
        repMax: 5,
      },
      {
        id: 'p-a',
        templateId: 'U1' as TemplateId,
        liftId: 'a',
        order: 1,
        weight: 100,
        sets: 1,
        repMin: 5,
        repMax: 5,
      },
    ];
    const sets: SetLog[] = [
      {
        id: '1',
        sessionLogId: 's1',
        liftId: 'b',
        prescriptionId: 'p-b',
        setIndex: 0,
        weight: 1,
        reps: 1,
        status: 'completed',
      },
      {
        id: '2',
        sessionLogId: 's1',
        liftId: 'a',
        prescriptionId: 'p-a',
        setIndex: 0,
        side: 'R',
        weight: 2,
        reps: 1,
        status: 'completed',
      },
      {
        id: '3',
        sessionLogId: 's1',
        liftId: 'a',
        prescriptionId: 'p-a',
        setIndex: 0,
        side: 'L',
        weight: 3,
        reps: 1,
        status: 'completed',
      },
    ];
    const out = sortSetLogsForSession(sets, rx);
    expect(out.map((x) => x.id)).toEqual(['3', '2', '1']);
  });
});

describe('filterSessionsAfterReadiness', () => {
  it('keeps sessions with readinessCompletedAt', () => {
    const sessions: SessionLog[] = [
      {
        id: '1',
        date: '2026-01-01',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
        readinessCompletedAt: '2026-01-01T12:00:00Z',
      },
    ];
    expect(filterSessionsAfterReadiness(sessions, []).length).toBe(1);
  });

  it('keeps sessions linked to a readiness log', () => {
    const sessions: SessionLog[] = [
      {
        id: 's1',
        date: '2026-01-01',
        templateId: 'U1',
        mode: 'standard',
        deload: false,
        watchFlags: [],
      },
    ];
    const readiness: ReadinessLog[] = [
      {
        id: 'r1',
        sessionLogId: 's1',
        date: '2026-01-01',
        sleepHours: 7,
        soreness: 2,
        motivation: 4,
        createdAt: '2026-01-01T08:00:00Z',
      },
    ];
    expect(filterSessionsAfterReadiness(sessions, readiness).length).toBe(1);
  });
});
