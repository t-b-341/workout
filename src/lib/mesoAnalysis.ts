import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { SummaryProgramTarget } from './programExportTargets';
import {
  bodyweightLbForSessionVolume,
  readinessBySessionId,
  strengthVolumeLbForSet,
} from './p1AssistedVolume';
import { isoWeekOf, sortSetsChronologically } from './stats';
import type {
  BodyMeasurementLog,
  BodyweightLog,
  InjuryEpisode,
  Lift,
  NutritionDayType,
  NutritionLog,
  Prescription,
  ReadinessLog,
  SessionLog,
  SetIntent,
  SetLog,
  SleepLog,
  StressLog,
  TemplateId,
} from './types';
import { deriveSessionStatus } from './sessionStatus';
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
  /** Session template whose load-trend sets dominated the window (most load sets; tie → lexicographic id). */
  primaryTemplateId: TemplateId | null;
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
  /** Completed sets logged beyond programmed volume for this lift. */
  extraSets: number;
  completionPct: number;
  skipReasons: string[];
};

export type IntentBreakdown = {
  warmup: number;
  working: number;
  backoff: number;
  max_test: number;
  skipped: number;
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
  /** Same-day readiness check-in for that session: motivation ≥ 4. */
  highMotivationSessionCompletion: WellnessCompletionBucket;
  /** Same-day readiness check-in for that session: motivation ≤ 2. */
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

export type RepRangeComplianceRow = {
  templateId: TemplateId;
  liftId: string;
  liftName: string;
  /** Prescription rep floor for this template + lift (from the prescription rows used by logged sets). */
  prescribedMin: number;
  /** Prescription rep ceiling for this template + lift. */
  prescribedMax: number;
  avgActualReps: number;
  /** Share of completed working sets with reps in [prescribedMin, prescribedMax] per set's prescription. */
  compliancePct: number;
  belowRangeSets: number;
  aboveRangeSets: number;
  note: string | null;
};

/** Waist/abdomen/hips net change across the meso window; deltas only when protocol is comparable. */
export type PrescriptionDivergenceRow = {
  liftId: string;
  liftName: string;
  /** Mean prescribed working weight (lb) across counted sets for this lift. */
  prescribedWeight: number;
  avgActualWeight: number;
  divergenceLb: number;
  divergencePct: number;
  direction: 'over' | 'under';
  sessionsLogged: number;
  /** True when load drift exceeds 10% and seen across ≥2 sessions (update the program sheet). */
  suggestPrescriptionUpdate: boolean;
};

export type BodyMeasurementDeltaSection = {
  /** True only when every row in the window has the same non-null `protocol` string (trimmed). */
  protocolConsistent: boolean;
  /** That shared protocol when consistent; otherwise null. */
  protocol: string | null;
  measurementCount: number;
  firstDate: string | null;
  lastDate: string | null;
  /** First-to-last delta in inches; null when not reliable for trend interpretation. */
  waistDeltaIn: number | null;
  abdomenDeltaIn: number | null;
  hipsDeltaIn: number | null;
  /** Why deltas may be omitted or interpreted cautiously. */
  reliabilityNote: string | null;
};

export type MesoAnalysisSectionKey =
  | 'volumeProgression'
  | 'targetDeltas'
  | 'completionRates'
  | 'intentBreakdown'
  | 'nutritionAdherence'
  | 'bodyweightTrend'
  | 'bodyMeasurementDelta'
  | 'wellnessCorrelations'
  | 'injuryFlags'
  | 'mindfulnessAdherence'
  | 'repRangeCompliance'
  | 'prescriptionDivergence'
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
  bodyMeasurementDelta: BodyMeasurementDeltaSection | null;
  wellnessCorrelations: WellnessCorrelations | null;
  injuryFlags: InjuryFlagRow[] | null;
  mindfulnessAdherence: MindfulnessAdherence | null;
  repRangeCompliance: RepRangeComplianceRow[] | null;
  prescriptionDivergence: PrescriptionDivergenceRow[] | null;
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

/** Sets included in per-template load trend (matches legacy global volumeProgression load series). */
function isLoadTrendSet(s: SetLog): boolean {
  if (s.status !== 'completed') return false;
  const i = intentOf(s);
  return i === 'working' || i === 'backoff';
}

/**
 * Group load-trend sets by session `templateId`, pick the template with the most such sets in the
 * window (tie-break lexicographic template id), then first/last load and delta within that
 * template only (chronological order preserved from `forLiftSorted`).
 */
function primaryTemplateLoadTrend(
  forLiftSorted: SetLog[],
  sessionById: Map<string, SessionLog>,
): {
  primaryTemplateId: TemplateId | null;
  firstWorkingSetLoad: number | null;
  lastWorkingSetLoad: number | null;
  loadDelta: number | null;
} {
  const byTemplate = new Map<TemplateId, SetLog[]>();
  for (const st of forLiftSorted) {
    if (!isLoadTrendSet(st)) continue;
    const sess = sessionById.get(st.sessionLogId);
    if (!sess) continue;
    const tid = sess.templateId;
    const arr = byTemplate.get(tid) ?? [];
    arr.push(st);
    byTemplate.set(tid, arr);
  }

  if (byTemplate.size === 0) {
    return {
      primaryTemplateId: null,
      firstWorkingSetLoad: null,
      lastWorkingSetLoad: null,
      loadDelta: null,
    };
  }

  let primaryTemplateId: TemplateId | null = null;
  let bestCount = -1;
  for (const tid of [...byTemplate.keys()].sort()) {
    const n = byTemplate.get(tid)!.length;
    if (n > bestCount) {
      bestCount = n;
      primaryTemplateId = tid;
    }
  }

  const primarySets = primaryTemplateId ? (byTemplate.get(primaryTemplateId) ?? []) : [];
  const firstW = primarySets[0]?.weight ?? null;
  const lastW = primarySets.length ? primarySets[primarySets.length - 1]!.weight : null;
  const loadDelta =
    firstW != null && lastW != null && Number.isFinite(firstW) && Number.isFinite(lastW)
      ? lastW - firstW
      : null;

  return {
    primaryTemplateId,
    firstWorkingSetLoad: firstW,
    lastWorkingSetLoad: lastW,
    loadDelta,
  };
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
  prescriptions: Array<
    Pick<Prescription, 'id' | 'templateId' | 'liftId' | 'sets' | 'repMin' | 'repMax' | 'weight'>
  >;
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
  body_measurement_logs: BodyMeasurementLog[];
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
      bodyMeasurementDelta: null,
      wellnessCorrelations: null,
      injuryFlags: null,
      mindfulnessAdherence: null,
      repRangeCompliance: null,
      prescriptionDivergence: null,
      liftRecommendations: null,
      sectionNullNotes: {
        volumeProgression: 'No session_logs — cannot determine analysis window.',
        targetDeltas: 'No session_logs — cannot determine analysis window.',
        completionRates: 'No session_logs — cannot determine analysis window.',
        intentBreakdown: 'No session_logs — cannot determine analysis window.',
        nutritionAdherence: 'No session_logs — cannot determine analysis window.',
        bodyweightTrend: 'No session_logs — cannot determine analysis window.',
        bodyMeasurementDelta: 'No session_logs — cannot determine analysis window.',
        wellnessCorrelations: 'No session_logs — cannot determine analysis window.',
        injuryFlags: 'No session_logs — cannot determine analysis window.',
        mindfulnessAdherence: 'No session_logs — cannot determine analysis window.',
        repRangeCompliance: 'No session_logs — cannot determine analysis window.',
        prescriptionDivergence: 'No session_logs — cannot determine analysis window.',
        liftRecommendations: 'No session_logs — cannot determine analysis window.',
      },
    };
  }

  const { windowStart, windowEnd } = win;

  const sessionInWindow = (s: SessionLog) =>
    cmpIsoDate(s.date, windowStart) >= 0 && cmpIsoDate(s.date, windowEnd) <= 0;

  const sessionsFiltered = args.session_logs.filter(sessionInWindow);
  const sessionById = new Map(args.session_logs.map((s) => [s.id, s]));

  const setsBySessionId = new Map<string, SetLog[]>();
  for (const st of args.set_logs) {
    const sess = sessionById.get(st.sessionLogId);
    if (!sess || !sessionInWindow(sess)) continue;
    const arr = setsBySessionId.get(st.sessionLogId) ?? [];
    arr.push(st);
    setsBySessionId.set(st.sessionLogId, arr);
  }

  const sessionsAnalytical = sessionsFiltered.filter((sess) => {
    const sets = setsBySessionId.get(sess.id) ?? [];
    return (
      deriveSessionStatus(sess, args.prescriptions as Prescription[], sets) !== 'ghost'
      && sess.sessionType !== 'opportunistic'
    );
  });

  const sessionIds = new Set(sessionsAnalytical.map((s) => s.id));
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
    const sortedSets = sortSetsChronologically(setsInWindow, sessionsAnalytical);

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

      const trend = primaryTemplateLoadTrend(forLift, sessionById);

      rows.push({
        liftId,
        liftName,
        weeklyVolumeByWeek,
        primaryTemplateId: trend.primaryTemplateId,
        firstWorkingSetLoad: trend.firstWorkingSetLoad,
        lastWorkingSetLoad: trend.lastWorkingSetLoad,
        loadDelta: trend.loadDelta,
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

  for (const s of sessionsAnalytical) {
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
    const cur = completionMap.get(st.liftId);
    // Unscheduled lift (no programmed sets in the meso window): exclude from completionRates.
    if (!cur) continue;
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
    if (v.programmed <= 0) continue;
    const extraSets = Math.max(0, v.completed - v.programmed);
    const completionPct = Math.min(100, v.programmed > 0 ? (v.completed / v.programmed) * 100 : 0);
    crRows.push({
      liftId,
      liftName: lift?.name ?? liftId,
      programmedSets: v.programmed,
      completedSets: v.completed,
      skippedSets: v.skipped,
      extraSets,
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
      m = 0,
      sk = 0;
    for (const st of setsInWindow) {
      const i = intentOf(st);
      if (i === 'warmup') w += 1;
      else if (i === 'working') wo += 1;
      else if (i === 'backoff') b += 1;
      else if (i === 'max_test') m += 1;
      else if (i === 'skipped') sk += 1;
    }
    const denom = wo + b + m;
    const workingPct = denom > 0 ? (wo / denom) * 100 : 0;
    if (setsInWindow.length === 0) {
      sectionNullNotes.intentBreakdown = 'No set_logs in the analysis window.';
    } else {
      intentBreakdown = { warmup: w, working: wo, backoff: b, max_test: m, skipped: sk, workingPct };
    }
  }

  let repRangeCompliance: RepRangeComplianceRow[] | null = null;
  // ----- repRangeCompliance -----
  {
    const rxById = new Map(args.prescriptions.map((p) => [p.id, p]));
    type RepAgg = {
      templateId: TemplateId;
      liftId: string;
      repMin: number;
      repMax: number;
      sumReps: number;
      n: number;
      within: number;
      below: number;
      above: number;
    };
    /** One row per prescription (template + lift + rep band), keyed by prescription id. */
    const aggByPrescription = new Map<string, RepAgg>();

    for (const st of setsInWindow) {
      if (st.status !== 'completed') continue;
      if (intentOf(st) !== 'working') continue;
      const lift = liftById.get(st.liftId);
      if (!lift || lift.equipment === 'cardio' || lift.equipment === 'time') continue;
      if (lift.loadScale === 'inverse') continue;
      const sess = sessionById.get(st.sessionLogId);
      if (!sess) continue;
      const rx = rxById.get(st.prescriptionId);
      if (!rx || rx.templateId !== sess.templateId || rx.liftId !== st.liftId) continue;
      const repMin = rx.repMin;
      const repMax = rx.repMax;
      const key = st.prescriptionId;
      let a = aggByPrescription.get(key);
      if (!a) {
        a = {
          templateId: rx.templateId,
          liftId: rx.liftId,
          repMin,
          repMax,
          sumReps: 0,
          n: 0,
          within: 0,
          below: 0,
          above: 0,
        };
        aggByPrescription.set(key, a);
      }
      a.n += 1;
      a.sumReps += st.reps;
      if (st.reps < repMin) a.below += 1;
      else if (st.reps > repMax) a.above += 1;
      else a.within += 1;
    }

    const repRows: RepRangeComplianceRow[] = [];
    for (const a of aggByPrescription.values()) {
      if (a.n < 3) continue;
      const liftName = liftById.get(a.liftId)?.name ?? a.liftId;
      const prescribedMin = a.repMin;
      const prescribedMax = a.repMax;
      const avgActualReps = Math.round((a.sumReps / a.n) * 10) / 10;
      const compliancePct = (a.within / a.n) * 100;
      let note: string | null = null;
      if (compliancePct < 70) {
        if (a.below > a.above) {
          note =
            'Consistently below range — consider reducing load or adjusting rep target.';
        } else if (a.above > a.below) {
          note =
            'Often above prescribed reps — consider increasing load or tightening execution.';
        } else {
          note = 'Rep range compliance below 70% — review load and targets.';
        }
      }
      repRows.push({
        templateId: a.templateId,
        liftId: a.liftId,
        liftName,
        prescribedMin,
        prescribedMax,
        avgActualReps,
        compliancePct: Math.round(compliancePct * 10) / 10,
        belowRangeSets: a.below,
        aboveRangeSets: a.above,
        note,
      });
    }
    repRows.sort((a, b) =>
      a.templateId === b.templateId
        ? a.liftName.localeCompare(b.liftName)
        : a.templateId.localeCompare(b.templateId),
    );
    repRangeCompliance = repRows.length ? repRows : null;
    if (!repRangeCompliance) {
      sectionNullNotes.repRangeCompliance =
        'No lifts with ≥3 completed working sets (non-inverse, strength reps) and matching prescriptions in the window.';
    }
  }

  let prescriptionDivergence: PrescriptionDivergenceRow[] | null = null;
  // ----- prescriptionDivergence -----
  {
    const rxByIdDiv = new Map(args.prescriptions.map((p) => [p.id, p]));
    /** All sessions in export (not meso-window filtered) for resolving set → template. */
    const sessionByIdAll = new Map(args.session_logs.map((s) => [s.id, s]));
    type DivAgg = {
      sumActual: number;
      sumPrescribed: number;
      n: number;
      sessions: Set<string>;
    };
    const aggByLift = new Map<string, DivAgg>();

    function resolvePrescriptionForSet(st: SetLog, sess: SessionLog) {
      const direct = rxByIdDiv.get(st.prescriptionId);
      if (direct && direct.templateId === sess.templateId && direct.liftId === st.liftId) {
        return direct;
      }
      return args.prescriptions.find(
        (p) => p.templateId === sess.templateId && p.liftId === st.liftId,
      );
    }

    for (const st of args.set_logs) {
      if (st.status !== 'completed') continue;
      if (intentOf(st) !== 'working') continue;
      const lift = liftById.get(st.liftId);
      if (!lift || lift.equipment === 'cardio' || lift.equipment === 'time') continue;
      if (lift.loadScale === 'inverse') continue;
      const sess = sessionByIdAll.get(st.sessionLogId);
      if (!sess) continue;
      const rx = resolvePrescriptionForSet(st, sess);
      if (!rx) continue;
      const prescribed = rx.weight;
      if (!Number.isFinite(prescribed) || prescribed <= 0) continue;
      if (!Number.isFinite(st.weight)) continue;

      let a = aggByLift.get(st.liftId);
      if (!a) {
        a = { sumActual: 0, sumPrescribed: 0, n: 0, sessions: new Set() };
        aggByLift.set(st.liftId, a);
      }
      a.sumActual += st.weight;
      a.sumPrescribed += prescribed;
      a.n += 1;
      a.sessions.add(st.sessionLogId);
    }

    const divRows: PrescriptionDivergenceRow[] = [];
    for (const [liftId, a] of aggByLift) {
      if (a.n < 1) continue;
      const avgActual = a.sumActual / a.n;
      const avgPrescribed = a.sumPrescribed / a.n;
      const divergenceLb = Math.round((avgActual - avgPrescribed) * 10) / 10;
      const divergencePctRaw =
        avgPrescribed !== 0 ? (divergenceLb / avgPrescribed) * 100 : 0;
      const divergencePct = Math.round(divergencePctRaw * 10) / 10;
      if (Math.abs(divergencePct) <= 10) continue;

      const sessionsLogged = a.sessions.size;
      const liftName = liftById.get(liftId)?.name ?? liftId;
      const suggestPrescriptionUpdate = sessionsLogged >= 2 && Math.abs(divergencePct) > 10;
      divRows.push({
        liftId,
        liftName,
        prescribedWeight: Math.round(avgPrescribed * 10) / 10,
        avgActualWeight: Math.round(avgActual * 10) / 10,
        divergenceLb,
        divergencePct,
        direction: divergenceLb >= 0 ? 'over' : 'under',
        sessionsLogged,
        suggestPrescriptionUpdate,
      });
    }
    divRows.sort((x, y) => x.liftName.localeCompare(y.liftName));
    prescriptionDivergence = divRows.length ? divRows : null;
    if (!prescriptionDivergence) {
      sectionNullNotes.prescriptionDivergence =
        'No lifts where mean actual working weight differs from prescribed by more than 10% across exported sets.';
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

  // ----- bodyMeasurementDelta -----
  let bodyMeasurementDelta: BodyMeasurementDeltaSection | null = null;
  {
    const measures = args.body_measurement_logs
      .filter(
        (m) =>
          cmpIsoDate(m.date, windowStart) >= 0 && cmpIsoDate(m.date, windowEnd) <= 0,
      )
      .sort((a, b) => cmpIsoDate(a.date, b.date));

    if (measures.length === 0) {
      sectionNullNotes.bodyMeasurementDelta =
        'No body_measurement_logs in the analysis window.';
    } else {
      const normalizedProtocols = measures.map((m) => {
        const t = m.protocol?.trim();
        return t ? t : null;
      });
      const allNonNullProtocol = normalizedProtocols.every((p) => p != null);
      const distinct = new Set(normalizedProtocols.filter((p): p is string => p != null));
      const protocolConsistent =
        measures.length > 0 && allNonNullProtocol && distinct.size === 1;
      const protocol = protocolConsistent ? [...distinct][0]! : null;

      const first = measures[0]!;
      const last = measures[measures.length - 1]!;
      const canDelta = protocolConsistent && measures.length >= 2;
      const waistDeltaIn = canDelta ? Math.round((last.waist - first.waist) * 10) / 10 : null;
      const abdomenDeltaIn = canDelta ? Math.round((last.abdomen - first.abdomen) * 10) / 10 : null;
      const hipsDeltaIn = canDelta ? Math.round((last.hips - first.hips) * 10) / 10 : null;

      let reliabilityNote: string | null = null;
      if (!protocolConsistent) {
        reliabilityNote =
          'Circumference deltas are not reported as reliable trends: entries must share the same non-null protocol across this window.';
      } else if (measures.length < 2) {
        reliabilityNote =
          'Only one measurement in this window — trend deltas need at least two logged points.';
      }

      bodyMeasurementDelta = {
        protocolConsistent,
        protocol,
        measurementCount: measures.length,
        firstDate: first.date,
        lastDate: last.date,
        waistDeltaIn,
        abdomenDeltaIn,
        hipsDeltaIn,
        reliabilityNote,
      };
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
    const highMot: number[] = [];
    const lowMot: number[] = [];

    for (const s of sessionsAnalytical) {
      const pct = sessionCompletionPct(s.id);
      if (pct == null) continue;

      const sl = sleepForSession(s.date);
      if (sl) {
        if (sl.sleepQuality <= 2) lowSleep.push(pct);
        if (sl.sleepQuality >= 4) highSleep.push(pct);
      }

      const stresses = stressBySessionDay.get(s.date) ?? [];
      if (stresses.some((x) => x.rating >= 4)) highStress.push(pct);

      const rx = rxBySession.get(s.id);
      if (rx) {
        if (rx.motivation >= 4) highMot.push(pct);
        if (rx.motivation <= 2) lowMot.push(pct);
      }
    }

    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

    wellnessCorrelations = {
      lowSleepQualitySessionCompletion: { sessions: lowSleep.length, avgCompletionPct: avg(lowSleep) },
      highSleepQualitySessionCompletion: { sessions: highSleep.length, avgCompletionPct: avg(highSleep) },
      highStressSessionCompletion: { sessions: highStress.length, avgCompletionPct: avg(highStress) },
      highMotivationSessionCompletion: { sessions: highMot.length, avgCompletionPct: avg(highMot) },
      lowMotivationSessionCompletion: { sessions: lowMot.length, avgCompletionPct: avg(lowMot) },
    };
    if (
      sessionsAnalytical.length > 0
      && lowSleep.length === 0
      && highSleep.length === 0
      && highStress.length === 0
      && highMot.length === 0
      && lowMot.length === 0
    ) {
      sectionNullNotes.wellnessCorrelations =
        'No sessions matched sleep (±1 day), stress (same day), or readiness motivation rules for correlation buckets.';
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

  for (const s of sessionsAnalytical) {
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
    const liftsWithThreeWorking = new Set<string>();
    for (const liftId of liftIdsWithSets) {
      const forLiftSorted = sortSetsChronologically(
        setsInWindow.filter((st) => st.liftId === liftId),
        sessionsAnalytical,
      );
      const trend = primaryTemplateLoadTrend(forLiftSorted, sessionById);
      if (!trend.primaryTemplateId) continue;
      const n = forLiftSorted.filter(
        (st) =>
          st.status === 'completed' &&
          intentOf(st) === 'working' &&
          sessionById.get(st.sessionLogId)?.templateId === trend.primaryTemplateId,
      ).length;
      if (n >= 3) liftsWithThreeWorking.add(liftId);
    }

    function countCompletedWorkingSetsInWindow(liftId: string): number {
      return setsInWindow.filter(
        (st) => st.liftId === liftId && st.status === 'completed' && intentOf(st) === 'working',
      ).length;
    }

    function targetForLift(liftId: string): number | null {
      const pts = args.programTargets.filter((p) => p.liftId === liftId && p.targetValue != null);
      const oneRm = pts.find((p) => p.metric === '1rm');
      if (oneRm?.targetValue != null) return oneRm.targetValue;
      const ws = pts.find((p) => p.metric === 'working_set');
      return ws?.targetValue ?? null;
    }

    /** Injury / note rows that reference this lift directly (not generic session overlap). */
    function liftIdTaggedInInjuryFlags(liftId: string): boolean {
      return flags.some((f) => f.liftId === liftId);
    }

    const recs: LiftRecommendation[] = [];
    const crByLift = new Map(completionRates?.map((r) => [r.liftId, r]) ?? []);

    for (const liftId of liftsWithThreeWorking) {
      const lift = liftById.get(liftId);
      const loadScale = lift?.loadScale === 'inverse' ? 'inverse' : 'normal';
      const liftName = lift?.name ?? liftId;

      if (loadScale === 'inverse') {
        recs.push({
          liftId,
          liftName,
          recommendation: 'monitor',
          rationale:
            'Inverse load scale — monitor load closely relative to prescription.',
        });
        continue;
      }

      if (lift?.equipment === 'cardio' || lift?.equipment === 'time') {
        continue;
      }

      const cr = crByLift.get(liftId);
      const completionPct = cr?.completionPct ?? 0;
      const vol = volumeProgression?.find((v) => v.liftId === liftId);
      const loadDelta = vol?.loadDelta ?? null;
      const lastLoad = vol?.lastWorkingSetLoad ?? null;
      const targetVal = targetForLift(liftId);

      const injuryTagged = liftIdTaggedInInjuryFlags(liftId);
      const monitorReason = completionPct < 70 || injuryTagged;

      let recommendation: LiftRecommendation['recommendation'] = 'hold';
      let rationale = '';

      if (monitorReason) {
        recommendation = 'monitor';
        if (completionPct < 70) {
          rationale = `Skipped or incomplete sets (${completionPct.toFixed(0)}% completion) — monitor before loading.`;
        } else {
          rationale = `Injury pipeline flagged this lift directly — monitor before loading.`;
        }
      } else if (loadDelta != null && loadDelta < 0) {
        recommendation = 'deload';
        rationale = `Working load slipped ${Math.abs(loadDelta)} lb over the meso — prioritize recovery or technique before pushing weight.`;
      } else if (loadDelta === 0 && lastLoad != null) {
        recommendation = 'hold';
        rationale = `Load held flat at ${lastLoad} lb with ${completionPct.toFixed(0)}% completion — maintain load and push rep ceiling before adding weight.`;
      } else if (
        completionPct >= 85 &&
        loadDelta != null &&
        loadDelta > 0 &&
        targetVal != null &&
        lastLoad != null &&
        lastLoad < targetVal * 0.9
      ) {
        recommendation = 'progress';
        rationale = `Completed ${completionPct.toFixed(0)}% of sets, load up ${loadDelta} lb — progress load next meso.`;
      } else {
        recommendation = 'hold';
        if (loadDelta === 0) {
          rationale = `Completion ${completionPct.toFixed(0)}% — maintain load and push rep ceiling before adding weight.`;
        } else {
          rationale = `Completion ${completionPct.toFixed(0)}%, load delta ${loadDelta ?? 'n/a'} lb — hold pattern next meso.`;
        }
      }

      const rrPoor = (repRangeCompliance ?? []).filter(
        (r) => r.liftId === liftId && r.compliancePct < 70,
      );
      if (rrPoor.length > 0) {
        const extra =
          rrPoor
            .map((r) => r.note)
            .filter((n): n is string => Boolean(n && n.length > 0))
            .join(' ') || 'Rep range compliance below 70% on working sets.';
        rationale = `${rationale.trim()} ${extra}`;
      }

      recs.push({ liftId, liftName, recommendation, rationale });
    }

    const monitorLowDataIds = new Set<string>();
    for (const row of completionRates ?? []) {
      if (row.programmedSets < 3) continue;
      if (liftsWithThreeWorking.has(row.liftId)) continue;
      if (countCompletedWorkingSetsInWindow(row.liftId) >= 3) continue;
      monitorLowDataIds.add(row.liftId);
    }
    for (const liftId of monitorLowDataIds) {
      const lift = liftById.get(liftId);
      if (lift?.equipment === 'cardio' || lift?.equipment === 'time') continue;
      const wc = countCompletedWorkingSetsInWindow(liftId);
      const liftName = lift?.name ?? liftId;
      let rationale = `Insufficient completed sets (${wc}) in this window to assess trend — check session completion and intent tagging.`;
      const rrPoorLow = (repRangeCompliance ?? []).filter(
        (r) => r.liftId === liftId && r.compliancePct < 70,
      );
      if (rrPoorLow.length > 0) {
        const extra =
          rrPoorLow
            .map((r) => r.note)
            .filter((n): n is string => Boolean(n && n.length > 0))
            .join(' ') || 'Rep range compliance below 70% on working sets.';
        rationale = `${rationale.trim()} ${extra}`;
      }
      recs.push({
        liftId,
        liftName,
        recommendation: 'monitor',
        rationale,
      });
    }

    liftRecommendations = recs.length ? recs.sort((a, b) => a.liftName.localeCompare(b.liftName)) : null;
    if (!liftRecommendations) {
      sectionNullNotes.liftRecommendations =
        'No lifts with ≥3 prescribed sets in the window, or none met recommendation criteria.';
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
    bodyMeasurementDelta,
    wellnessCorrelations,
    injuryFlags,
    mindfulnessAdherence,
    repRangeCompliance,
    prescriptionDivergence,
    liftRecommendations,
    ...(hasNotes ? { sectionNullNotes } : {}),
  };
}
