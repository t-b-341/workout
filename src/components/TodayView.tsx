'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  useAllBodyMeasurements,
  useAllBodyweight,
  useAllReadiness,
  useAllSessions,
  useAllSets,
  useLifts,
  useActivePhaseGoal,
  useMacroTrendAdvice,
  useMindfulnessForDate,
  usePrescriptions,
  usePullupLogsForDate,
  useReadinessForSession,
  useTemplates,
  useThisWeekCardio,
  useThisWeekMindfulness,
  useThisWeekPullups,
  useTodaySession,
} from '@/lib/hooks';
import { ensureSessionPersisted, getAuthUserId, localDelete, localUpsert, flushDirty, persistSessionUpdate } from '@/lib/sync';
import { fmtDate, todayIso } from '@/lib/time';
import type {
  BodyMeasurementLog,
  BodyweightLog,
  Lift,
  NutritionPhaseMode,
  PhaseGoal,
  Prescription,
  PullupLog,
  SessionLog,
  SessionTemplate,
  SetLog,
  TemplateId,
  TrainingPhaseMode,
} from '@/lib/types';
import { dayNotesMetaKey, normalizeDayNotesValue } from '@/lib/dayNotes';
import { SUPPLEMENT_ITEMS, useSupplementsForDate } from '@/lib/supplements';
import {
  durationHrForShift,
  normalizeWorkdayValue,
  useWorkdayForDate,
  type WorkdayShift,
} from '@/lib/workday';
import { CardioBanner } from './CardioBanner';
import { CollapsibleCard } from './CollapsibleCard';
import { PageHeader } from './SettingsGearLink';
import { MindfulnessWeeklyBanner } from './MindfulnessWeeklyBanner';
import { SessionHeader } from './SessionHeader';
import { LiftCard } from './LiftCard';
import { decideProgression, liftForSnap, snapWorkingWeight } from '@/lib/progression';
import {
  finalizeWorkoutPauseAtCompletion,
  fmtDurationShort,
  mostRecentWorkingWeight,
  sessionDurationMs,
  sessionFinishHighlights,
  workoutWallClockElapsedMs,
  type SessionFinishHighlights,
} from '@/lib/stats';
import { buildSessionRecapPayload, type SessionRecapPayload } from '@/lib/sessionRecap';
import { ReadinessForm } from './ReadinessForm';
import { ReadinessSummary } from './ReadinessSummary';
import { getDb } from '@/lib/db';
import { defaultTemplateForLocalDate } from '@/lib/seed';
import {
  readTodayPlanPreference,
  todayPlanPreferenceIsForToday,
  writeTodayPlanPreference,
} from '@/lib/todayPlanPreference';
import {
  readSundayMondayEarlyUnlocked,
  writeSundayMondayEarlyUnlocked,
} from '@/lib/sundayMondayEarly';
import { applyStandardDeload } from '@/lib/deload';
import { BodyweightQuickLog } from './BodyweightQuickLog';
import { BodyMeasurementsQuickLog } from './BodyMeasurementsQuickLog';
import { SessionRecapSheet } from './SessionRecapSheet';
import { SyncStatusBar } from './SyncStatusBar';
import { WeekActivityStrip } from './WeekActivityStrip';
import { SessionContextDock } from './SessionContextDock';
import { PageShell } from './PageShell';
import { StartWorkoutButton, WorkoutStopwatchBar } from './WorkoutSessionTimer';
import { MesoBoundaryPromptCard } from './MesoBoundaryPromptCard';
import { MacroTrendCallout } from './MacroTrendCallout';
import { GhostSessionPromptCard } from './GhostSessionPromptCard';
import { MindfulnessTodayCard } from './MindfulnessTodayCard';
import { DayNotesCard } from './DayNotesCard';
import { WorkdayCard } from './WorkdayCard';
import { SupplementsCard } from './SupplementsCard';
import { sortPrescriptionsWithFavoritesFirst, useFavoriteLiftIds } from '@/lib/favoriteLifts';
import { sortTemplatesProgramOrder } from '@/lib/seed';
import { QuickSessionView } from './QuickSessionView';
import { StoicMomentSheet } from './StoicMomentSheet';
import { OverwhelmProtocol } from './OverwhelmProtocol';
import { useHidePrescribed, useDisabledTemplateIds } from '@/lib/todayPrefs';

const MINI_TEMPLATE_IDS = new Set(['L2', 'U3', 'L3', 'S1']);

async function isPhaseTransitionDismissed(
  phaseId: string,
): Promise<boolean> {
  const key = `phase_transition_seen:${phaseId}`;
  const row = await getDb().meta.get(key);
  return row != null;
}

async function dismissPhaseTransition(
  phaseId: string,
): Promise<void> {
  const key = `phase_transition_seen:${phaseId}`;
  await getDb().meta.put({
    key,
    value: new Date().toISOString(),
  });
}

