'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAllSets,
  useLifts,
  usePrescriptions,
  useReadinessForSession,
  useTemplates,
  useTodaySession,
} from '@/lib/hooks';
import { localUpsert, flushDirty } from '@/lib/sync';
import { todayIso } from '@/lib/time';
import type { Prescription, SessionLog, SessionTemplate, TemplateId } from '@/lib/types';
import { CardioBanner } from './CardioBanner';
import { SessionHeader } from './SessionHeader';
import { LiftCard } from './LiftCard';
import { decideProgression } from '@/lib/progression';
import { fmtDurationShort, sessionDurationMs } from '@/lib/stats';
import { ReadinessForm } from './ReadinessForm';
import { ReadinessSummary } from './ReadinessSummary';
import { getDb } from '@/lib/db';
import { defaultTemplateForLocalDate } from '@/lib/seed';
import { applyEffortScale, effortLabel } from '@/lib/effort';
import { BodyweightQuickLog } from './BodyweightQuickLog';

export function TodayView() {
  const templates = useTemplates();
  const lifts = useLifts();
  const [chosenTemplateId, setChosenTemplateId] = useState<TemplateId | null>(null);
  const [readinessSkipped, setReadinessSkipped] = useState(false);

  const suggested: SessionTemplate | undefined = useMemo(() => {
    if (!templates?.length) return undefined;
    return defaultTemplateForLocalDate(templates);
  }, [templates]);

  const activeId = chosenTemplateId ?? suggested?.id ?? null;
  const activeTemplate = templates?.find((t) => t.id === activeId);
  const session = useTodaySession((activeId ?? 'U1') as TemplateId);
  const prescriptions = usePrescriptions((activeId ?? undefined) as TemplateId | undefined);
  const readiness = useReadinessForSession(session?.id);

  // Auto-create today's session row. We re-check Dexie inside the effect
  // because `session` is briefly `undefined` while useLiveQuery resolves;
  // a naive upsert would clobber an existing row's mode/deload/watchFlags/
  // startedAt/completedAt every time the page reloaded.
  useEffect(() => {
    if (!activeId || session) return;
    let cancelled = false;
    (async () => {
      const id = `${todayIso()}-${activeId}`;
      const existing = await getDb().session_logs.get(id);
      if (cancelled || existing) return;
      const row: SessionLog = {
        id,
        date: todayIso(),
        templateId: activeId as TemplateId,
        mode: 'standard',
        deload: false,
        watchFlags: [],
      };
      await localUpsert('session_logs', row);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [activeId, session]);

  if (!templates || !lifts || !activeTemplate) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }
  if (!session) return <div className="p-6 text-zinc-500">Creating session…</div>;

  const needsReadiness =
    !readiness && !readinessSkipped && !session.startedAt && !session.completedAt;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <CardioBanner />

      <SessionHeader
        template={activeTemplate}
        session={session}
        templates={templates}
        onTemplateChange={(t) => setChosenTemplateId(t.id)}
      />

      <BodyweightQuickLog
        date={todayIso()}
        subtitle="Doesn&apos;t have to be lower day — updates the BW chart for this date."
      />

      {needsReadiness ? (
        <>
          <ReadinessForm
            session={session}
            promptBodyweight={activeTemplate.id === 'L1'}
            onComplete={() => setReadinessSkipped(true)}
          />
          <button
            type="button"
            onClick={() => setReadinessSkipped(true)}
            className="w-full text-xs text-zinc-500 underline underline-offset-2"
          >Skip readiness check</button>
        </>
      ) : session.mode === 'skip' ? (
        <>
          {readiness && <ReadinessSummary readiness={readiness} />}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-center text-zinc-400">
            <div className="text-lg font-medium text-zinc-200 mb-2">Skipping for recovery</div>
            <div className="text-sm">No sets to log. Switch back to Standard or Light if plans change.</div>
          </div>
        </>
      ) : (
        <div className="space-y-3">
          {readiness && <ReadinessSummary readiness={readiness} />}
          {(prescriptions ?? []).map((p) => {
            const lift = lifts.find((l) => l.id === p.liftId);
            if (!lift) return null;
            const adjusted = applyEffortScale(applySessionMode(p, session), session);
            return <LiftCard key={p.id} prescription={adjusted} lift={lift} session={session} />;
          })}
        </div>
      )}

      {!needsReadiness && session.mode !== 'skip' && (
        <>
          {(session.effortScale ?? 0) !== 0 && (
            <div className="text-xs text-zinc-500 text-center">
              Effort mode active: {effortLabel(session.effortScale ?? 0)}
            </div>
          )}
          <FinishSessionButton session={session} prescriptions={prescriptions ?? []} />
        </>
      )}
    </div>
  );
}

function applySessionMode(p: Prescription, s: SessionLog): Prescription {
  if (s.deload) {
    return { ...p, weight: Math.round(p.weight * 0.6) };
  }
  if (s.mode === 'light') {
    return { ...p, weight: Math.round(p.weight * 0.8) };
  }
  return p;
}

function FinishSessionButton({ session, prescriptions }: { session: SessionLog; prescriptions: Prescription[] }) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ advanced: number; held: number; skipped: number; durationMs: number | null } | null>(null);
  const sets = useAllSets();

  // Live elapsed (only while the session is in progress).
  const liveDuration = useMemo(() => {
    if (!session.startedAt || session.completedAt) return null;
    return sessionDurationMs(session, sets ?? []);
  }, [session, sets]);

  async function finish() {
    setBusy(true);
    try {
      const db = getDb();
      const sessionSets = await db.set_logs.where('sessionLogId').equals(session.id).toArray();
      let advanced = 0, held = 0, skipped = 0;
      for (const p of prescriptions) {
        const dec = decideProgression(p, sessionSets, session);
        if (dec.advanced) {
          advanced++;
          await localUpsert('prescriptions', { ...p, weight: dec.nextWeight });
        } else if (dec.held) {
          held++;
        } else if (dec.skipped) {
          skipped++;
        }
      }
      const completedAt = new Date().toISOString();
      const finalSession = { ...session, completedAt };
      await localUpsert('session_logs', finalSession);
      await flushDirty();
      const durationMs = sessionDurationMs(finalSession, sessionSets);
      setSummary({ advanced, held, skipped, durationMs });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 pt-2">
      {liveDuration != null && (
        <div className="text-xs text-zinc-500 text-center font-mono">
          session · {fmtDurationShort(liveDuration)}
        </div>
      )}
      <button
        onClick={finish}
        disabled={busy}
        className="w-full h-14 rounded-2xl bg-amber-500 text-zinc-950 font-semibold text-lg disabled:opacity-50"
      >
        {busy ? 'Finishing…' : session.completedAt ? 'Re-run progression' : 'Finish session'}
      </button>
      {summary && (
        <div className="text-sm text-zinc-400 text-center space-y-0.5">
          <div>
            <span className="text-emerald-400">{summary.advanced} advanced</span>{' · '}
            <span className="text-amber-400">{summary.held} held</span>{' · '}
            <span className="text-zinc-500">{summary.skipped} skipped</span>
          </div>
          {summary.durationMs != null && (
            <div className="text-xs text-zinc-500 font-mono">
              session length · {fmtDurationShort(summary.durationMs)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
