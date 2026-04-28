'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  useAllBodyweight,
  useAllCardio,
  useAllReadiness,
  useSessionsAfterReadiness,
  useAllSets,
  useLifts,
} from '@/lib/hooks';
import { getDb } from '@/lib/db';
import { sortSetLogsForSession } from '@/lib/sessionFilters';
import { localDelete, localUpsert } from '@/lib/sync';
import { fmtDate } from '@/lib/time';
import {
  bodyweightSeries,
  buildLiftHistory,
  buildWeeklyMuscleVolume,
  buildWeeklyPatternCoverage,
  buildWeeklyReadiness,
  buildWeeklySummaries,
  fmtDurationShort,
  prFeed,
  sessionTotalRestBetweenSetsMs,
} from '@/lib/stats';
import { Sparkline, MiniBars } from './Sparkline';
import { ReadinessSummary } from './ReadinessSummary';
import { SessionEditSheet } from './SessionEditSheet';
import { CARDIO_WEEKLY_TARGET_MIN, MUSCLE_GROUPS, PATTERNS } from '@/lib/seed';
import type {
  BodyweightLog,
  CardioLog,
  Lift,
  MuscleGroup,
  ReadinessLog,
  SessionLog,
  SetLog,
} from '@/lib/types';

type Tab = 'sessions' | 'trends' | 'weeks' | 'prs' | 'muscle' | 'bodyweight';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'sessions', label: 'Sessions' },
  { id: 'trends', label: 'Trends' },
  { id: 'weeks', label: 'Weeks' },
  { id: 'prs', label: 'PRs' },
  { id: 'muscle', label: 'Muscle' },
  { id: 'bodyweight', label: 'BW' },
];

export function HistoryView() {
  const [tab, setTab] = useState<Tab>('sessions');
  const lifts = useLifts();
  const sessions = useSessionsAfterReadiness();
  const allSets = useAllSets();
  const cardio = useAllCardio();
  const bodyweights = useAllBodyweight();
  const readiness = useAllReadiness();

  if (!lifts || !sessions || !allSets || !cardio || !bodyweights || !readiness) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold">History</h1>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 rounded-xl bg-zinc-900 border border-zinc-800 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`h-10 rounded-lg text-sm ${tab === t.id ? 'bg-amber-500 text-zinc-950 font-medium' : 'text-zinc-400'}`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'sessions' && <SessionsList sessions={sessions} sets={allSets} lifts={lifts} readiness={readiness} />}
      {tab === 'trends' && <TrendsList sessions={sessions} sets={allSets} lifts={lifts} />}
      {tab === 'weeks' && <WeeksList sessions={sessions} sets={allSets} cardio={cardio} lifts={lifts} readiness={readiness} />}
      {tab === 'prs' && <PRsList sessions={sessions} sets={allSets} lifts={lifts} />}
      {tab === 'muscle' && <MuscleList sessions={sessions} sets={allSets} lifts={lifts} />}
      {tab === 'bodyweight' && <BodyweightList logs={bodyweights} />}
    </div>
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
        const restMs = s.completedAt ? sessionTotalRestBetweenSetsMs(s.id, sets) : 0;
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

function TrendsList({ sessions, sets, lifts }: { sessions: SessionLog[]; sets: SetLog[]; lifts: Lift[] }) {
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
        <LiftTrendCard key={lift.id} lift={lift} sessions={sessions} sets={sets} />
      ))}
    </div>
  );
}

