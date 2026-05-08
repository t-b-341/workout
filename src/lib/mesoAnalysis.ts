import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { SummaryProgramTarget } from './programExportTargets';
import {
  bodyweightLbForSessionVolume,
  readinessBySessionId,
  strengthVolumeLbForSet,
} from './p1AssistedVolume';
import { isoWeekOf, sortSetsChronologically } from './stats';
import type {
  BodyweightLog,
  InjuryEpisode,
  Lift,
  NutritionDayType,
  NutritionLog,
  ReadinessLog,
  SessionLog,
  SetIntent,
  SetLog,
  SleepLog,
  StressLog,
} from './types';
import { SET_INTENTS } from './types';

export type MesoVolumeWeekRow = {
  week: number;
  totalLbReps: number;
  workingSets: number;
};

export type VolumeProgressionRow = {
  liftId: string;
  liftName: string;
  weeklyVolumeByWeek: MesoVolumeWeekRow[];
  firstWorkingSetLoad: number | null;
  lastWorkingSetLoad: number | null;
  loadDelta: number | null;
};

export type TargetDeltaRow = {
  targetId: string;
  label: string;
  targetValue: number;
  unit: string;
  currentValueAtExport: number;
  gapAtExport: number;
  percentOfTarget: number;
  previousExportDate: string | null;
  previousCurrentValue: number | null;
};

export type CompletionRateRow = {
  liftId: string;
  liftName: string;
  programmedSets: number;
  completedSets: number;
  skippedSets: number;
  completionPct: number;
  skipReasons: string[];
};

export type IntentBreakdown = {
  warmup: number;
  working: number;
  backoff: number;
  max_test: number;
  workingPct: number;
};

export type NutritionDayBucket = {
  avgCaloriesActual: number;
  avgCaloriesTarget: number;
  avgCalorieDelta: number;
  avgProteinActual: number;
  avgProteinTarget: number;
  avgProteinDelta: number;
  daysLogged: number;
};

export type NutritionAdherence = Partial<
  Record<'training' | 'rest' | 'liss', NutritionDayBucket>
>;

export type BodyweightTrend = {
  firstReading: { date: string; value: number };
  lastReading: { date: string; value: number };
  netChange: number;
  rollingAvg3Day: Array<{ date: string; value: number }>;
};

export type WellnessCompletionBucket = {
  sessions: number;
  avgCompletionPct: number;
};

export type WellnessCorrelations = {
  lowSleepQualitySessionCompletion: WellnessCompletionBucket;
  highSleepQualitySessionCompletion: WellnessCompletionBucket;
  highStressSessionCompletion: WellnessCompletionBucket;
  lowMotivationSessionCompletion: WellnessCompletionBucket;
};

export type InjuryFlagRow = {
  date: string;
  sessionId: string;
  sessionType: string;
  flag: 'injury_episode' | 'abbreviated' | 'note_keyword' | 'high_skip_rate';
  affectedSite: string | null;
  liftId: string | null;
  liftName: string | null;
  detail: string;
};

export type MindfulnessAdherence = {
  targetMinPerDay: number;
  avgMinPerDay: number;
  daysLogged: number;
  daysHittingTarget: number;
  adherencePct: number;
};

export type LiftRecommendation = {
  liftId: string;
  liftName: string;
  recommendation: 'progress' | 'hold' | 'deload' | 'monitor';
  rationale: string;
};

export type MesoAnalysisSectionKey =
  | 'volumeProgression'
  | 'targetDeltas'
  | 'completionRates'
  | 'intentBreakdown'
  | 'nutritionAdherence'
  | 'bodyweightTrend'
  | 'wellnessCorrelations'
  | 'injuryFlags'
  | 'mindfulnessAdherence'
  | 'liftRecommendations';

export type MesoAnalysisReport = {
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  volumeProgression: VolumeProgressionRow[] | null;
  targetDeltas: TargetDeltaRow[] | null;
  completionRates: CompletionRateRow[] | null;
  intentBreakdown: IntentBreakdown | null;
  nutritionAdherence: NutritionAdherence | null;
  bodyweightTrend: BodyweightTrend | null;
  wellnessCorrelations: WellnessCorrelations | null;
  injuryFlags: InjuryFlagRow[] | null;
  mindfulnessAdherence: MindfulnessAdherence | null;
  liftRecommendations: LiftRecommendation[] | null;
  /** When a section is null, explains what data was missing (optional keys only). */
  sectionNullNotes?: Partial<Record<MesoAnalysisSectionKey, string>>;
};

