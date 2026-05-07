'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  useAllBodyweight,
  useAllReadiness,
  useAllSets,
  useLifts,
  usePrescriptions,
  usePrescriptionsByTemplate,
  useSessionsAfterReadiness,
  useTemplates,
} from '@/lib/hooks';
import { localDelete, localUpsert, flushDirty, pullAll } from '@/lib/sync';
import type { Lift, Prescription, SessionLog, SessionTemplate, SetLog, TemplateId } from '@/lib/types';
import { getDb } from '@/lib/db';
import { defaultTemplateForLocalDate, sortTemplatesProgramOrder } from '@/lib/seed';
import {
  readTodayPlanPreference,
  todayPlanPreferenceIsForToday,
} from '@/lib/todayPlanPreference';
import { buildFullLocalExport } from '@/lib/exportLocalDump';
import { fmtDate, todayIso } from '@/lib/time';
import {
  buildRoutineMarkdown,
  buildUpcomingWeekRoutineMarkdown,
  isoDatesEndingToday,
  RECENT_SIGNAL_DAYS_DEFAULT,
  stressLogsByDate,
  upcomingTrainingIsoWeekRange,
} from '@/lib/exportRoutineMarkdown';
import { isoWeekOf, startOfWeekIso } from '@/lib/stats';
import { liftForSnap, snapWorkingWeight } from '@/lib/progression';
import { MesocycleInsightsSection } from './MesocycleInsightsSection';
import {
  clearMesoBoundaryPromptState,
  mesocyclePosition,
  saveMesoConfig,
  useMesoConfig,
  type MesocycleConfig,
  type MesocyclePosition,
} from '@/lib/mesocycle';
import {
  analyzeMesoLengthRecommendation,
  MESO_DELOAD_EXECUTION_GUIDANCE,
  type MesoLengthRecommendation,
} from '@/lib/mesoRecommendation';
import {
  patchGoalSessionPrefs,
  reorderFitnessGoals,
  removeFitnessGoal,
  upsertFitnessGoal,
  useFitnessGoals,
  useGoalSessionPrefs,
  type FitnessGoal,
} from '@/lib/goals';
import { MesoBoundaryPromptCard } from './MesoBoundaryPromptCard';
import { LooseDecimalField, LooseIntField } from './WeightStepper';
import { PageShell } from './PageShell';
import { ScheduleWorkoutSheet } from './ScheduleWorkoutSheet';
import { sortLiftsWithFavoritesFirst, toggleFavoriteLift, useFavoriteLiftIds } from '@/lib/favoriteLifts';

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
  const persistedTodayTemplateId = useMemo((): TemplateId | null => {
    const p = readTodayPlanPreference();
    if (!todayPlanPreferenceIsForToday(p)) return null;
    return templates?.some((t) => t.id === p.templateId) ? p.templateId : null;
  }, [templates]);
  const effectiveProgramTemplateId = persistedTodayTemplateId ?? defaultTemplateId;
  const [templateOverride, setTemplateOverride] = useState<TemplateId | null>(null);
  const activeId = templateOverride ?? effectiveProgramTemplateId;
  const prescriptions = usePrescriptions(activeId);
  const favoriteLiftIds = useFavoriteLiftIds();
  const favoriteLiftIdSet = useMemo(() => new Set(favoriteLiftIds), [favoriteLiftIds]);
  const mesoCfg = useMesoConfig();
  const [exporting, setExporting] = useState(false);
  const [exportingClaude, setExportingClaude] = useState<'idle' | 'md' | 'txt' | 'upMd' | 'upTxt'>('idle');

  const templatesProgramOrder = useMemo(
    () => (templates?.length ? sortTemplatesProgramOrder(templates) : []),
    [templates],
  );

  const liftsSorted = useMemo(() => {
    if (!lifts?.length) return [];
    return sortLiftsWithFavoritesFirst(lifts, favoriteLiftIds);
  }, [lifts, favoriteLiftIds]);

  if (!templates || !lifts) return <div className="p-6 text-zinc-500">Loading…</div>;

  async function update(p: Prescription, patch: Partial<Prescription>) {
    await localUpsert('prescriptions', { ...p, ...patch });
  }

  async function addExerciseSlot() {
    const list = prescriptions ?? [];
    const maxOrder = list.length ? Math.max(...list.map((x) => x.order)) : 0;
    const defaultLift = liftsSorted[0]?.id ?? 'pp';
    const id = `${activeId}-slot-${Date.now().toString(36)}`;
    const row: Prescription = {
      id,
      templateId: activeId,
      liftId: defaultLift,
      order: maxOrder + 10,
      weight: snapWorkingWeight(45, liftForSnap(defaultLift)),
      sets: 3,
      repMin: 8,
      repMax: 12,
    };
    await localUpsert('prescriptions', row);
  }

  async function removeExerciseSlot(p: Prescription) {
    const name = (lifts ?? []).find((l) => l.id === p.liftId)?.name ?? p.liftId;
    if (
      !window.confirm(
        `Remove "${name}" from this template?\n\nPast session logs stay in History; this row disappears from Program and Today.`,
      )
    ) {
      return;
    }
    await localDelete('prescriptions', p.id, { undoLabel: `Program · ${name}` });
  }

  async function reorderPrescriptions(fromIndex: number, toIndex: number) {
    const list = [...(prescriptions ?? [])].sort((a, b) => a.order - b.order);
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= list.length ||
      toIndex >= list.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const next = [...list];
    const [removed] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, removed);
    await Promise.all(
      next.map((row, i) => localUpsert('prescriptions', { ...row, order: (i + 1) * 10 })),
    );
  }

  async function movePrescriptionUp(p: Prescription) {
    const list = [...(prescriptions ?? [])].sort((a, b) => a.order - b.order);
    const i = list.findIndex((x) => x.id === p.id);
    if (i <= 0) return;
    await reorderPrescriptions(i, i - 1);
  }

  async function movePrescriptionDown(p: Prescription) {
    const list = [...(prescriptions ?? [])].sort((a, b) => a.order - b.order);
    const i = list.findIndex((x) => x.id === p.id);
    if (i < 0 || i >= list.length - 1) return;
    await reorderPrescriptions(i, i + 1);
  }

  async function exportClaudeBrief(ext: 'md' | 'txt') {
    const liftsNow = lifts;
    if (!liftsNow) return;
    setExportingClaude(ext);
    try {
      const db = getDb();
      const [prescriptionsAll, nutritionAll, sleepAll, stressAll] = await Promise.all([
        db.prescriptions.toArray(),
        db.nutrition_logs.toArray(),
        db.sleep_logs.toArray(),
        db.stress_logs.toArray(),
      ]);
      const nutritionByDate = new Map(nutritionAll.map((n) => [n.date, n]));
      const sleepByDate = new Map(sleepAll.map((s) => [s.date, s]));
      const stressByDateFull = stressLogsByDate(stressAll);
      const signalDates = isoDatesEndingToday(RECENT_SIGNAL_DAYS_DEFAULT);
      const md = buildRoutineMarkdown({
        exportedAtIso: new Date().toISOString(),
        templates: templatesProgramOrder,
        lifts: liftsNow,
        prescriptions: prescriptionsAll,
        nutritionByDate: new Map(signalDates.map((d) => [d, nutritionByDate.get(d)])),
        sleepByDate: new Map(signalDates.map((d) => [d, sleepByDate.get(d)])),
        stressByDate: new Map(signalDates.map((d) => [d, stressByDateFull.get(d)])),
        signalDates,
      });
      const mime =
        ext === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
      const blob = new Blob([md], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workout-claude-${todayIso()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingClaude('idle');
    }
  }

  async function exportClaudeUpcomingWeek(ext: 'md' | 'txt') {
    const liftsNow = lifts;
    if (!liftsNow) return;
    setExportingClaude(ext === 'md' ? 'upMd' : 'upTxt');
    try {
      const db = getDb();
      const [prescriptionsAll, nutritionAll, sleepAll, stressAll] = await Promise.all([
        db.prescriptions.toArray(),
        db.nutrition_logs.toArray(),
        db.sleep_logs.toArray(),
        db.stress_logs.toArray(),
      ]);
      const nutritionByDate = new Map(nutritionAll.map((n) => [n.date, n]));
      const sleepByDate = new Map(sleepAll.map((s) => [s.date, s]));
      const stressByDateFull = stressLogsByDate(stressAll);
      const range = upcomingTrainingIsoWeekRange(todayIso());
      let mesoNote: string | undefined;
      if (mesoCfg) {
        const pos = mesocyclePosition(range.monday, mesoCfg);
        if (pos) {
          mesoNote = `Meso ${pos.mesoIndex} · Week ${pos.weekInMeso} of ${pos.totalWeeks}${pos.isDeload ? ' · deload' : ''}`;
        }
      }
      const md = buildUpcomingWeekRoutineMarkdown({
        exportedAtIso: new Date().toISOString(),
        todayIso: todayIso(),
        templates: templatesProgramOrder,
        lifts: liftsNow,
        prescriptions: prescriptionsAll,
        nutritionByDate,
        sleepByDate,
        stressByDate: stressByDateFull,
        mesoNote,
      });
      const mime =
        ext === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
      const blob = new Blob([md], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workout-claude-upcoming-week-${todayIso()}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingClaude('idle');
    }
  }

  async function exportAll() {
    setExporting(true);
    try {
      const dump = await buildFullLocalExport();
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            onClick={async () => { await flushDirty(); await pullAll(); }}
            className="h-10 px-3 rounded-lg bg-zinc-800 text-sm"
          >Sync</button>
          <button
            type="button"
            onClick={() => exportClaudeUpcomingWeek('md')}
            disabled={exportingClaude !== 'idle' || exporting}
            title="Next Mon–Sun on your program with calendar dates, plus 7 days of nutrition / sleep / stress before that week. Smaller than full Claude export."
            className="h-10 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
          >
            {exportingClaude === 'upMd' ? 'Exporting…' : 'Upcoming week* · .md'}
          </button>
          <button
            type="button"
            onClick={() => exportClaudeUpcomingWeek('txt')}
            disabled={exportingClaude !== 'idle' || exporting}
            title="Same as upcoming week .md as plain text."
            className="h-10 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
          >
            {exportingClaude === 'upTxt' ? 'Exporting…' : 'Upcoming week* · .txt'}
          </button>
          <button
            type="button"
            onClick={() => exportClaudeBrief('md')}
            disabled={exportingClaude !== 'idle' || exporting}
            className="h-10 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
          >
            {exportingClaude === 'md' ? 'Exporting…' : 'Claude .md'}
          </button>
          <button
            type="button"
            onClick={() => exportClaudeBrief('txt')}
            disabled={exportingClaude !== 'idle' || exporting}
            className="h-10 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
          >
            {exportingClaude === 'txt' ? 'Exporting…' : 'Claude .txt'}
          </button>
          <button
            type="button"
            onClick={exportAll}
            disabled={exporting || exportingClaude !== 'idle'}
            className="h-10 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
          >{exporting ? 'Exporting…' : 'Full JSON'}</button>
        </div>
      </div>

      <Schedule
        templates={templates}
        lifts={lifts}
        onSelectTemplate={(id) => setTemplateOverride(id)}
      />

      <div className="flex flex-wrap gap-2">
        {templatesProgramOrder.map((t) => (
          <button
            key={t.id}
            onClick={() => setTemplateOverride(t.id)}
            className={`h-10 px-3 rounded-lg text-sm ${activeId === t.id ? 'bg-amber-500 text-zinc-950 font-medium' : 'bg-zinc-800'}`}
          >{t.id} · {t.name.split('—')[0].trim()}</button>
        ))}
      </div>

      <p className="text-xs text-zinc-500">
        Row order is the order on Today for this day. Pinned lifts sort to the top on Today; the dropdown below puts
        pins first so swaps stay quick.
      </p>

      {favoriteLiftIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="text-zinc-500 text-xs uppercase tracking-wider shrink-0">Pinned</span>
          <div className="flex flex-wrap gap-1.5">
            {favoriteLiftIds.map((id) => {
              const name = lifts.find((l) => l.id === id)?.name ?? id;
              return (
                <Link
                  key={id}
                  href={`/lifts/${id}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-200 text-xs hover:bg-amber-500/20"
                >
                  <span aria-hidden className="text-amber-400">★</span>
                  {name}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs uppercase tracking-wider text-zinc-500 border-b border-zinc-800">
          <div className="col-span-3">Lift</div>
          <div className="col-span-2 text-center">Weight</div>
          <div className="col-span-1 text-center">Sets</div>
          <div className="col-span-2 text-center">Rep range</div>
          <div className="col-span-2">Notes</div>
          <div className="col-span-2 text-center">Slot</div>
        </div>
        {(prescriptions ?? []).map((p, idx, arr) => {
          const pinned = favoriteLiftIdSet.has(p.liftId);
          return (
          <div key={p.id} className="grid grid-cols-12 gap-2 px-3 py-3 items-center border-b border-zinc-800 last:border-b-0">
            <div className="col-span-3 min-w-0 flex items-center gap-1.5">
              <button
                type="button"
                aria-label={pinned ? 'Unpin lift' : 'Pin lift'}
                title={pinned ? 'Unpin from favorites' : 'Pin — surfaces first on Today & in this list'}
                onClick={() => void toggleFavoriteLift(p.liftId)}
                className={`shrink-0 h-10 w-9 rounded-lg border text-lg leading-none flex items-center justify-center ${
                  pinned
                    ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
                    : 'border-zinc-700 bg-zinc-950 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                }`}
              >
                {pinned ? '★' : '☆'}
              </button>
              <select
                value={p.liftId}
                aria-label="Exercise for this row"
                onChange={(e) => {
                  const liftId = e.target.value;
                  const w = snapWorkingWeight(p.weight, liftForSnap(liftId));
                  void update(p, { liftId, weight: w, increment: undefined });
                }}
                className="h-10 min-w-0 flex-1 rounded-lg bg-zinc-950 border border-zinc-800 px-2 text-sm text-zinc-200"
              >
                {!liftsSorted.some((l) => l.id === p.liftId) && (
                  <option value={p.liftId}>{p.liftId}</option>
                )}
                {liftsSorted.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
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
              className="col-span-2 h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm"
            />
            <div className="col-span-2 flex flex-col gap-1 items-stretch">
              <div className="flex gap-1 justify-center">
                <button
                  type="button"
                  aria-label="Move exercise up"
                  disabled={idx === 0}
                  onClick={() => void movePrescriptionUp(p)}
                  className="h-9 flex-1 max-w-[3.5rem] rounded-lg border border-zinc-700 bg-zinc-950 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move exercise down"
                  disabled={idx === arr.length - 1}
                  onClick={() => void movePrescriptionDown(p)}
                  className="h-9 flex-1 max-w-[3.5rem] rounded-lg border border-zinc-700 bg-zinc-950 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40 disabled:pointer-events-none"
                >
                  ↓
                </button>
              </div>
              <button
                type="button"
                onClick={() => void removeExerciseSlot(p)}
                className="h-9 px-2 rounded-lg border border-rose-900/60 bg-rose-950/40 text-[11px] font-medium text-rose-200 hover:bg-rose-950/70"
              >
                Remove
              </button>
            </div>
          </div>
          );
        })}
        <div className="px-3 py-3 border-t border-zinc-800">
          <button
            type="button"
            onClick={() => void addExerciseSlot()}
            className="h-10 w-full rounded-lg bg-zinc-800 text-sm text-zinc-200 hover:bg-zinc-700"
          >
            Add exercise slot
          </button>
        </div>
      </div>

      <GoalsPanel />
      <MesocycleSettings />
    </PageShell>
  );
}

function GoalNumericTargetEditor({ goal }: { goal: FitnessGoal }) {
  const [metric, setMetric] = useState(goal.metric ?? '');
  const [targetStr, setTargetStr] = useState(goal.target != null ? String(goal.target) : '');
  const [unit, setUnit] = useState(goal.unit ?? '');
  const [dir, setDir] = useState<'above' | 'below' | 'exact'>(goal.direction ?? 'above');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMetric(goal.metric ?? '');
    setTargetStr(goal.target != null ? String(goal.target) : '');
    setUnit(goal.unit ?? '');
    setDir(goal.direction ?? 'above');
  }, [goal.id, goal.metric, goal.target, goal.unit, goal.direction]);

  async function saveExtras() {
    setBusy(true);
    try {
      const parsed = parseFloat(targetStr);
      const hasNumeric = targetStr.trim() !== '' && Number.isFinite(parsed);
      await upsertFitnessGoal({
        ...goal,
        metric: metric.trim() ? metric.trim() : undefined,
        unit: unit.trim() ? unit.trim() : undefined,
        target: hasNumeric ? parsed : undefined,
        direction: hasNumeric ? dir : undefined,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 pl-7 space-y-2 border-t border-zinc-800 pt-2">
      <div className="text-[11px] text-zinc-500">Optional numeric target (export + analysis)</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs text-zinc-500">
          Metric
          <input
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            placeholder="e.g. bodyweight"
            className="mt-1 block w-full h-9 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Target
          <input
            value={targetStr}
            onChange={(e) => setTargetStr(e.target.value)}
            placeholder="number"
            inputMode="decimal"
            className="mt-1 block w-full h-9 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-sm font-mono"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Unit
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="lb, kg…"
            className="mt-1 block w-full h-9 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-500">
          Direction
          <select
            value={dir}
            onChange={(e) => setDir(e.target.value as 'above' | 'below' | 'exact')}
            aria-label="Target direction"
            className="mt-1 block w-full h-9 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-sm"
          >
            <option value="above">Above</option>
            <option value="below">Below</option>
            <option value="exact">Exact</option>
          </select>
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void saveExtras()}
        className="text-xs px-3 h-8 rounded-lg bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
      >
        Save numeric fields
      </button>
    </div>
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
          <div key={g.id} className="rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 space-y-1">
            <div
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
              className={`flex items-center gap-2 ${
                draggingId === g.id ? 'ring-1 ring-amber-500/60 rounded-md' : ''
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
            <GoalNumericTargetEditor goal={g} />
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
          aria-label="New goal category"
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
  lifts,
  onSelectTemplate,
}: {
  templates: SessionTemplate[];
  lifts: Lift[];
  onSelectTemplate: (id: TemplateId) => void;
}) {
  const sessions = useSessionsAfterReadiness();
  const sets = useAllSets();
  const meso = useMesoConfig();
  const prescriptionsByTemplate = usePrescriptionsByTemplate();
  const [weeksToShow, setWeeksToShow] = useState<WeekCount>(4);
  const [open, setOpen] = useState(true);
  const [previewRow, setPreviewRow] = useState<ScheduleRow | null>(null);

  const weeks = useMemo(
    () => buildSchedule(templates, sessions ?? [], sets ?? [], weeksToShow, meso),
    [templates, sessions, sets, weeksToShow, meso],
  );

  return (
    <>
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
            Next {weeksToShow} weeks · {templates.length}-day split · tap a workout for an estimated preview (no hypothetical progression).
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
                    key={`${w.weekLabel}-${r.template.id}-${r.date}`}
                    row={r}
                    onOpenPreview={() => setPreviewRow(r)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    <ScheduleWorkoutSheet
      row={previewRow}
      onClose={() => setPreviewRow(null)}
      templatePrescriptions={
        previewRow == null
          ? undefined
          : prescriptionsByTemplate === undefined
            ? undefined
            : (prescriptionsByTemplate.get(previewRow.template.id) ?? [])
      }
      lifts={lifts}
      meso={meso}
      onSelectTemplate={onSelectTemplate}
    />
    </>
  );
}

function ScheduleRowItem({
  row,
  onOpenPreview,
}: {
  row: ScheduleRow;
  onOpenPreview: () => void;
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
      onClick={onOpenPreview}
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

function MesocycleSettings() {
  const cfg = useMesoConfig();
  const lifts = useLifts();
  const sessions = useSessionsAfterReadiness();
  const sets = useAllSets();
  const readiness = useAllReadiness();
  const bodyweightLogs = useAllBodyweight();
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
    await clearMesoBoundaryPromptState();
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
      <MesoBoundaryPromptCard />
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

      <div
        className={`rounded-xl border p-3 space-y-1.5 ${
          here?.isDeload
            ? 'border-indigo-500/40 bg-indigo-950/25'
            : 'border-zinc-800 bg-zinc-950/50'
        }`}
      >
        <div className="text-xs uppercase tracking-wider text-zinc-500">Deload — how to run it</div>
        <p className="text-sm text-zinc-300 leading-relaxed">{MESO_DELOAD_EXECUTION_GUIDANCE}</p>
      </div>

      <MesocycleInsightsSection
        cfg={mesoConfig}
        position={here}
        sessions={sessions ?? []}
        sets={sets ?? []}
        readiness={readiness ?? []}
        lifts={lifts ?? []}
        bodyweightLogs={bodyweightLogs ?? []}
        today={today}
      />

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