function LiftTrendCard({ lift, sessions, sets }: { lift: Lift; sessions: SessionLog[]; sets: SetLog[] }) {
  const points = buildLiftHistory(lift.id, sets, sessions);
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

  return (
    <details className="rounded-2xl bg-zinc-900 border border-zinc-800 group" open={points.length <= 3}>
      <summary className="cursor-pointer p-4 list-none flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-zinc-100 truncate">
            <Link href={`/lifts/${lift.id}`} className="hover:text-amber-400">{lift.name}</Link>
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            {points.length} session{points.length === 1 ? '' : 's'} · last: <span className="font-mono">{last.topWeight}×{last.topReps}</span>
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
          <Sparkline values={e1rm} height={70} />
        </div>
        {volumes.some((v) => v > 0) && (
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Volume per session</div>
            <MiniBars values={volumes} height={40} />
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
}: {
  sessions: SessionLog[];
  sets: SetLog[];
  cardio: CardioLog[];
  lifts: Lift[];
  readiness: ReadinessLog[];
}) {
  const weeks = buildWeeklySummaries(sessions, sets, cardio, lifts);
  const muscleWeeks = useMemo(() => buildWeeklyMuscleVolume(sessions, sets, lifts), [sessions, sets, lifts]);
  const patternWeeks = useMemo(() => buildWeeklyPatternCoverage(sessions, sets, lifts), [sessions, sets, lifts]);
  const readinessWeeks = useMemo(() => buildWeeklyReadiness(readiness), [readiness]);
  if (weeks.length === 0) return <div className="text-zinc-500 text-sm">No data yet.</div>;

  // Most recent 12, chronological for the trend card.
  const trend = readinessWeeks.slice(0, 12).reverse();

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
      {weeks.map((w) => {
        const cardioPct = Math.min(100, Math.round((w.cardioMin / CARDIO_WEEKLY_TARGET_MIN) * 100));
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

            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="Volume" value={w.totalVolume.toLocaleString()} unit="lb" />
              <Stat label="Cardio" value={`${w.cardioMin}`} unit={`/ ${CARDIO_WEEKLY_TARGET_MIN}m`} />
              <Stat label="Flags" value={`${flagTotal}`} unit="" tone={flagTotal > 0 ? 'warn' : 'normal'} />
            </div>

            <div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div className={`h-full ${cardioPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${cardioPct}%` }} />
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
  if (feed.length === 0) {
    return <div className="text-zinc-500 text-sm">No PRs yet — log a few sessions and they&apos;ll start showing up here.</div>;
  }

  // Group by month for legibility
  const groups = new Map<string, typeof feed>();
  for (const item of feed) {
    const ym = item.date.slice(0, 7);
    const arr = groups.get(ym) ?? [];
    arr.push(item);
    groups.set(ym, arr);
  }

  return (
    <div className="space-y-4">
      {Array.from(groups.entries()).map(([ym, items]) => (
        <div key={ym}>
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">{fmtDate(ym + '-01', 'MMMM yyyy')}</div>
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
            {items.map((it, i) => (
              <div key={`${it.liftId}-${it.date}-${it.reps}-${i}`} className="p-3 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`/lifts/${it.liftId}`} className="font-medium text-zinc-100 hover:text-amber-400 truncate">
                    {it.liftName}
                  </Link>
                  <div className="text-xs text-zinc-500">{fmtDate(it.date, 'EEE M/d')}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-amber-400">{it.weight}×{it.reps}</div>
                  {it.previousWeight != null && (
                    <div className="text-xs text-zinc-500 font-mono">was {it.previousWeight}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MuscleList({ sessions, sets, lifts }: { sessions: SessionLog[]; sets: SetLog[]; lifts: Lift[] }) {
  const muscleWeeks = useMemo(() => buildWeeklyMuscleVolume(sessions, sets, lifts), [sessions, sets, lifts]);
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

function BodyweightList({ logs }: { logs: BodyweightLog[] }) {
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

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wider text-zinc-500">Latest</div>
            <div className="text-3xl font-mono">{last.bodyweight} <span className="text-sm text-zinc-500">lb</span></div>
            <div className="text-xs text-zinc-500">{fmtDate(last.date, 'EEE M/d')} · {last.isoWeek}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-zinc-500">vs first entry</div>
            <div className={`text-2xl font-mono ${deltaColor}`}>
              {delta > 0 ? '+' : ''}{delta} <span className="text-xs">lb</span>
            </div>
            <div className="text-xs text-zinc-500">{points.length} entries</div>
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Trend (raw + 4-wk rolling avg)</div>
          <Sparkline values={raw} overlay={avg} height={120} />
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
        {[...points].reverse().slice(0, 16).map((p) => (
          <div key={p.date} className="p-3 flex items-baseline justify-between text-sm">
            <div>
              <div className="text-zinc-300">{fmtDate(p.date, 'EEE MMM d, yyyy')}</div>
              <div className="text-xs text-zinc-500">{p.isoWeek}</div>
            </div>
            <div className="text-right">
              <div className="font-mono text-zinc-100">{p.bodyweight} <span className="text-xs text-zinc-500">lb</span></div>
              <div className="text-xs text-zinc-500 font-mono">avg {p.rolling4w.toFixed(1)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
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
        `Delete ${fmtDate(session.date, 'EEE, MMM d')} · ${session.templateId}?\n` +
        `This removes ${childParts} and cannot be undone.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      const db = getDb();
      // Mirror the server's ON DELETE CASCADE locally so Dexie doesn't keep
      // orphan rows. set_logs and readiness_logs cascade, cardio_logs sets
      // session_log_id to null on the server — we replicate that by clearing
      // the field locally.
      const childSets = await db.set_logs.where('sessionLogId').equals(session.id).toArray();
      for (const x of childSets) {
        await localDelete('set_logs', x.id, { skipDirty: true });
      }
      const childReadiness = await db.readiness_logs.where('sessionLogId').equals(session.id).toArray();
      for (const x of childReadiness) {
        await localDelete('readiness_logs', x.id, { skipDirty: true });
      }
      const childCardio = await db.cardio_logs.where('sessionLogId').equals(session.id).toArray();
      for (const x of childCardio) {
        await localUpsert('cardio_logs', { ...x, sessionLogId: undefined }, { skipDirty: true });
      }
      await localDelete('session_logs', session.id);
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
