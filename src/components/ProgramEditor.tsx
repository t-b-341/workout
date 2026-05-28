'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  useAllBodyweight,
  useAllBlockTemplates,
  useAllPhaseGoals,
  useActivePhaseGoal,
  useNutritionSummaryForDateRange,
  useRecentNutritionAverages,
  useTrainingChecklist,
  useAllReadiness,
  useAllSets,
  useLifts,
  usePrescriptions,
  usePrescriptionsByTemplate,
  useSessionsAfterReadiness,
  useTemplates,
} from '@/lib/hooks';
import { buildTenWeekBlock } from '@/lib/blockTemplate';
import { localDelete, localUpsert, flushDirty, pullAll } from '@/lib/sync';
import {
  SET_INTENTS,
  type Lift,
  type Prescription,
  type SessionLabelType,
  type SessionLog,
  type SessionTemplate,
  type SetIntent,
  type SetLog,
  type TemplateId,
  type PhaseGoal,
  type BlockTemplate,
  type TrainingPhaseMode,
  type NutritionPhaseMode,
  type TrainingChecklistItem,
  type NamedMesocycle,
} from '@/lib/types';
import {
  deleteNamedMesocycle,
  newMesocycleId,
  saveNamedMesocycle,
  useNamedMesocycles,
} from '@/lib/namedMesocycles';
import { createClient } from '@/lib/supabase/client';
import { getDb } from '@/lib/db';
import { defaultTemplateForLocalDate, sortTemplatesProgramOrder } from '@/lib/seed';
import {
  readTodayPlanPreference,
  todayPlanPreferenceIsForToday,
} from '@/lib/todayPlanPreference';
import { buildFullLocalExport } from '@/lib/exportLocalDump';
import { ensureMay20HistoricDeadliftSession } from '@/lib/historicSession';
import { fmtDate, todayIso } from '@/lib/time';
import { HistoricSessionSheet } from './HistoricSessionSheet';
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
import { SyncDiagnostics } from './SyncDiagnostics';
import {
  mesocyclePosition,
  useMesoConfig,
  type MesocycleConfig,
  type MesocyclePosition,
} from '@/lib/mesocycle';
import {
  deriveProgramTargetText,
  loadProgramTargetsStored,
  saveProgramTargetsStored,
  type ProgramTargetMetric,
  type ProgramTargetStored,
  type ProgramTargetUnit,
  PROGRAM_TARGET_METRICS,
  PROGRAM_TARGET_UNITS,
} from '@/lib/programExportTargets';
import { MesoBoundaryPromptCard } from './MesoBoundaryPromptCard';
import { LooseDecimalField, LooseIntField } from './WeightStepper';
import { PageShell } from './PageShell';
import { ScheduleWorkoutSheet } from './ScheduleWorkoutSheet';
import { sortLiftsWithFavoritesFirst, toggleFavoriteLift, useFavoriteLiftIds } from '@/lib/favoriteLifts';

type ExportWizardStep = 1 | 2 | 3;

type SessionReviewRow = {
  sessionId: string;
  date: string;
  templateId: string;
  templateName: string;
  durationMin: number | null;
  completionPct: number | null;
  currentType: SessionLabelType;
  suggestedType: SessionLabelType | null;
  selectedType: SessionLabelType;
};

type SetIntentReviewRow = {
  setId: string;
  sessionId: string;
  date: string;
  liftId: string;
  liftName: string;
  setIndex: number;
  reps: number;
  weight: number;
  currentIntent: SetIntent;
  suggestedIntent: SetIntent;
  selectedIntent: SetIntent;
};

const SESSION_TYPE_OPTIONS: SessionLabelType[] = ['standard', 'accumulation', 'deload', 'pr_test', 'abbreviated'];

function guidedExportIntentButtonLabel(opt: SetIntent): string {
  return opt === 'skipped' ? 'Skipped' : opt;
}

