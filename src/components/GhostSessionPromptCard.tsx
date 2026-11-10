'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  useAllSets,
  usePrescriptions,
  useSessionsForDate,
  useTemplates,
} from '@/lib/hooks';
import { localDelete, localUpsert } from '@/lib/sync';
import { deriveSessionStatus } from '@/lib/sessionStatus';
import { fmtDate, todayIso } from '@/lib/time';
import type { SessionLog, TemplateId } from '@/lib/types';

const dismissKey = (sessionId: string, date: string) =>
  `workout:ghostPromptDismissed:${date}:${sessionId}`;

export function GhostSessionPromptCard({
  onLogNow,
}: {
  onLogNow: (templateId: TemplateId) => void;
}) {
  const date = todayIso();
  const sessionsToday = useSessionsForDate(date);
  const allSets = useAllSets();
  const prescriptions = usePrescriptions();
  const templates = useTemplates();
  const [dismissed, setDismissed] = useState(() => new Set<string>());
  const [busyId, setBusyId] = useState<string | null>(null);

  const ghostSessions = useMemo(() => {
    if (!sessionsToday?.length || !prescriptions || !allSets) return [];
    const out: SessionLog[] = [];
    for (const s of sessionsToday) {
      try {
        if (typeof window !== 'undefined' && sessionStorage.getItem(dismissKey(s.id, date)) === '1') {
          continue;
        }
      } catch {
        /* ignore */
      }
      if (dismissed.has(s.id)) continue;
      // A workout that has started and not finished has no sets yet, so it
      // derives to ghost. Keep the prompt for stored ghosts only.
      if (s.startedAt && !s.completedAt) continue;
      const sets = allSets.filter((st) => st.sessionLogId === s.id);
      if (deriveSessionStatus(s, prescriptions, sets) !== 'ghost') continue;
      out.push(s);
    }
    return out;
  }, [sessionsToday, prescriptions, allSets, date, dismissed]);

  const dismissOne = useCallback((sessionId: string) => {
    try {
      sessionStorage.setItem(dismissKey(sessionId, date), '1');
    } catch {
      /* ignore */
    }
    setDismissed((prev) => new Set(prev).add(sessionId));
  }, [date]);

  if (!templates?.length || ghostSessions.length === 0) return null;

  const isLocalSunday = new Date(`${date}T12:00:00`).getDay() === 0;

  return (
    <div className="space-y-3">
      {ghostSessions.map((session) => {
        const templateName =
          templates.find((t) => t.id === session.templateId)?.name ?? session.templateId;
        const busy = busyId === session.id;
        return (
          <div
            key={session.id}
            role="dialog"
            aria-labelledby={`ghost-prompt-${session.id}`}
            className="rounded-2xl border border-violet-500/40 bg-violet-950/35 px-4 py-3.5 space-y-3"
          >
            <div id={`ghost-prompt-${session.id}`} className="text-sm font-medium text-zinc-100">
              {isLocalSunday
                ? `Up next: ${templateName} -- Planning for tomorrow`
                : `Did you train ${templateName} on ${fmtDate(session.date, 'MMM d, yyyy')}?`}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  onLogNow(session.templateId);
                  dismissOne(session.id);
                }}
                className="min-h-11 rounded-xl bg-violet-500 px-4 text-sm font-semibold text-zinc-950 disabled:opacity-50"
              >
                Log now
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusyId(session.id);
                  try {
                    await localUpsert('session_logs', {
                      ...session,
                      sessionStatus: 'skipped',
                      mode: 'skip',
                    });
                    dismissOne(session.id);
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="min-h-11 rounded-xl border border-zinc-600 bg-zinc-900 px-4 text-sm font-medium text-zinc-100 disabled:opacity-50"
              >
                Mark as skipped
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusyId(session.id);
                  try {
                    await localDelete('session_logs', session.id);
                    dismissOne(session.id);
                  } finally {
                    setBusyId(null);
                  }
                }}
                className="min-h-11 rounded-xl border border-red-500/50 bg-red-950/40 px-4 text-sm font-medium text-red-100 disabled:opacity-50"
              >
                Delete session
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
