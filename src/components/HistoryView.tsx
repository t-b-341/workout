'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  useActiveUserGoals,
  useAllBodyweight,
  useAllBodyMeasurements,
  useAllCardio,
  useAllReadiness,
  useAllStress,
  useAllNutrition,
  useAllHydration,
  useAllInjuryEpisodes,
  useAllMindfulness,
  useAllSessions,
  useSessionsAfterReadiness,
  useAllSets,
  useGoalAchievementDetector,
  useHistoryGoalSets,
  useLifts,
  useTemplates,
} from '@/lib/hooks';
import { getDb } from '@/lib/db';
import { currentValueForGoal } from '@/lib/liftingGoals';
import { sortSetLogsForSession } from '@/lib/sessionFilters';
import { cancelPendingDirtyDelete, localDelete, localUpsert } from '@/lib/sync';
import { offerDeleteUndo } from '@/lib/deleteUndoCoordinator';
import { daysBetweenIso, fmtDate, todayIso } from '@/lib/time';
import {
  bodyMeasurementSeries,
  bodyweightSeries,
  buildLiftHistory,
  buildWeeklyMuscleVolume,
  buildWeeklyPatternCoverage,
  buildWeeklyReadiness,
  buildWeeklySummaries,
  buildTemplateSessionProgressSeries,
  DEFAULT_ROLLING_STRENGTH_WINDOW_DAYS,
  fmtDurationShort,
  isoWeekOf,
  prFeed,
  rollingStrengthTrainingWindow,
  sessionTotalRestBetweenSetsMs,
  type TemplateSessionProgressPoint,
} from '@/lib/stats';
import { Sparkline, MiniBars, ProgressLineChart } from './Sparkline';
import { ReadinessSummary } from './ReadinessSummary';
import { SessionEditSheet } from './SessionEditSheet';
import { NutritionLogEditSheet } from './NutritionLogEditSheet';
import { HydrationLogEditSheet } from './HydrationLogEditSheet';
import { BodyweightLogEditSheet } from './BodyweightLogEditSheet';
import { BodyMeasurementLogEditSheet } from './BodyMeasurementLogEditSheet';
import { PageShell } from './PageShell';
import { LIFTS, MUSCLE_GROUPS, PATTERNS, sortTemplatesProgramOrder } from '@/lib/seed';
import { applyOpeningPrBaseline, OPENING_PR_BASELINE_META_KEY } from '@/lib/openingPrBaseline';
import { defaultWellnessTargets, useWellnessTargets, type WellnessTargets } from '@/lib/wellnessTargets';
import {
  buildHrvVariabilitySeries,
  describeHrvRecoveryVariability,
  measuredHrvAsc,
} from '@/lib/hrvAnalytics';
import { labelForSiteKey, type InjurySiteKey } from '@/lib/injurySites';
import {
  computeStrengthBalance,
  type RatioResult,
  type ValueSource,
} from '@/lib/strengthBalance';

import type {
  BodyMeasurementLog,
  BodyweightLog,
  CardioLog,
  InjuryEpisode,
  Lift,
  MuscleGroup,
  NutritionLog,
  HydrationLog,
  ReadinessLog,
  SessionLog,
  SetLog,
  StressLog,
  SessionTemplate,
  MindfulnessLog,
  GoalMetric,
  UserGoal,
} from '@/lib/types';

type Tab =
  | 'sessions'
  | 'trends'
  | 'weeks'
  | 'prs'
  | 'muscle'
  | 'bodyweight'
  | 'measurements'
  | 'diet'
  | 'hydration'
  | 'injuries'
  | 'hrv'
  | 'goals'
  | 'balance'
  | 'types';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'trends', label: 'Trends' },
  { id: 'types', label: 'Types' },
  { id: 'weeks', label: 'Weeks' },
  { id: 'prs', label: 'PRs' },
  { id: 'goals', label: 'Goals' },
  { id: 'muscle', label: 'Muscle' },
  { id: 'bodyweight', label: 'BW' },
  { id: 'measurements', label: 'Measure' },
  { id: 'diet', label: 'Diet' },
  { id: 'hydration', label: 'Hydration' },
  { id: 'injuries', label: 'Injuries' },
  { id: 'hrv', label: 'HRV' },
  { id: 'balance', label: 'Strength Balance' },
];

export function HistoryView() {
  const templates = useTemplates();
  const [tab, setTab] = useState<Tab>('sessions');
  const [showNewGoal, setShowNewGoal] = useState(false);
  const lifts = useLifts();
  const userGoals = useActiveUserGoals();
  const sessions = useSessionsAfterReadiness();
  const allSessions = useAllSessions();
  const allSets = useAllSets();
  const goalSets = useHistoryGoalSets();
  const cardio = useAllCardio();
  const bodyweights = useAllBodyweight();
  const bodyMeasurements = useAllBodyMeasurements();
  const readiness = useAllReadiness();
  const stress = useAllStress();
  const nutrition = useAllNutrition();
  const hydration = useAllHydration();
  const episodes = useAllInjuryEpisodes();
  const mindfulness = useAllMindfulness();
  const wellnessTargets = useWellnessTargets();
  const wkTargets = wellnessTargets ?? defaultWellnessTargets();
  useGoalAchievementDetector(userGoals, allSets, bodyweights);

  if (
    !lifts ||
    !templates ||
    !sessions ||
    !allSets ||
    !goalSets ||
    userGoals === undefined ||
    !cardio ||
    !bodyweights ||
    !bodyMeasurements ||
    !readiness ||
    !stress ||
    !nutrition ||
    !hydration ||
    !episodes ||
    !mindfulness
  ) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }

  return (
    <PageShell className="p-4 space-y-4">
      <h1 className="text-2xl font-semibold">History</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-1 rounded-xl bg-zinc-900 border border-zinc-800 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`h-10 rounded-lg text-sm ${tab === t.id ? 'bg-amber-500 text-zinc-950 font-medium' : 'text-zinc-400'}`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'sessions' && <SessionsList sessions={sessions} sets={allSets} lifts={lifts} readiness={readiness} />}
      {tab === 'trends' && (
        <TrendsList sessions={sessions} sets={allSets} lifts={lifts} bodyweights={bodyweights} readiness={readiness} />
      )}
      {tab === 'types' && (
        <TemplateProgressionList
          templates={templates}
          sessions={sessions}
          sets={allSets}
          lifts={lifts}
          bodyweights={bodyweights}
          readiness={readiness}
        />
      )}
      {tab === 'weeks' && (
        <WeeksList
          sessions={sessions}
          sets={allSets}
          cardio={cardio}
          lifts={lifts}
          readiness={readiness}
          stress={stress}
          mindfulness={mindfulness}
          bodyweights={bodyweights}
          wellnessTargets={wkTargets}
        />
      )}
      {tab === 'prs' && <PRsList sessions={sessions} sets={allSets} lifts={lifts} />}
      {tab === 'muscle' && (
        <MuscleList sessions={sessions} sets={allSets} lifts={lifts} bodyweights={bodyweights} readiness={readiness} />
      )}
      {tab === 'bodyweight' && <BodyweightList logs={bodyweights} />}
      {tab === 'measurements' && <MeasurementsList logs={bodyMeasurements} />}
      {tab === 'diet' && <DietList logs={nutrition} />}
      {tab === 'hydration' && <HydrationList logs={hydration} />}
      {tab === 'injuries' && <InjuriesList episodes={episodes} />}
      {tab === 'hrv' && <HrvList readiness={readiness} />}
      {tab === 'goals' && (
        <GoalsView
          goals={userGoals}
          sets={allSets}
          lifts={lifts}
          bodyweightLogs={bodyweights}
          onNew={() => setShowNewGoal(true)}
        />
      )}
      {showNewGoal && (
        <GoalWriterSheet
          sets={allSets}
          lifts={lifts}
          bodyweightLogs={bodyweights}
          onClose={() => setShowNewGoal(false)}
        />
      )}
      {tab === 'balance' && (
        <StrengthBalanceView
          sets={goalSets}
          sessions={allSessions ?? []}
        />
      )}
    </PageShell>
  );
}

