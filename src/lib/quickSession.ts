import { QUICK_DEFAULT_LIFT_IDS } from './seed';
import { mostRecentWorkingWeight } from './stats';
import { localDelete, localUpsert } from './sync';
import type {
  Prescription,
  QuickLoadout,
  QuickSessionTier,
  SessionLog,
  SetLog,
} from './types';

export const QUICK_MIN_LIFTS = 1;
export const QUICK_MAX_LIFTS = 8;

// Retained for backwards compatibility; `full` tier defaults mirror these.
const QUICK_SETS = 1;
const QUICK_REP_MIN = 1;
const QUICK_REP_MAX = 2;

/** Per-tier set/rep defaults for synthetic quick prescriptions. */
export const TIER_DEFAULTS: Record<QuickSessionTier, { sets: number; repMin: number; repMax: number }> = {
  coffee:  { sets: 1, repMin: 1, repMax: 2 },
  top_set: { sets: 2, repMin: 1, repMax: 3 },
  full:    { sets: QUICK_SETS, repMin: QUICK_REP_MIN, repMax: QUICK_REP_MAX },
};

/**
 * Build synthetic Prescription objects for a quick session.
 * Weight comes from mostRecentWorkingWeight(); falls back to
 * prescriptionFallback map (current prescription weights).
 * These are never stored in the DB — runtime only.
 */
export function buildQuickPrescriptions(
  liftIds: string[],
  allSets: SetLog[],
  allSessions: SessionLog[],
  prescriptionFallback: Map<string, number>,
  tier: QuickSessionTier = 'full',
): Prescription[] {
  const defaults = TIER_DEFAULTS[tier];
  return liftIds.map((liftId, i) => {
    const recent = mostRecentWorkingWeight(liftId, allSets, allSessions);
    const weight = recent ?? prescriptionFallback.get(liftId) ?? 0;
    return {
      id: `quick-${liftId}`,
      templateId: 'QUICK',
      liftId,
      order: i,
      weight,
      sets: defaults.sets,
      repMin: defaults.repMin,
      repMax: defaults.repMax,
      notes: 'Quick session — singles or doubles',
    };
  });
}

export type QuickPreset = {
  label: string;
  tier: QuickSessionTier;
  liftIds: string[];
};

export const QUICK_PRESETS: QuickPreset[] = [
  // Coffee presets — single movement, fast setup
  { label: 'OHP', tier: 'coffee', liftIds: ['ohp'] },
  { label: 'Bench', tier: 'coffee', liftIds: ['bp'] },
  { label: 'Push Press', tier: 'coffee', liftIds: ['pp'] },
  { label: 'Squat', tier: 'coffee', liftIds: ['back_squat'] },
  { label: 'Deadlift', tier: 'coffee', liftIds: ['dl'] },
  { label: 'Row', tier: 'coffee', liftIds: ['bbr'] },
  // Top Set presets — 2-3 movements
  { label: 'Upper — Press + Row', tier: 'top_set', liftIds: ['bp', 'bbr'] },
  { label: 'Upper — OHP + Row', tier: 'top_set', liftIds: ['ohp', 'bbr'] },
  { label: 'Upper — PP + Row', tier: 'top_set', liftIds: ['pp', 'bbr'] },
  { label: 'Lower — Squat + DL', tier: 'top_set', liftIds: ['back_squat', 'dl'] },
  { label: 'Lower — Squat only', tier: 'top_set', liftIds: ['back_squat'] },
  { label: 'Lower — DL only', tier: 'top_set', liftIds: ['dl'] },
  // Full presets
  { label: 'Upper — Full Press Day', tier: 'full', liftIds: ['bp', 'ohp', 'bbr'] },
  { label: 'Lower — Full Lower Day', tier: 'full', liftIds: ['back_squat', 'dl', 'rdl'] },
  { label: 'Default', tier: 'full', liftIds: [...QUICK_DEFAULT_LIFT_IDS] },
];

// Movement families — variant picker shows only family members for that lift.
// Falls back to full QUICK_SWAP_LIFT_IDS list for lifts not in any family.
export const MOVEMENT_FAMILIES: Record<string, string[]> = {
  // Bench family
  bp:        ['bp', 'bp_paused', 'wgbp', 'cgbp'],
  bp_paused: ['bp', 'bp_paused', 'wgbp', 'cgbp'],
  wgbp:      ['bp', 'bp_paused', 'wgbp', 'cgbp'],
  cgbp:      ['bp', 'bp_paused', 'wgbp', 'cgbp'],
  // Press family
  ohp:       ['ohp', 'pp', 'wgohp', 'btn_press'],
  pp:        ['ohp', 'pp', 'wgohp', 'btn_press'],
  wgohp:     ['ohp', 'pp', 'wgohp', 'btn_press'],
  btn_press: ['ohp', 'pp', 'wgohp', 'btn_press'],
  // Squat family
  back_squat:   ['back_squat', 'pause_squat', 'front_squat', 'bss'],
  pause_squat:  ['back_squat', 'pause_squat', 'front_squat', 'bss'],
  front_squat:  ['back_squat', 'pause_squat', 'front_squat', 'bss'],
  bss:          ['back_squat', 'pause_squat', 'front_squat', 'bss'],
  // Hinge family
  dl:          ['dl', 'deficit_dl', 'rdl'],
  deficit_dl:  ['dl', 'deficit_dl', 'rdl'],
  rdl:         ['dl', 'deficit_dl', 'rdl'],
  // Row family
  bbr:          ['bbr', 'pendlay_row', 'deficit_bbr'],
  pendlay_row:  ['bbr', 'pendlay_row', 'deficit_bbr'],
  deficit_bbr:  ['bbr', 'pendlay_row', 'deficit_bbr'],
};

export async function saveQuickLoadout(
  loadout: Omit<QuickLoadout, 'updatedAt'>,
): Promise<void> {
  await localUpsert('quick_loadouts', {
    ...loadout,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteQuickLoadout(id: string): Promise<void> {
  await localDelete('quick_loadouts', id, { undoLabel: 'Loadout' });
}

export function newLoadoutId(): string {
  return `ql-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export { QUICK_DEFAULT_LIFT_IDS };