const SITE_TO_LIFT_IDS = {
  'wrist-L': ['front_squat', 'fs', 'p1_eccentric', 'p1_bw', 'p1_assisted', 'farmers_carry'],
  'wrist-R': ['front_squat', 'fs', 'p1_eccentric', 'p1_bw', 'p1_assisted', 'farmers_carry'],
  'lower-back': ['deadlift', 'dl', 'rdl', 'back_squat', 'bs', 'pp', 'deficit_bbr', 'bbr'],
  'knee-L': ['back_squat', 'bs', 'bss', 'rdl', 'front_squat'],
  'knee-R': ['back_squat', 'bs', 'bss', 'rdl', 'front_squat'],
  'shoulder-L': ['ohp', 'pp', 'bp', 'bp_paused', 'wgbp', 'cgbp'],
  'shoulder-R': ['ohp', 'pp', 'bp', 'bp_paused', 'wgbp', 'cgbp'],
  'elbow-L': ['ohp', 'bp', 'wgbp', 'cgbp', 'jm_press', 'curls', 'ubr', 'bbr'],
  'elbow-R': ['ohp', 'bp', 'wgbp', 'cgbp', 'jm_press', 'curls', 'ubr', 'bbr'],
} as const;

const NOTE_SITE_KEYWORDS: Array<{ re: RegExp; sites: readonly (keyof typeof SITE_TO_LIFT_IDS)[] }> = [
  { re: /\bwrist\b/i, sites: ['wrist-L', 'wrist-R'] },
  { re: /\blower\s+back\b/i, sites: ['lower-back'] },
  { re: /\bback\b/i, sites: ['lower-back'] },
  { re: /\bknee\b/i, sites: ['knee-L', 'knee-R'] },
  { re: /\bshoulder\b/i, sites: ['shoulder-L', 'shoulder-R'] },
  { re: /\belbow\b/i, sites: ['elbow-L', 'elbow-R'] },
];

const NOTE_SYMPTOM_RE = /\b(?:pain|tweak|strain|injury|hurt|sore)\b/i;

function intentOf(s: SetLog): SetIntent {
  if (s.intent && (SET_INTENTS as readonly string[]).includes(s.intent)) return s.intent;
  return 'working';
}

