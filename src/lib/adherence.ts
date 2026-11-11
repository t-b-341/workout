import { format } from 'date-fns';
import { deriveSessionStatus, isEmptySession } from './sessionStatus';
import { addDaysIso, weekRange } from './time';
import type {
  Prescription,
  SessionLog,
  SessionTemplate,
  SetLog,
  TemplateId,
} from './types';

/**
 * Planned vs done for an inclusive local-date range.
 *
 * A non-optional template is planned on its `dayOfWeek` (0 Sun … 6 Sat), but
 * only on or after the first session that has a logged set. The session that
 * fills a slot is the one for that template in the same Mon–Sun week
 * (`weekRange`): on the planned date, or another day of that week
 * (`movedFromDate` is the planned date). Ghost and empty rows are ignored.
 * A logged session that fills no slot is `extra` and is left out of `rate`.
 */
export type AdherenceStatus =
  | 'completed'
  | 'partial'
  | 'skipped'
  | 'missed'
  | 'upcoming'
  | 'extra';

export type AdherenceSlotResult = {
  templateId: TemplateId;
  status: AdherenceStatus;
  sessionId?: string;
  /** Set when a same-week session on another day filled this planned date. */
  movedFromDate?: string;
};

export type AdherenceDay = {
  date: string;
  planned: TemplateId[];
  results: AdherenceSlotResult[];
};

export type AdherenceWeek = {
  weekStart: string;
  planned: number;
  completed: number;
  partial: number;
  skipped: number;
  missed: number;
  extra: number;
  rate: number | null;
};

export type AdherenceTotals = {
  planned: number;
  completed: number;
  partial: number;
  skipped: number;
  missed: number;
  extra: number;
  rate: number | null;
  /** Consecutive finished weeks, ending at the last finished week, with rate ≥ 0.8. */
  currentWeekStreak: number;
};

export type AdherenceInput = {
  /** Inclusive ISO date `YYYY-MM-DD`. */
  start: string;
  /** Inclusive ISO date `YYYY-MM-DD`. */
  end: string;
  /** Inclusive ISO date `YYYY-MM-DD` the caller treats as today. */
  today: string;
  templates: SessionTemplate[];
  sessions: SessionLog[];
  sets: SetLog[];
  prescriptions: Prescription[];
  /** Templates that are never planned. Defaults to Sunday optional `S1`. */
  optionalTemplateIds?: TemplateId[];
};

export type AdherenceReport = {
  days: AdherenceDay[];
  weeks: AdherenceWeek[];
  totals: AdherenceTotals;
};

type StatusCounts = {
  planned: number;
  completed: number;
  partial: number;
  skipped: number;
  missed: number;
  extra: number;
};

type CountedSession = {
  session: SessionLog;
  status: 'completed' | 'partial' | 'skipped';
  hasSets: boolean;
  order: number;
};

type PlannedSlot = {
  date: string;
  templateId: TemplateId;
  weekStart: string;
  session?: CountedSession;
  moved: boolean;
};

const EMPTY_COUNTS = (): StatusCounts => ({
  planned: 0,
  completed: 0,
  partial: 0,
  skipped: 0,
  missed: 0,
  extra: 0,
});

export function computeAdherence(input: AdherenceInput): AdherenceReport {
  const { start, end, today, templates, sessions, sets, prescriptions } = input;
  const optional = new Set<TemplateId>(input.optionalTemplateIds ?? ['S1']);
  const dates = enumerateDates(start, end);
  const setsBySession = indexSets(sets);
  const firstLoggedDate = earliestLoggedSessionDate(sessions, setsBySession);
  const counted = countSessions(sessions, setsBySession, prescriptions);
  const slots = buildSlots(dates, templates, optional, firstLoggedDate);
  assignSessions(slots, counted);

  const used = new Set<CountedSession>();
  for (const slot of slots) {
    if (slot.session) used.add(slot.session);
  }

  const slotsByDate = new Map<string, PlannedSlot[]>();
  for (const slot of slots) {
    const list = slotsByDate.get(slot.date);
    if (list) list.push(slot);
    else slotsByDate.set(slot.date, [slot]);
  }

  const days: AdherenceDay[] = dates.map((date) => {
    if (firstLoggedDate == null || date < firstLoggedDate) {
      return { date, planned: [], results: [] };
    }
    const daySlots = slotsByDate.get(date) ?? [];
    return {
      date,
      planned: daySlots.map((slot) => slot.templateId),
      results: [
        ...daySlots.map((slot) => slotResult(slot, today)),
        ...extrasOnDate(date, counted, used),
      ],
    };
  });

  const weeks = weeksFor(days);
  const totals = totalsFor(weeks, today);
  return { days, weeks, totals };
}

