'use client';

import { useMemo, useState } from 'react';
import {
  useAllSessions,
  useAllSets,
  useLifts,
  usePrescriptions,
  useQuickLoadouts,
} from '@/lib/hooks';
import {
  buildQuickPrescriptions,
  buildComplexPrescriptions,
  deleteQuickLoadout,
  MOVEMENT_FAMILIES,
  newLoadoutId,
  QUICK_DEFAULT_LIFT_IDS,
  QUICK_MAX_LIFTS,
  QUICK_MIN_LIFTS,
  QUICK_PRESETS,
  saveQuickLoadout,
  TIER_DEFAULTS,
} from '@/lib/quickSession';
import { useComplexes, complexSummary } from '@/lib/complexes';
import { liftForSnap, snapWorkingWeight } from '@/lib/progression';
import { ensureSessionPersisted, getAuthUserId, localUpsert, flushDirty } from '@/lib/sync';
import {
  finalizeWorkoutPauseAtCompletion,
  fmtDurationShort,
  mostRecentWorkingWeight,
  sessionDurationMs,
  sessionFinishHighlights,
  sessionRecapPRs,
} from '@/lib/stats';
import { todayIso } from '@/lib/time';
import type {
  Complex,
  Lift,
  Prescription,
  QuickLoadout,
  QuickSessionTier,
  SessionLabelType,
  SessionLog,
} from '@/lib/types';
import { LiftCard } from './LiftCard';
import { PageShell } from './PageShell';
import { WorkoutStopwatchBar } from './WorkoutSessionTimer';

const QUICK_SWAP_LIFT_IDS = [
  'dl',
  'back_squat',
  'bp',
  'bp_paused',
  'ohp',
  'pp',
  'bbr',
  'pendlay_row',
  'deficit_bbr',
  'rdl',
  'wgbp',
  'cgbp',
  'p1_bw',
  'p1_eccentric',
  'front_squat',
  'btn_press',
  // Olympic lifts
  'sn',
  'cj',
  'cl',
  'jk',
  'snatch_pull',
  'clean_pull',
  'power_snatch',
  'hang_snatch',
  'muscle_snatch',
  'drop_snatch',
  'snatch_balance',
  'oh_squat',
  'power_clean',
  'hang_clean',
  'muscle_clean',
  'push_jerk',
  'split_jerk',
  'btn_jerk',
] as const;

/** Family display name per lift id; absent → no family ('Swap'). */
const FAMILY_LABEL_BY_LIFT: Record<string, string> = {
  bp: 'Bench', bp_paused: 'Bench', wgbp: 'Bench', cgbp: 'Bench',
  ohp: 'Press', pp: 'Press', wgohp: 'Press', btn_press: 'Press',
  back_squat: 'Squat', pause_squat: 'Squat', front_squat: 'Squat', bss: 'Squat',
  dl: 'Hinge', deficit_dl: 'Hinge', rdl: 'Hinge',
  bbr: 'Row', pendlay_row: 'Row', deficit_bbr: 'Row',
  sn: 'Snatch', power_snatch: 'Snatch', hang_snatch: 'Snatch', muscle_snatch: 'Snatch', drop_snatch: 'Snatch', snatch_balance: 'Snatch', oh_squat: 'Snatch', snatch_pull: 'Snatch',
  cl: 'Clean', power_clean: 'Clean', hang_clean: 'Clean', muscle_clean: 'Clean', clean_pull: 'Clean',
  cj: 'Clean', jk: 'Jerk', split_jerk: 'Jerk', push_jerk: 'Jerk', btn_jerk: 'Jerk',
};

const TIER_HEADINGS: Record<QuickSessionTier, string> = {
  coffee: 'Coffee Session',
  top_set: 'Top Set',
  full: 'Quick Session',
};

const TIER_NAMES: Record<QuickSessionTier, string> = {
  coffee: 'Coffee',
  top_set: 'Top Set',
  full: 'Full',
};

const CUSTOM_DEFAULTS: Record<QuickSessionTier, string[]> = {
  coffee: ['ohp'],
  top_set: ['bp', 'bbr'],
  full: [...QUICK_DEFAULT_LIFT_IDS],
};

