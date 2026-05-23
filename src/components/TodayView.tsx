'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAllBodyMeasurements,
  useAllBodyweight,
  useAllReadiness,
  useAllSessions,
  useAllSets,
  useLifts,
  useMacroTrendAdvice,
  usePrescriptions,
  useReadinessForSession,
  useTemplates,
  useTodaySession,
} from '@/lib/hooks';
import { localDelete, localUpsert, flushDirty } from '@/lib/sync';
import { fmtDate, todayIso } from '@/lib/time';
import type { Lift, Prescription, SessionLog, SessionTemplate, SetLog, TemplateId } from '@/lib/types';
import { CardioBanner } from './CardioBanner';
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

const MINI_TEMPLATE_IDS = new Set(['L2', 'U3', 'L3']);

export function TodayView() {
  const templates = useTemplates();
  const lifts = useLifts();
  const [chosenTemplateId, setChosenTemplateId] = useState<TemplateId | null>(() => {
    if (typeof window === 'undefined') return null;
    const p = readTodayPlanPreference();
    return todayPlanPreferenceIsForToday(p) ? p.templateId : null;
  });
  const [readinessSkipped, setReadinessSkipped] = useState(false);
  const [quickMode, setQuickMode] = useState(false);
  const [recoveryPromptSessionId, setRecoveryPromptSessionId] = useState<string | null>(null);

  const programTemplates = useMemo(
    () => (templates ?? []).filter((t) => t.id !== 'QUICK'),
    [templates],
  );

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
  const session = useTodaySession((activeId ?? 'U1') as TemplateId);
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
        sessionType: 'standard',
      };
      await localUpsert('session_logs', row);
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [activeId, session]);

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

  if (!templates || !lifts || !activeTemplate) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }
  if (!session) return <div className="p-6 text-zinc-500">Creating session…</div>;

  const isMiniSession = session
    ? MINI_TEMPLATE_IDS.has(session.templateId)
    : false;

  const needsReadiness =
    !readiness && !readinessSkipped && !session.startedAt && !session.completedAt;
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

  const recoveryRated =
    session.perceivedRecovery !== undefined ||
    recoveryPromptSessionId === session.id;

  const needsPerceivedRecovery =
    Boolean(session.startedAt) &&
    !session.completedAt &&
    !recoveryRated;

  async function handlePerceivedRecovery(n: number | null) {
    await localUpsert('session_logs', {
      ...session,
      perceivedRecovery: n,
    });
    setRecoveryPromptSessionId(session.id);
  }

  return (
    <PageShell className={`p-4 space-y-4 ${showSessionDock ? 'pb-24' : ''}`}>
      <SyncStatusBar />
      <MesoBoundaryPromptCard />
      <MacroTrendTodayBanner />
      <GhostSessionPromptCard
        onLogNow={(templateId) => {
          setChosenTemplateId(templateId);
          writeTodayPlanPreference({ date: todayIso(), templateId });
        }}
      />
      <WeekActivityStrip />
      {session.completedAt && (
        <SessionCompleteBanner
          session={session}
          templateName={activeTemplate.name}
          sets={allSets ?? []}
          highlights={completeHighlights}
          onViewRecap={openReplayRecap}
        />
      )}

      <CardioBanner />
      <MindfulnessWeeklyBanner />

      {!session.startedAt && !session.completedAt && !sundayGateActive && (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Today&apos;s workout</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
          <div className="border-t border-zinc-800 pt-3">
            <button
              type="button"
              onClick={() => setQuickMode(true)}
              className="w-full py-3 rounded-xl bg-zinc-800 border border-zinc-700 text-zinc-300 text-sm"
            >
              ⚡ Quick Session — singles &amp; doubles
            </button>
          </div>
        </div>
      )}

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
      <MindfulnessTodayCard session={session} />
      <WorkdayCard date={todayIso()} />
      <SupplementsCard date={todayIso()} />
      <DayNotesCard date={todayIso()} />
      {(weeklyFlags.bodyweightOverdue || weeklyFlags.measurementsOverdue) && (
        <WeeklyTrackingReminder
          bodyweightOverdue={weeklyFlags.bodyweightOverdue}
          measurementsOverdue={weeklyFlags.measurementsOverdue}
        />
      )}

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

      <BodyweightQuickLog
        date={todayIso()}
        subtitle="Doesn&apos;t have to be lower day — updates the BW chart for this date."
      />
      <BodyMeasurementsQuickLog date={todayIso()} />
      {!needsReadiness && (
        <DailyCheckinStatusBanner
          fullyCompleted={checkinFullyCompleted}
          skipped={checkinSkipped}
        />
      )}

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
          {readiness && (
            <ReadinessSummary readiness={readiness} session={session} allowEdit />
          )}
          <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6 text-center text-zinc-400">
            <div className="text-lg font-medium text-zinc-200 mb-2">Skipping for recovery</div>
            <div className="text-sm">No sets to log. Switch back to Standard or Light if plans change.</div>
          </div>
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
                    className="absolute top-3 right-3 z-10 h-6 w-6 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-rose-400 text-xs flex items-center justify-center transition-colors"
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
      {showSessionDock && allSets && (
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
      const wasFirstCompletion = !session.completedAt;
      const db = getDb();
      const sessionSets = await db.set_logs.where('sessionLogId').equals(session.id).toArray();
      let advanced = 0, held = 0, skipped = 0;
      for (const p of prescriptions) {
        const dec = decideProgression(p, sessionSets, session, undefined, liftById);
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
        session.startedAt
          ? Math.round(
              (new Date(completedAt).getTime() -
                new Date(session.startedAt).getTime()) /
                60000,
            )
          : null;
      const finalSession = {
        ...finalizeWorkoutPauseAtCompletion(session, completedAt),
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
