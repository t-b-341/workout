'use client';

import { useState } from 'react';
import { useLifts, usePrescriptions, useTemplates } from '@/lib/hooks';
import { localUpsert, flushDirty, pullAll } from '@/lib/sync';
import type { Prescription, TemplateId } from '@/lib/types';
import { getDb } from '@/lib/db';

export function ProgramEditor() {
  const templates = useTemplates();
  const lifts = useLifts();
  const [activeId, setActiveId] = useState<TemplateId>('U1');
  const prescriptions = usePrescriptions(activeId);
  const [exporting, setExporting] = useState(false);

  if (!templates || !lifts) return <div className="p-6 text-zinc-500">Loading…</div>;

  const liftName = (id: string) => lifts.find((l) => l.id === id)?.name ?? id;

  async function update(p: Prescription, patch: Partial<Prescription>) {
    await localUpsert('prescriptions', { ...p, ...patch });
  }

  async function exportAll() {
    setExporting(true);
    try {
      const db = getDb();
      const dump = {
        exportedAt: new Date().toISOString(),
        prescriptions: await db.prescriptions.toArray(),
        session_logs: await db.session_logs.toArray(),
        set_logs: await db.set_logs.toArray(),
        cardio_logs: await db.cardio_logs.toArray(),
        bodyweight_logs: await db.bodyweight_logs.toArray(),
      };
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workout-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Program</h1>
        <div className="flex gap-2">
          <button
            onClick={async () => { await flushDirty(); await pullAll(); }}
            className="h-10 px-3 rounded-lg bg-zinc-800 text-sm"
          >Sync</button>
          <button
            onClick={exportAll}
            disabled={exporting}
            className="h-10 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
          >{exporting ? 'Exporting…' : 'Export JSON'}</button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={`h-10 px-3 rounded-lg text-sm ${activeId === t.id ? 'bg-amber-500 text-zinc-950 font-medium' : 'bg-zinc-800'}`}
          >{t.id} · {t.name.split('—')[0].trim()}</button>
        ))}
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
          <div className="col-span-4">Lift</div>
          <div className="col-span-2 text-center">Weight</div>
          <div className="col-span-1 text-center">Sets</div>
          <div className="col-span-2 text-center">Rep range</div>
          <div className="col-span-3">Notes</div>
        </div>
        {(prescriptions ?? []).map((p) => (
          <div key={p.id} className="grid grid-cols-12 gap-2 px-3 py-3 items-center border-b border-zinc-800 last:border-b-0">
            <div className="col-span-4 text-sm">{liftName(p.liftId)}</div>
            <input
              type="number"
              step={0.5}
              value={p.weight}
              onChange={(e) => update(p, { weight: parseFloat(e.target.value || '0') })}
              className="col-span-2 h-10 rounded-lg bg-zinc-950 border border-zinc-800 text-center"
            />
            <input
              type="number"
              value={p.sets}
              onChange={(e) => update(p, { sets: parseInt(e.target.value || '1', 10) })}
              className="col-span-1 h-10 rounded-lg bg-zinc-950 border border-zinc-800 text-center"
            />
            <div className="col-span-2 flex items-center gap-1">
              <input
                type="number"
                value={p.repMin}
                onChange={(e) => update(p, { repMin: parseInt(e.target.value || '1', 10) })}
                className="w-full h-10 rounded-lg bg-zinc-950 border border-zinc-800 text-center"
              />
              <span className="text-zinc-600">–</span>
              <input
                type="number"
                value={p.repMax}
                onChange={(e) => update(p, { repMax: parseInt(e.target.value || '1', 10) })}
                className="w-full h-10 rounded-lg bg-zinc-950 border border-zinc-800 text-center"
              />
            </div>
            <input
              type="text"
              value={p.notes ?? ''}
              onChange={(e) => update(p, { notes: e.target.value })}
              placeholder="—"
              className="col-span-3 h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