export function TodayView() {
  const templates = useTemplates();
  const lifts = useLifts();
  const [chosenTemplateId, setChosenTemplateId] = useState<TemplateId | null>(() => {
    if (typeof window === 'undefined') return null;
    const p = readTodayPlanPreference();
    return todayPlanPreferenceIsForToday(p) ? p.templateId : null;
  });
  // Session id whose check was just skipped or saved. Hides the form before the
  // live query returns `readinessCompletedAt`. A different template still prompts.
  const [readinessSkipSessionId, setReadinessSkipSessionId] = useState<string | null>(null);
  const [quickMode, setQuickMode] = useState(false);
  const [showStoicMoment, setShowStoicMoment] = useState(false);
  const [showOverwhelmProtocol, setShowOverwhelmProtocol] = useState(false);
  const [recoveryPromptSessionId, setRecoveryPromptSessionId] = useState<string | null>(null);
  const hidePrescribed = useHidePrescribed();
  const disabledTemplateIds = useDisabledTemplateIds();

  const programTemplates = useMemo(() => {
    const base = (templates ?? []).filter((t) => t.id !== 'QUICK');
    const filtered = base.filter((t) => !disabledTemplateIds.includes(t.id));
    // Guard: never allow the disable filter to empty the list.
    return filtered.length > 0 ? filtered : base;
  }, [templates, disabledTemplateIds]);

  const suggested: SessionTemplate | undefined = useMemo(() => {
    if (!programTemplates.length) return undefined;
    return defaultTemplateForLocalDate(programTemplates);
  }, [programTemplates]);

  const validatedChosenTemplateId = useMemo((): TemplateId | null => {
    if (!chosenTemplateId || !programTemplates.length) return null;
    return programTemplates.some((t) => t.id === chosenTemplateId) ? chosenTemplateId : null;
  }, [programTemplates, chosenTemplateId]);

  const activeId = validatedChosenTemplateId ?? suggested?.id ?? null;
  const activeTemplate = programTemplates.find((t) => t.id === activeId);
  const todayStr = todayIso();
  const storedSession = useTodaySession((activeId ?? 'U1') as TemplateId);
  const draftSession = useMemo((): SessionLog | null => {
    if (!activeId) return null;
    return {
      id: `${todayStr}-${activeId}`,
      date: todayStr,
      templateId: activeId,
      mode: 'standard',
      deload: false,
      watchFlags: [],
      sessionType: 'standard',
    };
  }, [activeId, todayStr]);
  const session = storedSession ?? draftSession;
  const activePhase = useActivePhaseGoal();
  const isNewPhaseDay = activePhase?.startDate === todayStr;
  const [phaseTransitionDismissed, setPhaseTransitionDismissed] =
    useState(true);

  useEffect(() => {
    if (!activePhase || !isNewPhaseDay) return;
    isPhaseTransitionDismissed(activePhase.id).then(seen => {
      setPhaseTransitionDismissed(seen);
    });
  }, [activePhase, isNewPhaseDay]);

  const prescriptions = usePrescriptions((activeId ?? undefined) as TemplateId | undefined);
  const favoriteLiftIds = useFavoriteLiftIds();
  const displayPrescriptions = useMemo(
    () => sortPrescriptionsWithFavoritesFirst(prescriptions ?? [], favoriteLiftIds),
    [prescriptions, favoriteLiftIds],
  );
  const [sessionRecap, setSessionRecap] = useState<SessionRecapPayload | null>(null);
  const [setCountOverride, setSetCountOverride] = useState<Record<string, number>>({});
  const [hiddenPrescriptionIds, setHiddenPrescriptionIds] = useState<Set<string>>(new Set());
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const visiblePrescriptions = useMemo(
    () => (displayPrescriptions ?? []).filter((p) => !hiddenPrescriptionIds.has(p.id)),
    [displayPrescriptions, hiddenPrescriptionIds],
  );
  const favoriteLiftIdSet = useMemo(() => new Set(favoriteLiftIds), [favoriteLiftIds]);
  const sessionActive = Boolean(session?.startedAt && !session?.completedAt);
  const readiness = useReadinessForSession(session?.id);
  const allReadiness = useAllReadiness();
  const allSets = useAllSets();
  const allSessions = useAllSessions();
  const allBodyweight = useAllBodyweight();
  const allMeasurements = useAllBodyMeasurements();
  const weeklyFlags = useMemo(
    () => computeWeeklyTrackingFlags(todayIso(), allBodyweight ?? [], allMeasurements ?? []),
    [allBodyweight, allMeasurements],
  );

  const lastWeighIn = useMemo(() => {
    const a = allBodyweight;
    if (!a?.length) return null;
    return a[a.length - 1];
  }, [allBodyweight]);

  const lastMeasurement = useMemo(() => {
    const a = allMeasurements;
    if (!a?.length) return null;
    return a[a.length - 1];
  }, [allMeasurements]);

  const openReplayRecap = useCallback(async () => {
    if (!session?.completedAt) return;
    const p = await buildSessionRecapPayload({ session, progression: null });
    if (p) setSessionRecap(p);
  }, [session]);

  const handleAddExercise = useCallback(
    async (liftId: string) => {
      const lift = lifts?.find((l) => l.id === liftId);
      if (!lift || !session || !activeId) return;

      const recent = mostRecentWorkingWeight(liftId, allSets ?? [], allSessions ?? []);

      const newPrescription: Prescription = {
        id: `session-${session.id}-${liftId}-${Date.now()}`,
        templateId: activeId as TemplateId,
        liftId,
        order: (displayPrescriptions?.length ?? 0) * 10 + 999,
        weight: recent ?? lift.increment ?? 45,
        sets: 1,
        repMin: 1,
        repMax: 5,
        notes: '__session_scoped__',
      };
      await localUpsert('prescriptions', newPrescription);
    },
    [lifts, session, activeId, allSets, allSessions, displayPrescriptions],
  );

  const cleanupSessionScopedPrescriptions = useCallback(async () => {
    const sessionScoped = (prescriptions ?? []).filter((p) => p.notes === '__session_scoped__');
    for (const p of sessionScoped) {
      await localDelete('prescriptions', p.id);
    }
  }, [prescriptions]);

  const completeHighlights = useMemo(() => {
    if (!session?.completedAt || !allSets || !lifts) return null;
    return sessionFinishHighlights(session, allSets, lifts, allBodyweight ?? [], allReadiness ?? []);
  }, [session, allSets, lifts, allBodyweight, allReadiness]);

  useEffect(() => {
    if (!session || session.date !== todayIso()) return;
    writeTodayPlanPreference({ date: session.date, templateId: session.templateId });
  }, [session]);

  const sessionUnlockKey = `${session?.id ?? ''}|${session?.date ?? ''}`;
  const [sessionUnlockKeySeen, setSessionUnlockKeySeen] = useState(sessionUnlockKey);
  const [sundayMondayUnlocked, setSundayMondayUnlocked] = useState(() =>
    readSundayMondayEarlyUnlocked(todayIso()),
  );
  if (sessionUnlockKey !== sessionUnlockKeySeen) {
    setSessionUnlockKeySeen(sessionUnlockKey);
    setSundayMondayUnlocked(readSundayMondayEarlyUnlocked(todayIso()));
  }

  if (quickMode) {
    return <QuickSessionView onBack={() => setQuickMode(false)} />;
  }

  if (!templates || !lifts || !activeTemplate || !session) {
    return (
      <PageShell className="p-4 space-y-4">
        <PageHeader title="Today" titleAs="p" />
        <div className="text-zinc-500">Loading…</div>
      </PageShell>
    );
  }

  const isMiniSession = session
    ? MINI_TEMPLATE_IDS.has(session.templateId)
    : false;

  const readinessSkipped = readinessSkipSessionId === session.id;
  const needsReadiness =
    !readiness &&
    !readinessSkipped &&
    !session.readinessCompletedAt &&
    !session.startedAt &&
    !session.completedAt;
  const checkinFullyCompleted = Boolean(readiness);
  const checkinSkipped = !readiness && Boolean(session.readinessCompletedAt);

  const isLocalSunday = new Date(`${todayIso()}T12:00:00`).getDay() === 0;
  const sundayGateActive =
    isLocalSunday
    && !needsReadiness
    && session.mode !== 'skip'
    && !session.startedAt
    && !session.completedAt
    && !sundayMondayUnlocked;

  const showSessionDock =
    !needsReadiness &&
    !sundayGateActive &&
    session.mode !== 'skip' &&
    (prescriptions?.length ?? 0) > 0 &&
    !session.completedAt;
  // Same condition that mounts SessionContextDock. The dock is ~3.6rem tall
  // on top of the 4rem nav; 5rem leaves at least 8px above it.
  const sessionDockVisible = !hidePrescribed && showSessionDock && Boolean(allSets);

  const recoveryRated =
    session.perceivedRecovery !== undefined ||
    recoveryPromptSessionId === session.id;

  const needsPerceivedRecovery =
    Boolean(session.startedAt) &&
    !session.completedAt &&
    !recoveryRated;


  const handleDismissPhaseTransition = async () => {
    if (activePhase) await dismissPhaseTransition(activePhase.id);
    setPhaseTransitionDismissed(true);
  };

  async function handlePerceivedRecovery(n: number | null) {
    if (!session) return;
    await persistSessionUpdate(session, { perceivedRecovery: n });
    setRecoveryPromptSessionId(session.id);
  }

  return (
    <PageShell className={`p-4 space-y-4 ${showSessionDock && !hidePrescribed ? 'pb-24' : ''}`}>
      <PageHeader title="Today" titleAs="p" />
      <SyncStatusBar />
      <MesoBoundaryPromptCard />
      {!hidePrescribed && (
        <GhostSessionPromptCard
          onLogNow={(templateId) => {
            setChosenTemplateId(templateId);
            writeTodayPlanPreference({ date: todayIso(), templateId });
          }}
        />
      )}
      {isNewPhaseDay && !phaseTransitionDismissed && activePhase && (
        <PhaseTransitionCard
          phase={activePhase}
          onDismiss={() => void handleDismissPhaseTransition()}
        />
      )}

      {!hidePrescribed && (
        <SessionHeader
          template={activeTemplate}
          session={session}
          templates={programTemplates}
          hideTemplatePicker={sundayGateActive}
          onTemplateChange={(t) => {
            setChosenTemplateId(t.id);
            writeTodayPlanPreference({ date: todayIso(), templateId: t.id });
          }}
        />
      )}

      {!session.startedAt && !session.completedAt && (hidePrescribed || !sundayGateActive) && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          {!hidePrescribed && (
            <>
              <div className="text-xs text-zinc-500 uppercase tracking-wider">Today&apos;s workout</div>
              <div className="grid grid-cols-3 gap-2">
                {sortTemplatesProgramOrder(programTemplates).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setChosenTemplateId(t.id);
                      writeTodayPlanPreference({ date: todayIso(), templateId: t.id });
                    }}
                    className={`py-2.5 px-3 rounded-xl text-sm font-medium border ${
                      activeId === t.id
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-100'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-300'
                    }`}
                  >
                    {t.id}
                  </button>
                ))}
              </div>
              <div className="border-t border-zinc-800 pt-3" />
            </>
          )}
          <button
            type="button"
            onClick={() => setQuickMode(true)}
            className="w-full py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm"
          >
            ⚡ Quick Session — singles &amp; doubles
          </button>
        </div>
      )}

      {hidePrescribed && !needsReadiness && (
        <DailyCheckinStatusBanner
          fullyCompleted={checkinFullyCompleted}
          skipped={checkinSkipped}
        />
      )}

      {!hidePrescribed && (
        <div className="space-y-3">
          {session.completedAt && (
            <SessionCompleteBanner
              session={session}
              templateName={activeTemplate.name}
              sets={allSets ?? []}
              highlights={completeHighlights}
              onViewRecap={openReplayRecap}
            />
          )}
          {needsReadiness ? (
        <>
          <ReadinessForm
            session={session}
            promptBodyweight={activeTemplate.id === 'L1'}
            onComplete={() => setReadinessSkipSessionId(session.id)}
          />
          <button
            type="button"
            onClick={async () => {
              await persistSessionUpdate(session, {
                readinessCompletedAt: new Date().toISOString(),
              });
              setReadinessSkipSessionId(session.id);
            }}
            className="w-full text-xs text-zinc-500 underline underline-offset-2"
          >Skip readiness check</button>
        </>
      ) : session.mode === 'skip' ? (
        <>
          {readiness && (
            <ReadinessSummary readiness={readiness} session={session} allowEdit />
          )}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-center text-zinc-400">
            <div className="text-lg font-medium text-zinc-200 mb-2">Skipping for recovery</div>
            <div className="text-sm">No sets to log. Switch back to Standard or Light if plans change.</div>
          </div>
          <DailyCheckinStatusBanner
            fullyCompleted={checkinFullyCompleted}
            skipped={checkinSkipped}
          />
        </>
      ) : sundayGateActive ? (
        <>
          {readiness && (
            <ReadinessSummary readiness={readiness} session={session} allowEdit />
          )}
          <div className="rounded-2xl border border-zinc-700 bg-zinc-900/80 px-4 py-5 space-y-3">
            <div className="text-sm font-medium text-zinc-200">Monday&apos;s workout</div>
            <p className="text-xs text-zinc-500 leading-relaxed">
              Your check-in is done for Sunday. Monday&apos;s session stays tucked away until you open it
              (or until Monday).
            </p>
            <button
              type="button"
              onClick={() => {
                const d = todayIso();
                writeSundayMondayEarlyUnlocked(d);
                setSundayMondayUnlocked(true);
              }}
              className="w-full h-12 rounded-xl bg-amber-500 text-zinc-950 text-sm font-semibold"
            >
              Tap here to start Monday&apos;s workout
            </button>
          </div>
          <DailyCheckinStatusBanner
            fullyCompleted={checkinFullyCompleted}
            skipped={checkinSkipped}
          />
        </>
      ) : (
        <div className="space-y-3">
          {readiness && (
            <ReadinessSummary readiness={readiness} session={session} allowEdit />
          )}
          {!session.completedAt && (
            <>
              {!session.startedAt && <StartWorkoutButton session={session} />}
              {session.startedAt && <WorkoutStopwatchBar session={session} />}
            </>
          )}
          <DailyCheckinStatusBanner
            fullyCompleted={checkinFullyCompleted}
            skipped={checkinSkipped}
          />
          {needsPerceivedRecovery && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 space-y-4">
              <div className="text-sm font-medium text-zinc-200">
                How recovered do you feel right now?
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => void handlePerceivedRecovery(n)}
                    className="flex-1 h-11 rounded-xl bg-zinc-800 border border-zinc-700 text-sm font-mono text-zinc-200 hover:bg-amber-600 hover:border-amber-500 hover:text-zinc-950 transition-colors"
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-zinc-600">
                <span>Very fatigued</span>
                <span>Fully recovered</span>
              </div>
              <button
                type="button"
                onClick={() => void handlePerceivedRecovery(null)}
                className="w-full text-xs text-zinc-600 hover:text-zinc-400"
              >
                Skip
              </button>
            </div>
          )}
          {!needsPerceivedRecovery && isMiniSession && (
            <div className="rounded-xl border border-zinc-700/60
              bg-zinc-900/70 px-4 py-3 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-amber-400
                  uppercase tracking-wide">
                  Mini session
                </span>
                <span className="text-xs text-zinc-500 font-mono">
                  Target: 15–30 min
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-snug">
                1–2 top sets per movement. Weights below are your
                current working loads — use prior session data on
                each lift card to orient. No progression today.
              </p>
            </div>
          )}
          {!needsPerceivedRecovery &&
          visiblePrescriptions.map((p) => {
            const lift = lifts.find((l) => l.id === p.liftId);
            if (!lift) return null;
            const modeAdjusted = applySessionMode(p, session, lift, allSets, allSessions);
            const withSnap = {
              ...modeAdjusted,
              weight: snapWorkingWeight(modeAdjusted.weight, liftForSnap(p.liftId)),
            };
            const snapped =
              withSnap.notes === '__session_scoped__' ? { ...withSnap, notes: undefined } : withSnap;
            return (
              <div key={p.id} className="relative">
                {sessionActive && (
                  <button
                    type="button"
                    aria-label={`Remove ${lift.name} from session`}
                    onClick={() =>
                      setHiddenPrescriptionIds((prev) => new Set([...prev, p.id]))
                    }
                    className="absolute top-2 right-2 z-10 h-11 w-11 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-rose-400 text-xl leading-none flex items-center justify-center transition-colors"
                  >
                    ×
                  </button>
                )}
                <LiftCard
                  prescription={snapped}
                  lift={lift}
                  session={session}
                  pinned={favoriteLiftIdSet.has(p.liftId)}
                  effectiveSets={setCountOverride[p.id]}
                  onAddSet={
                    sessionActive
                      ? () =>
                          setSetCountOverride((prev) => ({
                            ...prev,
                            [p.id]: (prev[p.id] ?? snapped.sets) + 1,
                          }))
                      : undefined
                  }
                  onRemoveLastSet={
                    sessionActive
                      ? async () => {
                          const currentCount = setCountOverride[p.id] ?? snapped.sets;
                          if (currentCount <= 1) return;
                          const lastIdx = currentCount - 1;
                          const sessionSets = (allSets ?? []).filter(
                            (s) =>
                              s.prescriptionId === p.id &&
                              s.sessionLogId === session.id &&
                              s.setIndex === lastIdx,
                          );
                          for (const s of sessionSets) {
                            await localDelete('set_logs', s.id, { undoLabel: 'Remove set' });
                          }
                          setSetCountOverride((prev) => ({
                            ...prev,
                            [p.id]: currentCount - 1,
                          }));
                        }
                      : undefined
                  }
                />
              </div>
            );
          })}
          {sessionActive && !needsPerceivedRecovery && (
            <button
              type="button"
              onClick={() => setAddExerciseOpen(true)}
              className="w-full h-11 rounded-2xl border border-dashed border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center justify-center gap-2"
            >
              <span className="text-lg leading-none">+</span>
              Add exercise
            </button>
          )}
        </div>
          )}

          {!needsReadiness &&
        !needsPerceivedRecovery &&
        session.mode !== 'skip' &&
        !sundayGateActive && (
        <>
          <button
            type="button"
            onClick={() => setShowStoicMoment(true)}
            className="w-full h-9 rounded-xl border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-500 hover:text-amber-400 hover:border-zinc-700 transition-colors text-left px-3"
          >
            + Stoic moment
          </button>
          <FinishSessionButton
            session={session}
            prescriptions={visiblePrescriptions}
            lifts={lifts ?? []}
            onRecap={async (p) => {
              setSessionRecap(p);
              await cleanupSessionScopedPrescriptions();
            }}
          />
          <AddExerciseSheet
            open={addExerciseOpen}
            onClose={() => setAddExerciseOpen(false)}
            session={session}
            lifts={lifts ?? []}
            existingLiftIds={new Set((displayPrescriptions ?? []).map((p) => p.liftId))}
            onAdd={handleAddExercise}
          />
        </>
          )}
        </div>
      )}
      <WeekActivityStrip />
      <TodayTrackers
        session={session}
        weeklyFlags={weeklyFlags}
        lastWeighIn={lastWeighIn}
        lastMeasurement={lastMeasurement}
      />
      <button
        type="button"
        onClick={() => setShowStoicMoment(true)}
        className="w-full h-9 rounded-xl border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-500 hover:text-amber-400 hover:border-zinc-700 transition-colors text-left px-3"
      >
        + Stoic moment
      </button>
      <PhaseSummaryCard />
      {!hidePrescribed && showSessionDock && allSets && (
        <SessionContextDock session={session} prescriptions={displayPrescriptions ?? []} allSets={allSets} />
      )}
      {sessionRecap && (
        <SessionRecapSheet
          open
          onClose={() => setSessionRecap(null)}
          session={sessionRecap.session}
          templateName={sessionRecap.templateName}
          durationMs={sessionRecap.durationMs}
          strengthLbPerHour={sessionRecap.strengthLbPerHour}
          progression={sessionRecap.progression}
          prs={sessionRecap.prs}
          highlights={sessionRecap.highlights}
          replay={sessionRecap.replay}
        />
      )}
      {showStoicMoment && (
        <StoicMomentSheet
          date={todayIso()}
          onClose={() => setShowStoicMoment(false)}
        />
      )}
      {/* Overwhelm Protocol floating trigger. Hidden dock: 5rem above the
          viewport bottom (bottom-20) plus the home-indicator inset, so it
          stays above the nav. Open dock: another 4rem clears the dock. */}
      <div
        className={`fixed right-4 z-40 ${
          sessionDockVisible
            ? 'bottom-[calc(4rem+max(env(safe-area-inset-bottom),0px)+5rem)]'
            : 'bottom-[calc(5rem+max(env(safe-area-inset-bottom),0px))]'
        }`}
      >
        <button
          type="button"
          onClick={() => setShowOverwhelmProtocol(true)}
          className="h-12 w-12 rounded-full bg-rose-900 border border-rose-700 text-rose-300 text-xl shadow-lg flex items-center justify-center active:bg-rose-800"
          aria-label="Open Overwhelm Protocol"
          title="Overwhelm Protocol"
        >
          ⚡
        </button>
      </div>

      {showOverwhelmProtocol && (
        <OverwhelmProtocol onClose={() => setShowOverwhelmProtocol(false)} />
      )}
    </PageShell>
  );
}

