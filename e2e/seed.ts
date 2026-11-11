/**
 * Writes completed sessions into the e2e stub before the app boots.
 *
 * Playwright: `await page.addInitScript(seedHistoryWeeks, weeks)`.
 * The function is self-contained so it can run in the page. One session per
 * week, newest first in the loop. Server session ids are
 * `${userId}:${date}-${templateId}`. Rows use the stub's snake_case shape.
 *
 * The newest day is Monday 2026-11-02, seven days before the suite clock
 * (Monday 2026-11-09 10:00 America/Chicago). Every seeded session stays in
 * the past through Sunday 2026-11-15, including when the runner is on UTC.
 */
export function seedHistoryWeeks(
  weeks: number,
  userId = '00000000-0000-4000-8000-000000000001',
): void {
  const count = Math.max(0, Math.floor(weeks));
  const sessions: Record<string, unknown>[] = [];
  const sets: Record<string, unknown>[] = [];
  const newest = new Date(Date.UTC(2026, 10, 2));

  for (let i = 0; i < count; i++) {
    const dt = new Date(newest);
    dt.setUTCDate(dt.getUTCDate() - i * 7);
    const date = dt.toISOString().slice(0, 10);
    const templateId = 'U1';
    const id = `${userId}:${date}-${templateId}`;
    const weight = 100 + (count - 1 - i) * 5;
    const updatedAt = `${date}T16:00:00.000Z`;

    sessions.push({
      id,
      user_id: userId,
      date,
      template_id: templateId,
      mode: 'standard',
      deload: false,
      watch_flags: [],
      session_type: 'standard',
      started_at: `${date}T15:00:00.000Z`,
      completed_at: updatedAt,
      readiness_completed_at: `${date}T14:55:00.000Z`,
      updated_at: updatedAt,
    });

    sets.push({
      id: `${date}-${templateId}-set-0`,
      user_id: userId,
      session_log_id: id,
      lift_id: 'bp',
      prescription_id: 'U1-bp',
      set_index: 0,
      weight,
      reps: 5,
      status: 'completed',
      intent: 'working',
      updated_at: updatedAt,
    });
  }

  localStorage.setItem('e2e:db:session_logs', JSON.stringify(sessions));
  localStorage.setItem('e2e:db:set_logs', JSON.stringify(sets));
}
