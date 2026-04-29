/** Derive start from end and logged duration (minutes). */
export function cardioStartedAtFromEnd(endedAtIso: string, durationMin: number): string {
  const end = Date.parse(endedAtIso);
  if (Number.isNaN(end)) return endedAtIso;
  const ms = Math.max(0, durationMin) * 60 * 1000;
  return new Date(end - ms).toISOString();
}

/**
 * `endedAt` is the wall-clock end (usually the set’s `loggedAt`).
 * If `timerStartedAt` is valid and on/before `endedAt`, it wins for `startedAt`;
 * otherwise start is derived from duration.
 */
export function resolveCardioTimestamps(
  loggedAtIso: string,
  durationMin: number,
  timerStartedAt?: string,
): { startedAt: string; endedAt: string } {
  const endedAt = loggedAtIso;
  const endMs = Date.parse(endedAt);
  if (timerStartedAt) {
    const startMs = Date.parse(timerStartedAt);
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && startMs <= endMs) {
      return { startedAt: timerStartedAt, endedAt };
    }
  }
  return { startedAt: cardioStartedAtFromEnd(endedAt, durationMin), endedAt };
}