function sessionTypeForTier(tier: QuickSessionTier): SessionLabelType {
  if (tier === 'coffee') return 'coffee';
  if (tier === 'top_set') return 'top_set';
  return 'opportunistic';
}

function variantLiftIdsFor(liftId: string): readonly string[] {
  return MOVEMENT_FAMILIES[liftId] ?? QUICK_SWAP_LIFT_IDS;
}

function variantButtonLabel(liftId: string): string {
  const family = FAMILY_LABEL_BY_LIFT[liftId];
  return family ? `${family} ▾` : 'Swap';
}

type Props = {
  onBack: () => void;
};

type Step = 'tier' | 'preset' | 'customize';

function shiftSetsOverrideDown(
  prev: Record<number, number>,
  removedIndex: number,
): Record<number, number> {
  const next: Record<number, number> = {};
  for (const [key, val] of Object.entries(prev)) {
    const idx = Number(key);
    if (idx < removedIndex) next[idx] = val;
    else if (idx > removedIndex) next[idx - 1] = val;
  }
  return next;
}

function shiftSetsOverrideForInsert(
  prev: Record<number, number>,
  insertIndex: number,
): Record<number, number> {
  const next: Record<number, number> = {};
  for (const [key, val] of Object.entries(prev)) {
    const idx = Number(key);
    if (idx < insertIndex) next[idx] = val;
    else next[idx + 1] = val;
  }
  return next;
}

function QuickLiftBlock({
  prescription,
  lift,
  session,
  onAddSet,
  extraSets,
}: {
  prescription: Prescription;
  lift: Lift;
  session: SessionLog;
  onAddSet: () => void;
  extraSets: number;
}) {
  const effectivePrescription = {
    ...prescription,
    sets: prescription.sets + extraSets,
  };
  return (
    <div className="space-y-1">
      <LiftCard
        prescription={effectivePrescription}
        lift={lift}
        session={session}
        restTargetSeconds={120}
      />
      <button
        type="button"
        onClick={onAddSet}
        className="w-full h-9 rounded-xl border border-dashed border-zinc-700 text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors"
      >
        + Add set
      </button>
    </div>
  );
}

