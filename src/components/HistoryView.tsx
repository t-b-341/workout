'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from '@/lib/db';
import { fmtDate } from '@/lib/time';
import { useLifts } from '@/lib/hooks';
import type { SessionLog, SetLog } from '@/lib/types';

export function HistoryView() {
  const lifts = useLifts();

  const sessions = useLiveQuery(async () => {
    const db = getDb();
    const all = await db.session_logs.toArray();
    return all.sort((a, b) => (a.date < b.date ? 1 : -1));
  }, []);

  const setsBySession = useLiveQuery(async () => {
    const db = getDb();
    const all = await db.set_logs.toArray();
    const map = new Map<string, SetLog[]>();
    for (const s of all) {
      const arr = map.get(s.sessionLogId) ?? [];
      arr.push(s);
      map.set(s.sessionLogId, arr);
    }
    return map;
  }, []);

  if (!sessions || !lifts || !setsBySession) return <div className="p-6 text-zinc-500">Loading…</div>;

  const liftName = (id: string) => lifts.find((l) => l.id === id)?.name ?? id;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-3">
      <h1 className="text-2xl font-semibold">History</h1>
      {sessions.length === 0 && <div className="text-zinc-500 text-sm">No sessions logged yet.</div>}
      {sessions.map((s: SessionLog) => {
        const sets = (setsBySession.get(s.id) ?? []).sort((a, b) => a.setIndex - b.setIndex);
        const grouped = new Map<string, SetLog[]>();
        for (const x of sets) {
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
