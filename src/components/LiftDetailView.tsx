'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/lib/db';
import { useAllSessions, useAllSets, useLifts } from '@/lib/hooks';
import { fmtDate } from '@/lib/time';
import { buildLiftHistory, est1RM, liftPRs } from '@/lib/stats';
import { MiniBars, Sparkline } from './Sparkline';
import type { Prescription } from '@/lib/types';

export function LiftDetailView({ liftId }: { liftId: string }) {
  const lifts = useLifts();
  const allSets = useAllSets();
  const allSessions = useAllSessions();
  const prescriptions = useLiveQuery(async () => {
    const all = await getDb().prescriptions.where('liftId').equals(liftId).toArray();
    return all.sort((a, b) => a.templateId.localeCompare(b.templateId));
  }, [liftId]);

  const points = useMemo(
    () => (allSets && allSessions ? buildLiftHistory(liftId, allSets, allSessions) : []),
    [liftId, allSets, allSessions],
  );
  const prs = useMemo(
    () => (allSets && allSessions
      ? liftPRs(liftId, allSets, allSessions)
      : { liftId, bestByReps: [], bestE1RM: null }),
    [liftId, allSets, allSessions],
  );

  if (!lifts || !allSets || !allSessions || !prescriptions) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }
  const lift = lifts.find((l) => l.id === liftId);
  if (!lift) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <Link href="/history" className="text-sm text-amber-400">← History</Link>
        <div className="text-zinc-400">Unknown lift: {liftId}</div>
      </div>
    );
  }

  const e1rm = points.map((p) => Math.round(p.best1RM));
  const volumes = points.map((p) => p.volume);
  const topWeights = points.map((p) => p.topWeight);

  const lastSetDate = points.length > 0 ? points[points.length - 1].date : null;
  const totalSetsLogged = allSets.filter((s) => s.liftId === liftId && s.status === 'completed').length;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div>
        <Link href="/history" className="text-sm text-amber-400">← History</Link>
        <h1 className="text-2xl font-semibold mt-1">{lift.name}</h1>
        <div className="text-xs text-zinc-500 mt-0.5">
          {lift.equipment} · {lift.repUnit}
          {lift.pattern && <> · <span className="capitalize">{lift.pattern.replace('-', ' ')}</span></>}
        </div>
        {(lift.muscleGroups ?? []).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {(lift.muscleGroups ?? []).map((g) => (
              <span key={g} className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300">
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      {prescriptions.length > 0 && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Active prescriptions</div>
          {prescriptions.map((p) => (
            <PrescriptionRow key={p.id} p={p} />
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Sessions" value={`${points.length}`} unit="" />
        <Stat label="Total sets" value={`${totalSetsLogged}`} unit="" />
        <Stat
          label="Best e1RM"
          value={prs.bestE1RM ? `${Math.round(prs.bestE1RM.value)}` : '—'}
          unit={prs.bestE1RM ? 'lb' : ''}
        />
      </div>

      {points.length > 0 ? (
        <>
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Estimated 1RM</div>
            <Sparkline values={e1rm} height={120} />
            {lastSetDate && (
              <div className="text-xs text-zinc-500">last logged {fmtDate(lastSetDate, 'EEE M/d, yyyy')}</div>
            )}
          </div>

          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
            <div className="text-xs uppercase tracking-wider text-zinc-500">Top set weight per session</div>
            <MiniBars values={topWeights} height={56} color="#f59e0b" />
          </div>

          {volumes.some((v) => v > 0) && (
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
              <div className="text-xs uppercase tracking-wider text-zinc-500">Volume per session</div>
              <MiniBars values={volumes} height={56} />
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-zinc-500 text-sm">
          No completed sets yet for this lift.
        </div>
      )}

      {prs.bestByReps.length > 0 && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
          <div className="text-xs uppercase tracking-wider text-zinc-500">PRs by rep range</div>
          <div className="space-y-1">
            {prs.bestByReps.map((b) => (
              <div key={b.reps} className="flex items-baseline justify-between text-sm">
                <span className="text-zinc-400 font-mono">{b.reps} rep{b.reps === 1 ? '' : 's'}</span>
                <span className="font-mono text-amber-400">
                  {b.weight} lb <span className="text-xs text-zinc-500 ml-1">e1RM {Math.round(est1RM(b.weight, b.reps))}</span>
                </span>
                <span className="text-xs text-zinc-500">{fmtDate(b.date, 'M/d/yy')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {points.length > 0 && (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 divide-y divide-zinc-800">
          {[...points].reverse().slice(0, 25).map((p) => (
            <div key={p.date + p.templateId} className="p-3 text-sm flex items-baseline justify-between gap-2">
              <div>
                <div className="text-zinc-300">{fmtDate(p.date, 'EEE M/d, yyyy')}</div>
                <div className="text-xs text-zinc-500">{p.templateId}{p.hasIncomplete ? ' · had incomplete sets' : ''}</div>
              </div>
              <div className="font-mono text-zinc-300 text-right">
                <div>{p.setsLabel}</div>
                <div className="text-xs text-zinc-500">e1RM {Math.round(p.best1RM)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PrescriptionRow({ p }: { p: Prescription }) {
  return (
    <div className="text-sm flex items-baseline justify-between gap-2">
      <span className="text-zinc-400 font-mono">{p.templateId}</span>
      <span className="font-mono text-zinc-200">
        {p.weight} × {p.sets} × {p.repMin === p.repMax ? p.repMax : `${p.repMin}–${p.repMax}`}
      </span>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded-xl bg-zinc-950 border border-zinc-800 p-2 text-center">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-lg font-mono text-zinc-100">
        {value}
        {unit && <span className="text-xs text-zinc-500 ml-1">{unit}</span>}
      </div>
    </div>
  );
}
