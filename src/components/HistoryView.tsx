'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/lib/db';
import { fmtDate } from '@/lib/time';
import { useLifts } from '@/lib/hooks';
import { buildLiftHistory, buildWeeklySummaries } from '@/lib/stats';
import { Sparkline, MiniBars } from './Sparkline';
import { CARDIO_WEEKLY_TARGET_MIN } from '@/lib/seed';
import type { CardioLog, Lift, SessionLog, SetLog } from '@/lib/types';

type Tab = 'sessions' | 'trends' | 'weeks';

export function HistoryView() {
  const [tab, setTab] = useState<Tab>('sessions');
  const lifts = useLifts();

  const sessions = useLiveQuery(async () => {
    const all = await getDb().session_logs.toArray();
    return all.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, []);

  const allSets = useLiveQuery(() => getDb().set_logs.toArray(), []);
  const cardio = useLiveQuery(() => getDb().cardio_logs.toArray(), []);

  if (!lifts || !sessions || !allSets || !cardio) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold">History</h1>

      <div className="flex gap-1 rounded-xl bg-zinc-900 border border-zinc-800 p-1">
        {(['sessions', 'trends', 'weeks'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 h-10 rounded-lg text-sm capitalize ${tab === t ? 'bg-amber-500 text-zinc-950 font-medium' : 'text-zinc-400'}`}
          >{t}</button>
        ))}
      </div>

      {tab === 'sessions' && <SessionsList sessions={sessions} sets={allSets} lifts={lifts} />}
      {tab === 'trends' && <TrendsList sessions={sessions} sets={allSets} lifts={lifts} />}
      {tab === 'weeks' && <WeeksList sessions={sessions} sets={allSets} cardio={cardio} lifts={lifts} />}
    </div>
  );
}

function SessionsList({ sessions, sets, lifts }: { sessions: SessionLog[]; sets: SetLog[]; lifts: Lift[] }) {
  const liftName = (id: string) => lifts.find((l) => l.id === id)?.name ?? id;
  if (sessions.length === 0) return <div className="text-zinc-500 text-sm">No sessions logged yet.</div>;

  const setsBySession = new Map<string, SetLog[]>();
  for (const s of sets) {
    const arr = setsBySession.get(s.sessionLogId) ?? [];
    arr.push(s);
    setsBySession.set(s.sessionLogId, arr);
  }

  return (
    <div className="space-y-3">
      {sessions.map((s) => {
        const ss = (setsBySession.get(s.id) ?? []).sort((a, b) => a.setIndex - b.setIndex);
        const grouped = new Map<string, SetLog[]>();
        for (const x of ss) {
          const arr = grouped.get(x.liftId) ?? [];
          arr.push(x);
          grouped.set(x.liftId, arr);
        }
        return (
          <div key={s.id} className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-sm font-medium">{fmtDate(s.date, 'EEE, MMM d')} · {s.templateId}</div>
                <div className="text-xs text-zinc-500 mt-0.5">
                  {s.mode !== 'standard' && <span className="mr-2 text-amber-400">{s.mode}</span>}
                  {s.deload && <span className="mr-2 text-indigo-400">deload</span>}
                  {s.watchFlags.length > 0 && (
                    <span className="text-rose-400">⚠ {s.watchFlags.join(', ')}</span>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {Array.from(grouped.entries()).map(([liftId, ls]) => (
                <div key={liftId} className="text-sm flex items-baseline justify-between gap-2">
                  <span className="text-zinc-300">{liftName(liftId)}</span>
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
          <div className="font-medium text-zinc-100 truncate">{lift.name}</div>
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

function WeeksList({ sessions, sets, cardio, lifts }: { sessions: SessionLog[]; sets: SetLog[]; cardio: CardioLog[]; lifts: Lift[] }) {
  const weeks = buildWeeklySummaries(sessions, sets, cardio, lifts);
  if (weeks.length === 0) return <div className="text-zinc-500 text-sm">No data yet.</div>;

  return (
    <div className="space-y-3">
      {weeks.map((w) => {
        const cardioPct = Math.min(100, Math.round((w.cardioMin / CARDIO_WEEKLY_TARGET_MIN) * 100));
        const flagTotal = w.watchFlagCounts.erectors + w.watchFlagCounts.elbow + w.watchFlagCounts.shoulder;
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

            {w.topSets.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Top sets</div>
                <div className="space-y-1">
                  {w.topSets
                    .sort((a, b) => b.weight * 100 + b.reps - (a.weight * 100 + a.reps))
                    .slice(0, 8)
                    .map((t) => (
                      <div key={t.liftId} className="text-sm flex items-baseline justify-between">
                        <span className="text-zinc-300">{t.liftName}</span>
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