export function ProgramEditor() {
  const templates = useTemplates();
  const lifts = useLifts();
  const defaultTemplateId = useMemo(
    () => (templates?.length ? defaultTemplateForLocalDate(templates).id : 'U1'),
    [templates],
  );
  const persistedTodayTemplateId = useMemo((): TemplateId | null => {
    const p = readTodayPlanPreference();
    if (!todayPlanPreferenceIsForToday(p) || p.templateId === 'QUICK') return null;
    return templates?.some((t) => t.id === p.templateId) ? p.templateId : null;
  }, [templates]);
  const effectiveProgramTemplateId = persistedTodayTemplateId ?? defaultTemplateId;
  const [templateOverride, setTemplateOverride] = useState<TemplateId | null>(null);
  const activeId = templateOverride ?? effectiveProgramTemplateId;
  const prescriptions = usePrescriptions(activeId);
  const favoriteLiftIds = useFavoriteLiftIds();
  const favoriteLiftIdSet = useMemo(() => new Set(favoriteLiftIds), [favoriteLiftIds]);
  const mesoCfg = useMesoConfig();
  const [exportMesoStart, setExportMesoStart] = useState('');
  const [exportMesoEnd, setExportMesoEnd] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportingClaude, setExportingClaude] = useState<'idle' | 'md' | 'txt' | 'upMd' | 'upTxt'>('idle');
  const [exportWizardOpen, setExportWizardOpen] = useState(false);
  const [exportWizardStep, setExportWizardStep] = useState<ExportWizardStep>(1);
  const [sessionReviewRows, setSessionReviewRows] = useState<SessionReviewRow[]>([]);
  const [setIntentReviewRows, setSetIntentReviewRows] = useState<SetIntentReviewRow[]>([]);
  const phaseGoals = useAllPhaseGoals();
  const activePhase = useActivePhaseGoal();
  const todayStr = todayIso();

  const phaseProgress = activePhase
    ? (() => {
        const start = new Date(activePhase.startDate).getTime();
        const end = new Date(activePhase.endDate).getTime();
        const now = new Date(todayStr).getTime();
        const totalDays = Math.round((end - start) / 86400000) + 1;
        const elapsed = Math.round((now - start) / 86400000) + 1;
        const remaining = Math.max(0, totalDays - elapsed);
        const pct = Math.min(100, Math.round((elapsed / totalDays) * 100));
        const weekNum = Math.ceil(elapsed / 7);
        const totalWeeks = Math.ceil(totalDays / 7);
        return { elapsed, remaining, pct, weekNum, totalWeeks };
      })()
    : null;

  useAllBlockTemplates();
  const [showExport, setShowExport] = useState(false);
  const [showHistoric, setShowHistoric] = useState(false);
  const [showPhasePanel, setShowPhasePanel] = useState(false);

  useEffect(() => {
    void ensureMay20HistoricDeadliftSession().catch(() => {});
  }, []);
  const [showNewBlock, setShowNewBlock] = useState(false);
  const [editingPhase, setEditingPhase] =
    useState<PhaseGoal | null>(null);

  const templatesProgramOrder = useMemo(
    () =>
      templates?.length
        ? sortTemplatesProgramOrder(templates.filter((t) => t.id !== 'QUICK'))
        : [],
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

  function isoToday(): string {
    return new Date().toISOString().slice(0, 10);
  }

  function inWindow(date: string, start: string, end: string): boolean {
    return date >= start && date <= end;
  }

  function defaultSessionType(s: SessionLog): SessionLabelType {
    return s.sessionType ?? 'standard';
  }

  function defaultIntent(st: SetLog): SetIntent {
    return st.intent ?? 'working';
  }

  async function openExportWizard(nextStep: ExportWizardStep = 1) {
    const db = getDb();
    const [sessionsAll, setsAll, templatesAll, prescriptionsAll, liftsAll] = await Promise.all([
      db.session_logs.toArray(),
      db.set_logs.toArray(),
      db.templates.toArray(),
      db.prescriptions.toArray(),
      db.lifts.toArray(),
    ]);
    const sortedDates = [...new Set(sessionsAll.map((s) => s.date))].sort();
    const start = exportMesoStart.trim() || sortedDates[0] || isoToday();
    const end = exportMesoEnd.trim() || isoToday();
    setExportMesoStart(start);
    setExportMesoEnd(end);

    const templatesById = new Map(templatesAll.map((t) => [t.id, t]));
    const liftsById = new Map(liftsAll.map((l) => [l.id, l]));
    const setsBySession = new Map<string, SetLog[]>();
    for (const st of setsAll) {
      const arr = setsBySession.get(st.sessionLogId) ?? [];
      arr.push(st);
      setsBySession.set(st.sessionLogId, arr);
    }
    const maxByLift = new Map<string, number>();
    for (const st of setsAll) {
      const cur = maxByLift.get(st.liftId) ?? 0;
      if (st.weight > cur) maxByLift.set(st.liftId, st.weight);
    }

    const sessionsWin = sessionsAll.filter((s) => inWindow(s.date, start, end));
    const durationList = sessionsWin
      .map((s) => {
        if (!s.startedAt || !s.completedAt) return null;
        const ms = Date.parse(s.completedAt) - Date.parse(s.startedAt);
        return Number.isFinite(ms) && ms > 0 ? ms / 60000 : null;
      })
      .filter((x): x is number => x != null);
    const avgDuration = durationList.length ? durationList.reduce((a, b) => a + b, 0) / durationList.length : 0;

    const sessionRows: SessionReviewRow[] = sessionsWin.map((s) => {
      const sets = setsBySession.get(s.id) ?? [];
      const completed = sets.filter((st) => st.status === 'completed').length;
      const programmed = prescriptionsAll
        .filter((p) => p.templateId === s.templateId)
        .reduce((sum, p) => sum + p.sets, 0);
      const completionPct = programmed > 0 ? (completed / programmed) * 100 : null;
      const durationMin =
        s.startedAt && s.completedAt
          ? Math.max(0, Math.round((Date.parse(s.completedAt) - Date.parse(s.startedAt)) / 60000))
          : null;

      let suggestedType: SessionLabelType | null = null;
      const singlesNearMax = sets.filter((st) => st.reps === 1 && st.weight >= (maxByLift.get(st.liftId) ?? 0) * 0.9).length;
      if (singlesNearMax >= 3) suggestedType = 'pr_test';
      if (suggestedType == null) {
        const shortSession = durationMin != null && avgDuration > 0 && durationMin < avgDuration * 0.6;
        const lowCompletion = completionPct != null && completionPct < 70;
        if (shortSession || lowCompletion) suggestedType = 'abbreviated';
      }
      if (suggestedType == null) {
        const byLift = new Map<string, number[]>();
        for (const st of sets) {
          if (defaultIntent(st) !== 'working' || st.status !== 'completed') continue;
          const list = byLift.get(st.liftId) ?? [];
          list.push(st.weight);
          byLift.set(st.liftId, list);
        }
        let deloadHits = 0;
        for (const [liftId, ws] of byLift) {
          const liftWindow = setsAll
            .filter((x) => x.liftId === liftId)
            .filter((x) => {
              const sess = sessionsAll.find((ss) => ss.id === x.sessionLogId);
              return sess ? inWindow(sess.date, start, end) : false;
            })
            .filter((x) => defaultIntent(x) === 'working' && x.status === 'completed')
            .map((x) => x.weight);
          if (!liftWindow.length || !ws.length) continue;
          const rolling = liftWindow.reduce((a, b) => a + b, 0) / liftWindow.length;
          const sessionAvg = ws.reduce((a, b) => a + b, 0) / ws.length;
          if (sessionAvg <= rolling * 0.85) deloadHits += 1;
        }
        if (deloadHits > 0) suggestedType = 'deload';
      }

      const currentType = defaultSessionType(s);
      return {
        sessionId: s.id,
        date: s.date,
        templateId: s.templateId,
        templateName: templatesById.get(s.templateId)?.name ?? s.templateId,
        durationMin,
        completionPct,
        currentType,
        suggestedType,
        selectedType: suggestedType ?? currentType,
      };
    }).sort((a, b) => (a.date < b.date ? -1 : 1));

    const maxInWindowByLift = new Map<string, number>();
    const sessionIdsWin = new Set(sessionsWin.map((s) => s.id));
    for (const st of setsAll.filter((x) => sessionIdsWin.has(x.sessionLogId))) {
      const cur = maxInWindowByLift.get(st.liftId) ?? 0;
      if (st.weight > cur) maxInWindowByLift.set(st.liftId, st.weight);
    }
    const intentRows: SetIntentReviewRow[] = [];
    for (const s of sessionsWin) {
      const sets = [...(setsBySession.get(s.id) ?? [])].sort((a, b) => a.setIndex - b.setIndex);
      const byLift = new Map<string, SetLog[]>();
      for (const st of sets) {
        const arr = byLift.get(st.liftId) ?? [];
        arr.push(st);
        byLift.set(st.liftId, arr);
      }
      for (const [liftId, liftSets] of byLift) {
        const workingAvg =
          liftSets
            .filter((st) => defaultIntent(st) === 'working' && st.status === 'completed')
            .map((st) => st.weight)
            .reduce((a, b, _, arr) => a + b / (arr.length || 1), 0) || null;
        for (let i = 0; i < liftSets.length; i++) {
          const st = liftSets[i]!;
          const curIntent = defaultIntent(st);
          if (curIntent !== 'working') continue;
          let suggested: SetIntent | null = null;
          if (st.reps === 1 && st.weight >= (maxInWindowByLift.get(liftId) ?? 0) * 0.9) suggested = 'max_test';
          if (!suggested && workingAvg != null) {
            const clearlySub = i <= 1 && st.weight <= workingAvg * 0.5;
            if (clearlySub) suggested = 'warmup';
          }
          if (!suggested) {
            const priorHeavier = liftSets.slice(0, i).some((prev) => prev.weight >= st.weight / 0.9);
            if (priorHeavier) suggested = 'backoff';
          }
          if (!suggested) continue;
          intentRows.push({
            setId: st.id,
            sessionId: s.id,
            date: s.date,
            liftId,
            liftName: liftsById.get(liftId)?.name ?? liftId,
            setIndex: st.setIndex,
            reps: st.reps,
            weight: st.weight,
            currentIntent: curIntent,
            suggestedIntent: suggested,
            selectedIntent: suggested,
          });
        }
      }
    }

    setSessionReviewRows(sessionRows);
    setSetIntentReviewRows(intentRows.sort((a, b) => (a.date === b.date ? a.setIndex - b.setIndex : a.date < b.date ? -1 : 1)));
    setExportWizardStep(nextStep);
    setExportWizardOpen(true);
  }

  async function exportAll() {
    setExporting(true);
    try {
      const sessionTypeOverrides = Object.fromEntries(
        sessionReviewRows
          .filter((r) => r.selectedType !== r.currentType)
          .map((r) => [r.sessionId, r.selectedType]),
      );
      const setIntentOverrides = Object.fromEntries(
        setIntentReviewRows
          .filter((r) => r.selectedIntent !== r.currentIntent)
          .map((r) => [r.setId, r.selectedIntent]),
      );
      const dump = await buildFullLocalExport({
        mesoStartDate: exportMesoStart.trim() || undefined,
        mesoEndDate: exportMesoEnd.trim() || undefined,
        sessionTypeOverrides,
        setIntentOverrides,
      });
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workout-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportWizardOpen(false);
    } catch (err) {
      console.error('Export failed:', err);
      alert(
        'Export failed: '
        + (err instanceof Error ? err.message : String(err)),
      );
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
          <Link
            href="/program/meso-analysis"
            className="h-10 px-3 rounded-lg bg-zinc-800 text-sm inline-flex items-center"
          >
            Meso analysis
          </Link>
        </div>
      </div>
      <SyncDiagnostics />
      {exportWizardOpen && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-0 sm:p-4">
          <button
            type="button"
            aria-label="Close export wizard"
            className="absolute inset-0 bg-black/70"
            onClick={() => setExportWizardOpen(false)}
          />
          <div className="relative w-full max-w-4xl rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[90dvh] flex flex-col">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <div className="text-xs uppercase tracking-wider text-zinc-500">Guided export</div>
                <h2 className="text-lg font-semibold">Step {exportWizardStep} of 3</h2>
              </div>
              <button type="button" className="h-9 px-3 rounded-lg bg-zinc-800 text-sm" onClick={() => setExportWizardOpen(false)}>
                Close
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-4">
              {exportWizardStep === 1 && (
                <div className="space-y-3">
                  <div className="text-sm text-zinc-300">Confirm mesocycle window for this export.</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-xs text-zinc-500">Meso start
                      <input
                        type="date"
                        value={exportMesoStart}
                        onChange={(e) => setExportMesoStart(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-sm text-zinc-200"
                      />
                    </label>
                    <label className="text-xs text-zinc-500">Meso end
                      <input
                        type="date"
                        value={exportMesoEnd}
                        onChange={(e) => setExportMesoEnd(e.target.value)}
                        className="mt-1 h-10 w-full rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-sm text-zinc-200"
                      />
                    </label>
                  </div>
                  <p className="text-xs text-zinc-500">These values populate `summary.mesoStartDate` / `summary.mesoEndDate`.</p>
                </div>
              )}
              {exportWizardStep === 2 && (
                <div className="space-y-3">
                  <div className="text-sm text-zinc-300">Review session types in the selected window.</div>
                  <div className="space-y-2">
                    {sessionReviewRows.map((r) => (
                      <div key={r.sessionId} className={`rounded-lg border p-2 ${r.suggestedType && r.suggestedType !== r.currentType ? 'border-amber-500/50 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="text-zinc-300">
                            {fmtDate(r.date)} · {r.templateId} · {r.templateName}
                            {r.durationMin != null ? ` · ${r.durationMin}m` : ''}
                            {r.completionPct != null ? ` · ${r.completionPct.toFixed(0)}% completion` : ''}
                          </div>
                          {r.suggestedType && <span className="text-amber-300">Suggested: {r.suggestedType}</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {SESSION_TYPE_OPTIONS.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => setSessionReviewRows((prev) => prev.map((x) => x.sessionId === r.sessionId ? { ...x, selectedType: opt } : x))}
                              className={`h-8 px-2 rounded-md text-xs ${r.selectedType === opt ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300'}`}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {exportWizardStep === 3 && (
                <div className="space-y-3">
                  <div className="text-sm text-zinc-300">Review likely misclassified set intents.</div>
                  {[...new Set(setIntentReviewRows.map((r) => r.sessionId))].map((sid) => {
                    const rows = setIntentReviewRows.filter((r) => r.sessionId === sid);
                    const d = rows[0]?.date ?? '';
                    return (
                      <div key={sid} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-sm font-medium">{fmtDate(d)}</div>
                          <button
                            type="button"
                            className="h-8 px-2 rounded-md bg-zinc-800 text-xs"
                            onClick={() => setSetIntentReviewRows((prev) => prev.map((x) => x.sessionId === sid ? { ...x, selectedIntent: x.suggestedIntent } : x))}
                          >
                            Mark all as suggested
                          </button>
                        </div>
                        {rows.map((r) => (
                          <div key={r.setId} className="rounded-md border border-zinc-800 p-2 text-xs">
                            <div className="text-zinc-300">{r.liftName} · set #{r.setIndex + 1} · {r.weight} x {r.reps}</div>
                            <div className="text-zinc-500">Current: {r.currentIntent} · Suggested: {r.suggestedIntent}</div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {SET_INTENTS.map((opt) => (
                                <button
                                  key={opt}
                                  type="button"
                                  onClick={() => setSetIntentReviewRows((prev) => prev.map((x) => x.setId === r.setId ? { ...x, selectedIntent: opt } : x))}
                                  className={`h-7 px-2 rounded-md ${r.selectedIntent === opt ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300'}`}
                                >
                                  {guidedExportIntentButtonLabel(opt)}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {setIntentReviewRows.length === 0 && <div className="text-sm text-zinc-500">No likely misclassified working sets found in this window.</div>}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-zinc-800 flex items-center justify-between gap-2">
              <button
                type="button"
                disabled={exportWizardStep === 1}
                onClick={() => setExportWizardStep((s) => (s === 1 ? 1 : s === 2 ? 1 : 2))}
                className="h-10 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-40"
              >
                Back
              </button>
              {exportWizardStep < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (exportWizardStep === 1) {
                      void openExportWizard(2);
                      return;
                    }
                    setExportWizardStep(3);
                  }}
                  className="h-10 px-3 rounded-lg bg-amber-500 text-zinc-950 text-sm font-medium"
                >
                  {exportWizardStep === 2 ? 'Looks good → Step 3' : 'Continue'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void exportAll()}
                  disabled={exporting}
                  className="h-10 px-3 rounded-lg bg-emerald-600 text-zinc-950 text-sm font-medium disabled:opacity-50"
                >
                  {exporting ? 'Exporting…' : 'Generate export'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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

      <div>
        <div className="text-xs uppercase tracking-wide
          text-zinc-500 mb-2">Training checklist</div>
        <TrainingChecklist />
        <button
          type="button"
          onClick={() => setShowHistoric(true)}
          className="mt-2 text-xs text-zinc-500 hover:text-amber-400"
        >
          + Add past session
        </button>
      </div>

      {showHistoric && (
        <HistoricSessionSheet onClose={() => setShowHistoric(false)} />
      )}

      <div
        className="rounded-2xl border border-zinc-800
          bg-zinc-900 px-4 py-3 flex items-center
          justify-between cursor-pointer"
        onClick={() => setShowPhasePanel(p => !p)}
      >
        <div className="space-y-0.5">
          <div className="text-xs uppercase tracking-wide
            text-zinc-500 font-medium">Current phase</div>
          {activePhase ? (
            <>
              <div className="text-sm font-medium text-zinc-200">
                {activePhase.label}
              </div>
              <div className="flex gap-3 text-xs text-zinc-500">
                <span className={
                  activePhase.trainingMode === 'accumulation'
                    ? 'text-amber-400'
                    : activePhase.trainingMode === 'deload'
                      ? 'text-sky-400'
                      : 'text-zinc-400'
                }>
                  {activePhase.trainingMode.charAt(0).toUpperCase()
                    + activePhase.trainingMode.slice(1)}
                </span>
                <span>·</span>
                <span className={
                  activePhase.nutritionMode === 'deficit'
                    ? 'text-rose-400'
                    : activePhase.nutritionMode === 'surplus'
                      ? 'text-emerald-400'
                      : 'text-zinc-400'
                }>
                  {activePhase.nutritionMode.charAt(0).toUpperCase()
                    + activePhase.nutritionMode.slice(1)}
                </span>
                {activePhase.caloriesTraining && (
                  <>
                    <span>·</span>
                    <span>
                      {activePhase.caloriesTraining} kcal
                      training
                    </span>
                  </>
                )}
              </div>
              {phaseProgress && (
                <div className="space-y-1 mt-1">
                  <div className="flex justify-between text-[10px]
                    text-zinc-600">
                    <span>
                      Week {phaseProgress.weekNum} of {phaseProgress.totalWeeks}
                    </span>
                    <span>{phaseProgress.remaining} days remaining</span>
                  </div>
                  <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        activePhase.trainingMode === 'deload'
                          ? 'bg-sky-500'
                          : activePhase.nutritionMode === 'deficit'
                            ? 'bg-rose-500'
                            : 'bg-amber-500'
                      }`}
                      style={{ width: `${phaseProgress.pct}%` }}
                    />
                  </div>
                </div>
              )}
              {activePhase.trainingMode === 'deload' &&
                activePhase.nutritionMode === 'deficit' && (
                <div className="text-[10px] text-amber-500/80
                  mt-0.5">
                  ⚠ Deload in deficit — prioritize sleep
                  and protein
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-zinc-500">
              No active phase — tap to configure
            </div>
          )}
        </div>
        <span className="text-zinc-600 text-lg">
          {showPhasePanel ? '▲' : '▼'}
        </span>
      </div>

      {showPhasePanel && (
        <div className="space-y-3 px-1">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowNewBlock(true)}
              className="flex-1 h-10 rounded-xl border border-dashed
                border-zinc-700 text-xs text-zinc-400
                hover:text-zinc-200 hover:border-zinc-500
                transition-colors"
            >
              + 10-week block
            </button>
            <button
              type="button"
              onClick={() => {
                const today = todayIso();
                const fourWeeksOut = (() => {
                  const d = new Date(today);
                  d.setDate(d.getDate() + 6);
                  return d.toISOString().slice(0, 10);
                })();
                setEditingPhase({
                  id: `phase-${Date.now()}`,
                  label: '',
                  trainingMode: 'accumulation',
                  nutritionMode: 'deficit',
                  startDate: today,
                  endDate: fourWeeksOut,
                  caloriesTraining: null,
                  caloriesRest: null,
                  proteinG: null,
                  notes: '',
                  active: false,
                  updatedAt: new Date().toISOString(),
                });
              }}
              className="flex-1 h-10 rounded-xl border border-dashed
                border-zinc-700 text-xs text-zinc-400
                hover:text-zinc-200 hover:border-zinc-500
                transition-colors"
            >
              + Custom phase
            </button>
          </div>

          {(phaseGoals ?? []).map(phase => (
            <PhaseGoalCard
              key={phase.id}
              phase={phase}
              onDelete={async () => {
                await localDelete('phase_goals', phase.id);
              }}
              onEdit={() => setEditingPhase(phase)}
            />
          ))}

          {(!phaseGoals || phaseGoals.length === 0) && (
            <p className="text-xs text-zinc-600 text-center py-4">
              No phases configured. Generate a 10-week block
              or add phases manually.
            </p>
          )}
        </div>
      )}

      {showNewBlock && (
        <NewBlockSheet
          onClose={() => setShowNewBlock(false)}
          onSave={async (block) => {
            await localUpsert('block_templates', block);
            for (const phase of block.phases) {
              await localUpsert('phase_goals', phase);
            }
            setShowNewBlock(false);
          }}
        />
      )}

      {editingPhase && (
        <PhaseEditSheet
          phase={editingPhase}
          onClose={() => setEditingPhase(null)}
          onSave={async (updated) => {
            await localUpsert('phase_goals', updated);
            setEditingPhase(null);
          }}
        />
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

      <div className="rounded-2xl border border-zinc-800
        bg-zinc-900 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowExport(s => !s)}
          className="w-full flex items-center justify-between
            px-4 py-3 text-left"
        >
          <div>
            <div className="text-xs uppercase tracking-wide
              text-zinc-500">Data export</div>
            <div className="text-sm font-medium text-zinc-300">
              JSON export
            </div>
          </div>
          <span className="text-zinc-600">
            {showExport ? '▲' : '▼'}
          </span>
        </button>
        {showExport && (
          <div className="border-t border-zinc-800 p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void openExportWizard()}
                disabled={exporting || exportingClaude !== 'idle'}
                className="h-10 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
              >
                {exporting ? 'Exporting…' : 'Full JSON (guided)'}
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
                onClick={() => exportClaudeUpcomingWeek('md')}
                disabled={exportingClaude !== 'idle' || exporting}
                className="h-10 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
              >
                {exportingClaude === 'upMd' ? 'Exporting…' : 'Upcoming week · .md'}
              </button>
              <button
                type="button"
                onClick={() => exportClaudeUpcomingWeek('txt')}
                disabled={exportingClaude !== 'idle' || exporting}
                className="h-10 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
              >
                {exportingClaude === 'upTxt' ? 'Exporting…' : 'Upcoming week · .txt'}
              </button>
            </div>
            <ProgramTargetsEditor lifts={lifts} />
          </div>
        )}
      </div>
      <MesoBoundaryPromptCard />
      <NamedMesocyclesSection />
      <MesocycleLegacyInsightsPanel />
    </PageShell>
  );
}

function TrainingChecklist() {
  const items = useTrainingChecklist();
  const [newText, setNewText] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');
  const active = (items ?? []).filter(i => !i.completed);
  const done = (items ?? []).filter(i => i.completed);

  async function addItem() {
    if (!newText.trim()) return;
    const now = new Date().toISOString();
    await localUpsert('training_checklist', {
      id: `tc-${Date.now()}`,
      createdAt: now,
      text: newText.trim(),
      completed: false,
      completedAt: null,
      comments: [],
      updatedAt: now,
    });
    setNewText('');
  }

  async function toggleComplete(item: TrainingChecklistItem) {
    const now = new Date().toISOString();
    await localUpsert('training_checklist', {
      ...item,
      completed: !item.completed,
      completedAt: !item.completed ? now : null,
      updatedAt: now,
    });
  }

  async function addComment(item: TrainingChecklistItem) {
    if (!commentText.trim()) return;
    const now = new Date().toISOString();
    await localUpsert('training_checklist', {
      ...item,
      comments: [
        ...item.comments,
        {
          id: `c-${Date.now()}`,
          text: commentText.trim(),
          createdAt: now,
        },
      ],
      updatedAt: now,
    });
    setCommentText('');
  }

  async function deleteItem(item: TrainingChecklistItem) {
    await localDelete('training_checklist', item.id);
  }

  function renderItem(item: TrainingChecklistItem) {
    const isExpanded = expandedId === item.id;
    return (
      <div key={item.id}
        className={`rounded-xl border p-3 space-y-2 ${
          item.completed
            ? 'border-zinc-800/50 bg-zinc-900/30'
            : 'border-zinc-800 bg-zinc-900/50'
        }`}>
        <div className="flex items-start gap-2">
          <button type="button"
            onClick={() => void toggleComplete(item)}
            className={`shrink-0 h-5 w-5 rounded border
              flex items-center justify-center mt-0.5 ${
              item.completed
                ? 'bg-emerald-700 border-emerald-600'
                : 'border-zinc-600'
            }`}>
            {item.completed && (
              <span className="text-[10px] text-white">✓</span>
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className={`text-sm whitespace-pre-wrap ${
              item.completed
                ? 'line-through text-zinc-600'
                : 'text-zinc-200'
            }`}>
              {item.text}
            </div>
            {item.completedAt && (
              <div className="text-[10px] text-zinc-600 mt-0.5">
                Done {new Date(item.completedAt)
                  .toLocaleDateString()}
              </div>
            )}
            {item.comments.length > 0 && (
              <div className="mt-1 space-y-1">
                {item.comments.map(c => (
                  <div key={c.id}
                    className="text-xs text-zinc-500 whitespace-pre-wrap
                      border-l-2 border-zinc-700 pl-2">
                    {c.text}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            <button type="button"
              onClick={() => setExpandedId(
                isExpanded ? null : item.id,
              )}
              className="text-[10px] px-2 h-6 rounded-md
                bg-zinc-800 border border-zinc-700
                text-zinc-500 hover:text-amber-400">
              Comment
            </button>
            <button type="button"
              onClick={() => void deleteItem(item)}
              className="h-6 w-6 rounded-full bg-zinc-800
                border border-zinc-700 text-zinc-600
                hover:text-rose-400 text-xs flex items-center
                justify-center">
              ×
            </button>
          </div>
        </div>
        {isExpanded && (
          <div className="flex gap-2 pl-7">
            <input
              type="text"
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void addComment(item);
              }}
              placeholder='e.g. "375 — had more in tank"'
              className="flex-1 h-8 rounded-lg bg-zinc-800
                border border-zinc-700 px-2.5 text-xs
                text-zinc-200 placeholder:text-zinc-600"
            />
            <button type="button"
              onClick={() => void addComment(item)}
              className="h-8 px-3 rounded-lg bg-amber-600
                text-zinc-950 text-xs font-medium">
              Add
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <textarea
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => {
            if (
              e.key === 'Enter'
              && !e.shiftKey
              && !e.ctrlKey
              && !e.metaKey
              && !e.altKey
            ) {
              e.preventDefault();
              void addItem();
            }
          }}
          placeholder="Add a training goal or note..."
          rows={3}
          className="flex-1 py-2 rounded-xl bg-zinc-900
            border border-zinc-700 px-3 text-sm
            text-zinc-200 placeholder:text-zinc-600 resize-none"
        />
        <button type="button" onClick={() => void addItem()}
          className="h-10 px-4 rounded-xl bg-amber-600
            text-zinc-950 text-sm font-medium
            hover:bg-amber-500">
          Add
        </button>
      </div>

      {active.map(renderItem)}

      {done.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wide
            text-zinc-700 pt-1">Completed</div>
          {done.slice(0, 5).map(renderItem)}
        </>
      )}
    </div>
  );
}

function ProgramTargetsEditor({ lifts }: { lifts: Pick<Lift, 'id' | 'name'>[] }) {
  const stored = useLiveQuery(() => loadProgramTargetsStored());
  const storedToken = useMemo(
    () => (stored === undefined ? '__loading__' : JSON.stringify(stored)),
    [stored],
  );
  const [storedTokenSeen, setStoredTokenSeen] = useState(storedToken);
  const [draft, setDraft] = useState<ProgramTargetStored[] | null>(null);
  const [dirty, setDirty] = useState(false);

  if (storedToken !== storedTokenSeen) {
    setStoredTokenSeen(storedToken);
    if (!dirty && stored !== undefined) {
      setDraft(stored.map((x) => ({ ...x })));
    }
  }

  function emptyPt(id: string): ProgramTargetStored {
    return {
      id,
      label: 'New',
      metric: '1rm',
      targetValue: null,
      targetReps: null,
      targetSets: null,
      currentValue: null,
      unit: 'lb',
      liftId: null,
    };
  }

  async function saveAll() {
    if (!draft) return;
    await saveProgramTargetsStored(draft);
    setDirty(false);
  }

  function revert() {
    if (stored) {
      setDraft(stored.map((x) => ({ ...x })));
      setDirty(false);
    }
  }

  function patchRow(i: number, patch: Partial<ProgramTargetStored>) {
    setDirty(true);
    setDraft((prev) => {
      const base = prev ?? [...(stored ?? [])];
      const next = [...base];
      if (!next[i]) return base;
      next[i] = { ...next[i]!, ...patch };
      return next;
    });
  }

  const rows = draft ?? stored;
  const loadingRows = rows === undefined;

  if (loadingRows) {
    return (
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 text-sm text-zinc-500">
        Loading export targets…
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="font-medium">Full JSON export — program targets</div>
      <p className="text-xs text-zinc-500">
        These rows become <span className="font-mono text-zinc-400">summary.programTargets</span> with numeric
        fields for analysis; the text line is generated automatically.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            const id = `pt-${Date.now().toString(36)}`;
            setDirty(true);
            setDraft((prev) => [...(prev ?? [...(stored ?? [])]), emptyPt(id)]);
          }}
          className="h-9 px-3 rounded-lg bg-zinc-800 text-sm"
        >
          Add target
        </button>
        <button type="button" onClick={revert} className="h-9 px-3 rounded-lg bg-zinc-800 text-sm" disabled={!dirty}>
          Reset
        </button>
        <button
          type="button"
          onClick={() => void saveAll()}
          disabled={!dirty || !draft}
          className="h-9 px-3 rounded-lg bg-amber-500 text-zinc-950 text-sm font-medium disabled:opacity-40"
        >
          Save
        </button>
      </div>
      <div className="space-y-3 max-h-[min(70dvh,560px)] overflow-y-auto pr-1">
        {rows.map((row, i) => (
          <div key={row.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
            <div className="flex justify-between gap-2">
              <span className="text-xs font-mono text-zinc-500 truncate">{row.id}</span>
              <button
                type="button"
                className="text-xs text-rose-400 shrink-0"
                onClick={() => {
                  setDirty(true);
                  setDraft((prev) => {
                    const base = prev ?? [...(stored ?? [])];
                    return base.filter((_, j) => j !== i);
                  });
                }}
              >
                Remove
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <label className="text-[11px] text-zinc-500">
                Label
                <input
                  value={row.label}
                  onChange={(e) => patchRow(i, { label: e.target.value })}
                  className="mt-0.5 block w-full h-8 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-xs"
                />
              </label>
              <label className="text-[11px] text-zinc-500">
                Metric
                <select
                  value={row.metric}
                  onChange={(e) => patchRow(i, { metric: e.target.value as ProgramTargetMetric })}
                  className="mt-0.5 block w-full h-8 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-xs"
                >
                  {PROGRAM_TARGET_METRICS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-zinc-500">
                Unit
                <select
                  value={row.unit}
                  onChange={(e) => patchRow(i, { unit: e.target.value as ProgramTargetUnit })}
                  className="mt-0.5 block w-full h-8 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-xs"
                >
                  {PROGRAM_TARGET_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </label>
              {(['targetValue', 'targetReps', 'targetSets', 'currentValue'] as const).map((k) => (
                <label key={k} className="text-[11px] text-zinc-500">
                  {k}
                  <input
                    value={row[k] ?? ''}
                    onChange={(e) => {
                      const s = e.target.value;
                      if (s.trim() === '') {
                        patchRow(i, { [k]: null });
                        return;
                      }
                      const n = Number(s);
                      patchRow(i, { [k]: Number.isFinite(n) ? n : null });
                    }}
                    inputMode="decimal"
                    className="mt-0.5 block w-full h-8 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-xs font-mono"
                  />
                </label>
              ))}
              <label className="text-[11px] text-zinc-500 sm:col-span-2">
                liftId (
                <span className="font-mono">lifts[]</span>, optional)
                <select
                  value={row.liftId ?? ''}
                  onChange={(e) => patchRow(i, { liftId: e.target.value.trim() ? e.target.value : null })}
                  aria-label="Linked lift id"
                  className="mt-0.5 block w-full h-8 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-xs"
                >
                  <option value="">— none —</option>
                  {lifts.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="text-[11px] text-zinc-500 border-t border-zinc-800 pt-2 italic">
              <span className="text-zinc-600 not-italic uppercase tracking-wide text-[10px]">Derived text · </span>
              {deriveProgramTargetText(row)}
            </div>
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
  status: 'completed' | 'today' | 'upcoming' | 'missed' | 'partial' | 'skipped';
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

  const schedulableTemplates = useMemo(
    () => templates.filter((t) => t.id !== 'QUICK'),
    [templates],
  );

  const weeks = useMemo(
    () => buildSchedule(schedulableTemplates, sessions ?? [], sets ?? [], weeksToShow, meso),
    [schedulableTemplates, sessions, sets, weeksToShow, meso],
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
            Next {weeksToShow} weeks · {schedulableTemplates.length}-day split · tap a workout for an estimated preview (no hypothetical progression).
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
      setLogs={sets}
      sessions={sessions}
      onSelectTemplate={onSelectTemplate}
      onSkip={async (r) => {
        await skipPlannedSession(r.date, r.template.id);
      }}
      onRestore={async (r) => {
        await restorePlannedSession(r.date, r.template.id, sets ?? []);
      }}
    />
    </>
  );
}

/**
 * Soft-delete a planned session. Upserts `session_logs` with
 * `sessionStatus: 'skipped'` so the row stays around (which keeps any
 * `readiness_logs` it references intact — the FK from readiness → session
 * stays valid because we don't delete the parent). If no row existed yet,
 * a minimal one is created just to hold the skip marker so future devices
 * see the same schedule.
 */
async function skipPlannedSession(date: string, templateId: TemplateId): Promise<void> {
  const db = getDb();
  const id = `${date}-${templateId}`;
  const existing = await db.session_logs.get(id);
  const base: SessionLog = existing ?? {
    id,
    date,
    templateId,
    mode: 'standard',
    deload: false,
    watchFlags: [],
    sessionType: 'standard',
  };
  await localUpsert('session_logs', { ...base, sessionStatus: 'skipped' });
  await flushDirty().catch(() => {});
}

/**
 * Undo a skip. If the session row has no other activity (no readiness
 * check, no started/completed timestamp, no logged sets), the whole row
 * gets deleted so the schedule treats the day as fresh `upcoming` again.
 * Otherwise we clear `sessionStatus` with an explicit `null` — the
 * upsert codec drops `undefined` keys, so `null` is the wire-level
 * sentinel that actually clears the server column.
 *
 * Crucially we also consult Dexie directly for any `readiness_logs` rows
 * pointing at this session id, because `readiness_logs.session_log_id`
 * has `ON DELETE CASCADE` on Supabase — if we hard-deleted a session
 * with a readiness check, the server would wipe the readiness too.
 * The `existing.readinessCompletedAt` field is normally enough to
 * detect that, but a direct table query makes us robust to a partial
 * write where the readiness landed but the session's mirror field
 * didn't.
 */
async function restorePlannedSession(
  date: string,
  templateId: TemplateId,
  allSets: SetLog[],
): Promise<void> {
  const db = getDb();
  const id = `${date}-${templateId}`;
  const existing = await db.session_logs.get(id);
  if (!existing) return;
  const hasSets = allSets.some((s) => s.sessionLogId === id);
  const hasReadiness =
    (await db.readiness_logs.where('sessionLogId').equals(id).count()) > 0;
  const hasActivity =
    existing.startedAt != null ||
    existing.completedAt != null ||
    existing.readinessCompletedAt != null ||
    hasReadiness ||
    hasSets;
  if (hasActivity) {
    await localUpsert('session_logs', { ...existing, sessionStatus: null });
  } else {
    await localDelete('session_logs', id);
  }
  await flushDirty().catch(() => {});
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
    row.status === 'missed' ? 'bg-rose-950/20' :
    row.status === 'skipped' ? 'bg-zinc-950 opacity-60' : '';
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
    skipped:   { label: 'skipped',   className: 'bg-zinc-700 text-zinc-300' },
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

  const sortedTemplates = templates
    .filter((t) => t.id !== 'QUICK')
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
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
      if (session?.sessionStatus === 'skipped') {
        status = 'skipped';
      } else if (session?.completedAt) {
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

// ---------- Named mesocycles ----------

function mesocycleDurationWeeks(startDate: string, endDate: string): number {
  const a = new Date(`${startDate}T00:00:00`);
  const b = new Date(`${endDate}T00:00:00`);
  const days = Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
  return Math.max(1, Math.ceil(days / 7));
}

type MesocycleFormState = {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  notes: string;
};

function emptyMesocycleForm(today: string): MesocycleFormState {
  const end = (() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + 27);
    return d.toISOString().slice(0, 10);
  })();
  return {
    id: newMesocycleId(),
    label: '',
    startDate: today,
    endDate: end,
    notes: '',
  };
}

function NamedMesocyclesSection() {
  const mesocycles = useNamedMesocycles();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<MesocycleFormState | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () => (mesocycles ?? []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [mesocycles],
  );

  function openAdd() {
    setForm(emptyMesocycleForm(todayIso()));
    setFormOpen(true);
    setConfirmDeleteId(null);
  }

  function openEdit(m: NamedMesocycle) {
    setForm({
      id: m.id,
      label: m.label,
      startDate: m.startDate,
      endDate: m.endDate,
      notes: m.notes,
    });
    setFormOpen(true);
    setConfirmDeleteId(null);
  }

  function cancelForm() {
    setFormOpen(false);
    setForm(null);
  }

  async function saveForm() {
    if (!form || !form.label.trim() || !form.startDate || !form.endDate) return;
    if (form.startDate > form.endDate) return;
    setBusy(true);
    try {
      const { data: { user } } = await createClient().auth.getUser();
      await saveNamedMesocycle({
        id: form.id,
        userId: user?.id ?? '',
        label: form.label.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        notes: form.notes.trim(),
      });
      await flushDirty().catch(() => {});
      cancelForm();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(id: string) {
    setBusy(true);
    try {
      await deleteNamedMesocycle(id);
      await flushDirty().catch(() => {});
      setConfirmDeleteId(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <div>
          <div className="font-medium">Mesocycles</div>
          <div className="text-xs text-zinc-500">
            Named blocks with explicit date ranges — used for schedule deload hints and meso analysis.
          </div>
        </div>
        {!formOpen && (
          <button
            type="button"
            onClick={openAdd}
            className="h-8 px-3 rounded-lg bg-amber-500 text-zinc-950 text-xs font-medium"
          >
            Add mesocycle
          </button>
        )}
      </div>

      {mesocycles === undefined ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : sorted.length === 0 && !formOpen ? (
        <p className="text-xs text-zinc-600 text-center py-4">
          No mesocycles yet. Add one to define analysis windows and track blocks.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((m) => (
            <li
              key={m.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 flex flex-wrap items-start justify-between gap-2"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="font-medium text-zinc-100">{m.label}</div>
                <div className="text-xs text-zinc-500 font-mono">
                  {m.startDate} → {m.endDate}
                </div>
                <div className="text-[11px] text-zinc-600">
                  {mesocycleDurationWeeks(m.startDate, m.endDate)} weeks
                </div>
                {m.notes.trim() !== '' && (
                  <p className="text-xs text-zinc-400 mt-1 whitespace-pre-wrap">{m.notes}</p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Link
                  href="/program/meso-analysis"
                  className="text-xs text-amber-400 hover:text-amber-300"
                >
                  → Analyse
                </Link>
                {confirmDeleteId === m.id ? (
                  <>
                    <span className="text-xs text-zinc-500">Confirm delete?</span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void confirmDelete(m.id)}
                      className="h-8 px-2 rounded-lg bg-rose-900 text-rose-200 text-xs disabled:opacity-50"
                    >
                      Yes, delete
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDeleteId(null)}
                      className="h-8 px-2 rounded-lg bg-zinc-800 text-xs disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => openEdit(m)}
                      className="h-8 px-2 rounded-lg bg-zinc-800 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(m.id)}
                      className="h-8 px-2 rounded-lg border border-rose-900/60 text-rose-400 text-xs"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen && form && (
        <div className="border-t border-zinc-800 pt-3 space-y-3">
          <label className="block text-xs text-zinc-500">
            Label
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              placeholder="e.g. Spring accumulation"
              className="mt-1 block w-full h-10 px-3 rounded-lg bg-zinc-950 border border-zinc-800 text-sm"
            />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs text-zinc-500">
              Start
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="mt-1 block w-full h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm"
              />
            </label>
            <label className="block text-xs text-zinc-500">
              End
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="mt-1 block w-full h-10 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm"
              />
            </label>
          </div>
          <label className="block text-xs text-zinc-500">
            Notes (optional)
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="mt-1 block w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm resize-y min-h-[3rem]"
            />
          </label>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={cancelForm}
              disabled={busy}
              className="h-9 px-3 rounded-lg bg-zinc-800 text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void saveForm()}
              disabled={busy || !form.label.trim() || form.startDate > form.endDate}
              className="h-9 px-3 rounded-lg bg-amber-500 text-zinc-950 font-medium text-sm disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MesocycleLegacyInsightsPanel() {
  const cfg = useMesoConfig();
  const lifts = useLifts();
  const sessions = useSessionsAfterReadiness();
  const sets = useAllSets();
  const readiness = useAllReadiness();
  const bodyweightLogs = useAllBodyweight();
  const today = todayIso();

  if (!cfg) return null;
  const here = mesocyclePosition(today, cfg);

  return (
    <MesocycleInsightsSection
      cfg={cfg}
      position={here}
      sessions={sessions ?? []}
      sets={sets ?? []}
      readiness={readiness ?? []}
      lifts={lifts ?? []}
      bodyweightLogs={bodyweightLogs ?? []}
      today={today}
    />
  );
}

function PhaseEditSheet({
  phase,
  onClose,
  onSave,
}: {
  phase: PhaseGoal;
  onClose: () => void;
  onSave: (updated: PhaseGoal) => Promise<void>;
}) {
  const [label, setLabel] = useState(phase.label);
  const [trainingMode, setTrainingMode] =
    useState<TrainingPhaseMode>(phase.trainingMode);
  const [nutritionMode, setNutritionMode] =
    useState<NutritionPhaseMode>(phase.nutritionMode);
  const [startDate, setStartDate] = useState(phase.startDate);
  const [endDate, setEndDate] = useState(phase.endDate);
  const [caloriesTraining, setCaloriesTraining] =
    useState(String(phase.caloriesTraining ?? ''));
  const [caloriesRest, setCaloriesRest] =
    useState(String(phase.caloriesRest ?? ''));
  const [proteinG, setProteinG] =
    useState(String(phase.proteinG ?? ''));
  const [notes, setNotes] = useState(phase.notes ?? '');
  const [busy, setBusy] = useState(false);

  const isDeloadInDeficit =
    trainingMode === 'deload' && nutritionMode === 'deficit';

  const canSave = label.trim() && startDate && endDate
    && startDate <= endDate;

  async function handleSave() {
    if (!canSave) return;
    setBusy(true);
    await onSave({
      ...phase,
      label: label.trim(),
      trainingMode,
      nutritionMode,
      startDate,
      endDate,
      caloriesTraining: caloriesTraining
        ? Number(caloriesTraining) : null,
      caloriesRest: caloriesRest
        ? Number(caloriesRest) : null,
      proteinG: proteinG ? Number(proteinG) : null,
      notes,
    });
    setBusy(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end
      justify-center">
      <button type="button" aria-label="Close"
        className="absolute inset-0 bg-black/70"
        onClick={onClose} />
      <div className="relative w-full max-w-lg
        rounded-t-3xl border border-zinc-800 bg-zinc-950
        max-h-[90dvh] flex flex-col">

        <div className="p-4 border-b border-zinc-800
          shrink-0 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-100">
            Edit phase
          </h3>
          <button type="button" onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200
              text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5">

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">
              Phase name
            </label>
            <input
              type="text"
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Weeks 1–4 Accumulation"
              className="w-full h-10 rounded-xl bg-zinc-900
                border border-zinc-700 px-3 text-sm
                text-zinc-200 placeholder:text-zinc-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Start date', value: startDate,
                set: setStartDate },
              { label: 'End date', value: endDate,
                set: setEndDate },
            ].map(({ label, value, set }) => (
              <div key={label} className="space-y-1.5">
                <label className="text-xs text-zinc-400">
                  {label}
                </label>
                <input
                  type="date"
                  value={value}
                  onChange={e => set(e.target.value)}
                  className="w-full h-10 rounded-xl
                    bg-zinc-900 border border-zinc-700
                    px-3 text-sm text-zinc-200"
                />
              </div>
            ))}
          </div>
          {startDate > endDate && (
            <p className="text-xs text-rose-400 -mt-2">
              End date must be after start date
            </p>
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">
              Training mode
            </label>
            <div className="flex gap-2">
              {(
                [
                  ['accumulation', 'Accumulation',
                    'text-amber-400 border-amber-700 bg-amber-950/30'],
                  ['maintenance', 'Maintenance',
                    'text-zinc-300 border-zinc-600 bg-zinc-800/50'],
                  ['deload', 'Deload',
                    'text-sky-400 border-sky-700 bg-sky-950/30'],
                ] as const
              ).map(([val, lbl, activeClass]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() =>
                    setTrainingMode(val as TrainingPhaseMode)}
                  className={`flex-1 h-10 rounded-xl text-xs
                    font-medium border transition-colors ${
                    trainingMode === val
                      ? activeClass
                      : 'bg-zinc-900 border-zinc-700 text-zinc-500'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">
              Nutrition mode
            </label>
            <div className="flex gap-2">
              {(
                [
                  ['deficit', 'Deficit',
                    'text-rose-400 border-rose-700 bg-rose-950/30'],
                  ['maintenance', 'Maintenance',
                    'text-zinc-300 border-zinc-600 bg-zinc-800/50'],
                  ['surplus', 'Surplus',
                    'text-emerald-400 border-emerald-700 bg-emerald-950/30'],
                ] as const
              ).map(([val, lbl, activeClass]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() =>
                    setNutritionMode(val as NutritionPhaseMode)}
                  className={`flex-1 h-10 rounded-xl text-xs
                    font-medium border transition-colors ${
                    nutritionMode === val
                      ? activeClass
                      : 'bg-zinc-900 border-zinc-700 text-zinc-500'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {[
            {
              label: 'Training day calories',
              value: caloriesTraining,
              set: setCaloriesTraining,
              hint: 'Days with a logged session',
            },
            {
              label: 'Rest / LISS day calories',
              value: caloriesRest,
              set: setCaloriesRest,
              hint: 'Non-training days',
            },
            {
              label: 'Daily protein target (g)',
              value: proteinG,
              set: setProteinG,
              hint: 'All days',
            },
          ].map(({ label, value, set, hint }) => (
            <div key={label} className="space-y-1.5">
              <label className="text-xs text-zinc-400">
                {label}
                <span className="text-zinc-600 ml-1.5">
                  ({hint})
                </span>
              </label>
              <input
                type="number"
                value={value}
                onChange={e => set(e.target.value)}
                placeholder="—"
                className="w-full h-10 rounded-xl bg-zinc-900
                  border border-zinc-700 px-3 text-sm
                  text-zinc-200 placeholder:text-zinc-600"
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any context for this phase..."
              className="w-full rounded-xl bg-zinc-900
                border border-zinc-700 px-3 py-2.5
                text-sm text-zinc-200
                placeholder:text-zinc-600 resize-none
                focus:outline-none focus:border-zinc-500"
            />
          </div>

          {isDeloadInDeficit && (
            <div className="rounded-xl border
              border-amber-800/40 bg-amber-950/20 px-3 py-2
              text-xs text-amber-400/90 leading-snug">
              Deload in deficit — recovery capacity is lower
              than a maintenance deload. Compensate with
              sleep and 200g+ protein daily.
            </div>
          )}

        </div>

        <div className="p-4 border-t border-zinc-800 shrink-0">
          <button
            type="button"
            disabled={!canSave || busy}
            onClick={() => void handleSave()}
            className="w-full h-11 rounded-xl bg-amber-600
              text-zinc-950 text-sm font-medium
              disabled:opacity-40 hover:bg-amber-500
              transition-colors"
          >
            {busy ? 'Saving…' : 'Save phase'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PhaseGoalCard({
  phase,
  onDelete,
  onEdit,
}: {
  phase: PhaseGoal;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const trainingColor =
    phase.trainingMode === 'accumulation'
      ? 'text-amber-400 border-amber-800/40 bg-amber-950/20'
      : phase.trainingMode === 'deload'
        ? 'text-sky-400 border-sky-800/40 bg-sky-950/20'
        : 'text-zinc-400 border-zinc-700 bg-zinc-800/30';

  const nutritionColor =
    phase.nutritionMode === 'deficit'
      ? 'text-rose-400 border-rose-800/40 bg-rose-950/20'
      : phase.nutritionMode === 'surplus'
        ? 'text-emerald-400 border-emerald-800/40 bg-emerald-950/20'
        : 'text-zinc-400 border-zinc-700 bg-zinc-800/30';

  const isDeloadInDeficit =
    phase.trainingMode === 'deload' &&
    phase.nutritionMode === 'deficit';

  const nutritionSummary = useNutritionSummaryForDateRange(
    phase.startDate,
    phase.endDate,
  );

  const adherencePct =
    nutritionSummary?.avgActualCalories != null &&
    phase.caloriesTraining != null &&
    phase.caloriesTraining > 0
      ? Math.round(
          (nutritionSummary.avgActualCalories /
            phase.caloriesTraining) * 100
        )
      : null;

  return (
    <div className={`rounded-xl border p-3 space-y-2 ${
      phase.active
        ? 'border-amber-700/50 bg-amber-950/10'
        : 'border-zinc-800 bg-zinc-900/50'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {phase.active && (
              <span className="text-[10px] uppercase
                tracking-wide text-amber-400 font-medium">
                Active
              </span>
            )}
            <span className="text-sm font-medium
              text-zinc-200 truncate">
              {phase.label}
            </span>
          </div>
          <div className="text-xs text-zinc-500">
            {phase.startDate} → {phase.endDate}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            className="h-6 px-2 rounded-md bg-zinc-800
              border border-zinc-700 text-[10px] text-zinc-400
              hover:text-amber-400 transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="h-6 w-6 rounded-full bg-zinc-800
              border border-zinc-700 text-zinc-500
              hover:text-rose-400 text-xs flex items-center
              justify-center transition-colors"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <span className={`text-[11px] px-2 py-0.5
          rounded-full border font-medium ${trainingColor}`}>
          {phase.trainingMode}
        </span>
        <span className={`text-[11px] px-2 py-0.5
          rounded-full border font-medium ${nutritionColor}`}>
          {phase.nutritionMode}
        </span>
      </div>

      {(phase.caloriesTraining || phase.proteinG) && (
        <div className="text-xs text-zinc-500 space-x-3">
          {phase.caloriesTraining && (
            <span>
              Training: {phase.caloriesTraining} kcal
            </span>
          )}
          {phase.caloriesRest && (
            <span>Rest: {phase.caloriesRest} kcal</span>
          )}
          {phase.proteinG && (
            <span>Protein: {phase.proteinG}g</span>
          )}
        </div>
      )}

      {nutritionSummary && nutritionSummary.trainingDays > 0 && (
        <div className="space-y-1 pt-1 border-t border-zinc-800/50">
          <div className="flex justify-between text-[10px]
            text-zinc-600">
            <span>
              Avg {nutritionSummary.avgActualCalories} kcal
              · {nutritionSummary.avgProtein}g protein
              ({nutritionSummary.trainingDays} training days logged)
            </span>
            {adherencePct != null && (
              <span className={
                adherencePct >= 95
                  ? 'text-emerald-400'
                  : adherencePct >= 85
                    ? 'text-amber-400'
                    : 'text-rose-400'
              }>
                {adherencePct}% adherence
              </span>
            )}
          </div>
          {adherencePct != null && (
            <div className="h-0.5 rounded-full bg-zinc-800">
              <div
                className={`h-full rounded-full ${
                  adherencePct >= 95
                    ? 'bg-emerald-500'
                    : adherencePct >= 85
                      ? 'bg-amber-500'
                      : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, adherencePct)}%` }}
              />
            </div>
          )}
        </div>
      )}

      {isDeloadInDeficit && (
        <div className="text-[10px] text-amber-500/80
          border border-amber-800/30 rounded-lg px-2 py-1
          bg-amber-950/20">
          Deload in deficit — prioritize sleep and protein
          over session length targets
        </div>
      )}

      {phase.notes && (
        <p className="text-xs text-zinc-600 leading-snug">
          {phase.notes}
        </p>
      )}
    </div>
  );
}

function NewBlockSheet({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (block: BlockTemplate) => Promise<void>;
}) {
  const recentAvg = useRecentNutritionAverages();

  const computedDefaults = useMemo(() => {
    const maintenance = recentAvg?.avgTrainingCalories ?? 2900;
    return {
      caloriesMaintenance: maintenance,
      caloriesDeficit: Math.max(1800, maintenance - 450),
      caloriesRest: Math.round(maintenance * 0.82),
      proteinG: recentAvg?.avgProtein ?? 200,
    };
  }, [recentAvg?.avgTrainingCalories, recentAvg?.avgProtein]);

  const [anchorDate, setAnchorDate] = useState(todayIso());
  const [caloriesDeficitOverride, setCaloriesDeficitOverride] =
    useState<number | null>(null);
  const [caloriesMaintenanceOverride, setCaloriesMaintenanceOverride] =
    useState<number | null>(null);
  const [caloriesRestOverride, setCaloriesRestOverride] =
    useState<number | null>(null);
  const [proteinGOverride, setProteinGOverride] =
    useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const caloriesDeficit =
    caloriesDeficitOverride ?? computedDefaults.caloriesDeficit;
  const caloriesMaintenance =
    caloriesMaintenanceOverride ?? computedDefaults.caloriesMaintenance;
  const caloriesRest =
    caloriesRestOverride ?? computedDefaults.caloriesRest;
  const proteinG = proteinGOverride ?? computedDefaults.proteinG;

  const preview = buildTenWeekBlock(
    `block-${anchorDate}`,
    anchorDate,
    {
      caloriesDeficit,
      caloriesMaintenanceTraining: caloriesMaintenance,
      caloriesRest,
      proteinG,
    },
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end
      justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg
        rounded-t-3xl border border-zinc-800 bg-zinc-950
        max-h-[85dvh] flex flex-col">
        <div className="p-4 border-b border-zinc-800
          shrink-0 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-zinc-100">
            Generate 10-week block
          </h3>
          <button type="button" onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200
              text-xl leading-none">×</button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">
              Block start date (Week 1 Monday)
            </label>
            <input
              type="date"
              value={anchorDate}
              onChange={e => setAnchorDate(e.target.value)}
              className="w-full h-10 rounded-xl bg-zinc-900
                border border-zinc-700 px-3 text-sm
                text-zinc-200"
            />
          </div>

          {[
            {
              label: 'Deficit calories (training days)',
              value: caloriesDeficit,
              set: setCaloriesDeficitOverride,
              hint: 'Weeks 1–4 and 9–10',
            },
            {
              label: 'Maintenance calories (training days)',
              value: caloriesMaintenance,
              set: setCaloriesMaintenanceOverride,
              hint: 'Weeks 5–8',
            },
            {
              label: 'Rest/LISS day calories',
              value: caloriesRest,
              set: setCaloriesRestOverride,
              hint: 'All phases',
            },
            {
              label: 'Daily protein target (g)',
              value: proteinG,
              set: setProteinGOverride,
              hint: 'All phases',
            },
          ].map(({ label, value, set, hint }) => (
            <div key={label} className="space-y-1.5">
              <label className="text-xs text-zinc-400">
                {label}
                <span className="text-zinc-600 ml-1">
                  ({hint})
                </span>
              </label>
              <input
                type="number"
                value={value}
                onChange={e =>
                  set(Number(e.target.value))}
                className="w-full h-10 rounded-xl
                  bg-zinc-900 border border-zinc-700
                  px-3 text-sm text-zinc-200"
              />
              {recentAvg?.avgTrainingCalories && (
                <p className="text-[10px] text-zinc-600">
                  Based on your last 21 days of training day logs
                </p>
              )}
            </div>
          ))}

          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wide
              text-zinc-500">Phase preview</div>
            {preview.phases.map(p => (
              <div key={p.id}
                className="rounded-xl border border-zinc-800
                  bg-zinc-900/50 px-3 py-2 space-y-0.5">
                <div className="text-xs font-medium
                  text-zinc-300">{p.label}</div>
                <div className="text-[11px] text-zinc-500">
                  {p.startDate} → {p.endDate}
                  {' · '}{p.caloriesTraining} kcal training
                </div>
                {p.trainingMode === 'deload' &&
                  p.nutritionMode === 'deficit' && (
                  <div className="text-[10px]
                    text-amber-500/80">
                    ⚠ Deload in deficit
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800
          shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSave(preview);
              setBusy(false);
            }}
            className="w-full h-11 rounded-xl bg-amber-600
              text-zinc-950 text-sm font-medium
              disabled:opacity-40 hover:bg-amber-500
              transition-colors"
          >
            Save block
          </button>
        </div>
      </div>
    </div>
  );
}
