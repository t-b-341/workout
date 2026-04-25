'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLifts, usePrescriptions, useTemplates, useTodaySession } from '@/lib/hooks';
import { localUpsert, flushDirty } from '@/lib/sync';
import { todayIso } from '@/lib/time';
import type { Prescription, SessionLog, SessionTemplate, TemplateId } from '@/lib/types';
import { CardioBanner } from './CardioBanner';
import { BodyweightPrompt } from './BodyweightPrompt';
import { SessionHeader } from './SessionHeader';
import { LiftCard } from './LiftCard';
import { decideProgression } from '@/lib/progression';
import { getDb } from '@/lib/db';

export function TodayView() {
  const templates = useTemplates();
  const lifts = useLifts();
  const [chosenTemplateId, setChosenTemplateId] = useState<TemplateId | null>(null);

  const suggested: SessionTemplate | undefined = useMemo(() => {
    if (!templates) return undefined;
    const today = new Date();
    return templates.find((t) => t.dayOfWeek === today.getDay()) ?? templates[0];
  }, [templates]);

  const activeId = chosenTemplateId ?? suggested?.id ?? null;
  const activeTemplate = templates?.find((t) => t.id === activeId);
  const session = useTodaySession((activeId ?? 'U1') as TemplateId);
  const prescriptions = usePrescriptions((activeId ?? undefined) as TemplateId | undefined);

  // Auto-create today's session row.
  useEffect(() => {
    if (!activeId || session) return;
    const id = `${todayIso()}-${activeId}`;
    const row: SessionLog = {
      id,
      date: todayIso(),
      templateId: activeId as TemplateId,
      mode: 'standard',
      deload: false,
      watchFlags: [],
    };
    localUpsert('session_logs', row).catch(() => {});
  }, [activeId, session]);

  if (!templates || !lifts || !activeTemplate) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }
  if (!session) return <div className="p-6 text-zinc-500">Creating session…</div>;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <CardioBanner />
      <BodyweightPrompt visible={activeTemplate.id === 'L1'} />

      <SessionHeader
        template={activeTemplate}
        session={session}
        templates={templates}
        onTemplateChange={(t) => setChosenTemplateId(t.id)}
      />

      {session.mode === 'skip' ? (
        <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-center text-zinc-400">
          <div className="text-lg font-medium text-zinc-200 mb-2">Skipping for recovery</div>
          <div className="text-sm">No sets to log. Switch back to Standard or Light if plans change.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {(prescriptions ?? []).map((p) => {
            const lift = lifts.find((l) => l.id === p.liftId);
            if (!lift) return null;
            const adjusted = applySessionMode(p, session);
            return <LiftCard key={p.id} prescription={adjusted} lift={lift} session={session} />;
          })}
        </div>
      )}

      {session.mode !== 'skip' && (
        <FinishSessionButton session={session} prescriptions={prescriptions ?? []} />
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
  const [summary, setSummary] = useState<{ advanced: number; held: number; skipped: number } | null>(null);

  async function finish() {
    setBusy(true);
    try {
      const db = getDb();
      const sets = await db.set_logs.where('sessionLogId').equals(session.id).toArray();
      let advanced = 0, held = 0, skipped = 0;
      for (const p of prescriptions) {
        const dec = decideProgression(p, sets, session);
        if (dec.advanced) {
          advanced++;
          await localUpsert('prescriptions', { ...p, weight: dec.nextWeight });
        } else if (dec.held) {
          held++;
        } else if (dec.skipped) {
          skipped++;
        }
      }
      await localUpsert('session_logs', { ...session, completedAt: new Date().toISOString() });
      await flushDirty();
      setSummary({ advanced, held, skipped });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 pt-2">
      <button
        onClick={finish}
        disabled={busy}
        className="w-full h-14 rounded-2xl bg-amber-500 text-zinc-950 font-semibold text-lg disabled:opacity-50"
      >
        {busy ? 'Finishing…' : session.completedAt ? 'Re-run progression' : 'Finish session'}
      </button>
      {summary && (
        <div className="text-sm text-zinc-400 text-center">
          <span className="text-emerald-400">{summary.advanced} advanced</span>{' · '}
          <span className="text-amber-400">{summary.held} held</span>{' · '}
          <span className="text-zinc-500">{summary.skipped} skipped</span>
        </div>
      )}
    </div>
  );
}