function SessionsList({
  sessions,
  sets,
  lifts,
  readiness,
}: {
  sessions: SessionLog[];
  sets: SetLog[];
  lifts: Lift[];
  readiness: ReadinessLog[];
}) {
  const [editing, setEditing] = useState<{ session: SessionLog; sets: SetLog[] } | null>(null);
  const liftName = (id: string) => lifts.find((l) => l.id === id)?.name ?? id;
  if (sessions.length === 0) return <div className="text-zinc-500 text-sm">No sessions logged yet.</div>;

  async function beginEditSession(s: SessionLog, rawSets: SetLog[]) {
    const db = getDb();
    const rx = await db.prescriptions.where('templateId').equals(s.templateId).toArray();
    rx.sort((a, b) => a.order - b.order);
    const sorted = sortSetLogsForSession([...rawSets], rx);
    setEditing({ session: s, sets: sorted });
  }

  const setsBySession = new Map<string, SetLog[]>();
  for (const s of sets) {
    const arr = setsBySession.get(s.sessionLogId) ?? [];
    arr.push(s);
    setsBySession.set(s.sessionLogId, arr);
  }

  // Most recent readiness per session, in case a session somehow has more than one.
  const readinessBySession = new Map<string, ReadinessLog>();
  for (const r of readiness) {
    const cur = readinessBySession.get(r.sessionLogId);
    if (!cur || cur.createdAt < r.createdAt) readinessBySession.set(r.sessionLogId, r);
  }

  return (
    <>
      {editing && (
        <SessionEditSheet
          key={editing.session.id}
          session={editing.session}
          initialSets={editing.sets}
          onClose={() => setEditing(null)}
        />
      )}
      <div className="space-y-3">
      {sessions.map((s) => {
        const ss = (setsBySession.get(s.id) ?? []).sort((a, b) => a.setIndex - b.setIndex);
        const grouped = new Map<string, SetLog[]>();
        for (const x of ss) {
          const arr = grouped.get(x.liftId) ?? [];
          arr.push(x);
          grouped.set(x.liftId, arr);
        }
        const r = readinessBySession.get(s.id);
        const isEmpty = ss.length === 0 && !r;
        const restMs = s.completedAt ? sessionTotalRestBetweenSetsMs(s.id, sets, lifts) : 0;
        return (
          <div key={s.id} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{fmtDate(s.date, 'EEE, MMM d')} · {s.templateId}</div>
                {restMs > 0 && (
                  <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                    Rest between sets · {fmtDurationShort(restMs)}
                  </div>
                )}
                <div className="text-xs text-zinc-500 mt-0.5">
                  {s.mode !== 'standard' && <span className="mr-2 text-amber-400">{s.mode}</span>}
                  {s.deload && <span className="mr-2 text-indigo-400">deload</span>}
                  {s.watchFlags.length > 0 && (
                    <span className="text-rose-400">⚠ {s.watchFlags.join(', ')}</span>
                  )}
                </div>
                {r && <ReadinessSummary readiness={r} dense />}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => void beginEditSession(s, ss)}
                  className="text-xs px-2 h-7 rounded-md border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-zinc-600"
                >
                  Edit
                </button>
                <DeleteSessionButton session={s} setCount={ss.length} hasReadiness={!!r} isEmpty={isEmpty} />
              </div>
            </div>
            {s.notes && (
              <div className="mt-2 text-sm text-zinc-400 border-t border-zinc-800 pt-2">
                {s.notes}
              </div>
            )}
            <div className="mt-3 space-y-1">
              {Array.from(grouped.entries()).map(([liftId, ls]) => (
                <div key={liftId} className="text-sm flex items-baseline justify-between gap-2">
                  <Link href={`/lifts/${liftId}`} className="text-zinc-300 hover:text-amber-400">
                    {liftName(liftId)}
                  </Link>
                  <span className="font-mono text-zinc-400">
                    {ls.map((x) => `${x.weight}×${x.reps}${x.status === 'completed' ? '' : '*'}`).join(', ')}
                  </span>
                </div>
              ))}
              {[...grouped.values()].flat().some((x) => x.reason) && (
                <div className="mt-2 text-xs text-zinc-500 border-t border-zinc-800 pt-2 space-y-1">
                  {[...grouped.values()].flat().filter((x) => x.reason).map((x) => (
                    <div key={x.id}>
                      <span className="text-zinc-400">{liftName(x.liftId)}</span>: {x.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>
    </>
  );
}

function TemplateProgressionList({
  templates,
  sessions,
  sets,
  lifts,
  bodyweights,
  readiness,
}: {
  templates: SessionTemplate[];
  sessions: SessionLog[];
  sets: SetLog[];
  lifts: Lift[];
  bodyweights: BodyweightLog[];
  readiness: ReadinessLog[];
}) {
  const ordered = useMemo(() => sortTemplatesProgramOrder(templates), [templates]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Each program day is compared only to itself (e.g. Upper 1 vs the last Upper 1). Strength volume is tonnage in
        lb; cardio-only work is not included.
      </p>
      <div className="space-y-6">
        {ordered.map((t) => (
          <TemplateProgressCard
            key={t.id}
            template={t}
            points={buildTemplateSessionProgressSeries(t.id, sessions, sets, lifts, bodyweights, readiness)}
          />
        ))}
      </div>
    </div>
  );
}

function TemplateProgressCard({
  template,
  points,
}: {
  template: SessionTemplate;
  points: TemplateSessionProgressPoint[];
}) {
  const values = points.map((p) => p.strengthVolumeLb);
  const dates = points.map((p) => p.date);
  const recent = useMemo(() => [...points].reverse().slice(0, 12), [points]);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-zinc-100">{template.name}</h3>
          <span className="text-xs font-mono text-zinc-500">{template.id}</span>
        </div>
        {points.length > 0 && (
          <span className="text-xs text-zinc-500">
            {points.length} session{points.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {points.length === 0 ? (
        <p className="text-sm text-zinc-500">No completed sessions for this day type yet.</p>
      ) : (
        <>
          <ProgressLineChart
            values={values}
            dates={dates}
            unit="lb"
            minWidth={300}
            aria-label={`Strength volume trend for ${template.name}`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500 border-b border-zinc-800">
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">Volume</th>
                  <th className="py-2 pr-2">Δ lb</th>
                  <th className="py-2 pr-2">Δ %</th>
                  <th className="py-2 pr-2">Sets</th>
                  <th className="py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((p) => (
                  <tr key={p.sessionId} className="border-b border-zinc-800/60">
                    <td className="py-1.5 pr-2 font-mono text-zinc-300">{fmtDate(p.date, 'MMM d, yyyy')}</td>
                    <td className="py-1.5 pr-2 font-mono text-zinc-200">
                      {Math.round(p.strengthVolumeLb).toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-zinc-400">
                      {p.volumeDeltaLb == null
                        ? '—'
                        : `${p.volumeDeltaLb >= 0 ? '+' : ''}${Math.round(p.volumeDeltaLb)}`}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-zinc-400">
                      {p.deltaPct == null
                        ? '—'
                        : `${p.deltaPct >= 0 ? '+' : ''}${p.deltaPct.toFixed(1)}%`}
                    </td>
                    <td className="py-1.5 pr-2 text-zinc-400">{p.completedSets}</td>
                    <td className="py-1.5 text-zinc-500">{p.durationLabel ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TrendsList({
  sessions,
  sets,
  lifts,
  bodyweights,
  readiness,
}: {
  sessions: SessionLog[];
  sets: SetLog[];
  lifts: Lift[];
  bodyweights: BodyweightLog[];
  readiness: ReadinessLog[];
}) {
  const seenLiftIds = new Set(sets.map((s) => s.liftId));
  const liftsWithData = lifts
    .filter((l) => seenLiftIds.has(l.id) && l.equipment !== 'cardio' && l.equipment !== 'time')
    .sort((a, b) => a.name.localeCompare(b.name));

  if (liftsWithData.length === 0) {
    return <div className="text-zinc-500 text-sm">No lifts logged yet — log a session and trends will appear here.</div>;
  }

  return (
    <div className="space-y-3">
      {liftsWithData.map((lift) => (
        <LiftTrendCard
          key={lift.id}
          lift={lift}
          sessions={sessions}
          sets={sets}
          bodyweights={bodyweights}
          readiness={readiness}
        />
      ))}
    </div>
  );
}

function LiftTrendCard({
  lift,
  sessions,
  sets,
  bodyweights,
  readiness,
}: {
  lift: Lift;
  sessions: SessionLog[];
  sets: SetLog[];
  bodyweights: BodyweightLog[];
  readiness: ReadinessLog[];
}) {
  const points = buildLiftHistory(lift.id, sets, sessions, bodyweights, readiness);
  if (points.length === 0) return null;

  const recent = points.slice(-12);
  const e1rm = recent.map((p) => Math.round(p.best1RM));
  const volumes = recent.map((p) => p.volume);

  const last = points[points.length - 1];
  const first = points.length > 1 ? points[0] : null;
  const delta = first && first.best1RM > 0
    ? Math.round(((last.best1RM - first.best1RM) / first.best1RM) * 100)
    : 0;
  const deltaColor = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-zinc-500';
  const deltaSign = delta > 0 ? '+' : '';
  const liftSessionIds = new Set(points.map((p) => `${p.date}:${p.templateId}`));
  const bySessionId = new Map(sessions.map((s) => [s.id, `${s.date}:${s.templateId}`]));
  const rpeSamples = sets
    .filter((s) => s.liftId === lift.id && s.status === 'completed' && s.rpe != null && s.reps <= 12)
    .filter((s) => {
      const key = bySessionId.get(s.sessionLogId);
      return key ? liftSessionIds.has(key) : false;
    })
    .map((s) => s.rpe as number);
  const recentRpe = rpeSamples.slice(-12);
  const avgRecentRpe = recentRpe.length > 0
    ? recentRpe.reduce((sum, n) => sum + n, 0) / recentRpe.length
    : null;

  return (
    <details className="rounded-2xl bg-zinc-900 border border-zinc-800 group" open={points.length <= 3}>
      <summary className="cursor-pointer p-4 list-none flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-zinc-100 truncate">
            <Link href={`/lifts/${lift.id}`} className="hover:text-amber-400">{lift.name}</Link>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            {points.length} session{points.length === 1 ? '' : 's'} · last: <span className="font-mono">{last.topWeight}×{last.topReps}</span>
            {lift.id === 'p1_assisted' && <span className="text-zinc-600"> lb moved</span>}
            {first && <span className={`ml-2 ${deltaColor}`}>{deltaSign}{delta}% e1RM</span>}
          </div>
        </div>
        <div className="w-32 shrink-0">
          <Sparkline values={e1rm} height={40} showDots={false} />
        </div>
      </summary>
      <div className="px-4 pb-4 space-y-3 border-t border-zinc-800 pt-3">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Estimated 1RM (last {recent.length})</div>
          <Sparkline
            values={e1rm}
            height={70}
            labels={recent.map((p) => p.date)}
            tooltipUnit="lb e1RM"
          />
        </div>
        {volumes.some((v) => v > 0) && (
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Volume per session</div>
            <MiniBars
              values={volumes}
              height={40}
              labels={recent.map((p) => p.date)}
              tooltipUnit="lb-reps"
            />
          </div>
        )}
        {recentRpe.length > 0 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
              RPE trend (last {recentRpe.length} tracked sets)
            </div>
            <Sparkline
              values={recentRpe}
              height={46}
              stroke="#f59e0b"
              fill="transparent"
              showDots
              labels={recentRpe.map((_, i) => `Set ${i + 1}`)}
              tooltipUnit="RPE"
            />
            <div className="text-[11px] text-zinc-500 mt-1">
              Avg recent RPE <span className="font-mono text-zinc-300">{avgRecentRpe?.toFixed(1)}</span>
            </div>
          </div>
        )}
        <div className="text-xs space-y-1">
          {points.slice(-8).reverse().map((p) => (
            <div key={p.date + p.templateId} className="flex items-baseline justify-between border-t border-zinc-800 pt-1">
              <span className="text-zinc-500">{fmtDate(p.date, 'EEE M/d')} · {p.templateId}</span>
              <span className="font-mono text-zinc-300">{p.setsLabel}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function WeeksList({
  sessions,
  sets,
  cardio,
  lifts,
  readiness,
  stress,
  mindfulness,
  bodyweights,
  wellnessTargets,
}: {
  sessions: SessionLog[];
  sets: SetLog[];
  cardio: CardioLog[];
  lifts: Lift[];
  readiness: ReadinessLog[];
  stress: StressLog[];
  mindfulness: MindfulnessLog[];
  bodyweights: BodyweightLog[];
  wellnessTargets: WellnessTargets;
}) {
  const weeks = buildWeeklySummaries(sessions, sets, cardio, lifts, readiness, bodyweights, mindfulness);
  const muscleWeeks = useMemo(
    () => buildWeeklyMuscleVolume(sessions, sets, lifts, bodyweights, readiness),
    [sessions, sets, lifts, bodyweights, readiness],
  );
  const patternWeeks = useMemo(() => buildWeeklyPatternCoverage(sessions, sets, lifts), [sessions, sets, lifts]);
  const readinessWeeks = useMemo(() => buildWeeklyReadiness(readiness), [readiness]);
  const rollingEndDate = useMemo(() => {
    let max = '';
    for (const s of sessions) {
      if (s.completedAt && s.date > max) max = s.date;
    }
    return max || todayIso();
  }, [sessions]);
  const rolling = useMemo(
    () =>
      rollingStrengthTrainingWindow(
        rollingEndDate,
        DEFAULT_ROLLING_STRENGTH_WINDOW_DAYS,
        sessions,
        sets,
        lifts,
        bodyweights,
        readiness,
      ),
    [rollingEndDate, sessions, sets, lifts, bodyweights, readiness],
  );
  if (weeks.length === 0) return <div className="text-zinc-500 text-sm">No data yet.</div>;

  // Most recent 12, chronological for the trend card.
  const trend = readinessWeeks.slice(0, 12).reverse();
  const stressTrend = buildWeeklyStress(stress).slice(0, 12).reverse();

  return (
    <div className="space-y-3">
      {trend.length > 0 && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <div>
            <div className="font-medium">Readiness trend</div>
            <div className="text-xs text-zinc-500">
              Weekly average across {trend.length} week{trend.length === 1 ? '' : 's'}.
              A slide here usually shows up in your sets a week later.
            </div>
          </div>
          <ReadinessTrendRow
            label="Sleep"
            unit="h"
            values={trend.map((w) => +w.avgSleep.toFixed(1))}
            color="#f59e0b"
            higherIsBetter
          />
          <ReadinessTrendRow
            label="Soreness"
            unit="/5"
            values={trend.map((w) => +w.avgSoreness.toFixed(1))}
            color="#fb7185"
            higherIsBetter={false}
          />
          <ReadinessTrendRow
            label="Motivation"
            unit="/5"
            values={trend.map((w) => +w.avgMotivation.toFixed(1))}
            color="#34d399"
            higherIsBetter
          />
        </div>
      )}
      {stressTrend.length > 0 && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <div>
            <div className="font-medium">Stress trend</div>
            <div className="text-xs text-zinc-500">
              Weekly average of all 1–5 stress check-ins logged that week (any number per day).
            </div>
          </div>
          <ReadinessTrendRow
            label="Stress"
            unit="/5"
            values={stressTrend.map((w) => +w.avgStress.toFixed(1))}
            color="#f97316"
            higherIsBetter={false}
          />
        </div>
      )}
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div>
          <div className="font-medium">Training density</div>
          <div className="text-xs text-zinc-500">
            Rolling {rolling.windowDays} days ({fmtDate(rolling.startDate, 'MMM d')}–{fmtDate(rolling.endDate, 'MMM d')})
            · completed sessions only
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Sessions" value={`${rolling.completedSessions}`} unit="" />
          <Stat label="Strength vol" value={Math.round(rolling.strengthVolumeLb).toLocaleString()} unit="lb" />
          <Stat
            label="Training time"
            value={rolling.trainingDurationMs > 0 ? fmtDurationShort(rolling.trainingDurationMs) : '—'}
            unit=""
          />
          <Stat
            label="Vol / hour"
            value={
              rolling.lbPerTrainingHour != null
                ? Math.round(rolling.lbPerTrainingHour).toLocaleString()
                : '—'
            }
            unit={rolling.lbPerTrainingHour != null ? 'lb/h' : ''}
          />
        </div>
        <div className="text-xs text-zinc-500 text-center">
          Calendar spread:{' '}
          <span className="font-mono text-zinc-400">
            {Math.round(rolling.strengthVolumeLbPerCalendarDay).toLocaleString()} lb/day
          </span>
        </div>
        {rolling.completedSessions > rolling.sessionsWithDuration && rolling.completedSessions > 0 ? (
          <div className="text-xs text-zinc-600 text-center">
            {rolling.completedSessions - rolling.sessionsWithDuration} session
            {rolling.completedSessions - rolling.sessionsWithDuration === 1 ? '' : 's'} missing start time — vol/h uses
            logged clock time only.
          </div>
        ) : null}
      </div>
      {weeks.map((w) => {
        const cardioPct = Math.min(
          100,
          Math.round((w.cardioMin / wellnessTargets.cardioWeeklyMin) * 100),
        );
        const mindfulnessPct = Math.min(
          100,
          Math.round((w.mindfulnessMin / wellnessTargets.mindfulnessWeeklyMin) * 100),
        );
        const flagTotal = w.watchFlagCounts.erectors + w.watchFlagCounts.elbow + w.watchFlagCounts.shoulder;
        const groupRow = muscleWeeks.find((g) => g.week === w.week);
        const patternRow = patternWeeks.find((p) => p.week === w.week);
        return (
          <div key={w.week} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="font-medium">{w.week}</div>
                <div className="text-xs text-zinc-500">week of {fmtDate(w.weekStart, 'MMM d')}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold font-mono">{w.sessionsCompleted}</div>
                <div className="text-xs text-zinc-500">sessions</div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <Stat label="Volume" value={w.totalVolume.toLocaleString()} unit="lb" />
              <Stat label="Cardio" value={`${w.cardioMin}`} unit={`/ ${wellnessTargets.cardioWeeklyMin}m`} />
              <Stat label="Mindfulness" value={`${w.mindfulnessMin}`} unit={`/ ${wellnessTargets.mindfulnessWeeklyMin}m`} />
              <Stat label="Flags" value={`${flagTotal}`} unit="" tone={flagTotal > 0 ? 'warn' : 'normal'} />
            </div>

            <div className="space-y-1.5">
              <div>
                <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                  <span>Cardio goal</span>
                  <span className="font-mono">{cardioPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full ${cardioPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${cardioPct}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] uppercase tracking-wider text-zinc-600 mb-0.5">
                  <span>Mindfulness goal</span>
                  <span className="font-mono">{mindfulnessPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full ${mindfulnessPct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
                    style={{ width: `${mindfulnessPct}%` }}
                  />
                </div>
              </div>
            </div>

            {patternRow && patternRow.total > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Pattern coverage (sets)</div>
                <PatternRow setsByPattern={patternRow.setsByPattern} />
              </div>
            )}

            {groupRow && Object.keys(groupRow.setsByGroup).length > 0 && (
              <details>
                <summary className="text-xs uppercase tracking-wider text-zinc-500 mb-1 cursor-pointer">
                  Sets per muscle group
                </summary>
                <MuscleGroupRow setsByGroup={groupRow.setsByGroup} />
              </details>
            )}

            {w.topSets.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Top sets</div>
                <div className="space-y-1">
                  {w.topSets
                    .sort((a, b) => b.weight * 100 + b.reps - (a.weight * 100 + a.reps))
                    .slice(0, 8)
                    .map((t) => (
                      <div key={t.liftId} className="text-sm flex items-baseline justify-between">
                        <Link href={`/lifts/${t.liftId}`} className="text-zinc-300 hover:text-amber-400">{t.liftName}</Link>
                        <span className="font-mono text-zinc-400">{t.weight}×{t.reps}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {flagTotal > 0 && (
              <div className="text-xs text-rose-400">
                ⚠ {Object.entries(w.watchFlagCounts).filter(([, n]) => n > 0).map(([k, n]) => `${k} ×${n}`).join(' · ')}
              </div>
            )}

            {(w.modeCounts.light + w.modeCounts.skip + w.modeCounts.deload) > 0 && (
              <div className="text-xs text-zinc-500">
                {w.modeCounts.light > 0 && <span className="mr-2 text-amber-400">light ×{w.modeCounts.light}</span>}
                {w.modeCounts.skip > 0 && <span className="mr-2">skip ×{w.modeCounts.skip}</span>}
                {w.modeCounts.deload > 0 && <span className="text-indigo-400">deload ×{w.modeCounts.deload}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function buildWeeklyStress(stressLogs: StressLog[]): Array<{ week: string; avgStress: number }> {
  const byWeek = new Map<string, number[]>();
  for (const s of stressLogs) {
    const week = isoWeekOf(s.date);
    const row = byWeek.get(week) ?? [];
    row.push(s.rating);
    byWeek.set(week, row);
  }
  return Array.from(byWeek.entries())
    .map(([week, ratings]) => ({
      week,
      avgStress: ratings.reduce((sum, n) => sum + n, 0) / ratings.length,
    }))
    .sort((a, b) => (a.week < b.week ? 1 : -1));
}

function ReadinessTrendRow({
  label,
  unit,
  values,
  color,
  higherIsBetter,
}: {
  label: string;
  unit: string;
  values: number[];
  color: string;
  higherIsBetter: boolean;
}) {
  if (values.length === 0) return null;
  const last = values[values.length - 1];
  const first = values[0];
  const delta = +(last - first).toFixed(1);
  const improved = higherIsBetter ? delta > 0 : delta < 0;
  const worsened = higherIsBetter ? delta < 0 : delta > 0;
  const deltaColor = improved ? 'text-emerald-400' : worsened ? 'text-rose-400' : 'text-zinc-500';
  const sign = delta > 0 ? '+' : '';
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-300">
          {last}{unit}
          {values.length > 1 && (
            <span className={`ml-2 ${deltaColor}`}>{sign}{delta}</span>
          )}
        </span>
      </div>
      <Sparkline values={values} stroke={color} fill="transparent" height={40} showDots={false} />
    </div>
  );
}

function PatternRow({ setsByPattern }: { setsByPattern: Partial<Record<import('@/lib/types').MovementPattern, number>> }) {
  const max = Math.max(1, ...Object.values(setsByPattern).map((n) => n ?? 0));
  return (
    <div className="space-y-1">
      {PATTERNS.map((p) => {
        const n = setsByPattern[p] ?? 0;
        const pct = Math.round((n / max) * 100);
        const tone = n === 0 ? 'bg-zinc-800' : n < 3 ? 'bg-amber-600' : 'bg-emerald-500';
        return (
          <div key={p} className="flex items-center gap-2 text-xs">
            <span className="w-20 text-zinc-400 capitalize">{p.replace('-', ' ')}</span>
            <div className="flex-1 h-3 rounded-full bg-zinc-800 overflow-hidden">
              <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="w-8 text-right font-mono text-zinc-300">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function MuscleGroupRow({ setsByGroup }: { setsByGroup: Partial<Record<MuscleGroup, number>> }) {
  const max = Math.max(1, ...Object.values(setsByGroup).map((n) => n ?? 0));
  const present = MUSCLE_GROUPS.filter((g) => (setsByGroup[g] ?? 0) > 0);
  return (
    <div className="space-y-1 mt-1">
      {present.map((g) => {
        const n = setsByGroup[g] ?? 0;
        const pct = Math.round((n / max) * 100);
        return (
          <div key={g} className="flex items-center gap-2 text-xs">
            <span className="w-20 text-zinc-400">{g}</span>
            <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-8 text-right font-mono text-zinc-300">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function PRsList({ sessions, sets, lifts }: { sessions: SessionLog[]; sets: SetLog[]; lifts: Lift[] }) {
  const feed = useMemo(() => prFeed(sets, sessions, lifts), [sessions, sets, lifts]);
  const openingPrImported = useLiveQuery(
    () => getDb().meta.where('key').equals(OPENING_PR_BASELINE_META_KEY).first(),
    [],
  );
  const [baselineBusy, setBaselineBusy] = useState(false);

  // Group by month for legibility
  const groups = useMemo(() => {
    const next = new Map<string, typeof feed>();
    for (const item of feed) {
      const ym = item.date.slice(0, 7);
      const arr = next.get(ym) ?? [];
      arr.push(item);
      next.set(ym, arr);
    }
    return next;
  }, [feed]);

  return (
    <div className="space-y-4">
      {!openingPrImported?.value && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="text-sm text-zinc-400">
            <div className="font-medium text-zinc-200">Opening PR baseline</div>
            <p className="text-xs text-zinc-500 mt-1">
              Add your lifetime best numbers once (Barbell Row, Bench, OHP, Push Press, unassisted pull-ups, Squat, Deadlift).
            </p>
          </div>
          <button
            type="button"
            disabled={baselineBusy}
            onClick={() => {
              setBaselineBusy(true);
              void applyOpeningPrBaseline()
                .finally(() => setBaselineBusy(false));
            }}
            className="h-10 shrink-0 px-4 rounded-lg bg-amber-500 text-zinc-950 text-sm font-medium disabled:opacity-50"
          >
            {baselineBusy ? 'Adding…' : 'Add opening PRs'}
          </button>
        </div>
      )}

      {feed.length === 0 ? (
        <div className="text-zinc-500 text-sm">
          No PRs yet — log sessions, or use &quot;Add opening PRs&quot; above.
        </div>
      ) : (
        Array.from(groups.entries()).map(([ym, items]) => (
          <div key={ym}>
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{fmtDate(ym + '-01', 'MMMM yyyy')}</div>
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
              {items.map((it, i) => {
                const isUnassistedPullup = it.liftId === 'p1_bw' && it.weight === 0;
                const isP1Assisted = it.liftId === 'p1_assisted';
                return (
                  <div key={`${it.liftId}-${it.date}-${it.reps}-${i}`} className="p-3 flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/lifts/${it.liftId}`} className="font-medium text-zinc-100 hover:text-amber-400 truncate">
                        {it.liftName}
                      </Link>
                      <div className="text-xs text-zinc-500">{fmtDate(it.date, 'EEE M/d')}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-amber-400">
                        {isUnassistedPullup
                          ? `${it.reps} reps (BW)`
                          : isP1Assisted
                            ? `${it.weight} lb assist ×${it.reps}`
                            : `${it.weight}×${it.reps}`}
                      </div>
                      {it.previousWeight != null && (
                        <div className="text-xs text-zinc-500 font-mono">
                          {isUnassistedPullup
                            ? `was ${it.previousWeight} reps`
                            : isP1Assisted
                              ? `was ${it.previousWeight} lb assist`
                              : `was ${it.previousWeight}`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function MuscleList({
  sessions,
  sets,
  lifts,
  bodyweights,
  readiness,
}: {
  sessions: SessionLog[];
  sets: SetLog[];
  lifts: Lift[];
  bodyweights: BodyweightLog[];
  readiness: ReadinessLog[];
}) {
  const muscleWeeks = useMemo(
    () => buildWeeklyMuscleVolume(sessions, sets, lifts, bodyweights, readiness),
    [sessions, sets, lifts, bodyweights, readiness],
  );
  const patternWeeks = useMemo(() => buildWeeklyPatternCoverage(sessions, sets, lifts), [sessions, sets, lifts]);
  if (muscleWeeks.length === 0) {
    return <div className="text-zinc-500 text-sm">Log a session to start tracking weekly muscle volume.</div>;
  }

  // Stacked view: each muscle group as its own bar chart over the last N weeks.
  const recent = muscleWeeks.slice(0, 12).reverse(); // chronological
  const recentPatterns = patternWeeks.slice(0, 12).reverse();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="font-medium">Pattern coverage by week</div>
        <div className="text-xs text-zinc-500">Sets per movement pattern, last {recentPatterns.length} weeks. Empty bar = pattern was missed that week.</div>
        <div className="space-y-1 mt-2">
          {PATTERNS.map((p) => {
            const values = recentPatterns.map((w) => w.setsByPattern[p] ?? 0);
            return (
              <div key={p} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-zinc-400 capitalize">{p.replace('-', ' ')}</span>
                <div className="flex-1"><MiniBars values={values} height={28} /></div>
                <span className="w-10 text-right font-mono text-zinc-300">{values.reduce((s, n) => s + n, 0)}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="font-medium">Sets per muscle group by week</div>
        <div className="text-xs text-zinc-500">Last {recent.length} weeks. Each set counts toward every group it stimulates.</div>
        <div className="space-y-1 mt-2">
          {MUSCLE_GROUPS.map((g) => {
            const values = recent.map((w) => w.setsByGroup[g] ?? 0);
            const total = values.reduce((s, n) => s + n, 0);
            if (total === 0) return null;
            return (
              <div key={g} className="flex items-center gap-2 text-xs">
                <span className="w-20 text-zinc-400">{g}</span>
                <div className="flex-1"><MiniBars values={values} height={28} /></div>
                <span className="w-10 text-right font-mono text-zinc-300">{total}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function injuryEpisodeDurationDays(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

function fmtInjuryInstant(iso: string): string {
  try {
    return format(new Date(iso), 'MMM d, yyyy · h:mm a');
  } catch {
    return iso;
  }
}

function InjuriesList({ episodes }: { episodes: InjuryEpisode[] }) {
  const activeBySite = useMemo(() => {
    const m = new Map<string, InjuryEpisode>();
    for (const e of episodes) {
      if (e.endedAt) continue;
      const prev = m.get(e.siteKey);
      if (!prev || e.startedAt > prev.startedAt) m.set(e.siteKey, e);
    }
    return m;
  }, [episodes]);

  const activeList = useMemo(() => {
    return Array.from(activeBySite.entries()).sort((a, b) =>
      labelForSiteKey(a[0] as InjurySiteKey).localeCompare(labelForSiteKey(b[0] as InjurySiteKey)),
    );
  }, [activeBySite]);

  const timeline = useMemo(
    () => [...episodes].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [episodes],
  );

  if (episodes.length === 0) {
    return (
      <div className="text-zinc-500 text-sm space-y-2">
        <p>No body-area episodes yet.</p>
        <p>
          Turn sites on under{' '}
          <Link href="/recovery" className="text-amber-400 hover:underline">
            Daily Check-In
          </Link>
          &nbsp;→ <span className="text-zinc-400">&quot;Current injuries &amp; body state.&quot;</span> Active sites
          and notes sync here automatically.
        </p>
      </div>
    );
  }

  const resolvedN = timeline.filter((e) => Boolean(e.endedAt)).length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-400">
        Same log as Daily Check-In —{' '}
        <Link href="/recovery" className="text-amber-400 hover:underline">
          open Check-In to edit
        </Link>
        .
      </p>

      {activeList.length > 0 && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-950/20 px-4 py-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wider text-amber-200/80">Active areas</div>
          <ul className="flex flex-wrap gap-2">
            {activeList.map(([sk, ep]) => (
              <li
                key={sk}
                className="text-xs rounded-lg bg-zinc-900 border border-zinc-700 px-2.5 py-1 text-zinc-200"
              >
                <span>{labelForSiteKey(sk as InjurySiteKey)}</span>
                <span className="text-zinc-500"> · {ep.kind}</span>
                <span className="text-zinc-600 font-mono text-[11px] block mt-0.5">
                  since {fmtInjuryInstant(ep.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Summary</div>
        <div className="mt-1 text-sm text-zinc-300">
          <span className="font-mono text-amber-400/90">{activeList.length}</span> active
          {activeList.length === 1 ? ' site' : ' sites'} ·{' '}
          <span className="font-mono text-zinc-400">{resolvedN}</span> resolved episode{resolvedN === 1 ? '' : 's'} ·{' '}
          <span className="font-mono text-zinc-400">{timeline.length}</span> total episode
          {timeline.length === 1 ? '' : 's'}
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
        <div className="px-4 py-3 text-xs uppercase tracking-wider text-zinc-500">
          Timeline (most recent started first)
        </div>
        {timeline.map((e) => {
          const site = labelForSiteKey(e.siteKey as InjurySiteKey);
          const open = !e.endedAt;
          return (
            <div key={e.id} className="p-4 space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-zinc-100">{site}</div>
                  <div className="text-[11px] text-zinc-500 capitalize mt-0.5">{e.kind}</div>
                </div>
                <div
                  className={`text-[11px] font-medium uppercase tracking-wide shrink-0 ${
                    open ? 'text-rose-400' : 'text-zinc-500'
                  }`}
                >
                  {open ? 'Active' : 'Resolved'}
                </div>
              </div>
              <div className="text-xs font-mono text-zinc-500 space-y-0.5">
                <div>Started · {fmtInjuryInstant(e.startedAt)}</div>
                {e.endedAt && (
                  <div>
                    Ended · {fmtInjuryInstant(e.endedAt)}
                    {' · '}
                    {injuryEpisodeDurationDays(e.startedAt, e.endedAt)}d tracked
                  </div>
                )}
              </div>
              {e.notes && (
                <div className="text-xs text-zinc-400 border-t border-zinc-800 pt-2 whitespace-pre-wrap">{e.notes}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function macroPct(actual: number, target: number): string | null {
  if (target <= 0) return null;
  return `${Math.round((actual / target) * 100)}%`;
}

function hydrationMlToOz(ml: number): number {
  return Math.round((ml / 29.5737) * 10) / 10;
}

function HydrationList({ logs }: { logs: HydrationLog[] }) {
  const [editing, setEditing] = useState<HydrationLog | null>(null);

  if (logs.length === 0) {
    return (
      <div className="text-zinc-500 text-sm">
        No hydration logs yet…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {editing && (
        <HydrationLogEditSheet key={editing.id} log={editing} onClose={() => setEditing(null)} />
      )}
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
        {logs.map((h) => {
          const actualOz = hydrationMlToOz(h.waterActualMl);
          const targetOz = hydrationMlToOz(h.waterTargetMl);
          return (
            <div key={h.id} className="p-3 space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-zinc-200">
                    {fmtDate(h.date, 'EEE, MMM d, yyyy')}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {h.electrolytes && (
                      <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                        Electrolytes
                      </span>
                    )}
                    {h.urineColor != null && (
                      <span className="text-[11px] text-zinc-500">Urine color {h.urineColor}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="text-right">
                    <div className="font-mono text-sm text-sky-300">
                      {actualOz}
                      <span className="text-zinc-500 text-xs"> / {targetOz} oz</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditing(h)}
                    className="text-xs px-2 h-8 rounded-md border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-zinc-600"
                  >
                    Edit
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DietList({ logs }: { logs: NutritionLog[] }) {
  const [editing, setEditing] = useState<NutritionLog | null>(null);
  const sorted = useMemo(
    () => [...logs].sort((a, b) => b.date.localeCompare(a.date)),
    [logs],
  );
  const sparkSeries = useMemo(() => {
    const ch = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    return {
      actual: ch.map((n) => n.caloriesActual),
      target: ch.map((n) => n.caloriesTarget),
    };
  }, [logs]);

  if (sorted.length === 0) {
    return (
      <div className="text-zinc-500 text-sm">
        No diet logs yet. Enter macros and calories on Daily Check-In (nutrition section).
      </div>
    );
  }

  const latest = sorted[0];

  return (
    <div className="space-y-3">
      {editing && (
        <NutritionLogEditSheet key={editing.id} log={editing} onClose={() => setEditing(null)} />
      )}
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Latest day</div>
            <div className="text-lg font-medium text-zinc-100">{fmtDate(latest.date, 'EEE, MMM d')}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">
              {sorted.length} day{sorted.length === 1 ? '' : 's'} logged
            </span>
            <button
              type="button"
              onClick={() => setEditing(latest)}
              className="text-xs px-2 h-8 rounded-md border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-zinc-600"
            >
              Edit
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-[11px] uppercase text-zinc-500">Calories</div>
            <div className="font-mono text-zinc-100">
              {latest.caloriesActual}
              <span className="text-zinc-500 text-xs"> / {latest.caloriesTarget}</span>
            </div>
            {macroPct(latest.caloriesActual, latest.caloriesTarget) && (
              <div className="text-xs text-zinc-500">{macroPct(latest.caloriesActual, latest.caloriesTarget)} of target</div>
            )}
          </div>
          <div>
            <div className="text-[11px] uppercase text-zinc-500">Protein</div>
            <div className="font-mono text-zinc-100">
              {latest.proteinActualG}g
              <span className="text-zinc-500 text-xs"> / {latest.proteinTargetG}g</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-zinc-500">Carbs</div>
            <div className="font-mono text-zinc-100">
              {latest.carbsActualG}g
              <span className="text-zinc-500 text-xs"> / {latest.carbsTargetG}g</span>
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase text-zinc-500">Fat</div>
            <div className="font-mono text-zinc-100">
              {latest.fatActualG}g
              <span className="text-zinc-500 text-xs"> / {latest.fatTargetG}g</span>
            </div>
          </div>
        </div>
        {sparkSeries.actual.length >= 2 && (
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">
              Calories trend (actual vs target)
            </div>
            <Sparkline
              values={sparkSeries.actual}
              overlay={sparkSeries.target}
              height={100}
              width={320}
            />
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
        {sorted.map((n) => (
          <div key={n.id} className="p-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-zinc-200">{fmtDate(n.date, 'EEE, MMM d, yyyy')}</div>
                <div className="text-[11px] text-zinc-500">
                  Meals logged: {n.mealsLoggedCount}
                  {n.mealTimestamps && n.mealTimestamps.length > 0 && (
                    <span className="ml-2">· {n.mealTimestamps.length} check-in times</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <div className="font-mono text-sm text-amber-400">
                    {n.caloriesActual}
                    <span className="text-zinc-500 text-xs"> / {n.caloriesTarget} kcal</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(n)}
                  className="text-xs px-2 h-8 rounded-md border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-zinc-600"
                >
                  Edit
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs font-mono">
              <div className="rounded-lg bg-zinc-950/80 px-2 py-1.5 border border-zinc-800">
                <span className="text-zinc-500">P </span>
                {n.proteinActualG}/{n.proteinTargetG}g
              </div>
              <div className="rounded-lg bg-zinc-950/80 px-2 py-1.5 border border-zinc-800">
                <span className="text-zinc-500">C </span>
                {n.carbsActualG}/{n.carbsTargetG}g
              </div>
              <div className="rounded-lg bg-zinc-950/80 px-2 py-1.5 border border-zinc-800">
                <span className="text-zinc-500">F </span>
                {n.fatActualG}/{n.fatTargetG}g
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiftingGoalCard({
  title,
  subtitle,
  currentLabel,
  targetLabel,
  pct,
  done,
  pctLabel,
  remaining,
  milestoneNote,
}: {
  title: string;
  subtitle?: ReactNode;
  currentLabel: string;
  targetLabel: string;
  pct: number;
  done: boolean;
  pctLabel?: string;
  remaining?: string;
  milestoneNote?: ReactNode;
}) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium text-zinc-100">{title}</div>
          {subtitle}
        </div>
        <span
          className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 border ${
            done
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
          }`}
        >
          {done ? '✓ Done' : 'In progress'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
        <div className="h-full rounded-full bg-amber-500" style={{ width: `${clamped}%` }} />
      </div>
      {milestoneNote}
      <div className="font-mono text-xs text-zinc-400">
        {currentLabel} / {targetLabel}
      </div>
      {done ? (
        <div className="text-xs text-emerald-400">✓ Goal reached</div>
      ) : (
        <>
          {pctLabel != null && <div className="text-xs text-zinc-400">{pctLabel}</div>}
          {remaining != null && <div className="text-xs text-zinc-500">{remaining}</div>}
        </>
      )}
    </div>
  );
}


function goalProgress(goal: UserGoal, current: number): { pct: number; lbsToGo: number } {
  if (goal.metric === 'bodyweight') {
    const range = goal.baselineValue - goal.targetValue;
    const pct =
      range <= 0
        ? 0
        : Math.min(100, Math.max(0, ((goal.baselineValue - current) / range) * 100));
    const lbsToGo = Math.max(0, current - goal.targetValue);
    return { pct, lbsToGo };
  }
  const pct =
    goal.targetValue > 0 ? Math.min(100, (current / goal.targetValue) * 100) : 0;
  const lbsToGo = Math.max(0, goal.targetValue - current);
  return { pct, lbsToGo };
}

function GoalsView({
  goals,
  sets,
  lifts,
  bodyweightLogs,
  onNew,
}: {
  goals: UserGoal[];
  sets: SetLog[];
  lifts: Lift[];
  bodyweightLogs: BodyweightLog[];
  onNew: () => void;
}) {
  const liftMap = useMemo(
    () => new Map(lifts.map((l) => [l.id, l])),
    [lifts],
  );
  const active = goals.filter((g) => !g.achievedAt);
  const achieved = goals.filter((g) => g.achievedAt);
  const today = todayIso();

  return (
    <div className="space-y-4 pb-8">
      <button
        type="button"
        onClick={onNew}
        className="w-full h-11 rounded-2xl border border-dashed border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center justify-center gap-2"
      >
        <span className="text-lg">+</span> New Goal
      </button>

      {active.length === 0 && achieved.length === 0 && (
        <p className="text-sm text-zinc-600 text-center py-8">
          No goals yet. Tap + New Goal to set your first target.
        </p>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          {active.map((goal) => {
            const lift = goal.metric === 'bodyweight' ? undefined : liftMap.get(goal.liftId);
            const current = currentValueForGoal(goal, sets, bodyweightLogs);
            const { pct, lbsToGo } = goalProgress(goal, current);
            const daysLeft = goal.deadline
              ? daysBetweenIso(today, goal.deadline)
              : null;
            return (
              <GoalCard
                key={goal.id}
                goal={goal}
                lift={lift}
                current={current}
                pct={pct}
                lbsToGo={lbsToGo}
                daysLeft={daysLeft}
                done={false}
                onDelete={async () => {
                  const snapshot = { ...goal };
                  await localDelete('user_goals', goal.id);
                  offerDeleteUndo({
                    kind: 'batch',
                    label: `Delete "${goal.label}"`,
                    restore: async () => {
                      await localUpsert('user_goals', snapshot);
                    },
                  });
                }}
              />
            );
          })}
        </div>
      )}

      {achieved.length > 0 && (
        <>
          <div className="text-xs uppercase tracking-wide text-zinc-600 pt-2">Achieved</div>
          <div className="space-y-3">
            {achieved.map((goal) => {
              const lift = goal.metric === 'bodyweight' ? undefined : liftMap.get(goal.liftId);
              const current = currentValueForGoal(goal, sets, bodyweightLogs);
              return (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  lift={lift}
                  current={current}
                  pct={100}
                  lbsToGo={0}
                  daysLeft={null}
                  done={true}
                  onDelete={async () => {
                    const snapshot = { ...goal };
                    await localDelete('user_goals', goal.id);
                    offerDeleteUndo({
                      kind: 'batch',
                      label: `Delete "${goal.label}"`,
                      restore: async () => {
                        await localUpsert('user_goals', snapshot);
                      },
                    });
                  }}
                />
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function GoalCard({
  goal,
  lift,
  current,
  pct,
  lbsToGo,
  daysLeft,
  done,
  onDelete,
}: {
  goal: UserGoal;
  lift: Lift | undefined;
  current: number;
  pct: number;
  lbsToGo: number;
  daysLeft: number | null;
  done: boolean;
  onDelete: () => void;
}) {
  const metricLabel =
    goal.metric === '1rm' ? '1RM' :
    goal.metric === 'reps' ? 'reps' :
    goal.metric === 'bodyweight' ? 'body weight' :
    goal.targetReps ? `${goal.targetReps}RM` : 'working';

  const liftLine =
    goal.metric === 'bodyweight' ? 'Body weight' : (lift?.name ?? goal.liftId);

  const currentLabel = goal.metric === 'bodyweight'
    ? `${current} lb`
    : goal.metric === 'reps'
      ? `${current} reps`
      : `${current} lb`;
  const targetLabel = goal.metric === 'bodyweight'
    ? `${goal.targetValue} lb`
    : goal.metric === 'reps'
      ? `${goal.targetValue} reps`
      : goal.metric === 'working_set' && goal.targetReps
        ? `${goal.targetValue} lb × ${goal.targetReps}`
        : `${goal.targetValue} lb`;

  const setDate = new Date(goal.createdAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const achievedDate = goal.achievedAt
    ? new Date(goal.achievedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  const baselineSuffix =
    goal.metric === 'reps'
      ? `${goal.baselineValue} reps`
      : `${goal.baselineValue} lb`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => void onDelete()}
        aria-label={`Delete goal: ${goal.label}`}
        className="absolute top-3 right-3 z-10 h-6 w-6 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-rose-400 text-xs flex items-center justify-center transition-colors"
      >
        ×
      </button>
      <LiftingGoalCard
        title={goal.label}
        subtitle={
          <div className="text-xs text-zinc-500 mt-0.5">
            {liftLine} · {metricLabel}
            {goal.baselineValue > 0 && ` · started at ${baselineSuffix}`}
          </div>
        }
        currentLabel={currentLabel}
        targetLabel={targetLabel}
        pct={pct}
        done={done}
        pctLabel={`${Math.round(pct)}% complete`}
        remaining={
          done
            ? achievedDate
              ? `Achieved ${achievedDate}`
              : undefined
            : goal.metric === 'bodyweight' && lbsToGo > 0
              ? `${lbsToGo} lb to lose${
                  daysLeft != null
                    ? ` · ${daysLeft > 0 ? `${daysLeft} days left` : 'deadline passed'}`
                    : ''
                }`
              : lbsToGo > 0
                ? `${goal.metric === 'reps' ? `${lbsToGo} reps` : `${lbsToGo} lb`} to go${
                    daysLeft != null
                      ? ` · ${daysLeft > 0 ? `${daysLeft} days left` : 'deadline passed'}`
                      : ''
                  }`
                : undefined
        }
        milestoneNote={
          <div className="text-[10px] text-zinc-600">
            Set {setDate}
            {goal.baselineValue > 0 && ` · baseline ${baselineSuffix}`}
          </div>
        }
      />
    </div>
  );
}

function GoalWriterSheet({
  sets,
  lifts,
  bodyweightLogs,
  onClose,
}: {
  sets: SetLog[];
  lifts: Lift[];
  bodyweightLogs: BodyweightLog[];
  onClose: () => void;
}) {
  const strengthLifts = useMemo(
    () =>
      lifts
        .filter((l) => l.equipment !== 'cardio' && l.equipment !== 'time')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [lifts],
  );
  const [liftQuery, setLiftQuery] = useState('');
  const [liftId, setLiftId] = useState(strengthLifts[0]?.id ?? '');
  const [label, setLabel] = useState(strengthLifts[0]?.name ?? '');
  const [metric, setMetric] = useState<GoalMetric>('1rm');
  const [targetValue, setTargetValue] = useState('');
  const [targetReps, setTargetReps] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);

  const filteredLifts = useMemo(() => {
    const q = liftQuery.trim().toLowerCase();
    if (!q) return strengthLifts;
    return strengthLifts.filter(
      (l) => l.name.toLowerCase().includes(q) || l.id.toLowerCase().includes(q),
    );
  }, [liftQuery, strengthLifts]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    const effectiveLiftId = metric === 'bodyweight' ? 'bodyweight' : liftId;
    if (!effectiveLiftId || !label.trim()) return;
    const target = Number(targetValue);
    if (!Number.isFinite(target) || target <= 0) return;
    const reps =
      metric === 'working_set' && targetReps.trim()
        ? Number(targetReps)
        : null;
    if (metric === 'working_set' && targetReps.trim() && (!Number.isFinite(reps!) || reps! < 1)) {
      return;
    }

    const draft: UserGoal = {
      id: `goal-${effectiveLiftId}-${metric}-${Date.now()}`,
      userId: '',
      liftId: effectiveLiftId,
      label: label.trim(),
      metric,
      targetValue: target,
      targetReps: metric === 'working_set' ? reps : null,
      deadline: deadline.trim() || null,
      createdAt: new Date().toISOString(),
      achievedAt: null,
      baselineValue: 0,
      active: true,
      updatedAt: new Date().toISOString(),
    };
    draft.baselineValue = currentValueForGoal(draft, sets, bodyweightLogs);

    setBusy(true);
    try {
      await localUpsert('user_goals', draft);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="goal-writer-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(92dvh,720px)] flex flex-col"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0 flex items-center justify-between gap-2">
          <h2 id="goal-writer-title" className="text-lg font-semibold text-zinc-100">New goal</h2>
          <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-xl leading-none px-2" aria-label="Close">×</button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto flex-1">
          {metric !== 'bodyweight' && (
            <>
              <label className="block text-xs text-zinc-500">
                Search lift
                <input
                  type="search"
                  value={liftQuery}
                  onChange={(e) => setLiftQuery(e.target.value)}
                  placeholder="Filter lifts…"
                  className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
                />
              </label>
              <label className="block text-xs text-zinc-500">
                Lift
                <select
                  value={liftId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setLiftId(id);
                    const lift = strengthLifts.find((l) => l.id === id);
                    if (lift) setLabel(lift.name);
                  }}
                  className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
                >
                  {filteredLifts.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="block text-xs text-zinc-500">
            Goal label
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
            />
          </label>
          <label className="block text-xs text-zinc-500">
            Metric
            <select
              value={metric}
              onChange={(e) => {
                const next = e.target.value as GoalMetric;
                setMetric(next);
                if (next === 'bodyweight') {
                  setLiftId('bodyweight');
                  if (!label.trim()) setLabel('Body weight');
                } else if (liftId === 'bodyweight') {
                  const first = strengthLifts[0];
                  setLiftId(first?.id ?? '');
                  setLabel(first?.name ?? '');
                }
              }}
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
            >
              <option value="1rm">1RM</option>
              <option value="working_set">Working set</option>
              <option value="reps">Reps (bodyweight)</option>
              <option value="bodyweight">Body weight</option>
            </select>
          </label>
          <label className="block text-xs text-zinc-500">
            {metric === 'reps' ? 'Target reps' : 'Target weight (lb)'}
            <input
              type="number"
              min={1}
              step={metric === 'reps' ? 1 : 2.5}
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
            />
            {metric === 'bodyweight' && (
              <p className="text-[11px] text-zinc-500 mt-1">
                Goal achieved when bodyweight reaches or drops below this number.
              </p>
            )}
          </label>
          {metric === 'working_set' && (
            <label className="block text-xs text-zinc-500">
              Target reps (optional, for NRM goals)
              <input
                type="number"
                min={1}
                max={20}
                value={targetReps}
                onChange={(e) => setTargetReps(e.target.value)}
                placeholder="e.g. 5 for 5RM"
                className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
              />
            </label>
          )}
          <label className="block text-xs text-zinc-500">
            Deadline (optional)
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="mt-1 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200"
            />
          </label>
        </div>
        <div className="p-4 border-t border-zinc-800 shrink-0">
          <button
            type="button"
            disabled={
              busy ||
              !label.trim() ||
              !targetValue ||
              (metric !== 'bodyweight' && !liftId)
            }
            onClick={() => void save()}
            className="w-full h-11 rounded-xl bg-amber-500 text-zinc-950 font-medium disabled:opacity-50"
          >
            Save goal
          </button>
        </div>
      </div>
    </div>
  );
}

function liftLabel(liftId: string): string {
  return LIFTS.find((l) => l.id === liftId)?.name ?? liftId;
}

function renderLiftValue(
  liftId: string,
  value: number,
  source: ValueSource | null,
): ReactNode {
  const name = liftLabel(liftId);
  if (!source) {
    return (
      <span>
        {name}: <span className="font-mono">{Math.round(value)} lb</span>
        <span className="text-zinc-600"> (working)</span>
      </span>
    );
  }
  if (!source.isEstimate && source.directBest != null) {
    return (
      <span>
        {name}:{' '}
        <span className="font-mono text-zinc-200">
          {Math.round(source.directBest)} lb
        </span>
        <span className="text-zinc-600">
          {' '}
          (tested {source.directSet?.intent === 'max_test' ? 'max' : 'single'})
        </span>
      </span>
    );
  }
  return (
    <span>
      {name}:{' '}
      <span className="font-mono text-amber-300/80">
        ~{Math.round(value)} lb
      </span>
      <span className="text-zinc-600">
        {' '}
        (e1RM from {source.estimatedSet?.weight}×{source.estimatedSet?.reps})
      </span>
    </span>
  );
}

function StrengthBalanceStatusBadge({ result }: { result: RatioResult }) {
  if (result.status === 'above') {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
        Above range
      </span>
    );
  }
  if (result.status === 'within') {
    return (
      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
        On target
      </span>
    );
  }
  if (result.gapPct >= 15) {
    return (
      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-medium text-rose-400">
        Gap
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
      Below target
    </span>
  );
}

function StrengthBalanceRatioBar({ result }: { result: RatioResult }) {
  const { standard, ratio, status, gapPct } = result;
  const visualMin = Math.min(standard.targetMin * 0.85, ratio);
  const visualMax = Math.max(standard.targetMax * 1.15, ratio);
  const span = visualMax - visualMin || 1;
  const posPct = Math.min(100, Math.max(0, ((ratio - visualMin) / span) * 100));
  const rangeLeft = ((standard.targetMin - visualMin) / span) * 100;
  const rangeWidth = ((standard.targetMax - standard.targetMin) / span) * 100;

  const markerColor =
    status === 'below'
      ? gapPct >= 15
        ? 'bg-rose-400'
        : 'bg-amber-400'
      : 'bg-emerald-400';

  return (
    <div className="space-y-1.5">
      <div className="relative h-2 rounded-full bg-zinc-800">
        <div
          className="absolute inset-y-0 rounded-full bg-amber-500/20"
          style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }}
        />
        <div
          className={`absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${markerColor}`}
          style={{ left: `${posPct}%` }}
        />
      </div>
      <div className="text-xs font-mono text-zinc-400">
        Current: {ratio.toFixed(2)} | Target: {standard.targetMin.toFixed(2)}–{standard.targetMax.toFixed(2)}
      </div>
    </div>
  );
}

function StrengthBalanceView({
  sets,
  sessions,
}: {
  sets: SetLog[];
  sessions: SessionLog[];
}) {
  const results = useMemo(
    () => computeStrengthBalance(sets, sessions),
    [sets, sessions],
  );

  const topResult = results.length > 0 ? results[0] : null;
  const allOnTarget =
    results.length > 0
    && results.every((r) => r.status === 'within' || r.status === 'above');

  if (results.length === 0) {
    return (
      <div className="text-sm text-zinc-500">
        Log working sets or max tests for the main lifts to see strength balance ratios.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {allOnTarget ? (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-4 text-sm text-zinc-300">
          All ratios within normal range — maintain current training balance.
        </div>
      ) : topResult && topResult.roiScore > 0 ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4 space-y-1">
          <div className="text-xs uppercase tracking-wide text-amber-400">Highest ROI focus</div>
          <div className="text-base font-semibold text-zinc-100">{topResult.standard.label}</div>
          <div className="text-xs text-zinc-400">
            {topResult.gapPct.toFixed(1)}% below target range · benefits{' '}
            {topResult.standard.downstreamBenefit} connected lifts
          </div>
          <div className="text-xs text-zinc-500 mt-1">{topResult.standard.description}</div>
        </div>
      ) : null}

      {results.map((result) => {
        const isTopRoi =
          topResult != null
          && result.standard.id === topResult.standard.id
          && topResult.roiScore > 0;

        return (
          <div
            key={result.standard.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-zinc-100">{result.standard.label}</span>
              <StrengthBalanceStatusBadge result={result} />
            </div>

            <StrengthBalanceRatioBar result={result} />

            <div className="text-xs text-zinc-500 space-y-0.5">
              <div>
                {renderLiftValue(
                  result.standard.numeratorLiftId,
                  result.numeratorValue,
                  result.numeratorSource,
                )}
              </div>
              <div>
                {renderLiftValue(
                  result.standard.denominatorLiftId,
                  result.denominatorValue,
                  result.denominatorSource,
                )}
              </div>
            </div>

            {(result.numeratorSource?.prOpportunity ||
              result.denominatorSource?.prOpportunity) && (
              <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 space-y-0.5">
                <div className="text-[10px] uppercase tracking-wide text-emerald-400 font-medium">
                  Potential PR on next test
                </div>
                {result.numeratorSource?.prOpportunity && (
                  <div className="text-xs text-zinc-400">
                    {liftLabel(result.standard.numeratorLiftId)}:{' '}
                    tested {result.numeratorSource.directBest} lb,
                    e1RM suggests ~{result.numeratorSource.estimatedBest} lb
                    ({result.numeratorSource.estimatedSet?.weight}×
                    {result.numeratorSource.estimatedSet?.reps})
                  </div>
                )}
                {result.denominatorSource?.prOpportunity && (
                  <div className="text-xs text-zinc-400">
                    {liftLabel(result.standard.denominatorLiftId)}:{' '}
                    tested {result.denominatorSource.directBest} lb,
                    e1RM suggests ~{result.denominatorSource.estimatedBest} lb
                    ({result.denominatorSource.estimatedSet?.weight}×
                    {result.denominatorSource.estimatedSet?.reps})
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-zinc-500 leading-snug">{result.standard.description}</p>

            {result.gapPct > 5 && (
              <div className="space-y-1 pt-1 border-t border-zinc-800/80">
                {isTopRoi && (
                  <div className="text-[10px] font-medium text-amber-400">
                    ↑ Highest training ROI
                  </div>
                )}
                <div className="text-xs text-zinc-500">
                  Improving {liftLabel(result.standard.numeratorLiftId)} benefits{' '}
                  {result.standard.downstreamBenefit} other lift
                  {result.standard.downstreamBenefit === 1 ? '' : 's'}.
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HrvList({ readiness }: { readiness: ReadinessLog[] }) {
  const sortedDesc = useMemo(
    () => [...readiness].sort((a, b) => b.date.localeCompare(a.date)),
    [readiness],
  );

  const measured = useMemo(() => measuredHrvAsc(readiness), [readiness]);

  const hrvSeries = useMemo(() => {
    const values = measured.map((r) => r.hrvRmssd);
    const rolling = values.map((_, i) => {
      const w = values.slice(Math.max(0, i - 3), i + 1);
      return w.reduce((s, x) => s + x, 0) / w.length;
    });
    return { values, rolling };
  }, [measured]);

  const variabilitySeries = useMemo(() => buildHrvVariabilitySeries(measured), [measured]);
  const latestVariability =
    variabilitySeries.length > 0 ? variabilitySeries[variabilitySeries.length - 1] : undefined;
  const sdSeries = useMemo(() => variabilitySeries.map((p) => p.sdRmssd), [variabilitySeries]);
  const cvSeries = useMemo(() => variabilitySeries.map((p) => p.cvPct), [variabilitySeries]);

  const recoveryVariabilityHint = useMemo(
    () => describeHrvRecoveryVariability(latestVariability),
    [latestVariability],
  );

  const { values, rolling } = hrvSeries;
  const lastReading = measured.length > 0 ? measured[measured.length - 1] : null;
  const firstReading = measured.length > 0 ? measured[0] : null;

  if (readiness.length === 0) {
    return (
      <div className="text-zinc-500 text-sm space-y-1">
        <p>No check-ins yet.</p>
        <p className="text-xs text-zinc-600">HRV (RMSSD, 5 min) is logged with your session check-in.</p>
      </div>
    );
  }

  const readingsCount = measured.length;
  const skippedCount = sortedDesc.filter((r) => r.hrvSkipped).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Morning HRV is optional RMSSD from a 5-minute measurement, saved with session check-in. Derived variability (SD / CV)
        is informational only and does not change your program.
      </p>

      {readingsCount >= 1 && lastReading && lastReading.hrvRmssd != null && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500">Latest reading</div>
              <div className="text-3xl font-mono text-zinc-100">
                {lastReading.hrvRmssd} <span className="text-sm text-zinc-500">ms RMSSD</span>
              </div>
              <div className="text-xs text-zinc-500">{fmtDate(lastReading.date, 'EEE M/d')} · {isoWeekOf(lastReading.date)}</div>
            </div>
            {readingsCount >= 2 && firstReading && firstReading.hrvRmssd != null && (
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-zinc-500">vs first in range</div>
                <div className="text-xl font-mono text-zinc-300">
                  {lastReading.hrvRmssd - firstReading.hrvRmssd > 0 ? '+' : ''}
                  {(lastReading.hrvRmssd - firstReading.hrvRmssd).toFixed(0)} <span className="text-xs">ms</span>
                </div>
              </div>
            )}
          </div>
          {values.length >= 2 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Trend (RMSSD + 4-point rolling avg)</div>
              <Sparkline values={values} overlay={rolling} height={110} stroke="#38bdf8" />
            </div>
          )}

          {values.length >= 3 && sdSeries.length >= 3 && (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 p-3 space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-0.5">Variability vs recovery context</div>
                <p className="text-[11px] text-zinc-600 leading-snug">
                  Rolling stats use your last up to 7 RMSSD readings per point: SD = spread (ms), CV = spread relative to the
                  window mean. Higher CV means more bounce between check-ins; it does not by itself say “good” or “bad.”
                </p>
              </div>
              {sdSeries.length >= 2 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-zinc-600 mb-1">Rolling SD (ms)</div>
                  <Sparkline values={sdSeries} height={72} stroke="#a78bfa" fill="rgba(167, 139, 250, 0.08)" showDots />
                </div>
              )}
              {cvSeries.length >= 2 && (
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-zinc-600 mb-1">Rolling CV (%)</div>
                  <Sparkline values={cvSeries} height={72} stroke="#34d399" fill="rgba(52, 211, 153, 0.08)" showDots />
                </div>
              )}
              {latestVariability && (
                <div className="space-y-1 text-xs text-zinc-400 border-t border-zinc-800 pt-2">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px]">
                    <span>
                      Latest window SD <span className="text-violet-300">{latestVariability.sdRmssd.toFixed(1)} ms</span>
                    </span>
                    <span>
                      CV <span className="text-emerald-300">{latestVariability.cvPct.toFixed(0)}%</span>
                    </span>
                    <span>
                      Mean RMSSD <span className="text-zinc-300">{latestVariability.meanRmssd.toFixed(0)} ms</span>
                      <span className="text-zinc-600"> · n={latestVariability.windowN}</span>
                    </span>
                  </div>
                  {recoveryVariabilityHint && (
                    <p className="text-[11px] text-zinc-500 leading-relaxed">{recoveryVariabilityHint}</p>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
            <span>{readingsCount} reading{readingsCount === 1 ? '' : 's'}</span>
            {skippedCount > 0 && <span>{skippedCount} check-in{skippedCount === 1 ? '' : 's'} skipped HRV</span>}
          </div>
        </div>
      )}

      {readingsCount === 0 && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
          No RMSSD readings yet. Use Skip HRV or enter a value on session check-in to build this chart.
        </div>
      )}

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
        <div className="px-3 py-2 text-[11px] uppercase tracking-wider text-zinc-600">Check-ins (newest first)</div>
        {sortedDesc.slice(0, 48).map((r) => (
          <div key={r.id} className="p-3 flex items-baseline justify-between gap-2 text-sm">
            <div>
              <div className="text-zinc-300">{fmtDate(r.date, 'EEE MMM d, yyyy')}</div>
              <div className="text-xs text-zinc-500">{isoWeekOf(r.date)}</div>
            </div>
            <div className="text-right font-mono shrink-0">
              {r.hrvSkipped ? (
                <span className="text-zinc-500">Skipped</span>
              ) : r.hrvRmssd != null ? (
                <span className="text-sky-300">{r.hrvRmssd} ms</span>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MeasurementsList({ logs }: { logs: BodyMeasurementLog[] }) {
  const [editing, setEditing] = useState<BodyMeasurementLog | null>(null);
  const logByDate = useMemo(() => {
    const m = new Map<string, BodyMeasurementLog>();
    for (const x of logs) m.set(x.date, x);
    return m;
  }, [logs]);
  const points = useMemo(() => bodyMeasurementSeries(logs), [logs]);
  if (points.length === 0) {
    return (
      <div className="text-zinc-500 text-sm space-y-1">
        <p>No body measurements yet.</p>
        <p className="text-xs text-zinc-600">Log waist, abdomen, and hips (in) from Today or the Daily Check-In.</p>
      </div>
    );
  }

  const last = points[points.length - 1];
  const first = points[0];

  const metrics = [
    {
      key: 'waist' as const,
      label: 'Waist',
      hint: 'narrowest',
      raw: points.map((p) => p.waist),
      roll: points.map((p) => p.rollingWaist4w),
      latest: last.waist,
      firstVal: first.waist,
      stroke: '#22d3ee',
    },
    {
      key: 'abdomen' as const,
      label: 'Abdomen',
      hint: 'at navel',
      raw: points.map((p) => p.abdomen),
      roll: points.map((p) => p.rollingAbdomen4w),
      latest: last.abdomen,
      firstVal: first.abdomen,
      stroke: '#a78bfa',
    },
    {
      key: 'hips' as const,
      label: 'Hips',
      hint: 'widest',
      raw: points.map((p) => p.hips),
      roll: points.map((p) => p.rollingHips4w),
      latest: last.hips,
      firstVal: first.hips,
      stroke: '#f472b6',
    },
  ];

  return (
    <div className="space-y-3">
      {editing && (
        <BodyMeasurementLogEditSheet key={editing.id} log={editing} onClose={() => setEditing(null)} />
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-zinc-500 flex-1 min-w-[12rem]">
          Trends use your logged inches. The dashed line is a rolling average of the last up to four entries (same window as
          bodyweight on the BW tab).
        </p>
        <button
          type="button"
          onClick={() => {
            const row = logByDate.get(last.date);
            if (row) setEditing(row);
          }}
          className="text-xs px-2 h-8 rounded-md border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-zinc-600 shrink-0"
        >
          Edit latest
        </button>
      </div>
      {metrics.map((m) => {
        const delta = +(m.latest - m.firstVal).toFixed(2);
        return (
          <div
            key={m.key}
            className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <div className="text-xs uppercase tracking-wider text-zinc-500">
                  {m.label} <span className="normal-case text-zinc-600">· {m.hint}</span>
                </div>
                <div className="text-3xl font-mono text-zinc-100">
                  {m.latest} <span className="text-sm text-zinc-500">in</span>
                </div>
                <div className="text-xs text-zinc-500">
                  {fmtDate(last.date, 'EEE M/d')} · {last.isoWeek}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-zinc-500">vs first entry</div>
                <div className="text-2xl font-mono text-zinc-300">
                  {delta > 0 ? '+' : ''}
                  {delta} <span className="text-xs">in</span>
                </div>
                <div className="text-xs text-zinc-500">{points.length} entries</div>
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Trend (raw + rolling avg)</div>
              <Sparkline values={m.raw} overlay={m.roll} height={120} stroke={m.stroke} />
            </div>
          </div>
        );
      })}

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
        {[...points].reverse().slice(0, 24).map((p) => {
          const rowLog = logByDate.get(p.date);
          return (
            <div key={p.date} className="p-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <div>
                <div className="text-zinc-300">{fmtDate(p.date, 'EEE MMM d, yyyy')}</div>
                <div className="text-xs text-zinc-500">{p.isoWeek}</div>
              </div>
              <div className="flex flex-wrap items-baseline justify-end gap-2 sm:gap-4">
                <div className="flex gap-4 text-right font-mono text-xs sm:text-sm">
                  <div>
                    <span className="text-zinc-600">W </span>
                    <span className="text-cyan-300/90">{p.waist}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600">A </span>
                    <span className="text-violet-300/90">{p.abdomen}</span>
                  </div>
                  <div>
                    <span className="text-zinc-600">H </span>
                    <span className="text-pink-300/90">{p.hips}</span>
                  </div>
                </div>
                {rowLog && (
                  <button
                    type="button"
                    onClick={() => setEditing(rowLog)}
                    className="text-xs px-2 h-8 rounded-md border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-zinc-600 shrink-0"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BodyweightList({ logs }: { logs: BodyweightLog[] }) {
  const [editing, setEditing] = useState<BodyweightLog | null>(null);
  const logByDate = useMemo(() => {
    const m = new Map<string, BodyweightLog>();
    for (const x of logs) m.set(x.date, x);
    return m;
  }, [logs]);
  const points = useMemo(() => bodyweightSeries(logs), [logs]);
  if (points.length === 0) {
    return <div className="text-zinc-500 text-sm">No bodyweight entries yet.</div>;
  }

  const raw = points.map((p) => p.bodyweight);
  const avg = points.map((p) => p.rolling4w);
  const last = points[points.length - 1];
  const first = points[0];
  const delta = +(last.bodyweight - first.bodyweight).toFixed(1);
  const deltaColor = delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-rose-400' : 'text-zinc-500';

  const latestLog = logByDate.get(last.date);

  return (
    <div className="space-y-3">
      {editing && (
        <BodyweightLogEditSheet key={editing.id} log={editing} onClose={() => setEditing(null)} />
      )}
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Latest</div>
            <div className="text-3xl font-mono">{last.bodyweight} <span className="text-sm text-zinc-500">lb</span></div>
            <div className="text-xs text-zinc-500">{fmtDate(last.date, 'EEE M/d')} · {last.isoWeek}</div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="text-right">
              <div className="text-xs uppercase tracking-wider text-zinc-500">vs first entry</div>
              <div className={`text-2xl font-mono ${deltaColor}`}>
                {delta > 0 ? '+' : ''}{delta} <span className="text-xs">lb</span>
              </div>
              <div className="text-xs text-zinc-500">{points.length} entries</div>
            </div>
            {latestLog && (
              <button
                type="button"
                onClick={() => setEditing(latestLog)}
                className="text-xs px-2 h-8 rounded-md border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-zinc-600"
              >
                Edit
              </button>
            )}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Trend (raw + 4-wk rolling avg)</div>
          <Sparkline values={raw} overlay={avg} height={120} />
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
        {[...points].reverse().slice(0, 16).map((p) => {
          const rowLog = logByDate.get(p.date);
          return (
            <div key={p.date} className="p-3 flex items-baseline justify-between gap-2 text-sm">
              <div>
                <div className="text-zinc-300">{fmtDate(p.date, 'EEE MMM d, yyyy')}</div>
                <div className="text-xs text-zinc-500">{p.isoWeek}</div>
              </div>
              <div className="flex items-baseline gap-2 shrink-0">
                <div className="text-right">
                  <div className="font-mono text-zinc-100">{p.bodyweight} <span className="text-xs text-zinc-500">lb</span></div>
                  <div className="text-xs text-zinc-500 font-mono">avg {p.rolling4w.toFixed(1)}</div>
                </div>
                {rowLog && (
                  <button
                    type="button"
                    onClick={() => setEditing(rowLog)}
                    className="text-xs px-2 h-8 rounded-md border border-zinc-700 text-zinc-400 hover:text-amber-400 hover:border-zinc-600"
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function cloneJsonForUndo<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function DeleteSessionButton({
  session,
  setCount,
  hasReadiness,
  isEmpty,
}: {
  session: SessionLog;
  setCount: number;
  hasReadiness: boolean;
  isEmpty: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!isEmpty) {
      const childParts = [
        setCount > 0 ? `${setCount} set${setCount === 1 ? '' : 's'}` : null,
        hasReadiness ? 'readiness check' : null,
      ].filter(Boolean).join(' + ');
      const ok = window.confirm(
        `Delete ${fmtDate(session.date, 'EEE, MMM d')} · ${session.templateId}?\n\n` +
        `This removes ${childParts}.\n\n` +
        `You'll have ~15 seconds to Undo from the bar at the bottom if this was a mistake.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const db = getDb();
      const childSets = await db.set_logs.where('sessionLogId').equals(session.id).toArray();
      const childReadiness = await db.readiness_logs.where('sessionLogId').equals(session.id).toArray();
      const childCardio = await db.cardio_logs.where('sessionLogId').equals(session.id).toArray();

      const undoSnapshot = {
        session: cloneJsonForUndo(session),
        sets: childSets.map(cloneJsonForUndo),
        readiness: childReadiness.map(cloneJsonForUndo),
        cardios: childCardio.map(cloneJsonForUndo),
      };

      // Mirror the server's ON DELETE CASCADE locally so Dexie doesn't keep
      // orphan rows. set_logs and readiness_logs cascade, cardio_logs sets
      // session_log_id to null on the server — we replicate that by clearing
      // the field locally.
      for (const x of childSets) {
        await localDelete('set_logs', x.id, { skipDirty: true });
      }
      for (const x of childReadiness) {
        await localDelete('readiness_logs', x.id, { skipDirty: true });
      }
      for (const x of childCardio) {
        await localUpsert('cardio_logs', { ...x, sessionLogId: undefined }, { skipDirty: true });
      }
      await localDelete('session_logs', session.id);

      offerDeleteUndo({
        kind: 'batch',
        label: `Workout · ${fmtDate(session.date, 'EEE, MMM d')}`,
        restore: async () => {
          await cancelPendingDirtyDelete('session_logs', undoSnapshot.session.id);
          await localUpsert('session_logs', undoSnapshot.session);
          for (const s of undoSnapshot.sets) await localUpsert('set_logs', s);
          for (const r of undoSnapshot.readiness) await localUpsert('readiness_logs', r);
          for (const c of undoSnapshot.cardios) await localUpsert('cardio_logs', c);
        },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={busy}
      className={`shrink-0 text-xs px-2 h-7 rounded-md border ${
        isEmpty
          ? 'border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-700'
          : 'border-rose-900/60 text-rose-400 hover:bg-rose-950/30'
      } disabled:opacity-50`}
      aria-label={isEmpty ? 'Remove empty session' : 'Delete session'}
    >
      {busy ? '…' : isEmpty ? 'Remove' : 'Delete'}
    </button>
  );
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: 'normal' | 'warn' }) {
  return (
    <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-2">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className={`text-lg font-mono ${tone === 'warn' ? 'text-rose-400' : 'text-zinc-100'}`}>
        {value}<span className="text-xs text-zinc-500 ml-1">{unit}</span>
      </div>
    </div>
  );
}
