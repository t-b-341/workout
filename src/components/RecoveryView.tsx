'use client';

import { useMemo, useState, type ReactNode } from 'react';
import {
  useAllBodyweight,
  useAllInjuryEpisodes,
  useAllNutrition,
  useBodyweightForDate,
  useHydrationForDate,
  useMacroTrendAdvice,
  useMindfulnessForDate,
  useNutritionForDate,
  useAllCardio,
  useSleepForDate,
  useStoicCheckinForDate,
  useStoicMomentsForDate,
  useCaffeineLogsForDate,
  useOralHealthForDate,
  useRelationshipCheckinForDate,
  useStressForDate,
  useTodayPlanTemplateId,
  useTodaySession,
  useReadinessForSession,
  useReadinessForDate,
  useSessionsForDate,
  useAllSessions,
} from '@/lib/hooks';
import {
  averageStressRating,
  buildRecoveryScore,
  compositeWeightsForRecovery,
  recoveryInsufficientDataLine,
  recoveryPlan,
} from '@/lib/recovery';
import {
  BOTTLE_REFILL_OZ_MAX,
  mlToUsFloz,
  patchRecoveryPrefs,
  useRecoveryPrefs,
  usFlozToMl,
  type RecoveryPrefs,
} from '@/lib/recoveryPrefs';
import { kcalFromMacros } from '@/lib/macros';
import { deriveMealMetrics, sortMealTimestamps } from '@/lib/mealTiming';
import { replaceMealTimestampsForDay } from '@/lib/nutritionMealQuick';
import { flushDirty, localDelete, localUpsert } from '@/lib/sync';
import { useSupplementsForDate } from '@/lib/supplements';
import { todayIso } from '@/lib/time';
import type {
  BodyweightLog,
  CaffeineLog,
  HydrationLog,
  InjuryEpisode,
  MindfulnessLog,
  NutritionDayType,
  NutritionLog,
  OralHealthLog,
  ReadinessLog,
  RelationshipCheckin,
  SessionLog,
  SleepLog,
  StoicCheckin,
  StressLog,
} from '@/lib/types';
import { NUTRITION_DAY_TYPES } from '@/lib/types';
import { defaultNutritionDayType } from '@/lib/nutritionDayType';
import { CbtThoughtRecordSheet } from './CbtThoughtRecordSheet';
import { StoicMomentSheet } from './StoicMomentSheet';
import { BodyweightQuickLog } from './BodyweightQuickLog';
import { InjuryTrackingPanel } from './InjuryTrackingPanel';
import { CollapsibleCard } from './CollapsibleCard';
import { MacroTrendCallout } from './MacroTrendCallout';
import { PageHeader } from './SettingsGearLink';
import { PageShell } from './PageShell';
import { SupplementsCard } from './SupplementsCard';
import { MindfulnessEntriesSection } from './MindfulnessEntriesSection';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 1–5 stress check-in scale (Recovery tab). Kept in sync with UI copy only — not persisted. */
const STRESS_RATING_SCALE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'No stress. Normal baseline, nothing notable.',
  2: 'Mild. Minor background load, not affecting function.',
  3: 'Moderate. Noticeable stress, some impact on focus or energy.',
  4: 'High. Significant stressor, affecting sleep, mood, or motivation.',
  5: 'Severe. Acute or crisis-level stress — training load should be considered for reduction.',
};

const STRESS_RATING_ORDER = [1, 2, 3, 4, 5] as const;

const STRESS_LABELS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'No stress',
  2: 'Mild',
  3: 'Moderate',
  4: 'High',
  5: 'Severe',
};

function fmtCheckInTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

function fmtGapMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

type MacroGoal = 'maintenance' | 'deficit' | 'maingain' | 'surplus';
type TrendWindowDays = 7 | 14;

type MacroRecommendation = {
  calories: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  maintenanceEstimate: number;
  weeklyWeightChangeLb: number | null;
  reason: string;
};

function buildTodayPerformanceRecommendations(input: {
  sleepHours?: number;
  /** Previous calendar day’s nutrition — same lagging signal as the recovery composite. */
  nutritionLagged?: NutritionLog;
  stress?: StressLog[];
}): string[] {
  const out: string[] = [];

  if (input.sleepHours != null && input.sleepHours < 9) {
    out.push('Sleep earlier tonight so total sleep is at least 9 hours.');
  }

  const n = input.nutritionLagged;
  if (n) {
    const low: string[] = [];
    const calT = kcalFromMacros(n.proteinTargetG, n.carbsTargetG, n.fatTargetG);
    const calA = kcalFromMacros(n.proteinActualG, n.carbsActualG, n.fatActualG);
    if (calA < calT) low.push('calories');
    if (n.proteinActualG < n.proteinTargetG) low.push('protein');
    if (n.carbsActualG < n.carbsTargetG) low.push('carbs');
    if (n.fatActualG < n.fatTargetG) low.push('fats');
    if (low.length > 0) {
      out.push(`Yesterday was below target on ${low.join(', ')} — prioritize those today.`);
    }
  }

  const loggedStress = input.stress ?? [];
  const stressAverage = loggedStress.length > 0 ? averageStressRating(loggedStress) : null;
  const stressHigh = loggedStress.some((x) => x.rating >= 4) || (stressAverage != null && stressAverage >= 4);
  if (loggedStress.length > 0 && stressHigh) {
    out.push('Focus on stress reduction now: 10-minute walk + slow exhale breathing, then lower training-day friction.');
  }

  return out;
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function roundTo5(n: number): number {
  return Math.round(n / 5) * 5;
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function recommendMacroTargets(opts: {
  goal: MacroGoal;
  windowDays: TrendWindowDays;
  today: string;
  bodyweights: { date: string; bodyweight: number }[];
  nutritionLogs: NutritionLog[];
  fallbackCalories: number;
}): MacroRecommendation {
  const { goal, windowDays, today, bodyweights, nutritionLogs, fallbackCalories } = opts;
  const recentStart = addDaysIso(today, -(windowDays - 1));
  const priorStart = addDaysIso(today, -(windowDays * 2 - 1));
  const priorEnd = addDaysIso(today, -windowDays);

  const recentWeights = bodyweights
    .filter((x) => x.date >= recentStart && x.date <= today)
    .map((x) => x.bodyweight);
  const priorWeights = bodyweights
    .filter((x) => x.date >= priorStart && x.date <= priorEnd)
    .map((x) => x.bodyweight);

  const recentAvg = avg(recentWeights);
  const priorAvg = avg(priorWeights);
  const weeklyWeightChangeLb =
    recentAvg != null && priorAvg != null
      ? ((recentAvg - priorAvg) / windowDays) * 7
      : null;

  const nutritionStart = addDaysIso(today, -13);
  const recentActualCalories = nutritionLogs
    .filter((x) => x.date >= nutritionStart && x.date <= today)
    .map((x) => {
      const fromMacros = kcalFromMacros(x.proteinActualG, x.carbsActualG, x.fatActualG);
      return fromMacros > 0 ? fromMacros : x.caloriesActual;
    })
    .filter((kcal) => kcal > 0);
  const observedMaintenance = avg(recentActualCalories);
  const baselineMaintenance = observedMaintenance ?? fallbackCalories;

  let trendAdjustment = 0;
  if (weeklyWeightChangeLb != null) {
    if (weeklyWeightChangeLb > 0.6) trendAdjustment = -150;
    else if (weeklyWeightChangeLb < -0.6) trendAdjustment = 150;
  }
  const maintenanceEstimate = roundTo5(clamp(baselineMaintenance + trendAdjustment, 1400, 6000));

  const goalDelta =
    goal === 'deficit' ? -400
      : goal === 'maingain' ? 150
      : goal === 'surplus' ? 300
      : 0;
  const calories = roundTo5(clamp(maintenanceEstimate + goalDelta, 1400, 6000));
  const proteinG =
    goal === 'deficit' ? 200
      : goal === 'surplus' ? 180
      : goal === 'maingain' ? 185
      : 190;
  const fatG = 75;
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));
  const caloriesTotal = kcalFromMacros(proteinG, carbsG, fatG);

  const trendText =
    weeklyWeightChangeLb == null
      ? `Need 2 windows (${windowDays}d + prior ${windowDays}d) for trend precision.`
      : `Weight trend: ${weeklyWeightChangeLb >= 0 ? '+' : ''}${weeklyWeightChangeLb.toFixed(2)} lb/week.`;
  const reason = `${trendText} Goal set to ${goal}; protein ${proteinG}g, fat ~${fatG}g, carbs fill remaining calories.`;

  return {
    calories: caloriesTotal,
    proteinG,
    fatG,
    carbsG,
    maintenanceEstimate,
    weeklyWeightChangeLb,
    reason,
  };
}

function pctWeightLabel(decimal: number): string {
  return `${Math.round(decimal * 100)}%`;
}

