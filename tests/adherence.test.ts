import { describe, expect, it } from 'vitest';
import { computeAdherence } from '@/lib/adherence';
import { addDaysIso } from '@/lib/time';
import type { Prescription, SessionLog, SessionTemplate, SetLog, TemplateId } from '@/lib/types';

const TEMPLATES: Record<TemplateId, SessionTemplate> = {
  U1: { id: 'U1', name: 'Monday — Upper (Full)', dayOfWeek: 1, group: 'upper', intensity: 'heavy' },
  L1: { id: 'L1', name: 'Tuesday — Lower (Full)', dayOfWeek: 2, group: 'lower', intensity: 'heavy' },
  U2: { id: 'U2', name: 'Wednesday — Upper (Full)', dayOfWeek: 3, group: 'upper', intensity: 'light' },
  L2: { id: 'L2', name: 'Thursday — Lower (Mini)', dayOfWeek: 4, group: 'lower', intensity: 'light' },
  U3: { id: 'U3', name: 'Friday — Upper (Mini)', dayOfWeek: 5, group: 'upper', intensity: 'moderate' },
  L3: { id: 'L3', name: 'Saturday — Lower (Mini)', dayOfWeek: 6, group: 'lower', intensity: 'moderate' },
  S1: { id: 'S1', name: 'Sunday — Optional', dayOfWeek: 0, group: 'lower', intensity: 'light' },
  QUICK: { id: 'QUICK', name: 'Quick Session', dayOfWeek: -1, group: 'upper', intensity: 'heavy' },
};

const WEEKDAY_PLAN: TemplateId[] = ['U1', 'L1', 'U2', 'L2', 'U3', 'L3'];

function prescription(templateId: TemplateId, sets: number): Prescription {
  return {
    id: `rx-${templateId}`,
    templateId,
    liftId: 'bp',
    order: 0,
    weight: 100,
    sets,
    repMin: 5,
    repMax: 8,
  };
}

function makeSession(
  id: string,
  date: string,
  templateId: TemplateId,
  extra?: Partial<SessionLog>,
): SessionLog {
  return {
    id,
    date,
    templateId,
    mode: 'standard',
    deload: false,
    watchFlags: [],
    ...extra,
  };
}

function completedSets(sessionLogId: string, count: number): SetLog[] {
  return Array.from({ length: count }, (_, setIndex) => ({
    id: `${sessionLogId}-${setIndex}`,
    sessionLogId,
    liftId: 'bp',
    prescriptionId: `rx-${sessionLogId}`,
    setIndex,
    weight: 100,
    reps: 5,
    status: 'completed' as const,
  }));
}

function logged(
  date: string,
  templateId: TemplateId,
  setCount = 1,
  extra?: Partial<SessionLog>,
): { session: SessionLog; sets: SetLog[] } {
  const id = extra?.id ?? `${date}-${templateId}`;
  return {
    session: makeSession(id, date, templateId, extra),
    sets: completedSets(id, setCount),
  };
}

/** Monday of week `index`, with week 0 starting 2026-01-05. */
function monday(index: number): string {
  return addDaysIso('2026-01-05', index * 7);
}

