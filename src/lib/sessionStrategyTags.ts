/** Optional labels for how you ran a session — used in mesocycle recap. */

export const SESSION_STRATEGY_TAGS = [
  { id: 'conservative-loads', label: 'Conservative loads' },
  { id: 'progressed-main', label: 'Progressed main lifts' },
  { id: 'volume-emphasis', label: 'Extra volume / accessories' },
  { id: 'time-crunched', label: 'Short on time' },
  { id: 'recovery-priority', label: 'Recovery priority' },
  { id: 'technique-focus', label: 'Technique focus' },
  { id: 'pain-managed', label: 'Worked around discomfort' },
  { id: 'pr-attempt', label: 'PR / top-set attempt' },
] as const;

export type SessionStrategyTagId = (typeof SESSION_STRATEGY_TAGS)[number]['id'];

const VALID = new Set<string>(SESSION_STRATEGY_TAGS.map((t) => t.id));

export function labelForSessionStrategyTag(id: SessionStrategyTagId): string {
  return SESSION_STRATEGY_TAGS.find((t) => t.id === id)?.label ?? id;
}

/** Dedupe and drop unknown ids (e.g. after a preset list change). */
export function normalizeSessionStrategyTags(raw: unknown): SessionStrategyTagId[] | undefined {
  if (raw == null) return undefined;
  if (!Array.isArray(raw)) return undefined;
  const out: SessionStrategyTagId[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== 'string' || !VALID.has(x) || seen.has(x)) continue;
    seen.add(x);
    out.push(x as SessionStrategyTagId);
  }
  return out.length > 0 ? out : undefined;
}

/** Count tag usage across sessions (for meso recap). */
export function aggregateSessionStrategyTags(
  sessions: { tags?: SessionStrategyTagId[] }[],
): Map<SessionStrategyTagId, number> {
  const m = new Map<SessionStrategyTagId, number>();
  for (const s of sessions) {
    const tags = s.tags;
    if (!tags?.length) continue;
    for (const id of tags) {
      if (!VALID.has(id)) continue;
      m.set(id, (m.get(id) ?? 0) + 1);
    }
  }
  return m;
}

export function formatTagAggregateSentence(counts: Map<SessionStrategyTagId, number>): string | null {
  if (counts.size === 0) return null;
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => `${labelForSessionStrategyTag(id)} (${n}×)`);
  return `Session tags this period: ${parts.join(', ')}.`;
}