function DailyRecoveryExplainSheet({
  open,
  onClose,
  weights,
}: {
  open: boolean;
  onClose: () => void;
  weights: ReturnType<typeof compositeWeightsForRecovery>;
}) {
  if (!open) return null;

  const lines: Array<{ title: string; pct: number }> = [
    { title: 'Sleep', pct: weights.sleep },
    { title: 'Hydration (yesterday)', pct: weights.hydration },
    { title: 'Nutrition (yesterday)', pct: weights.nutrition },
    { title: 'Readiness', pct: weights.readiness },
  ];
  if (weights.stress != null) lines.push({ title: "Stress (avg of today's check-ins)", pct: weights.stress });
  if (weights.mindfulness != null) lines.push({ title: 'Mindfulness', pct: weights.mindfulness });

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button
        type="button"
        aria-label="Close explanation"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="daily-recovery-help-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(88dvh,640px)] flex flex-col mb-14 sm:mb-0"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0 flex items-start justify-between gap-2">
          <h2 id="daily-recovery-help-title" className="text-lg font-semibold text-zinc-100 pr-2">
            How Daily Recovery is calculated
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 h-9 px-3 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            Close
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-5 text-sm text-zinc-300">
          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500">Overall score</h3>
            <p className="text-zinc-400">
              The big number is a <span className="text-zinc-200">weighted average</span> of pillar scores (each 0–100),
              rounded to an integer.
            </p>
            <ul className="list-disc list-inside space-y-1 text-zinc-400">
              {lines.map((ln) => (
                <li key={ln.title}>
                  <span className="text-zinc-200">{ln.title}</span> ·{' '}
                  <span className="font-mono text-zinc-300">{pctWeightLabel(ln.pct)}</span> of the composite
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-500">
              Stress only gets a slot after at least one stress check-in today. Mindfulness only counts after at least one
              mindfulness entry today (timed or time-only). Otherwise those weights shift into the other pillars (see row
              above). If sleep, hydration, nutrition, or readiness has no log, that pillar is left out and the remaining
              weights are rescaled so they still sum to 100%.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500">Bands</h3>
            <p className="text-zinc-400">The named band is thresholds on the composite only:</p>
            <ul className="text-zinc-400 space-y-1 list-disc list-inside">
              <li>
                <span className="text-zinc-200">Push</span> · composite ≥ 85
              </li>
              <li>
                <span className="text-zinc-200">Normal</span> · 70–84
              </li>
              <li>
                <span className="text-zinc-200">Conservative</span> · 50–69
              </li>
              <li>
                <span className="text-zinc-200">Recovery</span> · under 50
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500">Missing logs</h3>
            <p className="text-zinc-400">
              A pillar with no log is left blank. It is not filled in. The composite appears once at least two of sleep,
              readiness, hydration, and nutrition are logged. Hydration and nutrition both use{' '}
              <span className="text-zinc-200">yesterday&apos;s</span> logs.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500">Sleep pillar</h3>
            <ul className="text-zinc-400 space-y-1 list-disc list-inside">
              <li>
                <span className="text-zinc-200">62%</span> duration: 7–10h counts as fully on-track; shorter sleep penalizes;
                slightly long sleep applies a mild taper (not punished as harshly as short sleep).
              </li>
              <li>
                <span className="text-zinc-200">28%</span> subjective sleep quality (1–5 scaled to a 0–100 chunk).
              </li>
              <li>
                <span className="text-zinc-200">10%</span> fragmentation from optional wake count and onset latency — if you leave
                them blank, they don&apos;t hurt the score (neutral).
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500">Hydration pillar</h3>
            <ul className="text-zinc-400 space-y-1 list-disc list-inside">
              <li>
                Uses <span className="text-zinc-200">yesterday&apos;s</span> hydration log (lagging): intake vs that
                day&apos;s target, capped so going past target doesn&apos;t run away (extras above ~120% of target don&apos;t add more).
              </li>
              <li>Small bonus if you flagged electrolytes.</li>
              <li>Urine color (when set) subtracts slightly for darker buckets (dehydration signal).</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500">Nutrition pillar</h3>
            <ul className="text-zinc-400 space-y-1 list-disc list-inside">
              <li>
                Uses <span className="text-zinc-200">yesterday&apos;s</span> nutrition log (lagging): same-day fueling
                doesn&apos;t move this pillar until tomorrow.
              </li>
              <li>Blends macros vs targets — protein carries the most weight, then calories, then carbs and fat (each capped the same way as hydration so modest overshoot doesn’t explode the score).</li>
              <li>Calorie target/actual are derived from your macro targets in that log.</li>
              <li>Tiny bump when meal timing shows at least three eating occasions logged for that day.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500">Readiness pillar</h3>
            <ul className="text-zinc-400 space-y-1 list-disc list-inside">
              <li>Combines Today’s readiness fields: subjective sleep-hours estimate, sleep interruptions, soreness (lower soreness raises the score), and motivation.</li>
              <li>When RMSSD/HRV isn’t skipped and a value exists, we blend that signal in (~20%); otherwise that mixture is readiness answers only.</li>
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500">Stress pillar</h3>
            <p className="text-zinc-400">
              When included, uses the{' '}
              <span className="text-zinc-200">average</span> of all stress ratings you logged today (1 = calm … 5 = very
              stressed), inverted into a higher-is-better 0–100 score.
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs uppercase tracking-wider text-zinc-500">Mindfulness pillar</h3>
            <p className="text-zinc-400">
              When included, uses the sum of duration minutes you logged today (each entry 1–60 min; time-only rows add 0 to
              the minute total but still include the pillar). The composite curve is the same as before — minutes saturate
              around 30 for scoring.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

function formatHours(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatAmount(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function sleepRowSummary(sleep: SleepLog | undefined): string {
  if (!sleep) return 'Not logged';
  return `${formatHours(sleep.sleepHours)} h, quality ${sleep.sleepQuality}`;
}

function napRowSummary(row: ReadinessLog | undefined): string {
  const min = row?.napDurationMin ?? 0;
  if (min <= 0) return 'Not logged';
  if (row?.napTiming === 'late') return `${min} min, after 3pm`;
  if (row?.napTiming === 'early') return `${min} min, before 3pm`;
  return `${min} min`;
}

function reflectionRowSummary(checkin: StoicCheckin | undefined, momentCount: number): string {
  const tension = checkin?.tension.trim();
  if (tension) {
    const one = tension.replace(/\s+/g, ' ');
    return one.length > 48 ? `${one.slice(0, 47)}…` : one;
  }
  if (checkin && (checkin.withinControl.trim() || checkin.intention.trim())) return 'Logged';
  if (momentCount > 0) return momentCount === 1 ? '1 moment' : `${momentCount} moments`;
  return 'Not logged';
}

function ateRowSummary(log: NutritionLog | undefined): string {
  const stamped = log?.mealTimestamps?.length;
  const n = stamped != null ? stamped : (log?.mealsLoggedCount ?? 0);
  if (n <= 0) return 'Not logged';
  return n === 1 ? '1 meal' : `${n} meals`;
}

function hydrationRowSummary(log: HydrationLog | undefined): string {
  if (!log || log.waterActualMl <= 0) return 'Not logged';
  return `${formatAmount(mlToUsFloz(log.waterActualMl))} oz`;
}

function nutritionRowSummary(log: NutritionLog | undefined): string {
  if (!log) return 'Not logged';
  const fromMacros = kcalFromMacros(log.proteinActualG, log.carbsActualG, log.fatActualG);
  const kcal = fromMacros > 0 ? fromMacros : log.caloriesActual;
  if (kcal <= 0) return 'Not logged';
  return `${Math.round(kcal)} kcal`;
}

function caffeineRowSummary(logs: CaffeineLog[] | undefined): string {
  const total = (logs ?? []).reduce((sum, row) => sum + row.amountMg, 0);
  if (total <= 0) return 'Not logged';
  return `${total} mg`;
}

function supplementRowSummary(
  row: { zma: boolean; d3k2: boolean; multi: boolean; creatine: boolean } | undefined,
): string {
  if (!row) return 'Not logged';
  const n = [row.zma, row.d3k2, row.multi, row.creatine].filter(Boolean).length;
  if (n === 0) return 'Not logged';
  return `${n} of 4`;
}

function stressRowSummary(entries: StressLog[] | undefined): string {
  const rows = entries ?? [];
  if (rows.length === 0) return 'Not logged';
  const only = rows[0];
  if (rows.length === 1 && only) return `rating ${only.rating}`;
  const avg = averageStressRating(rows);
  return `${rows.length} check-ins, avg ${avg == null ? '—' : avg.toFixed(1)}`;
}

function mindfulnessRowSummary(logs: MindfulnessLog[] | undefined): string {
  const rows = logs ?? [];
  if (rows.length === 0) return 'Not logged';
  const minutes = rows.reduce((sum, row) => sum + (row.durationMin ?? 0), 0);
  if (minutes > 0) return `${minutes} min`;
  return rows.length === 1 ? '1 entry' : `${rows.length} entries`;
}

function relationshipRowSummary(row: RelationshipCheckin | undefined): string {
  if (!row) return 'Not logged';
  return `connection ${row.connectionRating}/5`;
}

function bodyweightRowSummary(row: BodyweightLog | undefined): string {
  if (!row) return 'Not logged';
  return `${formatAmount(row.bodyweight)} lb`;
}

function injuryRowSummary(episodes: InjuryEpisode[] | undefined): string {
  if (!episodes) return '…';
  const sites = new Set(episodes.filter((episode) => !episode.endedAt).map((episode) => episode.siteKey));
  if (sites.size === 0) return 'None active';
  return sites.size === 1 ? '1 active' : `${sites.size} active`;
}

function oralRowSummary(row: OralHealthLog | undefined): string {
  if (!row) return 'Not logged';
  const n = [row.tongueScrape, row.brush, row.floss, row.mouthwash].filter(Boolean).length;
  if (n === 0) return 'Not logged';
  if (n === 4) return 'All done';
  return `${n} of 4`;
}

function CheckinGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h2>
      {children}
    </section>
  );
}

export function RecoveryView() {
  const date = todayIso();
  const [showStoicMoment, setShowStoicMoment] = useState(false);
  const stoicMoments = useStoicMomentsForDate(date);
  const yesterday = addDaysIso(date, -1);
  const prefs = useRecoveryPrefs(); // always defined; live-updates when meta row changes
  const nutrition = useNutritionForDate(date);
  const nutritionLagged = useNutritionForDate(yesterday);
  const hydration = useHydrationForDate(date);
  const hydrationLagged = useHydrationForDate(yesterday);
  const sleep = useSleepForDate(date);
  const stress = useStressForDate(date);
  const mindfulness = useMindfulnessForDate(date);
  const todayPlanTemplateId = useTodayPlanTemplateId();
  const session = useTodaySession(todayPlanTemplateId);
  const readiness = useReadinessForSession(session?.id);
  const yesterdayReadiness = useReadinessForDate(yesterday);
  const napReadiness = useReadinessForDate(date);
  const stoicCheckin = useStoicCheckinForDate(date);
  const caffeineLogs = useCaffeineLogsForDate(date);
  const oralHealth = useOralHealthForDate(date);
  const relationship = useRelationshipCheckinForDate(date);
  const bodyweightToday = useBodyweightForDate(date);
  const injuryEpisodes = useAllInjuryEpisodes();
  const supplementsToday = useSupplementsForDate(date);

  const score = useMemo(
    () =>
      buildRecoveryScore({
        date,
        sleep,
        hydration: hydrationLagged,
        nutrition: nutritionLagged,
        readiness,
        stress: stress ?? [],
        mindfulness: mindfulness ?? [],
        yesterdayReadiness,
      }),
    [date, sleep, hydrationLagged, nutritionLagged, readiness, stress, mindfulness, yesterdayReadiness],
  );
  const plan = useMemo(() => recoveryPlan(score.band), [score.band]);
  const performanceRecommendations = useMemo(
    () => buildTodayPerformanceRecommendations({
      sleepHours: sleep?.sleepHours,
      nutritionLagged,
      stress: stress ?? [],
    }),
    [sleep, nutritionLagged, stress],
  );
  const macroTrend = useMacroTrendAdvice(date);
  const [recoveryHelpOpen, setRecoveryHelpOpen] = useState(false);
  const compositeExplainWeights = useMemo(
    () =>
      compositeWeightsForRecovery(
        (stress?.length ?? 0) > 0,
        (mindfulness?.length ?? 0) > 0 || readiness?.mindfulnessMinutes != null,
      ),
    [stress, mindfulness, readiness?.mindfulnessMinutes],
  );

  return (
    <PageShell className="p-4 space-y-4">
      <PageHeader title="Daily Check-In" />

      <div data-testid="daily-recovery-score" className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="text-xs uppercase tracking-wider text-zinc-500 shrink-0">Daily recovery</div>
          <button
            type="button"
            onClick={() => setRecoveryHelpOpen(true)}
            className="shrink-0 text-xs font-medium text-amber-500 hover:text-amber-400 pb-0.5"
          >
            More
          </button>
        </div>
        <div className="text-3xl font-semibold mt-1">{score.compositeScore == null ? '—' : score.compositeScore}</div>
        {score.band == null ? (
          <div className="text-sm text-zinc-400 mt-1">{recoveryInsufficientDataLine(score)}</div>
        ) : (
          <div className="text-sm text-zinc-400 mt-1">
            Band: <span className="text-zinc-200 capitalize">{score.band}</span>
          </div>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Stat
            label={
              yesterdayReadiness?.napDurationMin != null && yesterdayReadiness.napDurationMin > 0
                ? "Sleep (+ yesterday's nap)"
                : 'Sleep'
            }
            value={score.sleepScore}
          />
          <Stat label="Hydration (yesterday)" value={score.hydrationScore} />
          <Stat label="Nutrition (yesterday)" value={score.nutritionScore} />
          <Stat label="Readiness" value={score.readinessScore} />
          <Stat label="Stress" value={score.stressScore} />
          <Stat label="Mindfulness" value={score.mindfulnessScore} />
        </div>
      </div>

      <DailyRecoveryExplainSheet
        open={recoveryHelpOpen}
        onClose={() => setRecoveryHelpOpen(false)}
        weights={compositeExplainWeights}
      />

      {(performanceRecommendations.length > 0 || plan.band != null) && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
          <div className="text-sm font-medium">Today&apos;s recommendations</div>
          {performanceRecommendations.length > 0 && (
            <div className="space-y-1.5 text-sm text-zinc-300">
              {performanceRecommendations.map((line) => (
                <div key={line}>• {line}</div>
              ))}
            </div>
          )}
          {plan.band != null && (
            <>
              {performanceRecommendations.length > 0 && <div className="border-t border-zinc-800 pt-2" />}
              <div className="text-sm text-zinc-300">{plan.intensityNote}</div>
              <div className="text-sm text-zinc-300">{plan.cardioNote}</div>
              <div className="text-sm text-zinc-300">{plan.nutritionNote}</div>
            </>
          )}
        </div>
      )}

      <MacroTrendCallout advice={macroTrend} title="Fueling trend (days before today)" />

      <CheckinGroup title="Morning">
        <CollapsibleCard sectionId="checkin-sleep" title="Sleep" summary={sleepRowSummary(sleep)}>
          <SleepSection date={date} existing={sleep} />
        </CollapsibleCard>
        <CollapsibleCard sectionId="checkin-nap" title="Nap" summary={napRowSummary(napReadiness)}>
          <NapQuickLogCard date={date} />
        </CollapsibleCard>
        <CollapsibleCard
          sectionId="checkin-reflection"
          title="Morning reflection"
          summary={reflectionRowSummary(stoicCheckin, stoicMoments?.length ?? 0)}
        >
          <StoicCheckinCard
            date={date}
            momentCount={stoicMoments?.length ?? 0}
            onQuickMoment={() => setShowStoicMoment(true)}
          />
        </CollapsibleCard>
      </CheckinGroup>

      <CheckinGroup title="Intake">
        <CollapsibleCard sectionId="checkin-ate" title="Did you eat?" summary={ateRowSummary(nutrition)}>
          <DidYouEatQuickSection date={date} existing={nutrition} prefs={prefs} />
        </CollapsibleCard>
        <CollapsibleCard sectionId="checkin-hydration" title="Hydration" summary={hydrationRowSummary(hydration)}>
          <HydrationSection date={date} existing={hydration} prefs={prefs} />
        </CollapsibleCard>
        <CollapsibleCard sectionId="checkin-nutrition" title="Nutrition & macros" summary={nutritionRowSummary(nutrition)}>
          <NutritionSection date={date} existing={nutrition} prefs={prefs} />
        </CollapsibleCard>
        <CollapsibleCard sectionId="checkin-caffeine" title="Caffeine" summary={caffeineRowSummary(caffeineLogs)}>
          <CaffeineCard date={date} />
        </CollapsibleCard>
        <CollapsibleCard sectionId="checkin-supplements" title="Supplements" summary={supplementRowSummary(supplementsToday)}>
          <SupplementsCard date={date} />
        </CollapsibleCard>
      </CheckinGroup>

      <CheckinGroup title="Mind">
        <CollapsibleCard sectionId="checkin-stress" title="Stress check" summary={stressRowSummary(stress)}>
          <StressSection date={date} entries={stress ?? []} />
        </CollapsibleCard>
        <CollapsibleCard
          sectionId="checkin-mindfulness"
          title="Meditation / mindfulness"
          summary={mindfulnessRowSummary(mindfulness)}
        >
          <MindfulnessEntriesSection date={date} />
        </CollapsibleCard>
        <CollapsibleCard
          sectionId="checkin-relationship"
          title="Relationship"
          summary={relationshipRowSummary(relationship)}
        >
          <RelationshipCheckinCard date={date} />
        </CollapsibleCard>
      </CheckinGroup>

      <CheckinGroup title="Body">
        <CollapsibleCard sectionId="checkin-bodyweight" title="Bodyweight" summary={bodyweightRowSummary(bodyweightToday)}>
          <BodyweightQuickLog date={date} />
        </CollapsibleCard>
        <CollapsibleCard sectionId="checkin-injuries" title="Current injuries & body state" summary={injuryRowSummary(injuryEpisodes)}>
          <InjuryTrackingPanel />
        </CollapsibleCard>
        <CollapsibleCard sectionId="checkin-oral" title="Oral health" summary={oralRowSummary(oralHealth)}>
          <OralHealthCard date={date} />
        </CollapsibleCard>
      </CheckinGroup>

      {showStoicMoment && (
        <StoicMomentSheet
          date={date}
          onClose={() => setShowStoicMoment(false)}
        />
      )}
    </PageShell>
  );
}

function DidYouEatQuickSection({
  date,
  existing,
  prefs,
}: {
  date: string;
  existing: NutritionLog | undefined;
  prefs: RecoveryPrefs;
}) {
  const meals = sortMealTimestamps(existing?.mealTimestamps ?? []);

  async function logAteNow() {
    const next = [...meals, new Date().toISOString()];
    await replaceMealTimestampsForDay(date, prefs, next);
    await flushDirty().catch(() => {});
  }

  async function removeMeal(iso: string) {
    await replaceMealTimestampsForDay(
      date,
      prefs,
      meals.filter((x) => x !== iso),
    );
    await flushDirty().catch(() => {});
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">Did you eat?</div>
        <p className="text-xs text-zinc-500 mt-1">
          Tap Yes when you eat; each tap saves a timestamp. Use Remove to delete a line.
        </p>
      </div>
      {existing && existing.mealsLoggedCount > 0 && existing.mealTimestamps === undefined && (
        <p className="text-[11px] text-zinc-500">
          Earlier entry used manual meal count ({existing.mealsLoggedCount}). Add check-ins here to track times.
        </p>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          className="h-10 px-4 rounded-lg bg-emerald-600 text-zinc-950 text-sm font-medium"
          onClick={() => void logAteNow()}
        >
          Yes — log time
        </button>
        <span className="text-xs text-zinc-600 px-1" title="No — nothing is recorded">
          No — nothing saved
        </span>
      </div>
      {meals.length > 0 && (
        <ul className="space-y-1.5">
          {meals.map((iso, idx) => (
            <li
              key={`${iso}-${idx}`}
              className="flex items-center justify-between gap-2 text-xs font-mono text-zinc-300 rounded-lg bg-zinc-950 px-2 py-1.5 border border-zinc-800"
            >
              <span>{fmtCheckInTimestamp(iso)}</span>
              <button
                type="button"
                className="text-zinc-500 hover:text-rose-400 text-[11px] shrink-0"
                onClick={() => void removeMeal(iso)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const ORAL_ITEMS = [
  {
    key: 'tongueScrape' as const,
    label: 'Tongue scrape',
    hint: 'Morning — removes overnight bacteria',
  },
  {
    key: 'brush' as const,
    label: 'Brush',
    hint: '2 min, soft bristle',
  },
  {
    key: 'floss' as const,
    label: 'Floss',
    hint: 'Before brushing ideally',
  },
  {
    key: 'mouthwash' as const,
    label: 'Mouthwash',
    hint: '30 min gap from brushing',
  },
];

function OralHealthCard({ date }: { date: string }) {
  const existing = useOralHealthForDate(date);
  const state = {
    tongueScrape: existing?.tongueScrape ?? false,
    brush: existing?.brush ?? false,
    floss: existing?.floss ?? false,
    mouthwash: existing?.mouthwash ?? false,
  };

  const allDone = state.tongueScrape && state.brush
    && state.floss && state.mouthwash;

  async function toggle(
    key: keyof typeof state,
  ) {
    const next = { ...state, [key]: !state[key] };
    const allD = next.tongueScrape && next.brush
      && next.floss && next.mouthwash;
    await localUpsert('oral_health_logs', {
      id: `oral-${date}`,
      date,
      ...next,
      allDone: allD,
      updatedAt: new Date().toISOString(),
    });
    await flushDirty().catch(() => {});
  }

  return (
    <div className="rounded-2xl border border-zinc-800
      bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide
            text-zinc-500">Oral health</div>
          <div className="text-sm font-medium text-zinc-200">
            Daily routine
          </div>
        </div>
        {allDone && (
          <span className="text-[10px] text-emerald-400
            border border-emerald-800/40 rounded-full
            px-2 py-0.5">
            All done ✓
          </span>
        )}
      </div>
      <div className="space-y-2">
        {ORAL_ITEMS.map(({ key, label, hint }) => (
          <button
            key={key}
            type="button"
            onClick={() => void toggle(key)}
            className={`w-full flex items-center gap-3
              rounded-xl px-3 py-2.5 border transition-colors
              text-left ${
              state[key]
                ? 'border-emerald-800/50 bg-emerald-950/20'
                : 'border-zinc-800 bg-zinc-900/50'
            }`}
          >
            <div className={`h-4 w-4 rounded border
              flex items-center justify-center shrink-0 ${
              state[key]
                ? 'bg-emerald-600 border-emerald-500'
                : 'border-zinc-600'
            }`}>
              {state[key] && (
                <span className="text-[10px] text-white">✓</span>
              )}
            </div>
            <div>
              <div className={`text-xs font-medium ${
                state[key] ? 'text-emerald-300' : 'text-zinc-300'
              }`}>{label}</div>
              <div className="text-[10px] text-zinc-600">
                {hint}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CaffeineCard({ date }: { date: string }) {
  const logs = useCaffeineLogsForDate(date);
  const [busy, setBusy] = useState(false);

  const totalMg = (logs ?? []).reduce(
    (sum, l) => sum + l.amountMg, 0,
  );

  async function logPiece(pieces: number) {
    setBusy(true);
    try {
      await localUpsert('caffeine_logs', {
        id: `caff-${date}-${Date.now()}`,
        date,
        loggedAt: new Date().toISOString(),
        amountMg: 125 * pieces,
        pieces,
        updatedAt: new Date().toISOString(),
      });
      await flushDirty().catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-800
      bg-zinc-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide
            text-zinc-500">Caffeine</div>
          <div className="text-sm font-medium text-zinc-200">
            {totalMg > 0
              ? `${totalMg}mg today`
              : 'None logged'}
          </div>
        </div>
        {totalMg >= 400 && (
          <span className="text-[10px] text-amber-400
            border border-amber-800/40 rounded-full px-2 py-0.5">
            ≥400mg
          </span>
        )}
      </div>

      <div className="flex gap-2">
        {[1, 2, 3].map(n => (
          <button
            key={n}
            type="button"
            disabled={busy}
            onClick={() => void logPiece(n)}
            className="flex-1 h-9 rounded-xl bg-zinc-800
              border border-zinc-700 text-xs text-zinc-300
              hover:bg-zinc-700 transition-colors
              disabled:opacity-50"
          >
            +{n} ({n * 125}mg)
          </button>
        ))}
      </div>

      {(logs ?? []).length > 0 && (
        <div className="space-y-1">
          {logs!.map(l => (
            <div key={l.id}
              className="flex items-center justify-between
              text-xs text-zinc-500">
              <span>
                {new Date(l.loggedAt).toLocaleTimeString(
                  [], { hour: '2-digit', minute: '2-digit' },
                )} — {l.pieces} piece{l.pieces > 1 ? 's' : ''}
              </span>
              <span className="font-mono">{l.amountMg}mg</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StoicCheckinCard({
  date,
  momentCount = 0,
  onQuickMoment,
}: {
  date: string;
  momentCount?: number;
  onQuickMoment?: () => void;
}) {
  const existing = useStoicCheckinForDate(date);
  const [open, setOpen] = useState(false);
  const [tension, setTension] = useState('');
  const [withinControl, setWithinControl] = useState('');
  const [intention, setIntention] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCbt, setShowCbt] = useState(false);

  function hydrateFromExisting() {
    setTension(existing?.tension ?? '');
    setWithinControl(existing?.withinControl ?? '');
    setIntention(existing?.intention ?? '');
  }

  function openEditor() {
    hydrateFromExisting();
    setOpen(true);
  }

  function closeEditor() {
    setOpen(false);
    hydrateFromExisting();
  }

  const handleSave = async () => {
    setBusy(true);
    try {
      await localUpsert('stoic_checkins', {
        id: `stoic-${date}`,
        date,
        tension,
        withinControl,
        intention,
        updatedAt: new Date().toISOString(),
      });
      await flushDirty().catch(() => {});
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 flex items-center justify-between">
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-zinc-200">Morning reflection</div>
          {existing?.tension ? (
            <div className="text-xs text-zinc-500 truncate max-w-[220px]">{existing.tension}</div>
          ) : (
            <div className="text-xs text-zinc-600">What&apos;s within your control today?</div>
          )}
          {momentCount > 0 && (
            <div className="text-[10px] text-zinc-600 mt-1">
              {momentCount} moment{momentCount > 1 ? 's' : ''} today
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            onClick={openEditor}
            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
              existing?.tension
                ? 'border-zinc-700 text-zinc-400 hover:text-zinc-200'
                : 'border-amber-600 text-amber-400 hover:bg-amber-600 hover:text-zinc-950'
            }`}
          >
            {existing?.tension ? 'Edit' : 'Reflect'}
          </button>
          {onQuickMoment && (
            <button
              type="button"
              onClick={onQuickMoment}
              className="text-[10px] text-zinc-600 hover:text-amber-400 transition-colors"
            >
              + Quick moment
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-200">Morning reflection</div>
        <button
          type="button"
          onClick={closeEditor}
          className="text-zinc-600 hover:text-zinc-400 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {[
        {
          label: "What's creating tension?",
          value: tension,
          set: setTension,
          placeholder: 'What situation or thought is weighing on you?',
        },
        {
          label: "What's within your control?",
          value: withinControl,
          set: setWithinControl,
          placeholder: 'Your choices, responses, effort, attention...',
        },
        {
          label: 'One action today',
          value: intention,
          set: setIntention,
          placeholder: 'One specific thing you can do within your control',
        },
      ].map(({ label, value, set, placeholder }) => (
        <div key={label} className="space-y-1.5">
          <label className="text-xs text-zinc-400">{label}</label>
          <textarea
            value={value}
            onChange={(e) => set(e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
          />
        </div>
      ))}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy || (!tension && !withinControl && !intention)}
        className="w-full h-10 rounded-xl bg-amber-600 text-zinc-950 text-sm font-medium disabled:opacity-40 hover:bg-amber-500 transition-colors"
      >
        {busy ? 'Saving…' : 'Save reflection'}
      </button>

      <button
        type="button"
        onClick={() => setShowCbt(true)}
        className="text-xs text-zinc-500 hover:text-amber-400"
      >
        Log a thought record with this reflection →
      </button>

      {showCbt && (
        <CbtThoughtRecordSheet
          date={date}
          onClose={() => setShowCbt(false)}
        />
      )}
    </div>
  );
}

function RelationshipCheckinCard({ date }: { date: string }) {
  const existing = useRelationshipCheckinForDate(date);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [moodState, setMoodState] = useState<number | null>(null);
  const [anxietyLevel, setAnxietyLevel] = useState<number | null>(null);
  const [connectionRating, setConnectionRating] = useState<number | null>(null);
  const [turnedToward, setTurnedToward] = useState<boolean | null>(null);
  const [expressedAppreciation, setExpressedAppreciation] = useState<boolean | null>(null);
  const [physicalAffection, setPhysicalAffection] = useState<boolean | null>(null);
  const [showHorsemen, setShowHorsemen] = useState(false);
  const [usedCriticism, setUsedCriticism] = useState<boolean | null>(null);
  const [feltContempt, setFeltContempt] = useState<boolean | null>(null);
  const [wasDefensive, setWasDefensive] = useState<boolean | null>(null);
  const [stonewalled, setStonewalled] = useState<boolean | null>(null);
  const [horsemenNote, setHorsemenNote] = useState('');
  const [partnerSeemedDistressed, setPartnerSeemedDistressed] = useState<boolean | null>(null);
  const [respondedWithCalm, setRespondedWithCalm] = useState<boolean | null>(null);
  const [hadConflict, setHadConflict] = useState<boolean | null>(null);
  const [conflictRepaired, setConflictRepaired] = useState<
    boolean | null | undefined
  >(undefined);
  const [tookResponsibility, setTookResponsibility] = useState<
    boolean | null | undefined
  >(undefined);
  const [knowsHerInnerWorld, setKnowsHerInnerWorld] = useState<boolean | null>(null);
  const [askedAboutHerWorld, setAskedAboutHerWorld] = useState<boolean | null>(null);
  const [oneThingDifferently, setOneThingDifferently] = useState('');
  const [notes, setNotes] = useState('');
  const [showCbt, setShowCbt] = useState(false);

  const isWeeklyReflectionDay = new Date().getDay() === 0;
  const moodAnchorComplete = moodState != null && anxietyLevel != null;

  function hydrateFromExisting() {
    setMoodState(existing?.moodState ?? null);
    setAnxietyLevel(existing?.anxietyLevel ?? null);
    setConnectionRating(existing?.connectionRating ?? null);
    setTurnedToward(existing?.turnedToward ?? null);
    setExpressedAppreciation(existing?.expressedAppreciation ?? null);
    setPhysicalAffection(existing?.physicalAffection ?? null);
    setShowHorsemen(existing?.horsemenAudited ?? false);
    setUsedCriticism(existing?.usedCriticism ?? null);
    setFeltContempt(existing?.feltContempt ?? null);
    setWasDefensive(existing?.wasDefensive ?? null);
    setStonewalled(existing?.stonewalled ?? null);
    setHorsemenNote(existing?.horsemenNote ?? '');
    setPartnerSeemedDistressed(existing?.partnerSeemedDistressed ?? null);
    setRespondedWithCalm(existing?.respondedWithCalm ?? null);
    setHadConflict(existing?.hadConflict ?? null);
    setConflictRepaired(existing?.conflictRepaired ?? null);
    setTookResponsibility(existing?.tookResponsibility ?? null);
    setKnowsHerInnerWorld(existing?.knowsHerInnerWorld ?? null);
    setAskedAboutHerWorld(existing?.askedAboutHerWorld ?? null);
    setOneThingDifferently(existing?.oneThingDifferently ?? '');
    setNotes(existing?.notes ?? '');
  }

  function openEditor() {
    hydrateFromExisting();
    setOpen(true);
  }

  function closeEditor() {
    setOpen(false);
    hydrateFromExisting();
  }

  async function handleSave() {
    if (!moodAnchorComplete) return;
    setBusy(true);
    try {
      await localUpsert('relationship_checkins', {
        id: `rel-${date}`,
        userId: existing?.userId ?? '',
        date,
        moodState: moodState ?? 3,
        anxietyLevel: anxietyLevel ?? 3,
        connectionRating: connectionRating ?? 3,
        turnedToward,
        expressedAppreciation,
        physicalAffection,
        horsemenAudited: showHorsemen,
        usedCriticism: showHorsemen ? usedCriticism : null,
        feltContempt: showHorsemen ? feltContempt : null,
        wasDefensive: showHorsemen ? wasDefensive : null,
        stonewalled: showHorsemen ? stonewalled : null,
        horsemenNote,
        partnerSeemedDistressed,
        respondedWithCalm,
        hadConflict,
        conflictRepaired: hadConflict ? (conflictRepaired ?? null) : null,
        tookResponsibility: hadConflict ? (tookResponsibility ?? null) : null,
        isWeeklyReflection: isWeeklyReflectionDay,
        knowsHerInnerWorld: isWeeklyReflectionDay ? knowsHerInnerWorld : null,
        askedAboutHerWorld: isWeeklyReflectionDay ? askedAboutHerWorld : null,
        oneThingDifferently: isWeeklyReflectionDay ? oneThingDifferently : '',
        notes,
        updatedAt: new Date().toISOString(),
      });
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div
        className="rounded-2xl border border-zinc-800
          bg-zinc-900 px-4 py-3 flex items-center
          justify-between cursor-pointer"
        onClick={() => openEditor()}
      >
        <div className="space-y-0.5">
          <div className="text-xs uppercase tracking-wide
            text-zinc-500 font-medium">
            Relationship
          </div>
          {existing ? (
            <div className="flex items-center gap-2">
              <div className="flex">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={`text-base ${
                      n <= existing.connectionRating
                        ? 'text-amber-400'
                        : 'text-zinc-700'
                    }`}
                  >
                    ♥
                  </span>
                ))}
              </div>
              {existing.moodState <= 2 && (
                <span className="text-[10px] text-zinc-500">
                  (low mood day)
                </span>
              )}
            </div>
          ) : (
            <div className="text-xs text-zinc-600">
              Log today&apos;s check-in
            </div>
          )}
        </div>
        <span className="text-amber-400 text-sm font-medium">
          {existing ? 'Edit' : 'Log'}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wide text-zinc-500 font-medium">
          Relationship check-in
        </div>
        <button
          type="button"
          onClick={closeEditor}
          className="text-zinc-600 hover:text-zinc-400 text-lg leading-none"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <div className="space-y-3">
        <p className="text-xs text-zinc-500 leading-snug">
          Your mood state gives context to everything below. Low mood and high
          anxiety can make relationships feel more difficult than they are —
          this helps you interpret the data accurately.
        </p>
        <p className="text-xs text-zinc-500 leading-snug">
          Log your mood first — this gives context to everything below.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs text-zinc-400">Mood today</label>
          <div className="flex gap-2">
            {([
              [1, 'Low'],
              [2, 'Down'],
              [3, 'Stable'],
              [4, 'Good'],
              [5, 'Elevated'],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setMoodState(val)}
                className={`flex-1 h-9 rounded-lg text-xs border transition-colors ${
                  moodState === val
                    ? 'bg-amber-600 border-amber-500 text-zinc-950'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {(moodState === 1 || moodState === 5) && (
            <p className="text-[10px] text-zinc-500">
              {moodState === 1
                ? 'Low mood days — relationship perceptions may feel more negative than they are.'
                : 'Elevated mood — positive perceptions may be inflated. Note behaviors, not just feelings.'}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-zinc-400">Anxiety level today</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setAnxietyLevel(n)}
                className={`flex-1 h-9 rounded-lg text-xs border transition-colors font-mono ${
                  anxietyLevel === n
                    ? 'bg-zinc-600 border-zinc-500 text-zinc-100'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      {moodAnchorComplete && (
        <>
          <div className="border-t border-zinc-800" />

          <div className="space-y-4">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Connection today
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">
                How connected did you feel?
              </label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setConnectionRating(n)}
                    className={`flex-1 h-9 rounded-lg text-base transition-colors ${
                      connectionRating === n
                        ? 'text-amber-400 bg-amber-950/30 border border-amber-800/50'
                        : 'text-zinc-600 bg-zinc-800 border border-zinc-700'
                    }`}
                  >
                    ♥
                  </button>
                ))}
              </div>
            </div>

            {[
              {
                key: 'turnedToward',
                val: turnedToward,
                set: setTurnedToward,
                label: 'Did you turn toward her when she reached out?',
                hint: 'Any bid for attention, conversation, or connection',
              },
              {
                key: 'expressedAppreciation',
                val: expressedAppreciation,
                set: setExpressedAppreciation,
                label: 'Did you express appreciation or affection?',
                hint: null,
              },
              {
                key: 'physicalAffection',
                val: physicalAffection,
                set: setPhysicalAffection,
                label: 'Did you make non-sexual physical contact?',
                hint: 'Hug, touch, sitting close — daily physical warmth',
              },
            ].map(({ key, val, set, label, hint }) => (
              <div key={key} className="space-y-1.5">
                <label className="text-xs text-zinc-400">{label}</label>
                {hint && <p className="text-[10px] text-zinc-600">{hint}</p>}
                <div className="flex gap-2">
                  {(['Yes', 'No'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => set(opt === 'Yes')}
                      className={`flex-1 h-9 rounded-lg text-xs border transition-colors ${
                        val === (opt === 'Yes')
                          ? opt === 'Yes'
                            ? 'bg-emerald-800/60 border-emerald-700 text-emerald-200'
                            : 'bg-rose-900/50 border-rose-800 text-rose-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-zinc-800" />

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowHorsemen((h) => !h)}
              className="w-full text-left"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Self-audit (optional)
                </div>
                <span className="text-zinc-600 text-xs">
                  {showHorsemen ? 'Hide ▲' : 'Show ▼'}
                </span>
              </div>
              <p className="text-[10px] text-zinc-600 mt-0.5">
                Four behaviors that predict relationship difficulty. Tracking
                them keeps them visible.
              </p>
            </button>

            {showHorsemen && (
              <div className="space-y-3 border-l-2 border-zinc-800 pl-3">
                {[
                  {
                    key: 'usedCriticism',
                    val: usedCriticism,
                    set: setUsedCriticism,
                    label: 'Did you criticize her?',
                    hint: 'Attacking character rather than addressing a specific behavior',
                  },
                  {
                    key: 'feltContempt',
                    val: feltContempt,
                    set: setFeltContempt,
                    label: 'Did you feel or express contempt?',
                    hint: 'Eye-rolling, mockery, superiority — the most corrosive of the four',
                  },
                  {
                    key: 'wasDefensive',
                    val: wasDefensive,
                    set: setWasDefensive,
                    label: 'Were you defensive when she raised a concern?',
                    hint: 'Counter-attacking or making excuses rather than hearing her',
                  },
                  {
                    key: 'stonewalled',
                    val: stonewalled,
                    set: setStonewalled,
                    label: 'Did you stonewall or shut down?',
                    hint: 'Withdrawing, going silent, emotional absence — often anxiety-driven',
                  },
                ].map(({ key, val, set, label, hint }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs text-zinc-400">{label}</label>
                    <p className="text-[10px] text-zinc-600">{hint}</p>
                    <div className="flex gap-2">
                      {(['Yes', 'No'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => set(opt === 'Yes')}
                          className={`flex-1 h-8 rounded-lg text-xs border transition-colors ${
                            val === (opt === 'Yes')
                              ? opt === 'Yes'
                                ? 'bg-rose-900/50 border-rose-800 text-rose-300'
                                : 'bg-emerald-800/60 border-emerald-700 text-emerald-200'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}

                {(usedCriticism || feltContempt || wasDefensive || stonewalled) && (
                  <div className="space-y-1.5">
                    <label className="text-xs text-amber-400/80">
                      What was happening? What would have been a better response?
                    </label>
                    <textarea
                      value={horsemenNote}
                      onChange={(e) => setHorsemenNote(e.target.value)}
                      rows={2}
                      placeholder="Brief reflection — not judgment, just data..."
                      className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
                    />
                  </div>
                )}

                <div className="pt-1 border-t border-zinc-800/50 space-y-3">
                  <p className="text-[10px] text-zinc-600">
                    Partner-specific questions — distinguishes her distress signals
                    from relationship conflict.
                  </p>
                  {[
                    {
                      key: 'partnerSeemedDistressed',
                      val: partnerSeemedDistressed,
                      set: setPartnerSeemedDistressed,
                      label: 'Did she seem distressed or dysregulated?',
                      hint: 'May be trauma response or mood — not necessarily about you',
                    },
                    {
                      key: 'respondedWithCalm',
                      val: respondedWithCalm,
                      set: setRespondedWithCalm,
                      label: 'Did you respond with calm rather than escalating?',
                      hint: 'Your nervous system regulation is co-regulatory for her',
                    },
                  ].map(({ key, val, set, label, hint }) => (
                    <div key={key} className="space-y-1">
                      <label className="text-xs text-zinc-400">{label}</label>
                      <p className="text-[10px] text-zinc-600">{hint}</p>
                      <div className="flex gap-2">
                        {(['Yes', 'No'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => set(opt === 'Yes')}
                            className={`flex-1 h-8 rounded-lg text-xs border transition-colors ${
                              val === (opt === 'Yes')
                                ? opt === 'Yes'
                                  ? 'bg-emerald-800/60 border-emerald-700 text-emerald-200'
                                  : 'bg-zinc-700 border-zinc-600 text-zinc-300'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-zinc-800" />

          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">
              Conflict
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">
                Was there conflict or tension today?
              </label>
              <div className="flex gap-2">
                {(['Yes', 'No'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setHadConflict(opt === 'Yes')}
                    className={`flex-1 h-9 rounded-lg text-xs border transition-colors ${
                      hadConflict === (opt === 'Yes')
                        ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {hadConflict && (
              <div className="space-y-3 border-l-2 border-zinc-700 pl-3">
                {[
                  {
                    key: 'conflictRepaired',
                    val: conflictRepaired,
                    set: setConflictRepaired,
                    label: 'Was it repaired before end of day?',
                    hint: 'Any gesture to de-escalate counts — repair matters more than the conflict itself',
                  },
                  {
                    key: 'tookResponsibility',
                    val: tookResponsibility,
                    set: setTookResponsibility,
                    label: 'Did you take responsibility for your part?',
                    hint: null,
                  },
                ].map(({ key, val, set, label, hint }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs text-zinc-400">{label}</label>
                    {hint && <p className="text-[10px] text-zinc-600">{hint}</p>}
                    <div className="flex gap-2">
                      {(['Yes', 'No', 'Partially'] as const).map((opt) => {
                        const choice =
                          opt === 'Yes' ? true : opt === 'No' ? false : null;
                        const selected =
                          opt === 'Partially'
                            ? val === null
                            : val === choice;
                        return (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => set(choice)}
                          className={`flex-1 h-8 rounded-lg text-xs border transition-colors ${
                            selected
                              ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                          }`}
                        >
                          {opt}
                        </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isWeeklyReflectionDay && (
            <>
              <div className="border-t border-zinc-800" />
              <div className="space-y-3 border border-zinc-700/50 rounded-xl p-3 bg-zinc-800/30">
                <div className="text-xs uppercase tracking-wide text-zinc-500">
                  Weekly reflection
                </div>
                {[
                  {
                    key: 'knowsHerInnerWorld',
                    val: knowsHerInnerWorld,
                    set: setKnowsHerInnerWorld,
                    label: "Do you know what's weighing on her most right now?",
                    hint: 'Gottman Love Maps — knowing her inner world predicts relationship satisfaction',
                  },
                  {
                    key: 'askedAboutHerWorld',
                    val: askedAboutHerWorld,
                    set: setAskedAboutHerWorld,
                    label: 'Did you ask about something that matters to her this week?',
                    hint: "Her MLIS progress, her health, her goals, what she's reading or thinking about",
                  },
                ].map(({ key, val, set, label, hint }) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs text-zinc-400">{label}</label>
                    <p className="text-[10px] text-zinc-600">{hint}</p>
                    <div className="flex gap-2">
                      {(['Yes', 'No'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => set(opt === 'Yes')}
                          className={`flex-1 h-8 rounded-lg text-xs border transition-colors ${
                            val === (opt === 'Yes')
                              ? 'bg-zinc-700 border-zinc-600 text-zinc-200'
                              : 'bg-zinc-800 border-zinc-700 text-zinc-400'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <div className="space-y-1.5">
                  <label className="text-xs text-zinc-400">
                    One thing I want to do differently next week
                  </label>
                  <textarea
                    value={oneThingDifferently}
                    onChange={(e) => setOneThingDifferently(e.target.value)}
                    rows={2}
                    placeholder="Specific, behavioral, and within your control..."
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Anything else worth capturing briefly..."
              className="w-full rounded-xl bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
            />
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={busy || !moodAnchorComplete}
        className="w-full h-10 rounded-xl bg-amber-600 text-zinc-950 text-sm font-medium disabled:opacity-40 hover:bg-amber-500 transition-colors"
      >
        {busy ? 'Saving…' : 'Save check-in'}
      </button>

      <button
        type="button"
        onClick={() => setShowCbt(true)}
        className="text-xs text-zinc-500 hover:text-amber-400"
      >
        Log a thought record →
      </button>

      {showCbt && (
        <CbtThoughtRecordSheet
          date={date}
          onClose={() => setShowCbt(false)}
        />
      )}
    </div>
  );
}

function NapQuickLogCard({ date }: { date: string }) {
  const existing = useReadinessForDate(date);
  const sessions = useSessionsForDate(date) ?? [];
  const syncKey = `${existing?.id ?? 'none'}|${existing?.napDurationMin ?? 'x'}|${existing?.napTiming ?? 'x'}`;
  return <NapQuickLogCardForm key={syncKey} date={date} existing={existing} sessions={sessions} />;
}

function NapQuickLogCardForm({
  date,
  existing,
  sessions,
}: {
  date: string;
  existing: ReadinessLog | undefined;
  sessions: SessionLog[];
}) {
  const anchorSessionId = existing?.sessionLogId ?? sessions[0]?.id;

  const [duration, setDuration] = useState(existing?.napDurationMin ?? 0);
  const [timing, setTiming] = useState<'early' | 'late'>(existing?.napTiming ?? 'early');

  async function persist(nextDur: number, nextTiming: 'early' | 'late') {
    if (!anchorSessionId) return;
    if (!existing && nextDur <= 0) {
      setDuration(0);
      setTiming('early');
      return;
    }
    setDuration(nextDur);
    setTiming(nextTiming);
    if (existing) {
      const row: ReadinessLog = { ...existing };
      if (nextDur > 0) {
        row.napDurationMin = nextDur;
        row.napTiming = nextTiming;
      } else {
        delete row.napDurationMin;
        delete row.napTiming;
      }
      await localUpsert('readiness_logs', row);
    } else {
      const row: ReadinessLog = {
        id: `readiness-${anchorSessionId}`,
        sessionLogId: anchorSessionId,
        date,
        sleepHours: 8,
        soreness: 2,
        motivation: 3,
        createdAt: new Date().toISOString(),
      };
      if (nextDur > 0) {
        row.napDurationMin = nextDur;
        row.napTiming = nextTiming;
      }
      await localUpsert('readiness_logs', row);
    }
    await flushDirty().catch(() => {});
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-medium">Nap today?</div>
      {!anchorSessionId && (
        <p className="text-xs text-zinc-500">
          Start today&apos;s session from the Today tab first so a readiness row can attach to it.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {[0, 20, 30, 60, 90].map((min) => (
          <button
            key={min}
            type="button"
            disabled={!anchorSessionId}
            onClick={() => void persist(min, min > 0 ? timing : 'early')}
            className={`h-9 px-3 rounded-lg text-xs font-medium border transition-colors disabled:opacity-40 ${
              duration === min
                ? 'bg-amber-600 border-amber-500 text-zinc-950'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300'
            }`}
          >
            {min === 0 ? 'None' : `${min} min`}
          </button>
        ))}
      </div>
      {duration > 0 && (
        <div className="flex flex-wrap gap-2 items-center">
          {(['early', 'late'] as const).map((t) => (
            <button
              key={t}
              type="button"
              disabled={!anchorSessionId}
              onClick={() => void persist(duration, t)}
              className={`h-8 px-3 rounded-lg text-xs border transition-colors disabled:opacity-40 ${
                timing === t
                  ? 'bg-zinc-600 border-zinc-500 text-zinc-100'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}
            >
              {t === 'early' ? 'Before 3pm' : '3pm or later'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StressSection({
  date,
  entries,
}: {
  date: string;
  entries: StressLog[];
}) {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(3);
  const [commentDraft, setCommentDraft] = useState('');
  const [kidsDay, setKidsDay] = useState(false);
  const [workDay, setWorkDay] = useState(false);
  const [showThoughtRecord, setShowThoughtRecord] = useState(false);
  const [thoughtRecordPromptDismissed, setThoughtRecordPromptDismissed] = useState(false);
  const [lastLoggedRating, setLastLoggedRating] = useState(0);
  const [lastSavedStressLogId, setLastSavedStressLogId] = useState<string | null>(null);
  const dayAvg = averageStressRating(entries);
  const highStress =
    entries.some((e) => e.rating >= 4) || (dayAvg != null && dayAvg >= 4);

  function onRatingChange(next: 1 | 2 | 3 | 4 | 5) {
    setRating(next);
    setThoughtRecordPromptDismissed(false);
  }

  async function addCheckIn() {
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `stress-${date}-${crypto.randomUUID()}`
        : `stress-${date}-${Date.now()}`;
    const trimmed = commentDraft.trim();
    await localUpsert('stress_logs', {
      id,
      date,
      loggedAt: new Date().toISOString(),
      rating,
      ...(trimmed ? { comment: trimmed } : {}),
      ...(kidsDay ? { kidsDay: true } : {}),
      ...(workDay ? { workDay: true } : {}),
    });
    await flushDirty().catch(() => {});
    setLastLoggedRating(rating);
    setLastSavedStressLogId(id);
    setCommentDraft('');
    setKidsDay(false);
    setWorkDay(false);
  }

  async function removeEntry(id: string) {
    await localDelete('stress_logs', id, { undoLabel: 'Stress check-in' });
    await flushDirty().catch(() => {});
  }

  const sorted = [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Stress check</div>
          <div className="text-xs text-zinc-500">
            Each entry is a timestamp and a 1–5 rating. Add as many or as few per day as you want.
          </div>
        </div>
        {entries.length > 0 && dayAvg != null && (
          <div className="text-right">
            <div className="text-xs text-zinc-500">Day average</div>
            <div className="font-mono text-zinc-200">{dayAvg.toFixed(2)}</div>
          </div>
        )}
      </div>
      {sorted.length > 0 && (
        <ul className="space-y-2">
          {sorted.map((e) => (
            <li
              key={e.id}
              className="flex items-start justify-between gap-2 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="font-mono text-zinc-300">
                  {fmtCheckInTimestamp(e.loggedAt)} ·{' '}
                  <span className="text-amber-200/90">{e.rating}</span>/5
                  {e.kidsDay && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-sky-400/90">
                      Kids day
                    </span>
                  )}
                  {e.workDay && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-orange-400/90">
                      Work day
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-zinc-500 leading-snug">
                  {STRESS_RATING_SCALE[e.rating]}
                </div>
                {e.comment != null && e.comment.trim() !== '' && (
                  <div className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap break-words">
                    {e.comment}
                  </div>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-rose-300 hover:text-rose-200 shrink-0"
                onClick={() => void removeEntry(e.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div
        className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-1.5"
        aria-label="Stress rating scale reference"
      >
        <div className="text-xs font-medium text-zinc-400">Rating scale</div>
        <ul className="text-[11px] text-zinc-500 space-y-1 leading-snug">
          {STRESS_RATING_ORDER.map((n) => (
            <li key={n} className="flex gap-1.5">
              <span className="font-mono text-zinc-300 shrink-0 w-4 text-right">{n}</span>
              <span className="text-zinc-500">—</span>
              <span>{STRESS_RATING_SCALE[n]}</span>
            </li>
          ))}
        </ul>
      </div>
      <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={kidsDay}
          onChange={(ev) => setKidsDay(ev.target.checked)}
          className="rounded border-zinc-600 bg-zinc-950 accent-amber-500"
        />
        Kids day?
      </label>
      <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer w-fit">
        <input
          type="checkbox"
          checked={workDay}
          onChange={(ev) => setWorkDay(ev.target.checked)}
          className="rounded border-zinc-600 bg-zinc-950 accent-amber-500"
        />
        Work day?
      </label>
      <label className="block text-xs text-zinc-500">
        Comment (optional)
        <textarea
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          rows={2}
          placeholder="Note context for this check-in…"
          className="mt-1 block w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-y min-h-[2.5rem]"
        />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onRatingChange(Math.max(1, rating - 1) as 1 | 2 | 3 | 4 | 5)}
            className="h-9 w-9 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-lg font-medium flex items-center justify-center disabled:opacity-40"
            disabled={rating <= 1}
          >
            −
          </button>
          <div className="text-center min-w-[3rem]">
            <div className="text-2xl font-mono font-semibold text-zinc-100">{rating}</div>
            <div className="text-[10px] text-zinc-500 mt-0.5">{STRESS_LABELS[rating]}</div>
          </div>
          <button
            type="button"
            onClick={() => onRatingChange(Math.min(5, rating + 1) as 1 | 2 | 3 | 4 | 5)}
            className="h-9 w-9 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-lg font-medium flex items-center justify-center disabled:opacity-40"
            disabled={rating >= 5}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className="h-11 px-4 rounded-lg bg-amber-500 text-zinc-950 text-sm font-medium shrink-0"
          onClick={() => void addCheckIn()}
        >
          Log check-in
        </button>
      </div>
      {lastLoggedRating >= 4 && !thoughtRecordPromptDismissed && (
        <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-800/50 px-3 py-2.5 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-400 leading-snug">
            High stress logged. Want to work through what&apos;s driving it?
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setThoughtRecordPromptDismissed(true)}
              className="text-xs text-zinc-600 hover:text-zinc-400"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={() => setShowThoughtRecord(true)}
              className="text-xs text-amber-400 font-medium hover:text-amber-300"
            >
              Log thought
            </button>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setShowThoughtRecord(true)}
        className="text-xs text-zinc-500 hover:text-amber-400 self-start"
      >
        Log a thought record →
      </button>
      {highStress && (
        <div className="rounded-lg border border-amber-500/35 bg-amber-950/30 p-3 text-xs text-amber-100 space-y-1">
          <div className="font-semibold">High stress detected (4+)</div>
          <div>- Take a 10-minute walk outside and breathe through your nose.</div>
          <div>- Do 2 minutes of slow exhales (4s inhale, 6–8s exhale).</div>
          <div>- Reduce stimulant load and hydrate before the next session.</div>
        </div>
      )}
      {showThoughtRecord && (
        <CbtThoughtRecordSheet
          date={date}
          stressLogId={lastSavedStressLogId}
          onClose={() => {
            setShowThoughtRecord(false);
            setThoughtRecordPromptDismissed(true);
          }}
        />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null | undefined }) {
  const missing = value == null;
  return (
    <div className="rounded-lg bg-zinc-950 border border-zinc-800 p-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="font-semibold">{missing ? '—' : value}</div>
      {missing && <div className="text-xs text-zinc-500">Not logged</div>}
    </div>
  );
}

function SleepSection({
  date,
  existing,
}: {
  date: string;
  existing: ReturnType<typeof useSleepForDate>;
}) {
  const formKey = existing?.id ?? `sleep-new-${date}`;
  return <SleepSectionForm key={formKey} date={date} initial={existing} />;
}

function SleepSectionForm({
  date,
  initial,
}: {
  date: string;
  initial: ReturnType<typeof useSleepForDate>;
}) {
  const [hours, setHours] = useState(initial?.sleepHours ?? 8);
  const [qualityStr, setQualityStr] = useState(() =>
    String(initial?.sleepQuality ?? 3),
  );

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-medium">Sleep</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-500">
          Hours
          <input
            className="mt-1 h-11 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3"
            type="number"
            step="0.5"
            value={hours}
            onChange={(e) => setHours(parseFloat(e.target.value || '0'))}
          />
        </label>
        <label className="text-xs text-zinc-500">
          Quality (1–5)
          <input
            className="mt-1 h-11 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={qualityStr}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setQualityStr('');
                return;
              }
              const n = parseInt(raw, 10);
              if (!Number.isFinite(n)) return;
              setQualityStr(String(clamp(n, 1, 5)));
            }}
          />
        </label>
      </div>
      <button
        type="button"
        className="h-11 px-4 rounded-lg bg-zinc-800 text-sm w-full"
        onClick={async () => {
          const h = clamp(Number.isFinite(hours) ? hours : 0, 0, 18);
          const parsed =
            qualityStr.trim() === '' ? NaN : parseInt(qualityStr, 10);
          const q = clamp(
            Math.round(Number.isFinite(parsed) ? parsed : 3),
            1,
            5,
          ) as 1 | 2 | 3 | 4 | 5;
          setHours(h);
          setQualityStr(String(q));
          await localUpsert('sleep_logs', {
            id: `sleep-${date}`,
            date,
            sleepHours: h,
            sleepQuality: q,
          });
          await flushDirty().catch(() => {});
        }}
      >
        Save sleep
      </button>
    </div>
  );
}

const TARGET_PRESETS_OZ = [128, 100, 96, 64] as const;

/**
 * 100% bar width = goal; emerald fills to goal; optional overflow segment for intake over goal.
 */
function GoalProgressBar({
  ratio,
  fillClassName,
  overClassName,
  ariaLabel,
}: {
  ratio: number;
  fillClassName: string;
  overClassName: string;
  ariaLabel: string;
}) {
  const r = Math.max(0, ratio);
  if (r <= 1) {
    return (
      <div
        className="mb-2 h-3 w-full rounded-full bg-zinc-800 overflow-hidden ring-1 ring-zinc-700/60"
        role="img"
        aria-label={ariaLabel}
      >
        <div
          className={`h-full rounded-r-full transition-[width] duration-150 ${fillClassName}`}
          style={{ width: `${r * 100}%` }}
        />
      </div>
    );
  }
  return (
    <div className="mb-2 w-full overflow-x-auto pb-0.5" role="img" aria-label={ariaLabel}>
      <div
        className="flex h-3 min-w-full rounded-full overflow-hidden bg-zinc-800 ring-1 ring-zinc-700/60"
        style={{ width: `${r * 100}%` }}
      >
        <div
          className={`h-full shrink-0 transition-[width] duration-150 ${fillClassName}`}
          style={{ width: `${(1 / r) * 100}%` }}
        />
        <div
          className={`h-full shrink-0 rounded-r-full transition-[width] duration-150 ${overClassName}`}
          style={{ width: `${((r - 1) / r) * 100}%` }}
        />
      </div>
    </div>
  );
}

function HydrationGoalProgressBar({ ratio }: { ratio: number }) {
  const r = Math.max(0, ratio);
  return (
    <GoalProgressBar
      ratio={r}
      fillClassName="bg-emerald-500"
      overClassName="bg-sky-500"
      ariaLabel={`Hydration ${Math.round(r * 100)} percent of daily target`}
    />
  );
}

function MacroGoalProgressBar({ ratio, label }: { ratio: number; label: string }) {
  const r = Math.max(0, ratio);
  return (
    <GoalProgressBar
      ratio={r}
      fillClassName="bg-emerald-500"
      overClassName="bg-rose-600"
      ariaLabel={`${label} ${Math.round(r * 100)} percent of target`}
    />
  );
}

function HydrationSection({
  date,
  existing,
  prefs,
}: {
  date: string;
  existing: HydrationLog | undefined;
  prefs: RecoveryPrefs;
}) {
  const formKey = existing?.id ?? `hydration-new-${date}`;
  return <HydrationSectionForm key={formKey} date={date} existing={existing} prefs={prefs} />;
}

function HydrationSectionForm({
  date,
  existing,
  prefs,
}: {
  date: string;
  existing: HydrationLog | undefined;
  prefs: RecoveryPrefs;
}) {
  const [targetMl, setTargetMl] = useState(
    existing?.waterTargetMl ?? prefs.hydrationTargetMl,
  );
  const [actualMl, setActualMl] = useState(existing?.waterActualMl ?? 0);
  const [electrolytes, setElectrolytes] = useState(existing?.electrolytes ?? false);

  function addOz(oz: number) {
    setActualMl((a) => a + usFlozToMl(oz));
  }

  async function persistPrefsTarget() {
    await patchRecoveryPrefs({ hydrationTargetMl: targetMl });
  }

  const maxActualMl = Math.max(usFlozToMl(192), Math.round(targetMl * 3), actualMl);

  const hydrationRatio = targetMl <= 0 ? 0 : actualMl / targetMl;
  const pctDisplay =
    targetMl <= 0 ? 0 : Math.round(hydrationRatio * 100);

  function targetNearPresetOz(targetMlValue: number, oz: number): boolean {
    return Math.abs(mlToUsFloz(targetMlValue) - oz) < 1;
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-4">
      <div className="text-sm font-medium">Hydration</div>
      <p className="text-xs text-zinc-500">
        Default goal is <span className="text-zinc-400">128 fl oz (1 gal)</span> unless you change it below.
      </p>

      <div>
        <div className="flex justify-between text-xs text-zinc-500 mb-1">
          <span>Daily target</span>
          <span className="font-mono text-zinc-300">
            {mlToUsFloz(targetMl).toFixed(1)} fl oz · {targetMl.toLocaleString()} ml
          </span>
        </div>
        <input
          type="range"
          min={usFlozToMl(48)}
          max={usFlozToMl(256)}
          step={usFlozToMl(8)}
          value={clamp(targetMl, usFlozToMl(48), usFlozToMl(256))}
          onChange={(e) => setTargetMl(Number(e.target.value))}
          className="w-full accent-sky-500"
          aria-label="Daily water target"
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {TARGET_PRESETS_OZ.map((oz) => (
            <button
              key={oz}
              type="button"
              className={`h-8 px-2 rounded-lg text-xs ${
                targetNearPresetOz(targetMl, oz) ? 'bg-sky-700' : 'bg-zinc-800'
              }`}
              onClick={() => setTargetMl(usFlozToMl(oz))}
            >
              {oz} oz
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex justify-between text-xs text-zinc-500 mb-1">
          <span>Today&apos;s intake ({pctDisplay}% of target)</span>
          <span className="font-mono text-zinc-300">
            {mlToUsFloz(actualMl).toFixed(1)} fl oz · {actualMl.toLocaleString()} ml
          </span>
        </div>
        <HydrationGoalProgressBar ratio={hydrationRatio} />
        <input
          type="range"
          min={0}
          max={maxActualMl}
          step={usFlozToMl(2)}
          value={clamp(actualMl, 0, maxActualMl)}
          onChange={(e) => setActualMl(Number(e.target.value))}
          className="w-full accent-emerald-500"
          aria-label="Today's water intake"
        />
      </div>

      <div>
        <div className="text-xs text-zinc-500 mb-2">Quick refills (add to today)</div>
        <div className="flex flex-wrap gap-2">
          {[8, 16, 32].map((oz) => (
            <button
              key={oz}
              type="button"
              className="h-9 px-3 rounded-lg bg-zinc-800 text-sm"
              onClick={() => addOz(oz)}
            >
              +{oz} oz
            </button>
          ))}
          <button
            type="button"
            className="h-9 px-3 rounded-lg bg-zinc-700 text-sm"
            onClick={() => addOz(prefs.bottleRefillOz)}
          >
            + bottle ({prefs.bottleRefillOz} oz)
          </button>
        </div>
        <label className="flex items-center gap-2 mt-3 text-xs text-zinc-400">
          Bottle size for quick button
          <select
            value={prefs.bottleRefillOz}
            onChange={async (e) => {
              const oz = Number(e.target.value);
              await patchRecoveryPrefs({ bottleRefillOz: oz });
            }}
            className="h-9 rounded-lg bg-zinc-950 border border-zinc-800 px-2"
          >
            {[8, 12, 16, 20, 24, 32, BOTTLE_REFILL_OZ_MAX].map((o) => (
              <option key={o} value={o}>
                {o === BOTTLE_REFILL_OZ_MAX ? `${o} fl oz (1 gal)` : `${o} fl oz`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input type="checkbox" checked={electrolytes} onChange={(e) => setElectrolytes(e.target.checked)} />
        Electrolytes (training / sweat day)
      </label>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          className="h-11 px-4 rounded-lg bg-zinc-800 text-sm"
          onClick={async () => {
            await localUpsert('hydration_logs', {
              id: `hydration-${date}`,
              date,
              waterActualMl: actualMl,
              waterTargetMl: targetMl,
              electrolytes,
            });
            await flushDirty().catch(() => {});
          }}
        >
          Save hydration
        </button>
        <button
          type="button"
          className="h-10 px-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400"
          onClick={() => void persistPrefsTarget()}
        >
          Save current target ({mlToUsFloz(targetMl).toFixed(0)} oz) as my default
        </button>
      </div>
    </div>
  );
}

function NutritionSection({
  date,
  existing,
  prefs,
}: {
  date: string;
  existing: NutritionLog | undefined;
  prefs: RecoveryPrefs;
}) {
  const formKey = existing?.id ?? `nutrition-new-${date}`;
  return <NutritionSectionForm key={formKey} date={date} existing={existing} prefs={prefs} />;
}

function NutritionSectionForm({
  date,
  existing,
  prefs,
}: {
  date: string;
  existing: NutritionLog | undefined;
  prefs: RecoveryPrefs;
}) {
  const allBodyweight = useAllBodyweight();
  const allNutrition = useAllNutrition();
  const allSessions = useAllSessions();
  const allCardio = useAllCardio();
  const nt = prefs.nutritionTargets;
  const [goal, setGoal] = useState<MacroGoal>('maintenance');
  const [trendWindow, setTrendWindow] = useState<TrendWindowDays>(14);
  const [defaultsSavedToast, setDefaultsSavedToast] = useState(false);
  const resolvedDayTypeForNutrition = useMemo(
    () => defaultNutritionDayType(date, allSessions ?? [], allCardio ?? []),
    [date, allSessions, allCardio],
  );
  const [pT, setPT] = useState(existing?.proteinTargetG ?? nt.proteinG);
  const [cT, setCT] = useState(existing?.carbsTargetG ?? nt.carbsG);
  const [fT, setFT] = useState(existing?.fatTargetG ?? nt.fatG);
  const targetSyncKey = `${existing?.id ?? 'new'}|${nt.proteinG}|${nt.carbsG}|${nt.fatG}`;
  const [targetSyncSeen, setTargetSyncSeen] = useState(targetSyncKey);
  if (targetSyncKey !== targetSyncSeen) {
    setTargetSyncSeen(targetSyncKey);
    if (!existing) {
      setPT(nt.proteinG);
      setCT(nt.carbsG);
      setFT(nt.fatG);
    }
  }

  const [pA, setPA] = useState(existing?.proteinActualG ?? 0);
  const [cA, setCA] = useState(existing?.carbsActualG ?? 0);
  const [fA, setFA] = useState(existing?.fatActualG ?? 0);

  const defaultDayTypeForNutrition = resolvedDayTypeForNutrition;
  const dayTypeFromLog = existing?.dayType ?? defaultDayTypeForNutrition;
  const nutritionDayTypeSyncKey =
    `${existing?.id ?? 'none'}|${String(existing?.dayType ?? '')}|${defaultDayTypeForNutrition}|${date}`;
  const [dayType, setDayType] = useState<NutritionDayType>(dayTypeFromLog);
  const [nutritionDayTypeKeySeen, setNutritionDayTypeKeySeen] = useState(nutritionDayTypeSyncKey);
  if (nutritionDayTypeSyncKey !== nutritionDayTypeKeySeen) {
    setNutritionDayTypeKeySeen(nutritionDayTypeSyncKey);
    setDayType(dayTypeFromLog);
  }

  const targetKcal = useMemo(() => kcalFromMacros(pT, cT, fT), [pT, cT, fT]);
  const actualKcal = useMemo(() => kcalFromMacros(pA, cA, fA), [pA, cA, fA]);
  const fallbackCalories = useMemo(
    () => kcalFromMacros(nt.proteinG, nt.carbsG, nt.fatG),
    [nt.proteinG, nt.carbsG, nt.fatG],
  );

  const mealTimestamps = useMemo(
    () => sortMealTimestamps(existing?.mealTimestamps ?? []),
    [existing?.mealTimestamps],
  );
  const mealDerived = useMemo(() => deriveMealMetrics(mealTimestamps), [mealTimestamps]);
  const recommendation = useMemo(
    () =>
      recommendMacroTargets({
        goal,
        windowDays: trendWindow,
        today: date,
        bodyweights: allBodyweight ?? [],
        nutritionLogs: allNutrition ?? [],
        fallbackCalories,
      }),
    [goal, trendWindow, date, allBodyweight, allNutrition, fallbackCalories],
  );

  async function persistNutrition(meals: string[]) {
    const sorted = sortMealTimestamps(meals);

    const migrated = existing?.mealTimestamps != null;
    let mealsLoggedCount: number;
    let mealTimestampsOut: string[] | undefined;

    if (sorted.length > 0) {
      mealsLoggedCount = sorted.length;
      mealTimestampsOut = sorted;
    } else if (!migrated && (existing?.mealsLoggedCount ?? 0) > 0) {
      mealsLoggedCount = existing!.mealsLoggedCount;
      mealTimestampsOut = undefined;
    } else {
      mealsLoggedCount = 0;
      mealTimestampsOut = [];
    }

    await localUpsert('nutrition_logs', {
      id: `nutrition-${date}`,
      date,
      dayType,
      caloriesTarget: targetKcal,
      caloriesActual: actualKcal,
      proteinTargetG: pT,
      proteinActualG: pA,
      carbsTargetG: cT,
      carbsActualG: cA,
      fatTargetG: fT,
      fatActualG: fA,
      mealsLoggedCount,
      ...(mealTimestampsOut !== undefined ? { mealTimestamps: mealTimestampsOut } : {}),
    });
    await flushDirty().catch(() => {});
  }

  async function saveLog() {
    await persistNutrition(mealTimestamps);
  }

  async function saveTargetsAsDefaults() {
    await patchRecoveryPrefs({
      nutritionTargets: {
        calories: targetKcal,
        proteinG: pT,
        carbsG: cT,
        fatG: fT,
      },
    });
    setDefaultsSavedToast(true);
    window.setTimeout(() => setDefaultsSavedToast(false), 1800);
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-4">
      <div className="text-sm font-medium">Nutrition &amp; macros</div>
      <p className="text-xs text-zinc-500">
        Calories follow macros (4 kcal/g protein &amp; carbs, 9 kcal/g fat). Edit macros below or use
        sliders as % of target per macro.
      </p>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-3">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Goal-based recommendation</div>
        <div className="flex flex-wrap gap-2">
          {([
            ['maintenance', 'Maintenance'],
            ['deficit', 'Deficit'],
            ['maingain', 'Surplus (maingain)'],
            ['surplus', 'Surplus'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setGoal(id)}
              className={`h-8 px-2.5 rounded-lg text-xs ${
                goal === id ? 'bg-amber-500 text-zinc-950 font-medium' : 'bg-zinc-800 text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-500">Trend window</span>
          {[7, 14].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setTrendWindow(n as TrendWindowDays)}
              className={`h-7 px-2 rounded-md ${
                trendWindow === n ? 'bg-zinc-700 text-zinc-100' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {n}d
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
            <div className="text-zinc-500">Calories</div>
            <div className="font-mono text-zinc-200">{recommendation.calories}</div>
          </div>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
            <div className="text-zinc-500">Protein</div>
            <div className="font-mono text-zinc-200">{recommendation.proteinG}g</div>
          </div>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
            <div className="text-zinc-500">Fat</div>
            <div className="font-mono text-zinc-200">{recommendation.fatG}g</div>
          </div>
          <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
            <div className="text-zinc-500">Carbs</div>
            <div className="font-mono text-zinc-200">{recommendation.carbsG}g</div>
          </div>
        </div>
        <div className="text-[11px] text-zinc-500">
          Estimated maintenance: <span className="font-mono text-zinc-400">{recommendation.maintenanceEstimate}</span> kcal
          {recommendation.weeklyWeightChangeLb != null && (
            <>
              {' · '}trend <span className="font-mono text-zinc-400">
                {recommendation.weeklyWeightChangeLb >= 0 ? '+' : ''}
                {recommendation.weeklyWeightChangeLb.toFixed(2)}
              </span> lb/week
            </>
          )}
        </div>
        <div className="text-xs text-zinc-500">{recommendation.reason}</div>
        <button
          type="button"
          className="h-9 px-3 rounded-lg bg-amber-500 text-zinc-950 text-xs font-medium"
          onClick={() => {
            setPT(recommendation.proteinG);
            setFT(recommendation.fatG);
            setCT(recommendation.carbsG);
          }}
        >
          Apply recommended targets
        </button>
      </div>

      <div className="space-y-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
          <label htmlFor="recovery-nutrition-day-type" className="text-xs text-zinc-500">
            Day type (saved with these targets)
          </label>
          <select
            id="recovery-nutrition-day-type"
            value={dayType}
            onChange={(e) => setDayType(e.target.value as NutritionDayType)}
            className="block w-full max-w-xs h-10 rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm text-zinc-200"
          >
            {NUTRITION_DAY_TYPES.map((dt) => (
              <option key={dt} value={dt}>
                {dt === 'training' ? 'Training' : dt === 'liss' ? 'LISS cardio' : 'Rest'}
              </option>
            ))}
          </select>
        </div>
        <DerivedCaloriesRow
          targetKcal={targetKcal}
          actualKcal={actualKcal}
          targetMacros={{ p: pT, c: cT, f: fT }}
          setActualMacros={{ setP: setPA, setC: setCA, setF: setFA }}
        />
        <MacroRow
          macro="Protein"
          unit="g"
          target={pT}
          setTarget={setPT}
          actual={pA}
          setActual={setPA}
        />
        <MacroRow
          macro="Carbs"
          unit="g"
          target={cT}
          setTarget={setCT}
          actual={cA}
          setActual={setCA}
        />
        <MacroRow
          macro="Fat"
          unit="g"
          target={fT}
          setTarget={setFT}
          actual={fA}
          setActual={setFA}
        />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-3">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Meal timing stats</div>
        <p className="text-xs text-zinc-500">
          Log meal times with <span className="text-zinc-400">Did you eat?</span> at the top of this page. Stats update
          as you add timestamps.
        </p>
        {existing && existing.mealsLoggedCount > 0 && existing.mealTimestamps === undefined && (
          <p className="text-[11px] text-zinc-500">
            Earlier entry used manual meal count ({existing.mealsLoggedCount}). Add check-ins above to track times.
          </p>
        )}
        {mealDerived.occasions > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
              <div className="text-zinc-500">Occasions</div>
              <div className="font-mono text-zinc-200 mt-0.5">{mealDerived.occasions}</div>
            </div>
            {mealDerived.firstMealTimeLabel && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
                <div className="text-zinc-500">First</div>
                <div className="font-mono text-zinc-200 mt-0.5">{mealDerived.firstMealTimeLabel}</div>
              </div>
            )}
            {mealDerived.lastMealTimeLabel && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
                <div className="text-zinc-500">Last</div>
                <div className="font-mono text-zinc-200 mt-0.5">{mealDerived.lastMealTimeLabel}</div>
              </div>
            )}
            {mealDerived.longestGapMinutes != null && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
                <div className="text-zinc-500">Longest gap</div>
                <div className="font-mono text-zinc-200 mt-0.5">{fmtGapMinutes(mealDerived.longestGapMinutes)}</div>
              </div>
            )}
            {mealDerived.avgGapMinutes != null && (
              <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-2">
                <div className="text-zinc-500">Avg gap</div>
                <div className="font-mono text-zinc-200 mt-0.5">{fmtGapMinutes(mealDerived.avgGapMinutes)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <button type="button" className="h-11 px-4 rounded-lg bg-zinc-800 text-sm" onClick={() => void saveLog()}>
          Save today&apos;s nutrition
        </button>
        <button
          type="button"
          className="h-10 px-4 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-400"
          onClick={() => void saveTargetsAsDefaults()}
        >
          Save macro targets above as my defaults
        </button>
      </div>
      {defaultsSavedToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-24 left-1/2 z-[100] -translate-x-1/2 rounded-lg border border-emerald-700/50 bg-emerald-950/95 px-3 py-2 text-xs font-medium text-emerald-200 shadow-lg"
        >
          Defaults saved
        </div>
      )}
    </div>
  );
}

function DerivedCaloriesRow({
  targetKcal,
  actualKcal,
  targetMacros,
  setActualMacros,
}: {
  targetKcal: number;
  actualKcal: number;
  targetMacros: { p: number; c: number; f: number };
  setActualMacros: {
    setP: (n: number) => void;
    setC: (n: number) => void;
    setF: (n: number) => void;
  };
}) {
  const calRatio = targetKcal <= 0 ? 0 : actualKcal / targetKcal;
  const pctDisplay = Math.round(calRatio * 100);
  const sliderMax = Math.max(300, pctDisplay);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-medium text-zinc-200">Calories</span>
        <span className="text-xs text-zinc-500">kcal (derived)</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="text-xs text-zinc-500">
          Target
          <div className="mt-1 h-10 flex items-center rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm text-zinc-200">
            {targetKcal}
          </div>
        </div>
        <div className="text-xs text-zinc-500">
          Today (actual)
          <div className="mt-1 h-10 flex items-center rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm text-zinc-200">
            {actualKcal}
          </div>
        </div>
      </div>
      <MacroGoalProgressBar ratio={calRatio} label="Calories" />
      <div>
        <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
          <span>Actual vs target (moves all macros)</span>
          <span className="font-mono">{pctDisplay}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={sliderMax}
          value={targetKcal <= 0 ? 0 : Math.min(sliderMax, pctDisplay)}
          disabled={targetKcal <= 0}
          title={targetKcal <= 0 ? 'Set macro targets above zero to use the slider' : undefined}
          onChange={(e) => {
            const p = Number(e.target.value);
            setActualMacros.setP(Math.round((targetMacros.p * p) / 100));
            setActualMacros.setC(Math.round((targetMacros.c * p) / 100));
            setActualMacros.setF(Math.round((targetMacros.f * p) / 100));
          }}
          className="w-full accent-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label="Calories percent of macro targets"
        />
      </div>
    </div>
  );
}

function MacroRow({
  macro,
  unit,
  target,
  setTarget,
  actual,
  setActual,
}: {
  macro: string;
  unit: string;
  target: number;
  setTarget: (n: number) => void;
  actual: number;
  setActual: (n: number) => void;
}) {
  const ratio = target <= 0 ? 0 : actual / target;
  const pctDisplay = Math.round(ratio * 100);
  const sliderMax = Math.max(300, pctDisplay);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-medium text-zinc-200">{macro}</span>
        <span className="text-xs text-zinc-500">{unit}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-500">
          Target
          <input
            type="number"
            min={0}
            step={5}
            value={target || ''}
            onChange={(e) => setTarget(Math.max(0, parseFloat(e.target.value || '0')))}
            className="mt-1 h-10 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Today (actual)
          <input
            type="number"
            min={0}
            step={1}
            value={actual || ''}
            onChange={(e) => setActual(Math.max(0, parseFloat(e.target.value || '0')))}
            className="mt-1 h-10 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 font-mono text-sm"
          />
        </label>
      </div>
      <MacroGoalProgressBar ratio={ratio} label={macro} />
      <div>
        <div className="flex justify-between text-[11px] text-zinc-500 mb-1">
          <span>Actual vs target</span>
          <span className="font-mono">{pctDisplay}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={sliderMax}
          value={target <= 0 ? 0 : Math.min(sliderMax, pctDisplay)}
          disabled={target <= 0}
          title={target <= 0 ? 'Set a target above zero to use the slider' : undefined}
          onChange={(e) => {
            const p = Number(e.target.value);
            setActual(Math.round((target * p) / 100));
          }}
          className="w-full accent-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`${macro} percent of target`}
        />
      </div>
    </div>
  );
}
