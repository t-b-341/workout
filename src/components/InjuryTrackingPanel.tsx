'use client';

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useAllInjuryEpisodes } from '@/lib/hooks';
import {
  INJURY_SITE_GROUPS,
  labelForSiteKey,
  type InjurySiteKey,
} from '@/lib/injurySites';
import { flushDirty, localUpsert } from '@/lib/sync';
import type { InjuryEpisode, InjuryKind } from '@/lib/types';

function activeEpisodeForSite(episodes: InjuryEpisode[], siteKey: string): InjuryEpisode | undefined {
  const open = episodes.filter((e) => e.siteKey === siteKey && !e.endedAt);
  if (open.length === 0) return undefined;
  return open.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
}

function daysBetween(startIso: string, endIso: string): number {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

export function InjuryTrackingPanel() {
  const episodes = useAllInjuryEpisodes();

  const activeBySite = useMemo(() => {
    const m = new Map<string, InjuryEpisode>();
    if (!episodes) return m;
    for (const e of episodes) {
      if (e.endedAt) continue;
      const prev = m.get(e.siteKey);
      if (!prev || e.startedAt > prev.startedAt) m.set(e.siteKey, e);
    }
    return m;
  }, [episodes]);

  const resolvedEpisodes = useMemo(() => {
    if (!episodes) return [];
    return episodes
      .filter((e): e is InjuryEpisode & { endedAt: string } => Boolean(e.endedAt))
      .sort((a, b) => (a.endedAt! < b.endedAt! ? 1 : -1))
      .slice(0, 18);
  }, [episodes]);

  async function setSiteActive(siteKey: InjurySiteKey, active: boolean) {
    if (!episodes) return;
    if (active) {
      if (activeEpisodeForSite(episodes, siteKey)) return;
      await localUpsert('injury_episodes', {
        id: crypto.randomUUID(),
        siteKey,
        kind: 'acute',
        startedAt: new Date().toISOString(),
      });
    } else {
      const ep = activeEpisodeForSite(episodes, siteKey);
      if (!ep) return;
      await localUpsert('injury_episodes', {
        ...ep,
        endedAt: new Date().toISOString(),
      });
    }
    await flushDirty().catch(() => {});
  }

  async function updateKind(ep: InjuryEpisode, kind: InjuryKind) {
    await localUpsert('injury_episodes', { ...ep, kind });
    await flushDirty().catch(() => {});
  }

  async function updateNotes(ep: InjuryEpisode, notes: string) {
    const trimmed = notes.trim();
    await localUpsert('injury_episodes', {
      ...ep,
      notes: trimmed === '' ? undefined : trimmed,
    });
    await flushDirty().catch(() => {});
  }

  const activeList = useMemo(() => {
    return Array.from(activeBySite.entries()).sort((a, b) =>
      labelForSiteKey(a[0] as InjurySiteKey).localeCompare(labelForSiteKey(b[0] as InjurySiteKey)),
    );
  }, [activeBySite]);

  if (episodes === undefined) {
    return (
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 text-sm text-zinc-500">
        Loading injury data…
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-5">
      <div>
        <div className="text-sm font-medium text-zinc-100">Current injuries &amp; body state</div>
        <p className="text-xs text-zinc-500 mt-1">
          Checked sites stay on day to day until you turn them off — use for anything affecting training
          (acute flare-ups or chronic / overuse).
        </p>
      </div>

      {activeList.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 px-3 py-2">
          <div className="text-[11px] uppercase tracking-wider text-amber-200/80 mb-1.5">Active now</div>
          <ul className="flex flex-wrap gap-2">
            {activeList.map(([sk, ep]) => (
              <li
                key={sk}
                className="text-xs rounded-lg bg-zinc-900 border border-zinc-700 px-2 py-1 text-zinc-200"
              >
                {labelForSiteKey(sk as InjurySiteKey)}{' '}
                <span className="text-zinc-500">· {ep.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Body areas</div>
        {INJURY_SITE_GROUPS.map((group) => (
          <div key={group.area} className="space-y-2">
            <div className="text-xs font-medium text-zinc-400">{group.area}</div>
            <div className="flex flex-wrap gap-2">
              {group.items.map(({ siteKey, label: sideLabel }) => {
                const active = activeBySite.has(siteKey);
                const btnLabel = group.items.length === 1 ? group.area : sideLabel;
                return (
                  <div key={siteKey} className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => void setSiteActive(siteKey, !active)}
                      className={`h-9 min-w-[3rem] px-2 rounded-lg text-xs font-medium border transition-colors ${
                        active
                          ? 'border-rose-500/70 bg-rose-950/40 text-rose-100'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-600'
                      }`}
                    >
                      {btnLabel}
                    </button>
                  </div>
                );
              })}
            </div>
            {group.items.map(({ siteKey }) => {
              const ep = activeBySite.get(siteKey);
              if (!ep) return null;
              return (
                <SiteDetailRow
                  key={ep.id}
                  episode={ep}
                  siteLabel={labelForSiteKey(siteKey)}
                  onKind={(kind) => void updateKind(ep, kind)}
                  onNotesBlur={(notes) => void updateNotes(ep, notes)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {resolvedEpisodes.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Recent resolved</div>
          <ul className="space-y-2 max-h-56 overflow-y-auto text-xs">
            {resolvedEpisodes.map((e) => (
              <li
                key={e.id}
                className="flex flex-col gap-0.5 border-b border-zinc-800/80 pb-2 last:border-0 last:pb-0"
              >
                <div className="flex justify-between gap-2 text-zinc-300">
                  <span>{labelForSiteKey(e.siteKey as InjurySiteKey)}</span>
                  <span className="text-zinc-500 shrink-0">{e.kind}</span>
                </div>
                <div className="text-zinc-500 font-mono text-[11px]">
                  {daysBetween(e.startedAt, e.endedAt)}d · ended {format(new Date(e.endedAt!), 'MMM d')}
                </div>
                {e.notes && <div className="text-zinc-500 text-[11px] line-clamp-2">{e.notes}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SiteDetailRow({
  episode,
  siteLabel,
  onKind,
  onNotesBlur,
}: {
  episode: InjuryEpisode;
  siteLabel: string;
  onKind: (k: InjuryKind) => void;
  onNotesBlur: (notes: string) => void;
}) {
  const notesSyncKey = `${episode.id}|${episode.notes ?? ''}`;
  const [notesSyncSeen, setNotesSyncSeen] = useState(notesSyncKey);
  const [notesDraft, setNotesDraft] = useState(episode.notes ?? '');
  if (notesSyncKey !== notesSyncSeen) {
    setNotesSyncSeen(notesSyncKey);
    setNotesDraft(episode.notes ?? '');
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-2 space-y-2 ml-0 sm:ml-1">
      <div className="text-[11px] text-zinc-500">{siteLabel}</div>
      <div className="flex flex-wrap gap-2">
        <span className="text-[11px] text-zinc-500 self-center mr-1">Pain type:</span>
        {(['acute', 'chronic'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onKind(k)}
            className={`h-8 px-3 rounded-lg text-xs capitalize ${
              episode.kind === k ? 'bg-amber-500 text-zinc-950 font-medium' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            {k === 'chronic' ? 'Chronic / overuse' : 'Acute'}
          </button>
        ))}
      </div>
      <label className="block text-[11px] text-zinc-500">
        Notes (optional)
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => onNotesBlur(notesDraft)}
          rows={2}
          placeholder="Context, aggravators, what helps…"
          className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-2 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600"
        />
      </label>
    </div>
  );
}
