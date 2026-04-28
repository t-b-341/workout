'use client';

import { useMemo, useState } from 'react';
import { useAllSets, useLifts, usePrescriptions, useSessionsAfterReadiness, useTemplates } from '@/lib/hooks';
import { localUpsert, flushDirty, pullAll } from '@/lib/sync';
import type { Prescription, SessionLog, SessionTemplate, SetLog, TemplateId } from '@/lib/types';
import { getDb } from '@/lib/db';
import { defaultTemplateForLocalDate } from '@/lib/seed';
import { fmtDate, todayIso } from '@/lib/time';
import { isoWeekOf, startOfWeekIso } from '@/lib/stats';
import { liftForSnap, snapWorkingWeight } from '@/lib/progression';
import {
  mesocyclePosition,
  saveMesoConfig,
  useMesoConfig,
  type MesocycleConfig,
  type MesocyclePosition,
} from '@/lib/mesocycle';

/** Editable meso fields while the form is open — numbers as strings so the
 *  user can clear the field and type a new value (controlled `number` +
 *  `parseInt(v || '1')` forces empty back to 1 and blocks editing). */
type MesocycleFormDraft = {
  startDate: string;
  accumulation: string;
  deload: string;
};

export function ProgramEditor() {
  const templates = useTemplates();
  const lifts = useLifts();
  const defaultTemplateId = useMemo(
    () => (templates?.length ? defaultTemplateForLocalDate(templates).id : 'U1'),
    [templates],
  );
  const [templateOverride, setTemplateOverride] = useState<TemplateId | null>(null);
  const activeId = templateOverride ?? defaultTemplateId;
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

      <MesocycleSettings />

      <Schedule templates={templates} />

      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplateOverride(t.id)}
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
              onChange={(e) =>
                update(p, {
                  weight: snapWorkingWeight(parseFloat(e.target.value || '0'), liftForSnap(p.liftId)),
                })
              }
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

// ---------- Schedule ----------

const WEEK_OPTIONS = [4, 6, 8, 12] as const;
type WeekCount = typeof WEEK_OPTIONS[number];

type ScheduleRow = {
  date: string;            // ISO yyyy-mm-dd
  dayOfWeek: number;       // 1=Mon..7=Sun
  template: SessionTemplate;
  status: 'completed' | 'today' | 'upcoming' | 'missed' | 'partial';
  sessionId?: string;
};

type ScheduleWeek = {
  weekIndex: number;       // 1-based, Week 1 = current ISO week (legacy fallback label)
  weekLabel: string;       // ISO week label e.g. 2026-W17
  weekStart: string;       // ISO date of Monday
  weekEnd: string;         // ISO date of Sunday
  rows: ScheduleRow[];
  meso: MesocyclePosition | null;
};