function enumerateDates(start: string, end: string): string[] {
  if (start > end) return [];
  const dates: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(cursor);
    const next = addDaysIso(cursor, 1);
    if (next <= cursor) break;
    cursor = next;
  }
  return dates;
}

/** Monday of the local Mon–Sun week, same boundary as `weekRange`. */
function weekStartOf(dateIso: string): string {
  return format(weekRange(new Date(`${dateIso}T12:00:00`)).start, 'yyyy-MM-dd');
}

function localDayOfWeek(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00`).getDay();
}

function indexSets(sets: SetLog[]): Map<string, SetLog[]> {
  const bySession = new Map<string, SetLog[]>();
  for (const set of sets) {
    const list = bySession.get(set.sessionLogId);
    if (list) list.push(set);
    else bySession.set(set.sessionLogId, [set]);
  }
  return bySession;
}

function earliestLoggedSessionDate(
  sessions: SessionLog[],
  setsBySession: Map<string, SetLog[]>,
): string | null {
  let earliest: string | null = null;
  for (const session of sessions) {
    const sessionSets = setsBySession.get(session.id);
    if (!sessionSets || sessionSets.length === 0) continue;
    if (earliest == null || session.date < earliest) earliest = session.date;
  }
  return earliest;
}

function countSessions(
  sessions: SessionLog[],
  setsBySession: Map<string, SetLog[]>,
  prescriptions: Prescription[],
): CountedSession[] {
  const counted: CountedSession[] = [];
  sessions.forEach((session, order) => {
    const sessionSets = setsBySession.get(session.id) ?? [];
    // Empty rows and ghosts are not sessions: a moved or missing workout
    // must not be blocked by a placeholder row.
    if (isEmptySession(session, sessionSets, null)) return;
    const derived = deriveSessionStatus(session, prescriptions, sessionSets);
    if (derived === 'ghost') return;
    counted.push({
      session,
      status: derived,
      hasSets: sessionSets.length > 0,
      order,
    });
  });
  return counted;
}

function buildSlots(
  dates: string[],
  templates: SessionTemplate[],
  optional: Set<TemplateId>,
  firstLoggedDate: string | null,
): PlannedSlot[] {
  if (firstLoggedDate == null) return [];
  const plannedTemplates: SessionTemplate[] = [];
  const seen = new Set<TemplateId>();
  for (const template of templates) {
    if (optional.has(template.id) || seen.has(template.id)) continue;
    seen.add(template.id);
    plannedTemplates.push(template);
  }

  const slots: PlannedSlot[] = [];
  for (const date of dates) {
    if (date < firstLoggedDate) continue;
    const dow = localDayOfWeek(date);
    const weekStart = weekStartOf(date);
    for (const template of plannedTemplates) {
      if (template.dayOfWeek !== dow) continue;
      slots.push({ date, templateId: template.id, weekStart, moved: false });
    }
  }
  return slots;
}

function assignSessions(slots: PlannedSlot[], counted: CountedSession[]): void {
  const buckets = new Map<string, CountedSession[]>();
  for (const entry of counted) {
    const key = `${weekStartOf(entry.session.date)}|${entry.session.templateId}`;
    const list = buckets.get(key);
    if (list) list.push(entry);
    else buckets.set(key, [entry]);
  }
  for (const list of buckets.values()) {
    list.sort((a, b) => {
      if (a.session.date !== b.session.date) return a.session.date < b.session.date ? -1 : 1;
      return a.order - b.order;
    });
  }

  const used = new Set<CountedSession>();

  for (const slot of slots) {
    const match = (buckets.get(`${slot.weekStart}|${slot.templateId}`) ?? []).find(
      (entry) => entry.session.date === slot.date && !used.has(entry),
    );
    if (!match) continue;
    used.add(match);
    slot.session = match;
  }

  for (const slot of slots) {
    if (slot.session) continue;
    const match = (buckets.get(`${slot.weekStart}|${slot.templateId}`) ?? []).find(
      (entry) => !used.has(entry),
    );
    if (!match) continue;
    used.add(match);
    slot.session = match;
    slot.moved = true;
  }
}

function slotResult(slot: PlannedSlot, today: string): AdherenceSlotResult {
  if (!slot.session) {
    return {
      templateId: slot.templateId,
      status: slot.date < today ? 'missed' : 'upcoming',
    };
  }
  const result: AdherenceSlotResult = {
    templateId: slot.templateId,
    status: slot.session.status,
    sessionId: slot.session.session.id,
  };
  if (slot.moved) result.movedFromDate = slot.date;
  return result;
}

function extrasOnDate(
  date: string,
  counted: CountedSession[],
  used: Set<CountedSession>,
): AdherenceSlotResult[] {
  const extras: AdherenceSlotResult[] = [];
  for (const entry of counted) {
    if (entry.session.date !== date || used.has(entry) || !entry.hasSets) continue;
    extras.push({
      templateId: entry.session.templateId,
      status: 'extra',
      sessionId: entry.session.id,
    });
  }
  return extras;
}

function addResult(counts: StatusCounts, status: AdherenceStatus): void {
  if (status === 'upcoming') return;
  counts[status] += 1;
}

function rateOf(counts: StatusCounts): number | null {
  const denom = counts.completed + counts.partial + counts.skipped + counts.missed;
  if (denom === 0) return null;
  return counts.completed / denom;
}

function weeksFor(days: AdherenceDay[]): AdherenceWeek[] {
  const order: string[] = [];
  const byWeek = new Map<string, StatusCounts>();
  for (const day of days) {
    const weekStart = weekStartOf(day.date);
    let counts = byWeek.get(weekStart);
    if (!counts) {
      counts = EMPTY_COUNTS();
      byWeek.set(weekStart, counts);
      order.push(weekStart);
    }
    counts.planned += day.planned.length;
    for (const result of day.results) addResult(counts, result.status);
  }
  return order.map((weekStart) => {
    const counts = byWeek.get(weekStart)!;
    return { weekStart, ...counts, rate: rateOf(counts) };
  });
}

function weekFinished(weekStart: string, today: string): boolean {
  return addDaysIso(weekStart, 6) < today;
}

/** `rate >= 0.8`, compared in integers so 4/5 counts and 3/4 does not. */
function meetsStreak(week: AdherenceWeek): boolean {
  const denom = week.completed + week.partial + week.skipped + week.missed;
  if (denom === 0) return false;
  return week.completed * 5 >= denom * 4;
}

function streakEndingAtLastFinishedWeek(weeks: AdherenceWeek[], today: string): number {
  let index = weeks.length - 1;
  while (index >= 0 && !weekFinished(weeks[index].weekStart, today)) index -= 1;
  let streak = 0;
  for (; index >= 0; index -= 1) {
    if (!weekFinished(weeks[index].weekStart, today) || !meetsStreak(weeks[index])) break;
    streak += 1;
  }
  return streak;
}

function totalsFor(weeks: AdherenceWeek[], today: string): AdherenceTotals {
  const counts = EMPTY_COUNTS();
  for (const week of weeks) {
    counts.planned += week.planned;
    counts.completed += week.completed;
    counts.partial += week.partial;
    counts.skipped += week.skipped;
    counts.missed += week.missed;
    counts.extra += week.extra;
  }
  return {
    ...counts,
    rate: rateOf(counts),
    currentWeekStreak: streakEndingAtLastFinishedWeek(weeks, today),
  };
}