function daysSince(latestIso: string | null, today: string): number {
  if (!latestIso) return Number.POSITIVE_INFINITY;
  const ms = Date.parse(`${today}T00:00:00`) - Date.parse(`${latestIso}T00:00:00`);
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function computeWeeklyTrackingFlags(
  today: string,
  bodyweight: { date: string }[],
  measurements: { date: string }[],
): { bodyweightOverdue: boolean; measurementsOverdue: boolean } {
  const latestBwDate = bodyweight.length > 0 ? bodyweight[bodyweight.length - 1].date : null;
  const latestMeasureDate = measurements.length > 0 ? measurements[measurements.length - 1].date : null;
  return {
    bodyweightOverdue: daysSince(latestBwDate, today) >= 7,
    measurementsOverdue: daysSince(latestMeasureDate, today) >= 7,
  };
}

function WeeklyTrackingReminder({
  bodyweightOverdue,
  measurementsOverdue,
}: {
  bodyweightOverdue: boolean;
  measurementsOverdue: boolean;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/45 bg-amber-950/30 px-4 py-3 text-sm text-amber-100">
      <div className="font-medium">Weekly tracking reminder</div>
      <div className="text-amber-200/85 text-xs mt-1">
        {bodyweightOverdue && measurementsOverdue
          ? 'Bodyweight and body measurements are 1+ week old.'
          : bodyweightOverdue
            ? 'Bodyweight is 1+ week old.'
            : 'Body measurements are 1+ week old.'}
      </div>
    </div>
  );
}


const MACRO_TREND_DISMISS_PREFIX = 'workout:macroTrendDismiss:';

function MacroTrendTodayBanner() {
  const date = todayIso();
  const advice = useMacroTrendAdvice(date);
  const storageKey = `${MACRO_TREND_DISMISS_PREFIX}${date}`;
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return sessionStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    try {
      sessionStorage.setItem(storageKey, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  if (dismissed) return null;
  return (
    <MacroTrendCallout
      advice={advice}
      title="Fueling trend (recent days)"
      onDismiss={dismiss}
    />
  );
}

function PhaseTransitionCard({
  phase,
  onDismiss,
}: {
  phase: PhaseGoal;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-700/50 bg-amber-950/20 px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="text-xs uppercase tracking-wide text-amber-400 font-medium">
            New phase started today
          </div>
          <div className="text-sm font-medium text-zinc-200">{phase.label}</div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-zinc-600 hover:text-zinc-400 text-lg leading-none mt-0.5"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="flex gap-3 text-xs text-zinc-400">
        <span
          className={
            phase.trainingMode === 'accumulation'
              ? 'text-amber-400'
              : phase.trainingMode === 'deload'
                ? 'text-sky-400'
                : 'text-zinc-400'
          }
        >
          {phase.trainingMode}
        </span>
        <span>·</span>
        <span
          className={
            phase.nutritionMode === 'deficit'
              ? 'text-rose-400'
              : phase.nutritionMode === 'surplus'
                ? 'text-emerald-400'
                : 'text-zinc-400'
          }
        >
          {phase.nutritionMode}
        </span>
        {phase.caloriesTraining && (
          <>
            <span>·</span>
            <span>{phase.caloriesTraining.toLocaleString()} kcal training days</span>
          </>
        )}
        {phase.proteinG && (
          <>
            <span>·</span>
            <span>{phase.proteinG}g protein</span>
          </>
        )}
      </div>
      {phase.trainingMode === 'deload' && phase.nutritionMode === 'deficit' && (
        <div className="text-[10px] text-amber-500/80 border-t border-amber-800/30 pt-1.5">
          Deload in deficit — prioritize sleep and protein over session length targets this week.
        </div>
      )}
    </div>
  );
}

function workdaySummary(shift: WorkdayShift | null): string {
  if (shift == null) return 'Not set';
  if (shift === 'off') return 'Off';
  const label =
    shift === 'am' ? 'AM' : shift === 'pm' ? 'PM' : shift === 'double' ? 'Double' : 'Shift';
  return `${label} · ${durationHrForShift(shift)} hr`;
}

function oneLinePreview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (!flat) return 'Empty';
  return flat.length > 80 ? `${flat.slice(0, 79)}…` : flat;
}

function TodayTrackers({
  session,
  weeklyFlags,
  lastWeighIn,
  lastMeasurement,
}: {
  session: SessionLog;
  weeklyFlags: { bodyweightOverdue: boolean; measurementsOverdue: boolean };
  lastWeighIn: BodyweightLog | null;
  lastMeasurement: BodyMeasurementLog | null;
}) {
  const date = todayIso();
  const cardio = useThisWeekCardio();
  const pullups = useThisWeekPullups();
  const mindfulnessWeek = useThisWeekMindfulness();
  const mindfulnessToday = useMindfulnessForDate(session.date);
  const workday = useWorkdayForDate(date);
  const supplements = useSupplementsForDate(date);
  const notesKey = dayNotesMetaKey(date);
  const notesRow = useLiveQuery(
    () => getDb().meta.where('key').equals(notesKey).first(),
    [notesKey],
  );
  const macroAdvice = useMacroTrendAdvice(date);
  const macroDismissed =
    typeof window !== 'undefined' &&
    (() => {
      try {
        return sessionStorage.getItem(`${MACRO_TREND_DISMISS_PREFIX}${date}`) === '1';
      } catch {
        return false;
      }
    })();

  const cardioSummary = cardio ? `${cardio.total} / ${cardio.target} min` : '…';
  const pullupSummary = pullups ? `${pullups.total} / ${pullups.target} reps` : '…';
  const todayMindMin = (mindfulnessToday ?? []).reduce((sum, row) => sum + (row.durationMin ?? 0), 0);
  const mindfulnessSummary = mindfulnessWeek
    ? `${mindfulnessWeek.total} / ${mindfulnessWeek.target} min · ${todayMindMin} min today`
    : '…';
  const supplementCount = supplements
    ? SUPPLEMENT_ITEMS.filter(({ id }) => Boolean(supplements[id])).length
    : 0;
  const noteSummary = oneLinePreview(normalizeDayNotesValue(notesRow?.value).text);
  const bodyweightSummary = lastWeighIn
    ? lastWeighIn.date === date
      ? `${lastWeighIn.bodyweight} lb today`
      : `${lastWeighIn.bodyweight} lb`
    : 'No entries yet';
  const measurementSummary = lastMeasurement
    ? `W ${lastMeasurement.waist} · A ${lastMeasurement.abdomen} · H ${lastMeasurement.hips}`
    : 'No entries yet';
  const weeklySummary =
    weeklyFlags.bodyweightOverdue && weeklyFlags.measurementsOverdue
      ? 'Bodyweight and measurements are 1+ week old'
      : weeklyFlags.bodyweightOverdue
        ? 'Bodyweight is 1+ week old'
        : weeklyFlags.measurementsOverdue
          ? 'Measurements are 1+ week old'
          : 'Up to date';
  const macroSummary =
    macroAdvice === undefined
      ? '…'
      : macroDismissed
        ? 'Dismissed'
        : (macroAdvice.lines[0] ?? 'No hint');
  const lastLoggedSummary = lastWeighIn ? `${lastWeighIn.bodyweight} lb` : 'No weigh-in yet';

  return (
    <div className="space-y-2">
      <h2 className="px-1 text-xs font-medium uppercase tracking-wider text-zinc-500">Trackers</h2>
      <CollapsibleCard sectionId="cardio" title="Cardio this week" summary={cardioSummary}>
        <CardioBanner />
      </CollapsibleCard>
      <CollapsibleCard sectionId="pullups" title="Pull-ups this week" summary={pullupSummary}>
        <PullupTracker />
      </CollapsibleCard>
      <CollapsibleCard sectionId="mindfulness" title="Mindfulness" summary={mindfulnessSummary}>
        <div className="space-y-3">
          <MindfulnessWeeklyBanner />
          <MindfulnessTodayCard session={session} />
        </div>
      </CollapsibleCard>
      <CollapsibleCard
        sectionId="workday"
        title="Work day"
        summary={workdaySummary(normalizeWorkdayValue(workday?.value).shift)}
      >
        <WorkdayCard date={date} />
      </CollapsibleCard>
      <CollapsibleCard sectionId="supplements" title="Supplements" summary={`${supplementCount} of 4`}>
        <SupplementsCard date={date} />
      </CollapsibleCard>
      <CollapsibleCard sectionId="notes" title="Day's notes" summary={noteSummary}>
        <DayNotesCard date={date} />
      </CollapsibleCard>
      <CollapsibleCard sectionId="bodyweight" title="Bodyweight" summary={bodyweightSummary}>
        <BodyweightQuickLog
          date={date}
          subtitle="Doesn&apos;t have to be lower day — updates the BW chart for this date."
        />
      </CollapsibleCard>
      <CollapsibleCard sectionId="measurements" title="Body measurements" summary={measurementSummary}>
        <BodyMeasurementsQuickLog date={date} />
      </CollapsibleCard>
      <CollapsibleCard sectionId="weekly" title="Weekly tracking reminder" summary={weeklySummary}>
        {weeklyFlags.bodyweightOverdue || weeklyFlags.measurementsOverdue ? (
          <WeeklyTrackingReminder
            bodyweightOverdue={weeklyFlags.bodyweightOverdue}
            measurementsOverdue={weeklyFlags.measurementsOverdue}
          />
        ) : (
          <p className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
            Bodyweight and measurements are up to date.
          </p>
        )}
      </CollapsibleCard>
      <CollapsibleCard sectionId="macro" title="Macro trend hint" summary={macroSummary}>
        <MacroTrendTodayBanner />
        {macroAdvice !== undefined && (macroDismissed || macroAdvice.lines.length === 0) && (
          <p className="px-1 pt-1 text-sm text-zinc-500">No fueling hint right now.</p>
        )}
      </CollapsibleCard>
      <CollapsibleCard sectionId="lastLogged" title="Last logged" summary={lastLoggedSummary}>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-zinc-500">Last logged</div>
          <div className="text-sm text-zinc-300">
            <span className="text-zinc-500">Weigh-in </span>
            {lastWeighIn ? (
              <>
                <span className="text-zinc-200">{fmtDate(lastWeighIn.date, 'MMM d, yyyy')}</span>
                <span className="text-zinc-600"> · </span>
                <span className="font-mono text-zinc-100">{lastWeighIn.bodyweight}</span>
                <span className="text-zinc-500 text-xs"> lb</span>
              </>
            ) : (
              <span className="text-zinc-600">No entries yet</span>
            )}
          </div>
          <div className="text-sm text-zinc-300">
            <span className="text-zinc-500">Measurements </span>
            {lastMeasurement ? (
              <>
                <span className="text-zinc-200">{fmtDate(lastMeasurement.date, 'MMM d, yyyy')}</span>
                <span className="text-zinc-600"> · </span>
                <span className="font-mono text-zinc-100">
                  W {lastMeasurement.waist} · A {lastMeasurement.abdomen} · H {lastMeasurement.hips}
                </span>
                <span className="text-zinc-500 text-xs"> in</span>
              </>
            ) : (
              <span className="text-zinc-600">No entries yet</span>
            )}
          </div>
        </div>
      </CollapsibleCard>
    </div>
  );
}

function SessionCompleteBanner({
  session,
  templateName,
  sets,
  highlights,
  onViewRecap,
}: {
  session: SessionLog;
  templateName: string;
  sets: SetLog[];
  highlights: SessionFinishHighlights | null;
  onViewRecap: () => Promise<void>;
}) {
  const [recapBusy, setRecapBusy] = useState(false);
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
        <button
          type="button"
          disabled={recapBusy}
          onClick={() => {
            setRecapBusy(true);
            void onViewRecap().finally(() => setRecapBusy(false));
          }}
          className="mt-2.5 w-full sm:w-auto px-4 py-2 rounded-xl text-sm font-medium border border-emerald-500/40 text-emerald-100 hover:bg-emerald-500/10 disabled:opacity-50 transition-colors"
        >
          {recapBusy ? 'Opening…' : 'View recap'}
        </button>
      </div>
    </div>
  );
}

function DailyCheckinStatusBanner({
  fullyCompleted,
  skipped,
}: {
  fullyCompleted: boolean;
  skipped: boolean;
}) {
  if (!fullyCompleted && !skipped) return null;
  if (fullyCompleted) {
    return (
      <div
        role="status"
        className="rounded-2xl border border-emerald-500/45 bg-emerald-950/40 px-4 py-3 flex items-center gap-3"
      >
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-zinc-950 text-sm font-bold"
          aria-hidden
        >
          ✓
        </div>
        <div>
          <div className="text-sm font-semibold text-emerald-100">Daily check-in complete</div>
          <div className="text-xs text-emerald-200/75">You are set for today.</div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
      Daily check-in skipped for today.
    </div>
  );
}

function AddExerciseSheet({
  open,
  onClose,
  session,
  lifts,
  existingLiftIds,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  session: SessionLog;
  lifts: Lift[];
  existingLiftIds: Set<string>;
  onAdd: (liftId: string) => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  void session;

  if (!open) return null;

  const filtered = lifts.filter(
    (l) =>
      l.equipment !== 'cardio' &&
      l.equipment !== 'time' &&
      (search === '' || l.name.toLowerCase().includes(search.toLowerCase())),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-t-3xl border border-zinc-800 bg-zinc-950 max-h-[75dvh] flex flex-col">
        <div className="p-4 border-b border-zinc-800 shrink-0 space-y-3">
          <h3 className="text-lg font-semibold text-zinc-100">Add exercise</h3>
          <input
            type="search"
            placeholder="Search lifts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-9 rounded-lg bg-zinc-900 border border-zinc-700 px-3 text-sm text-zinc-200 placeholder:text-zinc-600"
            autoFocus
          />
        </div>
        <div className="overflow-y-auto divide-y divide-zinc-800/50 p-2">
          {filtered.map((l) => (
            <button
              key={l.id}
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                await onAdd(l.id);
                setBusy(false);
                onClose();
              }}
              className="w-full text-left px-3 py-3 text-sm text-zinc-200 hover:bg-zinc-900 rounded-lg flex items-center justify-between"
            >
              <span>{l.name}</span>
              {existingLiftIds.has(l.id) && (
                <span className="text-[10px] text-zinc-600 uppercase tracking-wide">
                  already in session
                </span>
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-8">No lifts match</p>
          )}
        </div>
      </div>
    </div>
  );
}

function applySessionMode(
  p: Prescription,
  s: SessionLog,
  lift: Lift,
  sets?: SetLog[],
  sessions?: SessionLog[],
): Prescription {
  if (s.deload) {
    const recentWorkingWeight =
      sets && sessions ? mostRecentWorkingWeight(p.liftId, sets, sessions) : undefined;
    return applyStandardDeload(p, lift, recentWorkingWeight);
  }
  if (s.mode === 'light') {
    return { ...p, weight: Math.round(p.weight * 0.8) };
  }
  return p;
}

function FinishSessionButton({
  session,
  prescriptions,
  lifts,
  onRecap,
}: {
  session: SessionLog;
  prescriptions: Prescription[];
  lifts: Lift[];
  onRecap: (payload: SessionRecapPayload) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ advanced: number; held: number; skipped: number; durationMs: number | null } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const liftById = useMemo(() => new Map(lifts.map((l) => [l.id, l])), [lifts]);

  useEffect(() => {
    if (!session.startedAt || session.completedAt || session.workoutPausedAt) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session.startedAt, session.completedAt, session.workoutPausedAt]);

  const liveDuration =
    session.startedAt && !session.completedAt
      ? workoutWallClockElapsedMs(session, nowTick)
      : null;

  async function finish() {
    setBusy(true);
    try {
      const stored = await ensureSessionPersisted(session);
      const wasFirstCompletion = !stored.completedAt;
      const db = getDb();
      const sessionSets = await db.set_logs.where('sessionLogId').equals(stored.id).toArray();
      let advanced = 0, held = 0, skipped = 0;
      for (const p of prescriptions) {
        const dec = decideProgression(p, sessionSets, stored, undefined, liftById);
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
      const durationMin =
        stored.startedAt
          ? Math.round(
              (new Date(completedAt).getTime() -
                new Date(stored.startedAt).getTime()) /
                60000,
            )
          : null;
      const finalSession = {
        ...finalizeWorkoutPauseAtCompletion(stored, completedAt),
        completedAt,
        durationMin,
      };
      await localUpsert('session_logs', finalSession);
      await flushDirty();
      const durationMs = sessionDurationMs(finalSession, sessionSets);
      const progression = { advanced, held, skipped };
      setSummary({ ...progression, durationMs });

      if (wasFirstCompletion) {
        const payload = await buildSessionRecapPayload({
          session: finalSession,
          progression,
        });
        if (payload) onRecap(payload);
      }
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

function PhaseSummaryCard() {
  const phase = useActivePhaseGoal();
  if (!phase) return null;

  const today = todayIso();

  // Days elapsed since phase start (0-based internally, display as 1-based)
  const msPerDay = 86400000;
  const startMs = new Date(`${phase.startDate}T00:00:00`).getTime();
  const todayMs = new Date(`${today}T00:00:00`).getTime();
  const endMs   = new Date(`${phase.endDate}T00:00:00`).getTime();

  const daysElapsed   = Math.max(0, Math.round((todayMs - startMs) / msPerDay));
  const daysRemaining = Math.max(0, Math.round((endMs - todayMs) / msPerDay) + 1);
  const totalDays     = Math.max(1, Math.round((endMs - startMs) / msPerDay) + 1);

  const weekNum = Math.floor(daysElapsed / 7) + 1;
  const dayNum  = daysElapsed + 1;
  const totalWeeks = Math.ceil(totalDays / 7);

  // Progress bar percentage
  const pct = Math.min(100, Math.round((daysElapsed / totalDays) * 100));

  // Training mode label + color
  const trainingColor: Record<TrainingPhaseMode, string> = {
    accumulation: 'text-amber-400',
    deload:       'text-sky-400',
    maintenance:  'text-zinc-400',
  };
  const trainingLabel: Record<TrainingPhaseMode, string> = {
    accumulation: 'Accumulation',
    deload:       'Deload',
    maintenance:  'Maintenance',
  };

  // Nutrition mode label + color
  const nutritionColor: Record<NutritionPhaseMode, string> = {
    surplus:     'text-emerald-400',
    deficit:     'text-rose-400',
    maintenance: 'text-zinc-400',
  };
  const nutritionLabel: Record<NutritionPhaseMode, string> = {
    surplus:     'Surplus',
    deficit:     'Deficit',
    maintenance: 'Maintenance',
  };

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-0.5">Current phase</div>
          <div className="text-sm font-medium text-zinc-100 leading-tight">{phase.label}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-zinc-500">
            Week {weekNum} of {totalWeeks}
          </div>
          <div className="text-[11px] text-zinc-600">
            Day {dayNum} · {daysRemaining}d remaining
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <div
          className="h-full bg-amber-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Phase mode pills */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-xs font-medium ${trainingColor[phase.trainingMode]}`}>
          {trainingLabel[phase.trainingMode]}
        </span>
        <span className="text-zinc-700 text-xs">·</span>
        <span className={`text-xs font-medium ${nutritionColor[phase.nutritionMode]}`}>
          {nutritionLabel[phase.nutritionMode]}
        </span>
        {phase.caloriesTraining != null && (
          <>
            <span className="text-zinc-700 text-xs">·</span>
            <span className="text-xs text-zinc-500 font-mono">
              {phase.caloriesTraining.toLocaleString()} kcal
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function PullupTracker() {
  const today = todayIso();
  const logs = usePullupLogsForDate(today);
  const wk = useThisWeekPullups();
  const [expanded, setExpanded] = useState(false);
  const [reps, setReps] = useState(5);
  const [timeHm, setTimeHm] = useState(() =>
    new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }).slice(0, 5),
  );
  const [saving, setSaving] = useState(false);

  async function add() {
    setSaving(true);
    try {
      const authUserId = await getAuthUserId();
      const [h, m] = timeHm.split(':').map(Number);
      const loggedAt = new Date();
      loggedAt.setHours(h, m, 0, 0);
      const row: PullupLog = {
        id: `pullup-${Date.now()}`,
        userId: authUserId ?? '',
        date: today,
        loggedAt: loggedAt.toISOString(),
        reps,
        updatedAt: new Date().toISOString(),
      };
      await localUpsert('pullup_logs', row);
      setReps(5);
    } finally {
      setSaving(false);
    }
  }

  async function remove(log: PullupLog) {
    await localDelete('pullup_logs', log.id, { undoLabel: 'Pullup set' });
  }

  const todayTotal = (logs ?? []).reduce((s, l) => s + l.reps, 0);
  const weekPct = wk ? Math.min(100, Math.round((wk.total / wk.target) * 100)) : 0;

  return (
    <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
      <button
        type="button"
        className="w-full p-3 flex items-center justify-between text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="space-y-1 flex-1 mr-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-400">Pull-ups this week</span>
            <span className="font-mono text-zinc-200">
              {wk?.total ?? 0} / {wk?.target ?? 50} reps
            </span>
          </div>
          <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
            <div
              className={`h-full transition-all ${weekPct >= 100 ? 'bg-emerald-500' : 'bg-sky-500'}`}
              style={{ width: `${weekPct}%` }}
            />
          </div>
        </div>
        <span className="text-zinc-500 text-sm shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="border-t border-zinc-800 p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setReps((r) => Math.max(1, r - 1))}
                className="h-8 w-8 rounded-lg bg-zinc-800 text-zinc-300 text-lg flex items-center justify-center active:bg-zinc-700"
              >
                −
              </button>
              <span className="w-10 text-center font-mono text-zinc-100 text-sm">{reps}</span>
              <button
                type="button"
                onClick={() => setReps((r) => Math.min(50, r + 1))}
                className="h-8 w-8 rounded-lg bg-zinc-800 text-zinc-300 text-lg flex items-center justify-center active:bg-zinc-700"
              >
                +
              </button>
            </div>
            <span className="text-zinc-500 text-xs">reps at</span>
            <input
              type="time"
              value={timeHm}
              onChange={(e) => setTimeHm(e.target.value)}
              className="h-8 px-2 rounded-lg bg-zinc-800 text-zinc-200 text-sm font-mono border-0 outline-none"
            />
            <button
              type="button"
              onClick={add}
              disabled={saving}
              className="h-8 px-4 rounded-lg bg-sky-700 text-white text-sm font-medium disabled:opacity-50 active:bg-sky-600"
            >
              {saving ? '…' : 'Log'}
            </button>
          </div>

          {(logs ?? []).length > 0 && (
            <div className="space-y-1">
              <div className="text-[11px] text-zinc-500 uppercase tracking-wider">
                Today — {todayTotal} reps
              </div>
              {[...(logs ?? [])].reverse().map((log) => (
                <div key={log.id} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300 font-mono">{log.reps} reps</span>
                  <span className="text-zinc-600 text-xs">
                    {new Date(log.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(log)}
                    className="text-zinc-600 hover:text-rose-400 text-xs px-2 py-0.5"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
