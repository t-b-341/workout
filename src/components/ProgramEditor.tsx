'use client';

import { useMemo, useState } from 'react';
import {
  useAllReadiness,
  useAllSets,
  useLifts,
  usePrescriptions,
  useSessionsAfterReadiness,
  useTemplates,
} from '@/lib/hooks';
import { localUpsert, flushDirty, pullAll } from '@/lib/sync';
import type { Lift, Prescription, ReadinessLog, SessionLog, SessionTemplate, SetLog, TemplateId } from '@/lib/types';
import { getDb } from '@/lib/db';
import { defaultTemplateForLocalDate, sortTemplatesProgramOrder } from '@/lib/seed';
import { fmtDate, todayIso } from '@/lib/time';
import { isoWeekOf, startOfWeekIso } from '@/lib/stats';
import { liftForSnap, snapWorkingWeight } from '@/lib/progression';
import { prFeed } from '@/lib/stats';
import {
  mesocyclePosition,
  saveMesoConfig,
  useMesoConfig,
  type MesocycleConfig,
  type MesocyclePosition,
} from '@/lib/mesocycle';
import {
  patchGoalSessionPrefs,
  reorderFitnessGoals,
  removeFitnessGoal,
  upsertFitnessGoal,
  useFitnessGoals,
  useGoalSessionPrefs,
  type FitnessGoal,
} from '@/lib/goals';
import { LooseDecimalField, LooseIntField } from './WeightStepper';
import { PageShell } from './PageShell';

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

  const templatesProgramOrder = useMemo(
    () => (templates?.length ? sortTemplatesProgramOrder(templates) : []),
    [templates],
  );

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
    <PageShell variant="program" className="p-4 space-y-4">
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

      <GoalsPanel />
      <MesocycleSettings />

      <Schedule templates={templates} onSelectTemplate={(id) => setTemplateOverride(id)} />

      <div className="flex flex-wrap gap-2">
        {templatesProgramOrder.map((t) => (
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
            <LooseDecimalField
              value={p.weight}
              onCommit={(n) =>
                update(p, {
                  weight: snapWorkingWeight(n, liftForSnap(p.liftId)),
                })
              }
              className="col-span-2 h-10 rounded-lg bg-zinc-950 border border-zinc-800 text-center"
            />
            <LooseIntField
              value={p.sets}
              min={1}
              max={99}
              onCommit={(n) => update(p, { sets: n })}
              className="col-span-1 h-10 rounded-lg bg-zinc-950 border border-zinc-800 text-center"
            />
            <div className="col-span-2 flex items-center gap-1">
              <LooseIntField
                value={p.repMin}
                min={1}
                max={99}
                onCommit={(n) => update(p, { repMin: n })}
                className="w-full h-10 rounded-lg bg-zinc-950 border border-zinc-800 text-center"
              />
              <span className="text-zinc-600">–</span>
              <LooseIntField
                value={p.repMax}
                min={1}
                max={99}
                onCommit={(n) => update(p, { repMax: n })}
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
    </PageShell>
  );
}

function GoalsPanel() {
  const goals = useFitnessGoals();
  const sessionGoalPrefs = useGoalSessionPrefs();
  const [newGoal, setNewGoal] = useState('');
  const [category, setCategory] = useState<FitnessGoal['category']>('long-term');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  if (!goals || !sessionGoalPrefs) return null;

  async function addGoal() {
    const text = newGoal.trim();
    if (!text) return;
    await upsertFitnessGoal({
      id: `goal-${Date.now().toString(36)}`,
      text,
      category,
    });
    setNewGoal('');
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="font-medium">Goals</div>
      <label className="flex items-center justify-between gap-2 rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2">
        <span className="text-sm text-zinc-300">Use top 3 goals in session checklist</span>
        <input
          type="checkbox"
          checked={sessionGoalPrefs.useTopThreeOnly}
          onChange={(e) => void patchGoalSessionPrefs({ useTopThreeOnly: e.target.checked })}
        />
      </label>
      <div className="text-xs text-zinc-500">
        Drag goals to reorder. Session checklist follows this order.
      </div>
      <div className="space-y-2">
        {goals.map((g, idx) => (
          <div
            key={g.id}
            draggable
            onDragStart={() => setDraggingId(g.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (!draggingId || draggingId === g.id) return;
              const from = goals.findIndex((x) => x.id === draggingId);
              const to = goals.findIndex((x) => x.id === g.id);
              void reorderFitnessGoals(from, to);
              setDraggingId(null);
            }}
            onDragEnd={() => setDraggingId(null)}
            className={`flex items-center gap-2 rounded-lg bg-zinc-950 border px-3 py-2 ${
              draggingId === g.id ? 'border-amber-500/60' : 'border-zinc-800'
            }`}
          >
            <span className="text-zinc-500 cursor-grab" aria-hidden>⋮⋮</span>
            <span className="w-5 text-xs text-zinc-500 font-mono">{idx + 1}</span>
            <span className="flex-1 text-sm text-zinc-200">{g.text}</span>
            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
              {g.category}
            </span>
            <button
              type="button"
              onClick={() => void removeFitnessGoal(g.id)}
              className="text-xs text-rose-300 hover:text-rose-200"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2">
        <input
          type="text"
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          placeholder="Add a goal"
          className="h-10 rounded-lg bg-zinc-950 border border-zinc-800 px-3 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as FitnessGoal['category'])}
          className="h-10 rounded-lg bg-zinc-950 border border-zinc-800 px-2 text-sm"
        >
          <option value="long-term">Long-term</option>
          <option value="current">Current</option>
        </select>
        <button
          type="button"
          onClick={() => void addGoal()}
          className="h-10 px-3 rounded-lg bg-amber-500 text-zinc-950 text-sm font-medium"
        >
          Add
        </button>
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

function Schedule({
  templates,
  onSelectTemplate,
}: {
  templates: SessionTemplate[];
  onSelectTemplate: (id: TemplateId) => void;
}) {
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
                  <ScheduleRowItem
                    key={`${w.weekLabel}-${r.template.id}`}
                    row={r}
                    onSelectTemplate={onSelectTemplate}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScheduleRowItem({
  row,
  onSelectTemplate,
}: {
  row: ScheduleRow;
  onSelectTemplate: (id: TemplateId) => void;
}) {
  const dayName = fmtDate(row.date, 'EEE');
  const monthDay = fmtDate(row.date, 'M/d');
  const tone =
    row.status === 'today' ? 'bg-amber-500/10' :
    row.status === 'completed' ? '' :
    row.status === 'partial' ? 'bg-amber-900/10' :
    row.status === 'missed' ? 'bg-rose-950/20' : '';
  return (
    <button
      type="button"
      onClick={() => onSelectTemplate(row.template.id)}
      className={`w-full text-left flex items-center gap-2 px-3 py-2 ${tone} hover:bg-zinc-800/50 transition-colors`}
    >
      <div className="w-14 shrink-0 text-xs text-zinc-500 font-mono">
        {dayName} <span className="text-zinc-600">{monthDay}</span>
      </div>
      <div className="w-10 shrink-0 text-sm font-mono text-zinc-300">{row.template.id}</div>
      <div className="flex-1 min-w-0 text-sm text-zinc-300 truncate">
        {row.template.name.split('—')[1]?.trim() ?? row.template.name}
      </div>
      <StatusBadge status={row.status} />
    </button>
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
      if (session?.completedAt) {
        status = 'completed';
      } else if (date === today) {
        status = 'today';
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

type MesoLengthRecommendation = {
  action: 'extend' | 'shorten' | 'keep';
  suggestedAccumulation: number;
  suggestedDeload: number;
  reason: string;
  signalSummary: string;
};

function MesocycleSettings() {
  const cfg = useMesoConfig();
  const lifts = useLifts();
  const sessions = useSessionsAfterReadiness();
  const sets = useAllSets();
  const readiness = useAllReadiness();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<MesocycleFormDraft | null>(null);

  const today = todayIso();
  const recommendation = useMemo((): MesoLengthRecommendation => {
    if (!cfg) {
      return {
        action: 'keep',
        suggestedAccumulation: 4,
        suggestedDeload: 1,
        reason: 'Loading mesocycle settings…',
        signalSummary: '—',
      };
    }
    return analyzeMesoLengthRecommendation(cfg, sessions ?? [], sets ?? [], readiness ?? [], lifts ?? [], today);
  }, [cfg, sessions, sets, readiness, lifts, today]);

  if (!cfg) return null;
  const mesoConfig = cfg;
  const here = mesocyclePosition(today, mesoConfig);
  const startMonday = startOfWeekIso(isoWeekOf(mesoConfig.startDate));

  function startEdit() {
    setDraft({
      startDate: mesoConfig.startDate,
      accumulation: String(mesoConfig.accumulation),
      deload: String(mesoConfig.deload),
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
    // Length edits should never silently re-anchor the cycle.
    const keepAnchorLengthOnly: MesocycleConfig = {
      startDate: mesoConfig.startDate,
      accumulation,
      deload,
    };
    await saveMesoConfig(keepAnchorLengthOnly);
    setEditing(false);
    setDraft(null);
  }
  async function saveAnchorOnly() {
    if (!draft) return;
    // Normalize anchor to Monday of selected week; leave length unchanged.
    const normalizedAnchor = startOfWeekIso(isoWeekOf(draft.startDate));
    await saveMesoConfig({
      startDate: normalizedAnchor,
      accumulation: mesoConfig.accumulation,
      deload: mesoConfig.deload,
    });
    setEditing(false);
    setDraft(null);
  }
  async function applyLength(accumulation: number, deload: number) {
    await saveMesoConfig({
      startDate: mesoConfig.startDate,
      accumulation: Math.max(1, Math.min(12, Math.floor(accumulation))),
      deload: Math.max(0, Math.min(4, Math.floor(deload))),
    });
  }
  async function applyRecommendedLength() {
    await applyLength(recommendation.suggestedAccumulation, recommendation.suggestedDeload);
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
            <span className="font-mono text-zinc-400">{mesoConfig.accumulation}+{mesoConfig.deload}</span>
            {' '}({mesoConfig.accumulation + mesoConfig.deload}-week block)
          </div>
        </div>
        {!editing && (
          <button
            onClick={startEdit}
            className="h-8 px-3 rounded-lg bg-zinc-800 text-xs"
          >Edit</button>
        )}
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="text-xs uppercase tracking-wider text-zinc-500">Length recommendation</div>
          <span
            className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold ${
              recommendation.action === 'extend'
                ? 'bg-emerald-700 text-emerald-100'
                : recommendation.action === 'shorten'
                  ? 'bg-rose-900 text-rose-200'
                  : 'bg-zinc-800 text-zinc-300'
            }`}
          >
            {recommendation.action === 'extend'
              ? 'extend'
              : recommendation.action === 'shorten'
                ? 'shorten'
                : 'keep'}
          </span>
        </div>
        <div className="text-sm text-zinc-300">
          Suggested: <span className="font-mono">{recommendation.suggestedAccumulation}+{recommendation.suggestedDeload}</span>
          {' '}
          ({recommendation.suggestedAccumulation + recommendation.suggestedDeload}-week block)
        </div>
        <div className="text-xs text-zinc-500">{recommendation.reason}</div>
        <div className="text-[11px] text-zinc-500">
          Signals: {recommendation.signalSummary}
        </div>
        <div className="flex gap-2 flex-wrap pt-1">
          <button
            type="button"
            onClick={applyRecommendedLength}
            className="h-8 px-3 rounded-lg bg-amber-500 text-zinc-950 text-xs font-medium"
          >
            Apply recommendation
          </button>
          <button
            type="button"
            onClick={() => applyLength(mesoConfig.accumulation - 1, mesoConfig.deload)}
            className="h-8 px-3 rounded-lg bg-zinc-800 text-xs"
          >
            Shorten 1 week
          </button>
          <button
            type="button"
            onClick={() => applyLength(mesoConfig.accumulation + 1, mesoConfig.deload)}
            className="h-8 px-3 rounded-lg bg-zinc-800 text-xs"
          >
            Extend 1 week
          </button>
        </div>
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
            <button onClick={save} className="h-9 px-3 rounded-lg bg-zinc-800 text-sm">Save length only</button>
            <button onClick={saveAnchorOnly} className="h-9 px-3 rounded-lg bg-amber-500 text-zinc-950 font-medium text-sm">
              Save anchor date
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const MESO_HEURISTICS = {
  // Require clear momentum to extend.
  minPrSignalsToExtend: 3,
  minCompletionRateToExtend: 0.85,
  maxModifiedRateToExtend: 0.1,
  maxAvgSorenessToExtend: 2.8,
  minAvgMotivationToExtend: 3.2,
  // Be more sensitive to accumulating fatigue.
  highSorenessToShorten: 3.4,
  lowMotivationToShorten: 2.4,
  highModifiedRateToShorten: 0.2,
  lowCompletionRateToShorten: 0.65,
} as const;

function analyzeMesoLengthRecommendation(
  cfg: MesocycleConfig,
  sessions: SessionLog[],
  sets: SetLog[],
  readiness: ReadinessLog[],
  lifts: Lift[],
  today: string,
): MesoLengthRecommendation {
  const cycleDays = (cfg.accumulation + cfg.deload) * 7;
  const fromIso = addDaysIso(today, -cycleDays + 1);
  const cycleSessions = sessions.filter((s) => s.date >= fromIso && s.date <= today);
  const cycleSessionIds = new Set(cycleSessions.map((s) => s.id));
  const cycleSets = sets.filter((s) => cycleSessionIds.has(s.sessionLogId));
  const cycleReadiness = readiness.filter((r) => r.date >= fromIso && r.date <= today);

  const prs = prFeed(cycleSets, cycleSessions, lifts).length;
  const completedSessions = cycleSessions.filter((s) => Boolean(s.completedAt)).length;
  const completionRate = cycleSessions.length > 0 ? completedSessions / cycleSessions.length : 0;

  const modifiedSets = cycleSets.filter((s) => s.status !== 'completed').length;
  const modifiedRate = cycleSets.length > 0 ? modifiedSets / cycleSets.length : 0;
  const avgSoreness = cycleReadiness.length > 0
    ? cycleReadiness.reduce((sum, r) => sum + r.soreness, 0) / cycleReadiness.length
    : 0;
  const avgMotivation = cycleReadiness.length > 0
    ? cycleReadiness.reduce((sum, r) => sum + r.motivation, 0) / cycleReadiness.length
    : 0;

  const h = MESO_HEURISTICS;
  const highFatigue =
    avgSoreness >= h.highSorenessToShorten
    || avgMotivation <= h.lowMotivationToShorten
    || modifiedRate >= h.highModifiedRateToShorten
    || (cycleSessions.length > 0 && completionRate <= h.lowCompletionRateToShorten);
  const strongMomentum =
    prs >= h.minPrSignalsToExtend
    && completionRate >= h.minCompletionRateToExtend
    && modifiedRate <= h.maxModifiedRateToExtend
    && avgSoreness <= h.maxAvgSorenessToExtend
    && avgMotivation >= h.minAvgMotivationToExtend;

  if (strongMomentum && cfg.accumulation < 12) {
    const next = cfg.accumulation + 1;
    return {
      action: 'extend',
      suggestedAccumulation: next,
      suggestedDeload: cfg.deload,
      reason: 'Momentum looks good (PRs + strong completion + low fatigue). Extending accumulation by 1 week is likely productive.',
      signalSummary: `${prs} PR signals, ${Math.round(completionRate * 100)}% session completion, ${Math.round(modifiedRate * 100)}% modified sets`,
    };
  }
  if (highFatigue && cfg.accumulation > 1) {
    const next = cfg.accumulation - 1;
    return {
      action: 'shorten',
      suggestedAccumulation: next,
      suggestedDeload: cfg.deload,
      reason: 'Fatigue signals are elevated. Shortening accumulation by 1 week should reduce overshooting and improve next-block quality.',
      signalSummary: `soreness ${avgSoreness.toFixed(1)}/5, motivation ${avgMotivation.toFixed(1)}/5, ${Math.round(modifiedRate * 100)}% modified sets`,
    };
  }
  return {
    action: 'keep',
    suggestedAccumulation: cfg.accumulation,
    suggestedDeload: cfg.deload,
    reason: 'Current block length looks balanced from available cycle signals.',
    signalSummary: `${prs} PR signals, soreness ${avgSoreness ? avgSoreness.toFixed(1) : 'n/a'}/5, motivation ${avgMotivation ? avgMotivation.toFixed(1) : 'n/a'}/5`,
  };
}