export function QuickSessionView({ onBack }: Props) {
  const lifts = useLifts();
  const allSets = useAllSets();
  const allSessions = useAllSessions();
  const allPrescriptions = usePrescriptions();
  const complexes = useComplexes();

  const [step, setStep] = useState<Step>('tier');
  const [selectedTier, setSelectedTier] = useState<QuickSessionTier | null>(null);
  const savedLoadouts = useQuickLoadouts(selectedTier ?? undefined);

  const [liftIds, setLiftIds] = useState<string[]>([]);
  const [activeComplex, setActiveComplex] = useState<Complex | null>(null);
  const [complexWeight, setComplexWeight] = useState<number>(0);
  const [variantIndex, setVariantIndex] = useState<number | null>(null);
  const [addingSlot, setAddingSlot] = useState(false);
  const [confirmDeleteLoadoutId, setConfirmDeleteLoadoutId] = useState<string | null>(null);
  const [savingLoadout, setSavingLoadout] = useState(false);
  const [loadoutLabel, setLoadoutLabel] = useState('');

  const [sessionStarted, setSessionStarted] = useState(false);
  const [session, setSession] = useState<SessionLog | null>(null);
  const [finishBusy, setFinishBusy] = useState(false);
  const [recap, setRecap] = useState<{
    prCount: number;
    completedSets: number;
    durationMs: number | null;
  } | null>(null);
  const [setsOverride, setSetsOverride] = useState<Record<number, number>>({});
  const [extraSets, setExtraSets] = useState<Record<string, number>>({});

  const prescriptionFallback = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of allPrescriptions ?? []) {
      m.set(p.liftId, p.weight);
    }
    return m;
  }, [allPrescriptions]);

  const syntheticPrescriptions = useMemo(() => {
    if (activeComplex) {
      return buildComplexPrescriptions(activeComplex, complexWeight);
    }
    if (!allSets || !allSessions) return [];
    return buildQuickPrescriptions(
      liftIds,
      allSets,
      allSessions,
      prescriptionFallback,
      selectedTier ?? 'full',
    );
  }, [activeComplex, complexWeight, liftIds, allSets, allSessions, prescriptionFallback, selectedTier]);

  const liftById = useMemo(() => new Map((lifts ?? []).map((l) => [l.id, l])), [lifts]);

  const displayPrescriptions = useMemo(() => {
    return syntheticPrescriptions.map((p, i) => ({
      ...p,
      sets: activeComplex ? p.sets : (setsOverride[i] ?? p.sets),
      weight: snapWorkingWeight(
        activeComplex ? complexWeight : p.weight,
        liftForSnap(p.liftId),
      ),
    }));
  }, [syntheticPrescriptions, setsOverride, activeComplex, complexWeight]);

  const variantOptions = useMemo(() => {
    if (variantIndex == null) return [];
    const currentLiftId = liftIds[variantIndex];
    if (!currentLiftId) return [];
    const out: Lift[] = [];
    for (const id of variantLiftIdsFor(currentLiftId)) {
      const lift = liftById.get(id);
      if (lift) out.push(lift);
    }
    return out;
  }, [variantIndex, liftIds, liftById]);

  const addOptions = useMemo(() => {
    const out: Lift[] = [];
    for (const id of QUICK_SWAP_LIFT_IDS) {
      const lift = liftById.get(id);
      if (lift) out.push(lift);
    }
    return out;
  }, [liftById]);

  function resetCustomizeState(nextLiftIds: string[]) {
    setLiftIds(nextLiftIds);
    setActiveComplex(null);
    setComplexWeight(0);
    setSetsOverride({});
    setExtraSets({});
    setVariantIndex(null);
    setAddingSlot(false);
    setSavingLoadout(false);
    setLoadoutLabel('');
  }

  function selectComplex(c: Complex) {
    const firstLiftId = c.elements[0]?.liftId;
    const recent = firstLiftId
      ? mostRecentWorkingWeight(firstLiftId, allSets ?? [], allSessions ?? [])
      : undefined;
    setLiftIds([]);
    setSetsOverride({});
    setExtraSets({});
    setVariantIndex(null);
    setAddingSlot(false);
    setSavingLoadout(false);
    setLoadoutLabel('');
    setActiveComplex(c);
    setComplexWeight(recent ?? 0);
    setSelectedTier('top_set');
    setStep('customize');
  }

  function chooseTier(tier: QuickSessionTier) {
    setSelectedTier(tier);
    setConfirmDeleteLoadoutId(null);
    setStep('preset');
  }

  function selectLoadout(loadout: QuickLoadout) {
    resetCustomizeState([...loadout.liftIds]);
    setStep('customize');
  }

  if (!lifts || !allSets || !allSessions || allPrescriptions === undefined) {
    return <div className="p-6 text-zinc-500">Loading…</div>;
  }

  async function startSession() {
    const tier = selectedTier ?? 'full';
    const row: SessionLog = {
      id: `${todayIso()}-QUICK-${Date.now()}`,
      date: todayIso(),
      templateId: 'QUICK',
      mode: 'standard',
      deload: false,
      sessionType: sessionTypeForTier(tier),
      watchFlags: [],
      startedAt: new Date().toISOString(),
    };
    await localUpsert('session_logs', row);
    setSession(row);
    setSessionStarted(true);
  }

  async function persistLoadout() {
    const tier = selectedTier ?? 'full';
    const label = loadoutLabel.trim();
    if (!label) return;
    const userId = (await getAuthUserId()) ?? '';
    await saveQuickLoadout({
      id: newLoadoutId(),
      userId,
      tier,
      label,
      liftIds: [...liftIds],
    });
    setSavingLoadout(false);
    setLoadoutLabel('');
  }

  async function finishSession() {
    if (!session || !lifts) return;
    setFinishBusy(true);
    try {
      const completedAt = new Date().toISOString();
      const stored = await ensureSessionPersisted(session);
      const finalSession = {
        ...finalizeWorkoutPauseAtCompletion(stored, completedAt),
        completedAt,
      };
      await localUpsert('session_logs', finalSession);
      await flushDirty();
      setSession(finalSession);

      const sessionSets = (allSets ?? []).filter((s) => s.sessionLogId === session.id);
      const highlights = sessionFinishHighlights(finalSession, sessionSets, lifts, [], []);
      const prs = sessionRecapPRs(
        finalSession.id,
        sessionSets,
        allSessions ?? [],
        lifts,
      );
      setRecap({
        prCount: prs.length,
        completedSets: highlights.completedSetCount,
        durationMs: sessionDurationMs(finalSession, sessionSets),
      });
    } finally {
      setFinishBusy(false);
    }
  }

  // ----- Screen 4b: recap -----
  if (recap) {
    return (
      <PageShell className="p-4 space-y-4">
        <div className="rounded-2xl border border-emerald-500/45 bg-emerald-950/40 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-emerald-100">Quick session complete</h2>
          <ul className="text-sm text-zinc-300 space-y-1">
            <li>
              <span className="text-zinc-500">Sets completed:</span> {recap.completedSets}
            </li>
            <li>
              <span className="text-zinc-500">PRs:</span>{' '}
              {recap.prCount > 0 ? recap.prCount : 'none this session'}
            </li>
            {recap.durationMs != null && (
              <li>
                <span className="text-zinc-500">Duration:</span>{' '}
                <span className="font-mono">{fmtDurationShort(recap.durationMs)}</span>
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={onBack}
            className="w-full h-12 rounded-xl bg-amber-500 text-zinc-950 font-semibold text-sm"
          >
            Done
          </button>
        </div>
      </PageShell>
    );
  }

  // ----- Screen 4a: active session -----
  if (sessionStarted && session) {
    return (
      <PageShell className="p-4 space-y-4 pb-24">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-zinc-400 underline underline-offset-2"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">
            {activeComplex?.label ?? TIER_HEADINGS[selectedTier ?? 'full']}
          </h1>
          <p className="text-xs text-zinc-500 mt-1">Opportunistic · no progression</p>
        </div>
        {session.startedAt && !session.completedAt && <WorkoutStopwatchBar session={session} />}

        <div className="space-y-3">
          {displayPrescriptions.map((p, i) => {
            const lift = liftById.get(p.liftId);
            if (!lift) return null;
            const extra = extraSets[activeComplex ? p.id : p.liftId] ?? 0;
            return (
              <QuickLiftBlock
                key={`quick-active-${i}`}
                prescription={p}
                lift={lift}
                session={session}
                extraSets={extra}
                onAddSet={() =>
                  setExtraSets((prev) => ({
                    ...prev,
                    [activeComplex ? p.id : p.liftId]: (prev[activeComplex ? p.id : p.liftId] ?? 0) + 1,
                  }))
                }
              />
            );
          })}
        </div>

        {!session.completedAt && (
          <button
            type="button"
            disabled={finishBusy}
            onClick={() => void finishSession()}
            className="w-full h-14 rounded-2xl bg-amber-500 text-zinc-950 font-semibold text-lg disabled:opacity-50"
          >
            {finishBusy ? 'Finishing…' : 'Finish Quick Session'}
          </button>
        )}
      </PageShell>
    );
  }

  // ----- Screen 1: tier picker -----
  if (step === 'tier') {
    const tiles: { tier: QuickSessionTier; title: string; desc: string }[] = [
      { tier: 'coffee', title: 'Coffee', desc: '1 movement · singles or doubles · fastest setup' },
      { tier: 'top_set', title: 'Top Set', desc: '2–3 movements · work up to something heavy' },
      { tier: 'full', title: 'Full', desc: 'Up to 8 movements · off-program · no progression' },
    ];
    return (
      <PageShell className="p-4 space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-zinc-400 underline underline-offset-2"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Quick Session</h1>
          <p className="text-sm text-zinc-500 mt-1">Pick a style to get going.</p>
        </div>
        <div className="space-y-3">
          {tiles.map((t) => (
            <button
              key={t.tier}
              type="button"
              onClick={() => chooseTier(t.tier)}
              className="w-full text-left rounded-2xl border border-zinc-800 bg-zinc-900 p-5 hover:border-amber-500/60 transition-colors"
            >
              <div className="text-lg font-semibold text-zinc-100">{t.title}</div>
              <div className="text-sm text-zinc-500 mt-1">{t.desc}</div>
            </button>
          ))}
        </div>
      </PageShell>
    );
  }

  const tier = selectedTier ?? 'full';

  // ----- Screen 2: preset + saved loadout picker -----
  if (step === 'preset') {
    const presets = QUICK_PRESETS.filter((p) => p.tier === tier);
    const saved = savedLoadouts ?? [];
    const liftNames = (ids: string[]) =>
      ids.map((id) => liftById.get(id)?.name ?? id).join(' · ');
    return (
      <PageShell className="p-4 space-y-4">
        <button
          type="button"
          onClick={() => {
            setStep('tier');
            setSelectedTier(null);
            setConfirmDeleteLoadoutId(null);
          }}
          className="text-sm text-zinc-400 underline underline-offset-2"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">{TIER_NAMES[tier]}</h1>
          <p className="text-sm text-zinc-500 mt-1">Start from a preset or a saved loadout.</p>
        </div>

        <div className="space-y-2">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">Presets</div>
          <ul className="space-y-2">
            {presets.map((preset) => (
              <li key={preset.label}>
                <button
                  type="button"
                  onClick={() => {
                    resetCustomizeState([...preset.liftIds]);
                    setStep('customize');
                  }}
                  className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 hover:border-zinc-600 transition-colors"
                >
                  <div className="font-medium text-zinc-100">{preset.label}</div>
                  <div className="text-xs text-zinc-500 mt-0.5">{liftNames(preset.liftIds)}</div>
                </button>
              </li>
            ))}
          </ul>
        </div>

        {saved.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Saved</div>
            <ul className="space-y-2">
              {saved.map((loadout) => (
                <li
                  key={loadout.id}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <button
                    type="button"
                    onClick={() => selectLoadout(loadout)}
                    className="min-w-0 text-left flex-1"
                  >
                    <div className="font-medium text-zinc-100 truncate">{loadout.label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 truncate">
                      {liftNames(loadout.liftIds)}
                    </div>
                  </button>
                  {confirmDeleteLoadoutId === loadout.id ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-zinc-500">Delete?</span>
                      <button
                        type="button"
                        onClick={() => {
                          void deleteQuickLoadout(loadout.id);
                          setConfirmDeleteLoadoutId(null);
                        }}
                        className="h-8 px-2 rounded-lg bg-rose-900 text-rose-200 text-xs"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteLoadoutId(null)}
                        className="h-8 px-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteLoadoutId(loadout.id)}
                      aria-label={`Delete ${loadout.label}`}
                      className="shrink-0 h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center hover:text-rose-400 transition-colors"
                    >
                      −
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(complexes ?? []).length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-zinc-500 uppercase tracking-wider">Complexes</div>
            {(complexes ?? []).map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectComplex(c)}
                className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 active:bg-zinc-900"
              >
                <div className="font-medium text-zinc-100">{c.label}</div>
                <div className="text-xs text-zinc-400 font-mono">
                  {complexSummary(c.elements, (id) => (lifts ?? []).find((l) => l.id === id)?.name ?? id)}
                </div>
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            resetCustomizeState([...CUSTOM_DEFAULTS[tier]]);
            setStep('customize');
          }}
          className="w-full h-11 rounded-2xl border border-dashed border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors"
        >
          Custom — start from scratch
        </button>
      </PageShell>
    );
  }

  // ----- Screen 3: customize (pre-start) -----
  const tierDefaults = TIER_DEFAULTS[tier];
  const complexSnapLift = activeComplex?.elements[0]?.liftId;
  const complexSnappedWeight = complexSnapLift
    ? snapWorkingWeight(complexWeight, liftForSnap(complexSnapLift))
    : complexWeight;

  return (
    <PageShell className="p-4 space-y-4">
      <button
        type="button"
        onClick={() => {
          setActiveComplex(null);
          setStep('preset');
          setVariantIndex(null);
          setAddingSlot(false);
          setSavingLoadout(false);
        }}
        className="text-sm text-zinc-400 underline underline-offset-2"
      >
        ← Back
      </button>
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">
          {activeComplex?.label ?? TIER_HEADINGS[tier]}
        </h1>
        <p className="text-sm text-zinc-500 mt-1">
          {activeComplex ? 'Complex · shared bar weight · no progression' : 'Off-program, no progression.'}
        </p>
        {!activeComplex && (
          <p className="text-xs text-zinc-600 mt-0.5">
            {liftIds.length} movement{liftIds.length !== 1 ? 's' : ''} · max {QUICK_MAX_LIFTS} ·{' '}
            {tierDefaults.sets}×{tierDefaults.repMin}–{tierDefaults.repMax} default
          </p>
        )}
      </div>

      {activeComplex ? (
        <>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <div className="text-xs text-zinc-500">Bar weight</div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setComplexWeight((w) => Math.max(0, w - 5))}
                disabled={complexWeight <= 0}
                aria-label="Decrease bar weight"
                className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-lg flex items-center justify-center disabled:opacity-30"
              >
                −
              </button>
              <span className="font-mono text-lg text-zinc-100 w-16 text-center">
                {complexSnappedWeight}
              </span>
              <button
                type="button"
                onClick={() => setComplexWeight((w) => w + 5)}
                aria-label="Increase bar weight"
                className="h-10 w-10 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-lg flex items-center justify-center"
              >
                +
              </button>
              <span className="text-xs text-zinc-500">lb</span>
            </div>
          </div>

          <div className="space-y-2">
            {displayPrescriptions.map((p, i) => {
              const lift = liftById.get(p.liftId);
              if (!lift) return null;
              return (
                <div
                  key={`complex-prestart-${i}`}
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 flex items-center justify-between gap-2"
                >
                  <div className="font-medium text-zinc-100">{lift.name}</div>
                  <div className="text-sm text-zinc-500 font-mono">
                    × {p.repMin} @ {p.weight} lb
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
      <div className="space-y-3">
        {displayPrescriptions.map((p, i) => {
          const lift = liftById.get(p.liftId);
          if (!lift) return null;
          const snapped = snapWorkingWeight(p.weight, liftForSnap(p.liftId));
          const slotSets = p.sets;
          return (
            <div
              key={`quick-prestart-${i}`}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium text-zinc-100">{lift.name}</div>
                  <div className="text-sm text-zinc-500 mt-0.5">
                    {slotSets}×{p.repMin}–{p.repMax} @ {snapped}
                    {lift.loadUnit === 'lb' ? ' lb' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setSetsOverride((prev) => ({
                        ...prev,
                        [i]: Math.max(1, (prev[i] ?? p.sets) - 1),
                      }))
                    }
                    disabled={slotSets <= 1}
                    aria-label="Fewer sets"
                    className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-base flex items-center justify-center disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="font-mono text-sm text-zinc-200 w-4 text-center">{slotSets}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSetsOverride((prev) => ({
                        ...prev,
                        [i]: Math.min(5, (prev[i] ?? p.sets) + 1),
                      }))
                    }
                    disabled={slotSets >= 5}
                    aria-label="More sets"
                    className="h-8 w-8 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-base flex items-center justify-center disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setVariantIndex(i)}
                  className="flex-1 h-9 px-3 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300"
                >
                  {variantButtonLabel(p.liftId)}
                </button>
                {liftIds.length < QUICK_MAX_LIFTS && (
                  <button
                    type="button"
                    onClick={() => {
                      setLiftIds((prev) => {
                        const next = [...prev];
                        next.splice(i + 1, 0, prev[i]);
                        return next;
                      });
                      setSetsOverride((prev) => shiftSetsOverrideForInsert(prev, i + 1));
                    }}
                    aria-label={`Duplicate ${lift.name}`}
                    className="shrink-0 h-9 px-3 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-zinc-300"
                  >
                    Dup
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setLiftIds((prev) => prev.filter((_, idx) => idx !== i));
                    setSetsOverride((prev) => shiftSetsOverrideDown(prev, i));
                    setVariantIndex((vi) => {
                      if (vi === null) return null;
                      if (vi === i) return null;
                      if (vi > i) return vi - 1;
                      return vi;
                    });
                  }}
                  disabled={liftIds.length <= QUICK_MIN_LIFTS}
                  aria-label={`Remove ${lift.name}`}
                  className="shrink-0 h-9 w-9 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-400 flex items-center justify-center text-lg disabled:opacity-30 hover:text-rose-400 transition-colors"
                >
                  −
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {liftIds.length < QUICK_MAX_LIFTS && (
        <button
          type="button"
          onClick={() => setAddingSlot(true)}
          className="w-full h-11 rounded-2xl border border-dashed border-zinc-700 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-colors flex items-center justify-center gap-2"
        >
          <span className="text-lg leading-none">+</span>
          Add movement
        </button>
      )}

      {savingLoadout ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 space-y-2">
          <input
            type="text"
            value={loadoutLabel}
            onChange={(e) => setLoadoutLabel(e.target.value)}
            placeholder="Loadout name"
            aria-label="Loadout name"
            className="w-full h-10 rounded-lg bg-zinc-900 border border-zinc-700 px-3 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!loadoutLabel.trim()}
              onClick={() => void persistLoadout()}
              className="flex-1 h-10 rounded-lg bg-amber-500 text-zinc-950 text-sm font-medium disabled:opacity-40"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setSavingLoadout(false);
                setLoadoutLabel('');
              }}
              className="flex-1 h-10 rounded-lg bg-zinc-800 text-zinc-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSavingLoadout(true)}
          className="w-full h-10 rounded-xl border border-zinc-800 bg-zinc-900/50 text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-700 transition-colors"
        >
          Save loadout
        </button>
      )}
        </>
      )}

      <button
        type="button"
        onClick={() => void startSession()}
        className="w-full h-14 rounded-2xl bg-amber-500 text-zinc-950 font-semibold text-lg"
      >
        Start {TIER_HEADINGS[tier]}
      </button>

      {variantIndex != null && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/70"
            onClick={() => setVariantIndex(null)}
          />
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 max-h-[70dvh] flex flex-col">
            <div className="p-4 border-b border-zinc-800 shrink-0">
              <h3 className="text-lg font-semibold text-zinc-100">Choose variant</h3>
              <p className="text-xs text-zinc-500 mt-1">Session only — does not change your program.</p>
            </div>
            <div className="overflow-y-auto p-2 divide-y divide-zinc-800">
              {variantOptions.map((lift) => (
                <button
                  key={lift.id}
                  type="button"
                  onClick={() => {
                    setLiftIds((prev) => {
                      const next = [...prev];
                      next[variantIndex] = lift.id;
                      return next;
                    });
                    setSetsOverride((prev) => {
                      const next = { ...prev };
                      delete next[variantIndex];
                      return next;
                    });
                    setVariantIndex(null);
                  }}
                  className="w-full text-left px-3 py-3 text-sm text-zinc-200 hover:bg-zinc-900 rounded-lg"
                >
                  {lift.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {addingSlot && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:p-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-black/70"
            onClick={() => setAddingSlot(false)}
          />
          <div className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 max-h-[70dvh] flex flex-col">
            <div className="p-4 border-b border-zinc-800 shrink-0">
              <h3 className="text-lg font-semibold text-zinc-100">Add movement</h3>
              <p className="text-xs text-zinc-500 mt-1">Appended to the end of your quick session.</p>
            </div>
            <div className="overflow-y-auto p-2 divide-y divide-zinc-800">
              {addOptions.map((lift) => (
                <button
                  key={lift.id}
                  type="button"
                  onClick={() => {
                    setLiftIds((prev) => [...prev, lift.id]);
                    setAddingSlot(false);
                  }}
                  className="w-full text-left px-3 py-3 text-sm text-zinc-200 hover:bg-zinc-900 rounded-lg"
                >
                  {lift.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