function cmpIsoDate(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Inclusive calendar days spanned by [start, end]. */
function calendarDaysInclusive(start: string, end: string): string[] {
  const a = parseISO(start);
  const b = parseISO(end);
  const n = differenceInCalendarDays(b, a) + 1;
  if (n <= 0) return [];
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(a);
    d.setDate(a.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function resolveMesoAnalysisWindow(args: {
  session_logs: SessionLog[];
  mesoStartDate: string | null | undefined;
  mesoEndDate: string | null | undefined;
}): { windowStart: string; windowEnd: string } | null {
  const dates = [...new Set(args.session_logs.map((s) => s.date).filter(Boolean))].sort(cmpIsoDate);
  const fallbackStart = dates[0] ?? null;
  const fallbackEnd = dates.length ? dates[dates.length - 1]! : null;

  const ms = args.mesoStartDate?.trim();
  const me = args.mesoEndDate?.trim();
  if (ms && me && /^\d{4}-\d{2}-\d{2}$/.test(ms) && /^\d{4}-\d{2}-\d{2}$/.test(me) && cmpIsoDate(ms, me) <= 0) {
    return { windowStart: ms, windowEnd: me };
  }
  if (fallbackStart && fallbackEnd) {
    return { windowStart: fallbackStart, windowEnd: fallbackEnd };
  }
  return null;
}

export function computeMesoAnalysis(args: {
  exportedAtIso: string;
  session_logs: SessionLog[];
  set_logs: SetLog[];
  lifts: Lift[];
  prescriptions: Array<{ templateId: string; liftId: string; sets: number }>;
  readiness_logs: ReadinessLog[];
  bodyweight_logs: BodyweightLog[];
  nutrition_logs: Array<
    NutritionLog & { dayType?: NutritionDayType }
  >;
  sleep_logs: SleepLog[];
  stress_logs: StressLog[];
  mindfulness_logs: Array<{ date: string; durationMin?: number }>;
  injury_episodes: InjuryEpisode[];
  programTargets: SummaryProgramTarget[];
  mesoStartDate: string | null | undefined;
  mesoEndDate: string | null | undefined;
}): MesoAnalysisReport {
  const generatedAt = args.exportedAtIso;
  const sectionNullNotes: Partial<Record<MesoAnalysisSectionKey, string>> = {};

  const win = resolveMesoAnalysisWindow({
    session_logs: args.session_logs,
    mesoStartDate: args.mesoStartDate,
    mesoEndDate: args.mesoEndDate,
  });

  if (!win) {
    return {
      generatedAt,
      windowStart: '',
      windowEnd: '',
      volumeProgression: null,
      targetDeltas: null,
      completionRates: null,
      intentBreakdown: null,
      nutritionAdherence: null,
      bodyweightTrend: null,
      wellnessCorrelations: null,
      injuryFlags: null,
      mindfulnessAdherence: null,
      liftRecommendations: null,
      sectionNullNotes: {
        volumeProgression: 'No session_logs — cannot determine analysis window.',
        targetDeltas: 'No session_logs — cannot determine analysis window.',
        completionRates: 'No session_logs — cannot determine analysis window.',
        intentBreakdown: 'No session_logs — cannot determine analysis window.',
        nutritionAdherence: 'No session_logs — cannot determine analysis window.',
        bodyweightTrend: 'No session_logs — cannot determine analysis window.',
        wellnessCorrelations: 'No session_logs — cannot determine analysis window.',
        injuryFlags: 'No session_logs — cannot determine analysis window.',
        mindfulnessAdherence: 'No session_logs — cannot determine analysis window.',
        liftRecommendations: 'No session_logs — cannot determine analysis window.',
      },
    };
  }

  const { windowStart, windowEnd } = win;

  const sessionInWindow = (s: SessionLog) =>
    cmpIsoDate(s.date, windowStart) >= 0 && cmpIsoDate(s.date, windowEnd) <= 0;

  const sessionsFiltered = args.session_logs.filter(sessionInWindow);
  const sessionIds = new Set(sessionsFiltered.map((s) => s.id));
  const sessionById = new Map(args.session_logs.map((s) => [s.id, s]));

  const setsInWindow = args.set_logs.filter((st) => sessionIds.has(st.sessionLogId));

  const liftById = new Map(args.lifts.map((l) => [l.id, l]));
  const rxBySession = readinessBySessionId(args.readiness_logs);

  /** Session completion: completed sets / programmed prescription sets. */
  function sessionCompletionPct(sessionId: string): number | null {
    const s = sessionById.get(sessionId);
    if (!s) return null;
    let programmed = 0;
    for (const p of args.prescriptions) {
      if (p.templateId === s.templateId) programmed += p.sets;
    }
    if (programmed <= 0) return null;
    const logged = setsInWindow.filter((st) => st.sessionLogId === sessionId);
    const completed = logged.filter((st) => st.status === 'completed').length;
    return (completed / programmed) * 100;
  }

  // ----- volumeProgression -----
  let volumeProgression: VolumeProgressionRow[] | null = null;
  const liftIdsWithSets = [...new Set(setsInWindow.map((st) => st.liftId))];
  if (liftIdsWithSets.length === 0) {
    sectionNullNotes.volumeProgression = 'No set_logs in the analysis window.';
  } else {
    const sortedSets = sortSetsChronologically(setsInWindow, sessionsFiltered);

    const rows: VolumeProgressionRow[] = [];
    for (const liftId of liftIdsWithSets) {
      const lift = liftById.get(liftId);
      const liftName = lift?.name ?? liftId;
      const forLift = sortedSets.filter((st) => st.liftId === liftId);

      const uniqueWeeks = [
        ...new Set(
          forLift
            .map((st) => {
              const sess = sessionById.get(st.sessionLogId);
              return sess?.date ? isoWeekOf(sess.date) : null;
            })
            .filter((w): w is string => !!w),
        ),
      ].sort();

      const weeklyVolumeByWeek: MesoVolumeWeekRow[] = uniqueWeeks.map((wk, i) => {
        let totalLbReps = 0;
        let workingSets = 0;
        for (const st of forLift) {
          const sess = sessionById.get(st.sessionLogId);
          if (!sess) continue;
          if (isoWeekOf(sess.date) !== wk) continue;
          const bw = bodyweightLbForSessionVolume(sess, rxBySession.get(sess.id), args.bodyweight_logs);
          totalLbReps += strengthVolumeLbForSet(st, lift, bw);
          if (st.status === 'completed' && intentOf(st) === 'working') workingSets += 1;
        }
        return { week: i + 1, totalLbReps, workingSets };
      });

      const workingLoads = forLift.filter(
        (st) => st.status === 'completed' && intentOf(st) === 'working',
      );
      const firstW = workingLoads[0]?.weight ?? null;
      const lastW = workingLoads.length ? workingLoads[workingLoads.length - 1]!.weight : null;
      const loadDelta =
        firstW != null && lastW != null && Number.isFinite(firstW) && Number.isFinite(lastW)
          ? lastW - firstW
          : null;

      rows.push({
        liftId,
        liftName,
        weeklyVolumeByWeek,
        firstWorkingSetLoad: firstW,
        lastWorkingSetLoad: lastW,
        loadDelta,
      });
    }
    volumeProgression = rows.sort((a, b) => a.liftName.localeCompare(b.liftName));
  }

  // ----- targetDeltas -----
  let targetDeltas: TargetDeltaRow[] | null = null;
  const tdRows: TargetDeltaRow[] = [];
  for (const pt of args.programTargets) {
    if (pt.currentValue == null || pt.targetValue == null) continue;
    if (!Number.isFinite(pt.currentValue) || !Number.isFinite(pt.targetValue)) continue;
    tdRows.push({
      targetId: pt.id,
      label: pt.label,
      targetValue: pt.targetValue,
      unit: pt.unit,
      currentValueAtExport: pt.currentValue,
      gapAtExport: pt.targetValue - pt.currentValue,
      percentOfTarget: pt.targetValue !== 0 ? (pt.currentValue / pt.targetValue) * 100 : 0,
      previousExportDate: null,
      previousCurrentValue: null,
    });
  }
  targetDeltas = tdRows.length ? tdRows : null;
  if (!targetDeltas) {
    sectionNullNotes.targetDeltas = 'No programTargets with both targetValue and currentValue set.';
  }

  // ----- completionRates -----
  let completionRates: CompletionRateRow[] | null = null;
  const completionMap = new Map<
    string,
    { programmed: number; completed: number; skipped: number; reasons: Set<string> }
  >();

  for (const s of sessionsFiltered) {
    for (const p of args.prescriptions) {
      if (p.templateId !== s.templateId) continue;
      const cur = completionMap.get(p.liftId) ?? {
        programmed: 0,
        completed: 0,
        skipped: 0,
        reasons: new Set<string>(),
      };
      cur.programmed += p.sets;
      completionMap.set(p.liftId, cur);
    }
  }

  for (const st of setsInWindow) {
    const cur = completionMap.get(st.liftId) ?? {
      programmed: 0,
      completed: 0,
      skipped: 0,
      reasons: new Set<string>(),
    };
    if (st.status === 'completed') cur.completed += 1;
    if (st.status === 'skipped') {
      cur.skipped += 1;
      cur.reasons.add(st.reason?.trim() ? `skipped:${st.reason.trim()}` : 'skipped');
    }
    completionMap.set(st.liftId, cur);
  }

  const crRows: CompletionRateRow[] = [];
  for (const [liftId, v] of completionMap) {
    const lift = liftById.get(liftId);
    const denom = v.programmed > 0 ? v.programmed : v.completed + v.skipped;
    const completionPct = denom > 0 ? (v.completed / denom) * 100 : 0;
    crRows.push({
      liftId,
      liftName: lift?.name ?? liftId,
      programmedSets: v.programmed,
      completedSets: v.completed,
      skippedSets: v.skipped,
      completionPct,
      skipReasons: [...v.reasons],
    });
  }
  completionRates = crRows.length ? crRows.sort((a, b) => a.liftName.localeCompare(b.liftName)) : null;
  if (!completionRates) {
    sectionNullNotes.completionRates = 'No prescriptions or set_logs matched lifts in the window.';
  }

  // ----- intentBreakdown -----
  let intentBreakdown: IntentBreakdown | null = null;
  {
    let w = 0,
      wo = 0,
      b = 0,
      m = 0;
    for (const st of setsInWindow) {
      const i = intentOf(st);
      if (i === 'warmup') w += 1;
      else if (i === 'working') wo += 1;
      else if (i === 'backoff') b += 1;
      else if (i === 'max_test') m += 1;
    }
    const denom = wo + b + m;
    const workingPct = denom > 0 ? (wo / denom) * 100 : 0;
    if (setsInWindow.length === 0) {
      sectionNullNotes.intentBreakdown = 'No set_logs in the analysis window.';
    } else {
      intentBreakdown = { warmup: w, working: wo, backoff: b, max_test: m, workingPct };
    }
  }

  // ----- nutritionAdherence -----
  let nutritionAdherence: NutritionAdherence | null = null;
  {
    const inWin = args.nutrition_logs.filter(
      (n) => cmpIsoDate(n.date, windowStart) >= 0 && cmpIsoDate(n.date, windowEnd) <= 0,
    );
    const byDay: Partial<Record<NutritionDayType, NutritionLog[]>> = {};
    for (const n of inWin) {
      const dt = n.dayType ?? 'rest';
      if (dt !== 'training' && dt !== 'rest' && dt !== 'liss') continue;
      const list = byDay[dt] ?? [];
      list.push(n);
      byDay[dt] = list;
    }
    const out: NutritionAdherence = {};
    for (const key of ['training', 'rest', 'liss'] as const) {
      const logs = byDay[key];
      if (!logs?.length) continue;
      const n = logs.length;
      const avgCaloriesActual = logs.reduce((s, x) => s + x.caloriesActual, 0) / n;
      const avgCaloriesTarget = logs.reduce((s, x) => s + x.caloriesTarget, 0) / n;
      const avgProteinActual = logs.reduce((s, x) => s + x.proteinActualG, 0) / n;
      const avgProteinTarget = logs.reduce((s, x) => s + x.proteinTargetG, 0) / n;
      out[key] = {
        avgCaloriesActual,
        avgCaloriesTarget,
        avgCalorieDelta: avgCaloriesActual - avgCaloriesTarget,
        avgProteinActual,
        avgProteinTarget,
        avgProteinDelta: avgProteinActual - avgProteinTarget,
        daysLogged: n,
      };
    }
    nutritionAdherence = Object.keys(out).length ? out : null;
    if (!nutritionAdherence) {
      sectionNullNotes.nutritionAdherence = 'No nutrition_logs with dayType in the analysis window.';
    }
  }

  // ----- bodyweightTrend -----
  let bodyweightTrend: BodyweightTrend | null = null;
  {
    const bwIn = args.bodyweight_logs
      .filter(
        (b) =>
          cmpIsoDate(b.date, windowStart) >= 0 && cmpIsoDate(b.date, windowEnd) <= 0 && b.bodyweight > 0,
      )
      .sort((a, b) => cmpIsoDate(a.date, b.date));
    if (bwIn.length < 1) {
      sectionNullNotes.bodyweightTrend = 'No bodyweight_logs in the analysis window.';
    } else {
      const byDate = new Map<string, number>();
      for (const b of bwIn) {
        byDate.set(b.date, b.bodyweight);
      }
      const firstReading = { date: bwIn[0]!.date, value: bwIn[0]!.bodyweight };
      const lastReading = {
        date: bwIn[bwIn.length - 1]!.date,
        value: bwIn[bwIn.length - 1]!.bodyweight,
      };
      const netChange = lastReading.value - firstReading.value;
      const days = calendarDaysInclusive(windowStart, windowEnd);
      const rollingAvg3Day: Array<{ date: string; value: number }> = [];
      for (const d of days) {
        const cur = parseISO(d);
        const vals: number[] = [];
        for (let k = -2; k <= 0; k++) {
          const t = new Date(cur);
          t.setDate(cur.getDate() + k);
          const ds = t.toISOString().slice(0, 10);
          const v = byDate.get(ds);
          if (v != null) vals.push(v);
        }
        if (vals.length === 0) continue;
        rollingAvg3Day.push({
          date: d,
          value: vals.reduce((a, b) => a + b, 0) / vals.length,
        });
      }
      bodyweightTrend = { firstReading, lastReading, netChange, rollingAvg3Day };
    }
  }

  // ----- wellnessCorrelations -----
  let wellnessCorrelations: WellnessCorrelations | null = null;
  {
    const sleepByDate = new Map(args.sleep_logs.map((s) => [s.date, s]));
    const stressBySessionDay = new Map<string, StressLog[]>();
    for (const st of args.stress_logs) {
      const list = stressBySessionDay.get(st.date) ?? [];
      list.push(st);
      stressBySessionDay.set(st.date, list);
    }

    function addDaysIso(iso: string, delta: number): string {
      const d = parseISO(iso);
      d.setDate(d.getDate() + delta);
      return d.toISOString().slice(0, 10);
    }

    function sleepForSession(sessDate: string): SleepLog | null {
      for (const d of [sessDate, addDaysIso(sessDate, -1), addDaysIso(sessDate, 1)]) {
        const sl = sleepByDate.get(d);
        if (
          sl
          && Math.abs(differenceInCalendarDays(parseISO(sl.date), parseISO(sessDate))) <= 1
        ) {
          return sl;
        }
      }
      return null;
    }

    const lowSleep: number[] = [];
    const highSleep: number[] = [];
    const highStress: number[] = [];
    const lowMot: number[] = [];

    for (const s of sessionsFiltered) {
      const pct = sessionCompletionPct(s.id);
      if (pct == null) continue;

      const sl = sleepForSession(s.date);
      if (sl) {
        if (sl.sleepQuality <= 2) lowSleep.push(pct);
        if (sl.sleepQuality >= 4) highSleep.push(pct);
      }

      const stresses = stressBySessionDay.get(s.date) ?? [];
      if (stresses.some((x) => x.rating === 3)) highStress.push(pct);

      const rx = rxBySession.get(s.id);
      if (rx && rx.motivation <= 2) lowMot.push(pct);
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

    wellnessCorrelations = {
      lowSleepQualitySessionCompletion: { sessions: lowSleep.length, avgCompletionPct: avg(lowSleep) },
      highSleepQualitySessionCompletion: { sessions: highSleep.length, avgCompletionPct: avg(highSleep) },
      highStressSessionCompletion: { sessions: highStress.length, avgCompletionPct: avg(highStress) },
      lowMotivationSessionCompletion: { sessions: lowMot.length, avgCompletionPct: avg(lowMot) },
    };
    if (
      sessionsFiltered.length > 0
      && lowSleep.length === 0
      && highSleep.length === 0
      && highStress.length === 0
      && lowMot.length === 0
    ) {
      sectionNullNotes.wellnessCorrelations =
        'No sessions matched sleep (±1 day), stress (same day), or readiness rules for correlation buckets.';
    }
  }

  // ----- injuryFlags -----
  let injuryFlags: InjuryFlagRow[] | null = null;
  const flags: InjuryFlagRow[] = [];
  const seen = new Set<string>();

  function addFlag(flag: InjuryFlagRow) {
    const key = [
      flag.date,
      flag.sessionId,
      flag.flag,
      flag.affectedSite ?? '',
      flag.liftId ?? '',
      flag.detail,
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    flags.push(flag);
  }

  function isEpisodeActiveOnDate(ep: InjuryEpisode, dateIso: string): boolean {
    const start = ep.startedAt.slice(0, 10);
    const end = ep.endedAt?.slice(0, 10) ?? null;
    if (cmpIsoDate(start, dateIso) > 0) return false;
    if (end && cmpIsoDate(end, dateIso) < 0) return false;
    return true;
  }

  function liftMatchesSite(liftId: string, siteKey: string): boolean {
    const allowed = SITE_TO_LIFT_IDS[siteKey as keyof typeof SITE_TO_LIFT_IDS];
    return Array.isArray(allowed) ? allowed.includes(liftId as never) : false;
  }

  function sitesFromNote(notes: string): Array<keyof typeof SITE_TO_LIFT_IDS> {
    const out = new Set<keyof typeof SITE_TO_LIFT_IDS>();
    for (const k of NOTE_SITE_KEYWORDS) {
      if (!k.re.test(notes)) continue;
      for (const s of k.sites) out.add(s);
    }
    return [...out];
  }

  for (const s of sessionsFiltered) {
    const stype = s.sessionType ?? 'standard';
    const sessionSets = setsInWindow.filter((st) => st.sessionLogId === s.id);

    // Rule 1: injury episodes active on this date only flag lifts that match the site's mapping.
    const activeEpisodes = args.injury_episodes.filter((ep) => isEpisodeActiveOnDate(ep, s.date));
    for (const ep of activeEpisodes) {
      for (const st of sessionSets) {
        if (!liftMatchesSite(st.liftId, ep.siteKey)) continue;
        addFlag({
          date: s.date,
          sessionId: s.id,
          sessionType: stype,
          flag: 'injury_episode',
          affectedSite: ep.siteKey,
          liftId: st.liftId,
          liftName: liftById.get(st.liftId)?.name ?? st.liftId,
          detail: `Active injury episode at ${ep.siteKey} matched lift ${liftById.get(st.liftId)?.name ?? st.liftId}.`,
        });
      }
    }

    // Rule 2: note keywords only flag mapped lifts for implied body sites.
    const notes = s.notes?.trim() ?? '';
    if (notes) {
      const impliedSites = sitesFromNote(notes);
      for (const site of impliedSites) {
        for (const st of sessionSets) {
          if (!liftMatchesSite(st.liftId, site)) continue;
          addFlag({
            date: s.date,
            sessionId: s.id,
            sessionType: stype,
            flag: 'note_keyword',
            affectedSite: site,
            liftId: st.liftId,
            liftName: liftById.get(st.liftId)?.name ?? st.liftId,
            detail: `Session note implied ${site}; mapped lift ${liftById.get(st.liftId)?.name ?? st.liftId} flagged.`,
          });
        }
      }
      // Generic symptoms (without site keywords) are session-level only.
      if (NOTE_SYMPTOM_RE.test(notes) && impliedSites.length === 0) {
        const excerpt = notes.length > 120 ? `${notes.slice(0, 117)}…` : notes;
        addFlag({
          date: s.date,
          sessionId: s.id,
          sessionType: stype,
          flag: 'note_keyword',
          affectedSite: null,
          liftId: null,
          liftName: null,
          detail: excerpt,
        });
      }
    }

    // Rule 3: abbreviated sessions are session-level.
    if (stype === 'abbreviated') {
      addFlag({
        date: s.date,
        sessionId: s.id,
        sessionType: stype,
        flag: 'abbreviated',
        affectedSite: null,
        liftId: null,
        liftName: null,
        detail: 'Session labeled abbreviated.',
      });
    }
    const pct = sessionCompletionPct(s.id);
    if (pct != null && pct < 70) {
      const liftsSkipped = [
        ...new Set(
          setsInWindow
            .filter((st) => st.sessionLogId === s.id && st.status === 'skipped')
            .map((st) => liftById.get(st.liftId)?.name ?? st.liftId),
        ),
      ];
      addFlag({
        date: s.date,
        sessionId: s.id,
        sessionType: stype,
        flag: 'high_skip_rate',
        affectedSite: null,
        liftId: null,
        liftName: null,
        detail:
          liftsSkipped.length > 0
            ? `Completion ${pct.toFixed(0)}%; skipped: ${liftsSkipped.join(', ')}`
            : `Completion ${pct.toFixed(0)}%.`,
      });
    }
  }
  injuryFlags = flags.length ? flags.sort((a, b) => cmpIsoDate(a.date, b.date)) : null;
  if (!injuryFlags) {
    sectionNullNotes.injuryFlags = 'No active injury episodes, mapped note-keyword flags, abbreviated sessions, or low-completion sessions.';
  }

  // ----- mindfulnessAdherence -----
  let mindfulnessAdherence: MindfulnessAdherence | null = null;
  {
    const mt = args.programTargets.find((p) => p.id === 'mindfulness');
    const targetMin = mt?.targetValue != null && Number.isFinite(mt.targetValue) ? mt.targetValue : 0;
    const daysWindow = calendarDaysInclusive(windowStart, windowEnd).length || 1;

    const logsIn = args.mindfulness_logs.filter(
      (m) => cmpIsoDate(m.date, windowStart) >= 0 && cmpIsoDate(m.date, windowEnd) <= 0,
    );
    const minByDay = new Map<string, number>();
    for (const m of logsIn) {
      const dm = m.durationMin ?? 0;
      minByDay.set(m.date, (minByDay.get(m.date) ?? 0) + dm);
    }
    let sumMin = 0;
    let daysHitting = 0;
    let daysLogged = 0;
    for (const d of calendarDaysInclusive(windowStart, windowEnd)) {
      const v = minByDay.get(d) ?? 0;
      if (v > 0) daysLogged += 1;
      sumMin += v;
      if (targetMin > 0 && v >= targetMin) daysHitting += 1;
    }
    const avgMinPerDay = sumMin / daysWindow;
    const adherencePct = targetMin > 0 ? (daysHitting / daysWindow) * 100 : 0;

    if (!mt || targetMin <= 0) {
      sectionNullNotes.mindfulnessAdherence = 'No mindfulness programTarget or target minutes unset.';
      mindfulnessAdherence = null;
    } else {
      mindfulnessAdherence = {
        targetMinPerDay: targetMin,
        avgMinPerDay,
        daysLogged,
        daysHittingTarget: daysHitting,
        adherencePct,
      };
    }
  }

  // ----- liftRecommendations -----
  let liftRecommendations: LiftRecommendation[] | null = null;
  {
    const liftsWithFourWorking = new Set<string>();
    for (const liftId of liftIdsWithSets) {
      const n = setsInWindow.filter(
        (st) =>
          st.liftId === liftId && st.status === 'completed' && intentOf(st) === 'working',
      ).length;
      if (n >= 4) liftsWithFourWorking.add(liftId);
    }

    function targetForLift(liftId: string): number | null {
      const pts = args.programTargets.filter((p) => p.liftId === liftId && p.targetValue != null);
      const oneRm = pts.find((p) => p.metric === '1rm');
      if (oneRm?.targetValue != null) return oneRm.targetValue;
      const ws = pts.find((p) => p.metric === 'working_set');
      return ws?.targetValue ?? null;
    }

    function liftAppearsInInjuryFlags(liftId: string): boolean {
      const sessionsWithLift = new Set(
        setsInWindow.filter((st) => st.liftId === liftId).map((st) => st.sessionLogId),
      );
      return flags.some((f) => sessionsWithLift.has(f.sessionId));
    }

    const recs: LiftRecommendation[] = [];
    const crByLift = new Map(completionRates?.map((r) => [r.liftId, r]) ?? []);

    for (const liftId of liftsWithFourWorking) {
      const lift = liftById.get(liftId);
      const loadScale = lift?.loadScale === 'inverse' ? 'inverse' : 'normal';
      if (loadScale === 'inverse') continue;

      const liftName = lift?.name ?? liftId;
      const cr = crByLift.get(liftId);
      const completionPct = cr?.completionPct ?? 0;
      const vol = volumeProgression?.find((v) => v.liftId === liftId);
      const loadDelta = vol?.loadDelta ?? null;
      const lastLoad = vol?.lastWorkingSetLoad ?? null;
      const targetVal = targetForLift(liftId);

      const monitorReason = completionPct < 70 || liftAppearsInInjuryFlags(liftId);

      let recommendation: LiftRecommendation['recommendation'] = 'hold';
      let rationale = '';

      if (monitorReason) {
        recommendation = 'monitor';
        if (completionPct < 70) {
          rationale = `Skipped or incomplete sets (${completionPct.toFixed(0)}% completion) — monitor before loading.`;
        } else {
          rationale = `Flagged session overlap (${completionPct.toFixed(0)}% completion) — monitor before loading.`;
        }
      } else if (loadDelta != null && loadDelta < 0) {
        recommendation = 'deload';
        rationale = `Working load slipped ${Math.abs(loadDelta)} lb over the meso — prioritize recovery or technique before pushing weight.`;
      } else if (
        completionPct >= 70 &&
        loadDelta === 0 &&
        targetVal != null &&
        lastLoad != null &&
        lastLoad >= targetVal * 0.9
      ) {
        recommendation = 'hold';
        rationale = `Load held flat but near target (${lastLoad} lb vs ${targetVal} lb goal) at ${completionPct.toFixed(0)}% completion — hold and accumulate reps.`;
      } else if (
        completionPct >= 85 &&
        loadDelta != null &&
        loadDelta >= 0 &&
        targetVal != null &&
        lastLoad != null &&
        lastLoad < targetVal * 0.9
      ) {
        recommendation = 'progress';
        const ld = loadDelta ?? 0;
        rationale = `Completed ${completionPct.toFixed(0)}% of sets, load ${ld >= 0 ? `up ${ld}` : 'flat'} lb — progress load next meso.`;
      } else {
        recommendation = 'hold';
        rationale = `Completion ${completionPct.toFixed(0)}%, load delta ${loadDelta ?? 'n/a'} lb — hold pattern next meso.`;
      }

      recs.push({ liftId, liftName, recommendation, rationale });
    }
    liftRecommendations = recs.length ? recs.sort((a, b) => a.liftName.localeCompare(b.liftName)) : null;
    if (!liftRecommendations) {
      sectionNullNotes.liftRecommendations =
        'No lifts with ≥4 completed working sets and normal loadScale in the window.';
    }
  }

  const hasNotes = Object.keys(sectionNullNotes).length > 0;

  return {
    generatedAt,
    windowStart,
    windowEnd,
    volumeProgression,
    targetDeltas,
    completionRates,
    intentBreakdown,
    nutritionAdherence,
    bodyweightTrend,
    wellnessCorrelations,
    injuryFlags,
    mindfulnessAdherence,
    liftRecommendations,
    ...(hasNotes ? { sectionNullNotes } : {}),
  };
}
