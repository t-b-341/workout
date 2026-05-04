'use client';

import { localUpsert } from '@/lib/sync';
import {
  SESSION_STRATEGY_TAGS,
  type SessionStrategyTagId,
} from '@/lib/sessionStrategyTags';
import type { SessionLog } from '@/lib/types';

export function SessionStrategyTagsCard({ session }: { session: SessionLog }) {
  const selected = new Set(session.tags ?? []);

  async function toggle(id: SessionStrategyTagId) {
    const next = new Set(session.tags ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const arr = [...next].sort() as SessionStrategyTagId[];
    await localUpsert('session_logs', {
      ...session,
      tags: arr.length > 0 ? arr : undefined,
    });
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div>
        <div className="text-sm font-medium text-zinc-100">Session tags</div>
        <div className="text-xs text-zinc-500 mt-0.5">
          Optional — how you ran today (feeds mesocycle recap).
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {SESSION_STRATEGY_TAGS.map(({ id, label }) => {
          const on = selected.has(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => void toggle(id)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                on
                  ? 'border-amber-500/70 bg-amber-950/40 text-amber-100'
                  : 'border-zinc-700 bg-zinc-800/80 text-zinc-400 hover:border-zinc-600'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