function Schedule({ templates }: { templates: SessionTemplate[] }) {
  const sessions = useSessionsAfterReadiness();
  const sets = useAllSets();
  const meso = useMesoConfig();
  const [weeksToShow, setWeeksToShow] = useState<WeekCount>(4);
  const [open, setOpen] = useState(true);

  const weeks = useMemo(
    () => buildSchedule(templates, sessions ?? [], sets ?? [], weeksToShow, meso),
    [templates, sessions, sets, weeksToShow, meso],
  );

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800">
      <div className="p-4 flex items-center justify-between gap-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex-1 text-left"
          aria-controls="schedule-body"
        >
          <div className="font-medium flex items-center gap-2">
            <span className={`text-zinc-500 transition-transform inline-block ${open ? 'rotate-90' : ''}`}>›</span>
            Schedule
          </div>
          <div className="text-xs text-zinc-500 ml-4">
            Next {weeksToShow} weeks · {templates.length}-day split
          </div>
        </button>
        <div className="flex items-center gap-1 rounded-lg bg-zinc-950 border border-zinc-800 p-1">
          {WEEK_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => setWeeksToShow(n)}
              className={`h-7 px-2 rounded-md text-xs ${
                weeksToShow === n ? 'bg-amber-500 text-zinc-950 font-medium' : 'text-zinc-400'
              }`}
            >{n}w</button>
          ))}
        </div>
      </div>
      {open && (
        <div id="schedule-body" className="border-t border-zinc-800 px-2 sm:px-4 pb-4 pt-2 space-y-3">
          {weeks.map((w) => (
            <div
              key={w.weekLabel}
              className={`rounded-xl border overflow-hidden ${
                w.meso?.isDeload ? 'border-indigo-900/60' : 'border-zinc-800'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2 px-3 py-2 bg-zinc-950 border-b border-zinc-800 flex-wrap">
                <div className="text-sm font-medium flex items-center gap-2">
                  {w.meso ? (
                    <>
                      <span>Meso {w.meso.mesoIndex} · Week {w.meso.weekInMeso} of {w.meso.totalWeeks}</span>
                      {w.meso.isDeload && (
                        <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-700 text-indigo-100 font-semibold">
                          deload
                        </span>
                      )}
                    </>
                  ) : (
                    <span>Week {w.weekIndex}</span>
                  )}
                </div>
                <div className="text-xs text-zinc-500">
                  {fmtDate(w.weekStart, 'MMM d')} – {fmtDate(w.weekEnd, 'MMM d')}
                </div>
              </div>
              <div className="divide-y divide-zinc-800">
                {w.rows.map((r) => (
                  <ScheduleRowItem key={`${w.weekLabel}-${r.template.id}`} row={r} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleRowItem({ row }: { row: ScheduleRow }) {
  const dayName = fmtDate(row.date, 'EEE');
  const monthDay = fmtDate(row.date, 'M/d');
  const tone =
    row.status === 'today' ? 'bg-amber-500/10' :
    row.status === 'completed' ? '' :
    row.status === 'partial' ? 'bg-amber-900/10' :
    row.status === 'missed' ? 'bg-rose-950/20' : '';
  return (
    <div className={`flex items-center gap-2 px-3 py-2 ${tone}`}>
      <div className="w-14 shrink-0 text-xs text-zinc-500 font-mono">
        {dayName} <span className="text-zinc-600">{monthDay}</span>
      </div>
      <div className="w-10 shrink-0 text-sm font-mono text-zinc-300">{row.template.id}</div>
      <div className="flex-1 min-w-0 text-sm text-zinc-300 truncate">
        {row.template.name.split('—')[1]?.trim() ?? row.template.name}
      </div>
      <StatusBadge status={row.status} />
    </div>
  );
}

function StatusBadge({ status }: { status: ScheduleRow['status'] }) {
  const map: Record<ScheduleRow['status'], { label: string; className: string }> = {
    today:     { label: 'today',     className: 'bg-amber-500 text-zinc-950' },
    completed: { label: 'done',      className: 'bg-emerald-700 text-emerald-100' },
    partial:   { label: 'partial',   className: 'bg-amber-700 text-amber-100' },
    missed:    { label: 'missed',    className: 'bg-rose-900 text-rose-200' },
    upcoming:  { label: '',          className: 'invisible' },
  };
  const { label, className } = map[status];
  return (
    <span className={`shrink-0 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${className}`}>
      {label || '—'}
    </span>
  );
}

function buildSchedule(
  templates: SessionTemplate[],
  sessions: SessionLog[],
  sets: SetLog[],
  weeksToShow: WeekCount,
  meso: MesocycleConfig | undefined,
): ScheduleWeek[] {
  const today = todayIso();
  const currentWeek = isoWeekOf(today);

  // Index sessions and sets for fast lookup.
  const sessionsByKey = new Map<string, SessionLog>();
  for (const s of sessions) {
    sessionsByKey.set(`${s.date}:${s.templateId}`, s);
  }
  const setCountBySession = new Map<string, number>();
  for (const x of sets) {
    setCountBySession.set(x.sessionLogId, (setCountBySession.get(x.sessionLogId) ?? 0) + 1);
  }

  const sortedTemplates = [...templates].sort((a, b) => a.dayOfWeek - b.dayOfWeek);
  const out: ScheduleWeek[] = [];

  for (let i = 0; i < weeksToShow; i++) {
    const weekLabel = addWeeksToIsoWeek(currentWeek, i);
    const weekStart = startOfWeekIso(weekLabel);
    const weekEnd = addDaysIso(weekStart, 6);
    const rows: ScheduleRow[] = sortedTemplates.map((t) => {
      const date = addDaysIso(weekStart, t.dayOfWeek - 1);
      const session = sessionsByKey.get(`${date}:${t.id}`);
      const setCount = session ? (setCountBySession.get(session.id) ?? 0) : 0;
      let status: ScheduleRow['status'];
      if (date === today) {
        status = 'today';
      } else if (session?.completedAt) {
        status = 'completed';
      } else if (setCount > 0) {
        status = 'partial';
      } else if (date < today) {
        status = 'missed';
      } else {
        status = 'upcoming';
      }
      return { date, dayOfWeek: t.dayOfWeek, template: t, status, sessionId: session?.id };
    });
    out.push({
      weekIndex: i + 1,
      weekLabel,
      weekStart,
      weekEnd,
      rows,
      meso: meso ? mesocyclePosition(weekStart, meso) : null,
    });
  }
  return out;
}

function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function addWeeksToIsoWeek(weekLabel: string, n: number): string {
  // Compute the Monday of that week, add n*7 days, then label that date's ISO week.
  const monday = startOfWeekIso(weekLabel);
  const shifted = addDaysIso(monday, n * 7);
  return isoWeekOf(shifted);
}

// ---------- Mesocycle settings ----------

function MesocycleSettings() {
  const cfg = useMesoConfig();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MesocycleFormDraft | null>(null);

  if (!cfg) return null;

  const today = todayIso();
  const here = mesocyclePosition(today, cfg);
  const startMonday = startOfWeekIso(isoWeekOf(cfg.startDate));

  function startEdit() {
    if (!cfg) return;
    setDraft({
      startDate: cfg.startDate,
      accumulation: String(cfg.accumulation),
      deload: String(cfg.deload),
    });
    setEditing(true);
  }
  async function save() {
    if (!draft) return;
    const accParsed = parseInt(draft.accumulation.trim(), 10);
    const delParsed = parseInt(draft.deload.trim(), 10);
    const accumulation = Math.max(
      1,
      Math.min(12, Number.isFinite(accParsed) ? Math.floor(accParsed) : 1),
    );
    const deload = Math.max(
      0,
      Math.min(4, Number.isFinite(delParsed) ? Math.floor(delParsed) : 0),
    );
    // Normalize: snap startDate to the Monday of its ISO week.
    const normalized: MesocycleConfig = {
      startDate: startOfWeekIso(isoWeekOf(draft.startDate)),
      accumulation,
      deload,
    };
    await saveMesoConfig(normalized);
    setEditing(false);
    setDraft(null);
  }
  function cancel() {
    setEditing(false);
    setDraft(null);
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <div className="font-medium">Mesocycle</div>
          <div className="text-xs text-zinc-500">
            {here ? (
              <>
                Currently:{' '}
                <span className="text-zinc-300 font-mono">
                  Meso {here.mesoIndex} · Week {here.weekInMeso} of {here.totalWeeks}
                </span>
                {here.isDeload && <span className="ml-2 text-indigo-400">deload week</span>}
              </>
            ) : (
              <>Anchor is in the future — Meso 1 starts {fmtDate(startMonday, 'EEE MMM d')}.</>
            )}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5">
            Anchor: <span className="font-mono text-zinc-400">{fmtDate(startMonday, 'EEE MMM d, yyyy')}</span>
            {' · '}
            <span className="font-mono text-zinc-400">{cfg.accumulation}+{cfg.deload}</span>
            {' '}({cfg.accumulation + cfg.deload}-week block)
          </div>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="h-8 px-3 rounded-lg bg-zinc-800 text-xs"
          >Edit</button>
        )}
      </div>

      {editing && draft && (
        <div className="border-t border-zinc-800 pt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Anchor date (Meso 1 · Week 1 Monday)
            <input
              type="date"
              value={draft.startDate}
              onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
              className="h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm"
              aria-label="Mesocycle anchor date"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Accumulation weeks
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft.accumulation}
              onChange={(e) => setDraft({ ...draft, accumulation: e.target.value.replace(/\D/g, '') })}
              className="h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono"
              aria-label="Accumulation weeks per mesocycle"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-zinc-400">
            Deload weeks
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={draft.deload}
              onChange={(e) => setDraft({ ...draft, deload: e.target.value.replace(/\D/g, '') })}
              className="h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm font-mono"
              aria-label="Deload weeks per mesocycle"
            />
          </label>
          <div className="sm:col-span-3 flex gap-2 justify-end">
            <button onClick={cancel} className="h-9 px-3 rounded-lg bg-zinc-800 text-sm">Cancel</button>
            <button onClick={save} className="h-9 px-3 rounded-lg bg-amber-500 text-zinc-950 font-medium text-sm">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