describe('computeAdherence', () => {
  it('scores a fully completed week at rate 1', () => {
    const sessions: SessionLog[] = [];
    const sets: SetLog[] = [];
    for (let offset = 0; offset < WEEKDAY_PLAN.length; offset++) {
      const templateId = WEEKDAY_PLAN[offset];
      const entry = logged(addDaysIso('2026-01-05', offset), templateId);
      sessions.push(entry.session);
      sets.push(...entry.sets);
    }

    const report = computeAdherence({
      start: '2026-01-05',
      end: '2026-01-11',
      today: '2026-01-12',
      templates: [...WEEKDAY_PLAN.map((id) => TEMPLATES[id]), TEMPLATES.S1],
      sessions,
      sets,
      prescriptions: WEEKDAY_PLAN.map((id) => prescription(id, 1)),
    });

    expect(report.weeks).toHaveLength(1);
    expect(report.weeks[0]).toMatchObject({
      weekStart: '2026-01-05',
      planned: 6,
      completed: 6,
      partial: 0,
      skipped: 0,
      missed: 0,
      extra: 0,
      rate: 1,
    });
    expect(report.days.find((day) => day.date === '2026-01-11')?.planned).toEqual([]);
    expect(report.totals.rate).toBe(1);
    expect(report.totals.planned).toBe(6);
    expect(report.totals.completed).toBe(6);
  });

  it('marks the same planned day missed in the past and upcoming in the future', () => {
    const anchor = logged('2026-01-05', 'U1');
    const base = {
      start: '2026-01-05',
      end: '2026-01-06',
      templates: [TEMPLATES.U1, TEMPLATES.L1],
      sessions: [anchor.session],
      sets: anchor.sets,
      prescriptions: [prescription('U1', 1), prescription('L1', 4)],
    };

    const future = computeAdherence({ ...base, today: '2026-01-05' });
    const today = computeAdherence({ ...base, today: '2026-01-06' });
    const past = computeAdherence({ ...base, today: '2026-01-07' });

    const tuesday = (report: ReturnType<typeof computeAdherence>) =>
      report.days.find((day) => day.date === '2026-01-06')?.results[0];

    expect(tuesday(future)).toEqual({ templateId: 'L1', status: 'upcoming' });
    expect(tuesday(today)).toEqual({ templateId: 'L1', status: 'upcoming' });
    expect(tuesday(past)).toEqual({ templateId: 'L1', status: 'missed' });
    expect(future.totals.rate).toBe(1);
    expect(past.totals).toMatchObject({ completed: 1, missed: 1, rate: 0.5 });
  });

  it('counts a workout done a day late in the same week as completed, not missed', () => {
    const prior = logged('2026-01-05', 'U1');
    const moved = logged('2026-01-13', 'U1');
    const report = computeAdherence({
      start: '2026-01-12',
      end: '2026-01-13',
      today: '2026-01-14',
      templates: [TEMPLATES.U1],
      sessions: [prior.session, moved.session],
      sets: [...prior.sets, ...moved.sets],
      prescriptions: [prescription('U1', 1)],
    });

    const monday = report.days.find((day) => day.date === '2026-01-12');
    const tuesday = report.days.find((day) => day.date === '2026-01-13');
    expect(monday?.results).toEqual([
      {
        templateId: 'U1',
        status: 'completed',
        sessionId: moved.session.id,
        movedFromDate: '2026-01-12',
      },
    ]);
    expect(monday?.results.some((result) => result.status === 'missed')).toBe(false);
    expect(tuesday?.results).toEqual([]);
    expect(report.totals).toMatchObject({ completed: 1, missed: 0, extra: 0, rate: 1 });
  });

  it('counts a skipped session in the rate denominator', () => {
    const anchor = logged('2026-01-05', 'U1');
    const skipped = makeSession('2026-01-12-U1', '2026-01-12', 'U1', { sessionStatus: 'skipped' });
    const report = computeAdherence({
      start: '2026-01-12',
      end: '2026-01-12',
      today: '2026-01-13',
      templates: [TEMPLATES.U1],
      sessions: [anchor.session, skipped],
      sets: anchor.sets,
      prescriptions: [prescription('U1', 1)],
    });

    expect(report.days[0].results).toEqual([
      { templateId: 'U1', status: 'skipped', sessionId: skipped.id },
    ]);
    expect(report.totals).toMatchObject({ planned: 1, skipped: 1, completed: 0, rate: 0 });
  });

  it('marks a session under half the programmed sets as partial', () => {
    const entry = logged('2026-01-05', 'U1', 1);
    const report = computeAdherence({
      start: '2026-01-05',
      end: '2026-01-05',
      today: '2026-01-06',
      templates: [TEMPLATES.U1],
      sessions: [entry.session],
      sets: entry.sets,
      prescriptions: [prescription('U1', 4)],
    });

    expect(report.days[0].results[0]).toMatchObject({
      templateId: 'U1',
      status: 'partial',
      sessionId: entry.session.id,
    });
    expect(report.totals).toMatchObject({ partial: 1, completed: 0, rate: 0 });
  });

  it('treats an empty session row as no session', () => {
    const anchor = logged('2026-01-05', 'U1');
    const empty = makeSession('2026-01-06-L1', '2026-01-06', 'L1');
    const report = computeAdherence({
      start: '2026-01-05',
      end: '2026-01-06',
      today: '2026-01-07',
      templates: [TEMPLATES.U1, TEMPLATES.L1],
      sessions: [anchor.session, empty],
      sets: anchor.sets,
      prescriptions: [prescription('U1', 1), prescription('L1', 4)],
    });

    const tuesday = report.days.find((day) => day.date === '2026-01-06');
    expect(tuesday?.planned).toEqual(['L1']);
    expect(tuesday?.results).toEqual([{ templateId: 'L1', status: 'missed' }]);
    expect(report.totals.missed).toBe(1);
  });

  it('logs optional S1 as extra and does not mark it missed when absent', () => {
    const monday = logged('2026-01-05', 'U1');
    const sunday = logged('2026-01-11', 'S1');
    const shared = {
      start: '2026-01-05',
      end: '2026-01-11',
      today: '2026-01-12',
      templates: [TEMPLATES.U1, TEMPLATES.S1],
      prescriptions: [prescription('U1', 1), prescription('S1', 1)],
    };

    const done = computeAdherence({
      ...shared,
      sessions: [monday.session, sunday.session],
      sets: [...monday.sets, ...sunday.sets],
    });
    const sundayDone = done.days.find((day) => day.date === '2026-01-11');
    expect(sundayDone?.planned).toEqual([]);
    expect(sundayDone?.results).toEqual([
      { templateId: 'S1', status: 'extra', sessionId: sunday.session.id },
    ]);
    expect(done.totals).toMatchObject({ completed: 1, extra: 1, missed: 0, rate: 1 });

    const skipped = computeAdherence({
      ...shared,
      sessions: [monday.session],
      sets: monday.sets,
    });
    const sundaySkipped = skipped.days.find((day) => day.date === '2026-01-11');
    expect(sundaySkipped?.planned).toEqual([]);
    expect(sundaySkipped?.results).toEqual([]);
    expect(skipped.totals).toMatchObject({ missed: 0, extra: 0, rate: 1 });
  });

  it('plans nothing before the first session that has a logged set', () => {
    const first = logged('2026-01-07', 'U2');
    const report = computeAdherence({
      start: '2026-01-05',
      end: '2026-01-11',
      today: '2026-01-20',
      templates: [TEMPLATES.U1, TEMPLATES.L1, TEMPLATES.U2],
      sessions: [first.session],
      sets: first.sets,
      prescriptions: [prescription('U2', 1)],
    });

    expect(report.days.find((day) => day.date === '2026-01-05')).toEqual({
      date: '2026-01-05',
      planned: [],
      results: [],
    });
    expect(report.days.find((day) => day.date === '2026-01-06')?.planned).toEqual([]);
    expect(report.days.find((day) => day.date === '2026-01-07')).toMatchObject({
      planned: ['U2'],
      results: [{ templateId: 'U2', status: 'completed', sessionId: first.session.id }],
    });
    expect(report.totals.missed).toBe(0);
  });

  it('streak is the finished weeks at or above 0.8 ending at the last finished week', () => {
    // Five weekday slots. Four done is rate 0.8; none done is a poor week.
    // Weeks 0–2 good, week 3 poor, weeks 4–5 good. Week 6 has started
    // (today is its Tuesday) and must not extend the streak.
    const good = [4, 4, 4, 0, 4, 4];
    const sessions: SessionLog[] = [];
    const sets: SetLog[] = [];
    good.forEach((doneDays, weekIndex) => {
      for (let day = 0; day < doneDays; day++) {
        const templateId = WEEKDAY_PLAN[day];
        const entry = logged(addDaysIso(monday(weekIndex), day), templateId);
        sessions.push(entry.session);
        sets.push(...entry.sets);
      }
    });
    const currentMonday = monday(6);
    const current = logged(currentMonday, 'U1');
    sessions.push(current.session);
    sets.push(...current.sets);

    const report = computeAdherence({
      start: monday(0),
      end: addDaysIso(currentMonday, 1),
      today: addDaysIso(currentMonday, 1),
      templates: WEEKDAY_PLAN.slice(0, 5).map((id) => TEMPLATES[id]),
      sessions,
      sets,
      prescriptions: WEEKDAY_PLAN.slice(0, 5).map((id) => prescription(id, 1)),
    });

    expect(report.weeks.map((week) => week.rate)).toEqual([0.8, 0.8, 0.8, 0, 0.8, 0.8, 1]);
    expect(report.totals.currentWeekStreak).toBe(2);
  });

  it('a second run of the same template is extra and does not raise the rate', () => {
    const first = logged('2026-01-05', 'U1');
    const again = logged('2026-01-07', 'U1', 1, { id: '2026-01-07-U1-again' });
    const report = computeAdherence({
      start: '2026-01-05',
      end: '2026-01-07',
      today: '2026-01-08',
      templates: [TEMPLATES.U1],
      sessions: [first.session, again.session],
      sets: [...first.sets, ...again.sets],
      prescriptions: [prescription('U1', 1)],
    });

    expect(report.days.find((day) => day.date === '2026-01-07')?.results).toEqual([
      { templateId: 'U1', status: 'extra', sessionId: again.session.id },
    ]);
    expect(report.totals).toMatchObject({ completed: 1, extra: 1, rate: 1 });
  });

  it('returns a null rate for an empty range and for a range with no sessions', () => {
    const empty = computeAdherence({
      start: '2026-02-01',
      end: '2026-01-01',
      today: '2026-01-15',
      templates: [TEMPLATES.U1],
      sessions: [],
      sets: [],
      prescriptions: [prescription('U1', 4)],
    });
    expect(empty.days).toEqual([]);
    expect(empty.weeks).toEqual([]);
    expect(empty.totals.rate).toBeNull();
    expect(empty.totals.currentWeekStreak).toBe(0);

    const none = computeAdherence({
      start: '2026-01-05',
      end: '2026-01-11',
      today: '2026-01-20',
      templates: [TEMPLATES.U1, TEMPLATES.L1],
      sessions: [],
      sets: [],
      prescriptions: [prescription('U1', 4), prescription('L1', 4)],
    });
    expect(none.days.every((day) => day.planned.length === 0 && day.results.length === 0)).toBe(true);
    expect(none.totals).toMatchObject({
      planned: 0,
      completed: 0,
      missed: 0,
      rate: null,
      currentWeekStreak: 0,
    });
  });
});
