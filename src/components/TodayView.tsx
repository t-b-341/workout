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
import { fmtDate, todayIso } from '@/lib/time';
import type { Prescription, SessionLog, SessionTemplate, SetLog, TemplateId } from '@/lib/types';
import { CardioBanner } from './CardioBanner';
import { SessionHeader } from './SessionHeader';
import { LiftCard } from './LiftCard';
import { decideProgression } from '@/lib/progression';
import {
  fmtDurationShort,
  sessionDurationMs,
  sessionFinishHighlights,
  sessionRecapPRs,
  type SessionFinishHighlights,
  type SessionRecapPRItem,
} from '@/lib/stats';
import { ReadinessForm } from './ReadinessForm';
import { ReadinessSummary } from './ReadinessSummary';
import { getDb } from '@/lib/db';
import { defaultTemplateForLocalDate } from '@/lib/seed';
import { applyEffortScale, effortLabel } from '@/lib/effort';
import { BodyweightQuickLog } from './BodyweightQuickLog';
import { SessionRecapSheet } from './SessionRecapSheet';

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
  const allSets = useAllSets();

  const completeHighlights = useMemo(() => {
    if (!session?.completedAt || !allSets || !lifts) return null;
    return sessionFinishHighlights(session.id, allSets, lifts);
  }, [session?.completedAt, session?.id, allSets, lifts]);

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
      {session.completedAt && (
        <SessionCompleteBanner
          session={session}
          templateName={activeTemplate.name}
          sets={allSets ?? []}
          highlights={completeHighlights}
        />
      )}

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
            onClick={async () => {
              await localUpsert('session_logs', {
                ...session,
                readinessCompletedAt: new Date().toISOString(),
              });
              setReadinessSkipped(true);
            }}
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

function SessionCompleteBanner({
  session,
  templateName,
  sets,
  highlights,
}: {
  session: SessionLog;
  templateName: string;
  sets: SetLog[];
  highlights: SessionFinishHighlights | null;
}) {
  const durationMs = sessionDurationMs(session, sets);
  return (
    <div
      role="status"
      className="rounded-2xl border border-emerald-500/45 bg-gradient-to-br from-emerald-950/90 via-emerald-950/50 to-zinc-900 px-4 py-3.5 flex items-start gap-3 shadow-lg shadow-emerald-950/20"
    >
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 text-lg font-bold"
        aria-hidden
      >
        ✓
      </div>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-base font-semibold text-emerald-50">Session complete</div>
        <div className="text-sm text-emerald-200/85 mt-1">
          <span className="font-medium text-emerald-100">{templateName}</span>
          <span className="text-emerald-200/50"> · </span>
          <span>{fmtDate(session.date, 'EEE, MMM d')}</span>
          {durationMs != null && (
            <>
              <span className="text-emerald-200/50"> · </span>
              <span className="font-mono text-emerald-100/90">{fmtDurationShort(durationMs)}</span>
            </>
          )}
          {highlights != null && highlights.totalRestBetweenSetsMs > 0 && (
            <>
              <span className="text-emerald-200/50"> · </span>
              <span className="font-mono text-emerald-100/90">
                rest {fmtDurationShort(highlights.totalRestBetweenSetsMs)}
              </span>
            </>
          )}
        </div>
        <p className="text-xs text-emerald-200/60 mt-1.5">
          You can still edit sets below; use <span className="text-emerald-100/90">Re-run progression</span> if you change something material.
        </p>
      </div>
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

type SessionRecapPayload = {
  session: SessionLog;
  templateName: string;
  prs: SessionRecapPRItem[];
  durationMs: number | null;
  progression: { advanced: number; held: number; skipped: number };
  highlights: SessionFinishHighlights;
};

function FinishSessionButton({ session, prescriptions }: { session: SessionLog; prescriptions: Prescription[] }) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ advanced: number; held: number; skipped: number; durationMs: number | null } | null>(null);
  const [recap, setRecap] = useState<SessionRecapPayload | null>(null);
  const sets = useAllSets();

  // Live elapsed (only while the session is in progress).
  const liveDuration = useMemo(() => {
    if (!session.startedAt || session.completedAt) return null;
    return sessionDurationMs(session, sets ?? []);
  }, [session, sets]);

  async function finish() {
    setBusy(true);
    try {
      const wasFirstCompletion = !session.completedAt;
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
      const progression = { advanced, held, skipped };
      setSummary({ ...progression, durationMs });

      if (wasFirstCompletion) {
        const tmpl = await db.templates.get(session.templateId);
        const allSets = await db.set_logs.toArray();
        const allSessions = await db.session_logs.toArray();
        const lifts = await db.lifts.toArray();
        const prs = sessionRecapPRs(session.id, allSets, allSessions, lifts);
        const highlights = sessionFinishHighlights(session.id, sessionSets, lifts);
        setRecap({
          session: finalSession,
          templateName: tmpl?.name ?? session.templateId,
          prs,
          durationMs,
          progression,
          highlights,
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 pt-2">
      {recap && (
        <SessionRecapSheet
          open
          onClose={() => setRecap(null)}
          session={recap.session}
          templateName={recap.templateName}
          durationMs={recap.durationMs}
          progression={recap.progression}
          prs={recap.prs}
          highlights={recap.highlights}
        />
      )}
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
