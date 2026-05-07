'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  useAllBodyMeasurements,
  useAllBodyweight,
  useAllReadiness,
  useAllSets,
  useLifts,
  useMacroTrendAdvice,
  usePrescriptions,
  useReadinessForSession,
  useTemplates,
  useTodaySession,
} from '@/lib/hooks';
import { localUpsert, flushDirty } from '@/lib/sync';
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
import { applyEffortScale, effortLabel } from '@/lib/effort';
import { BodyweightQuickLog } from './BodyweightQuickLog';
import { BodyMeasurementsQuickLog } from './BodyMeasurementsQuickLog';
import { SessionRecapSheet } from './SessionRecapSheet';
import { SyncStatusBar } from './SyncStatusBar';
import { WeekActivityStrip } from './WeekActivityStrip';
import { SessionContextDock } from './SessionContextDock';
import { PageShell } from './PageShell';
import { StartWorkoutButton, WorkoutStopwatchBar } from './WorkoutSessionTimer';
import { TrainingMindsetCard } from './TrainingMindsetCard';
import { MesoBoundaryPromptCard } from './MesoBoundaryPromptCard';
import { MacroTrendCallout } from './MacroTrendCallout';
import { MindfulnessTodayCard } from './MindfulnessTodayCard';
import { SessionStrategyTagsCard } from './SessionStrategyTagsCard';
import { DayNotesCard } from './DayNotesCard';
import {
  setGoalCheckedForSession,
  useFitnessGoals,
  useGoalChecksForSession,
  useGoalSessionPrefs,
} from '@/lib/goals';
import { sortPrescriptionsWithFavoritesFirst, useFavoriteLiftIds } from '@/lib/favoriteLifts';

export function TodayView() {
  const templates = useTemplates();
  const lifts = useLifts();
  const [chosenTemplateId, setChosenTemplateId] = useState<TemplateId | null>(() => {
    if (typeof window === 'undefined') return null;
    const p = readTodayPlanPreference();
    return todayPlanPreferenceIsForToday(p) ? p.templateId : null;
  });
  const [readinessSkipped, setReadinessSkipped] = useState(false);

  const suggested: SessionTemplate | undefined = useMemo(() => {
    if (!templates?.length) return undefined;
    return defaultTemplateForLocalDate(templates);
  }, [templates]);

  const validatedChosenTemplateId = useMemo((): TemplateId | null => {
    if (!chosenTemplateId || !templates?.length) return null;
    return templates.some((t) => t.id === chosenTemplateId) ? chosenTemplateId : null;
  }, [templates, chosenTemplateId]);

  const activeId = validatedChosenTemplateId ?? suggested?.id ?? null;
  const activeTemplate = templates?.find((t) => t.id === activeId);
  const session = useTodaySession((activeId ?? 'U1') as TemplateId);
  const prescriptions = usePrescriptions((activeId ?? undefined) as TemplateId | undefined);
  const favoriteLiftIds = useFavoriteLiftIds();
  const displayPrescriptions = useMemo(
    () => sortPrescriptionsWithFavoritesFirst(prescriptions ?? [], favoriteLiftIds),
    [prescriptions, favoriteLiftIds],
  );
  const favoriteLiftIdSet = useMemo(() => new Set(favoriteLiftIds), [favoriteLiftIds]);
  const readiness = useReadinessForSession(session?.id);
  const allReadiness = useAllReadiness();
  const allSets = useAllSets();
  const allBodyweight = useAllBodyweight();
  const allMeasurements = useAllBodyMeasurements();
  const [sessionRecap, setSessionRecap] = useState<SessionRecapPayload | null>(null);
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

  const [sundayMondayUnlocked, setSundayMondayUnlocked] = useState(false);
  useEffect(() => {
    setSundayMondayUnlocked(readSundayMondayEarlyUnlocked(todayIso()));
  }, [session?.id, session?.date]);

  if (!templates || !lifts || !activeTemplate) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }
  if (!session) return <div className="p-6 text-zinc-500">Creating session…</div>;

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

  return (
    <PageShell className={`p-4 space-y-4 ${showSessionDock ? 'pb-24' : ''}`}>
      <SyncStatusBar />
      <MesoBoundaryPromptCard />
      <MacroTrendTodayBanner />
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

      <SessionHeader
        template={activeTemplate}
        session={session}
        templates={templates}
        hideTemplatePicker={sundayGateActive}
        onTemplateChange={(t) => {
          setChosenTemplateId(t.id);
          writeTodayPlanPreference({ date: todayIso(), templateId: t.id });
        }}
      />
      {!sundayGateActive && <SessionGoalsCard sessionId={session.id} />}
      {!needsReadiness && session.mode !== 'skip' && <SessionStrategyTagsCard session={session} />}
      <MindfulnessTodayCard session={session} />
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
              <TrainingMindsetCard />
            </>
          )}
          {(displayPrescriptions ?? []).map((p) => {
            const lift = lifts.find((l) => l.id === p.liftId);
            if (!lift) return null;
            const adjusted = applyEffortScale(applySessionMode(p, session, lift), session);
            const snapped = {
              ...adjusted,
              weight: snapWorkingWeight(adjusted.weight, liftForSnap(p.liftId)),
            };
            return (
              <LiftCard
                key={p.id}
                prescription={snapped}
                lift={lift}
                session={session}
                pinned={favoriteLiftIdSet.has(p.liftId)}
              />
            );
          })}
        </div>
      )}

      {!needsReadiness && session.mode !== 'skip' && !sundayGateActive && (
        <>
          {(session.effortScale ?? 0) !== 0 && (
            <div className="text-xs text-zinc-500 text-center">
              Effort mode active: {effortLabel(session.effortScale ?? 0)}
            </div>
          )}
          <FinishSessionButton
            session={session}
            prescriptions={displayPrescriptions ?? []}
            onRecap={(p) => setSessionRecap(p)}
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

function SessionGoalsCard({ sessionId }: { sessionId: string }) {
  const goals = useFitnessGoals();
  const checks = useGoalChecksForSession(sessionId);
  const prefs = useGoalSessionPrefs();

  if (!goals || goals.length === 0 || !checks || !prefs) return null;
  const visibleGoals = prefs.useTopThreeOnly ? goals.slice(0, 3) : goals;
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Session goals</div>
        {prefs.useTopThreeOnly && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
            top 3 pinned
          </span>
        )}
      </div>
      <div className="space-y-1.5">
        {visibleGoals.map((goal) => {
          const checked = Boolean(checks[goal.id]);
          return (
            <label key={goal.id} className="flex items-start gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  void setGoalCheckedForSession(sessionId, goal.id, e.target.checked);
                }}
                className="mt-0.5"
              />
              <span className={checked ? 'line-through text-zinc-500' : ''}>{goal.text}</span>
            </label>
          );
        })}
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

function applySessionMode(p: Prescription, s: SessionLog, lift: Lift): Prescription {
  if (s.deload) {
    return applyStandardDeload(p, lift);
  }
  if (s.mode === 'light') {
    return { ...p, weight: Math.round(p.weight * 0.8) };
  }
  return p;
}

function FinishSessionButton({
  session,
  prescriptions,
  onRecap,
}: {
  session: SessionLog;
  prescriptions: Prescription[];
  onRecap: (payload: SessionRecapPayload) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<{ advanced: number; held: number; skipped: number; durationMs: number | null } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

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
      const finalSession = {
        ...finalizeWorkoutPauseAtCompletion(session, completedAt),
        completedAt,
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
