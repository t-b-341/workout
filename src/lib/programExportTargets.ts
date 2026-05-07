'use client';

import { getDb } from './db';

export const PROGRAM_TARGET_METRICS = [
  '1rm',
  'working_set',
  'reps',
  'bodyweight',
  'duration_min',
] as const;
export type ProgramTargetMetric = (typeof PROGRAM_TARGET_METRICS)[number];

export const PROGRAM_TARGET_UNITS = ['lb', 'reps', 'min', 'none'] as const;
export type ProgramTargetUnit = (typeof PROGRAM_TARGET_UNITS)[number];

/** Authoring / Dexie payload — numeric source of truth; `text` is derived at export only. */
export type ProgramTargetStored = {
  id: string;
  label: string;
  metric: ProgramTargetMetric;
  targetValue: number | null;
  targetReps: number | null;
  targetSets: number | null;
  currentValue: number | null;
  unit: ProgramTargetUnit;
  liftId: string | null;
};

/** Serialized row in JSON export (`summary.programTargets`) — explicit nulls. */
export type SummaryProgramTarget = {
  id: string;
  label: string;
  text: string;
  metric: ProgramTargetMetric;
  targetValue: number | null;
  targetReps: number | null;
  targetSets: number | null;
  currentValue: number | null;
  unit: ProgramTargetUnit;
  liftId: string | null;
};

export const PROGRAM_TARGETS_META_KEY = 'export:programTargets:v2';

function isMetric(v: unknown): v is ProgramTargetMetric {
  return typeof v === 'string' && (PROGRAM_TARGET_METRICS as readonly string[]).includes(v);
}

function isUnit(v: unknown): v is ProgramTargetUnit {
  return typeof v === 'string' && (PROGRAM_TARGET_UNITS as readonly string[]).includes(v);
}

export function deriveProgramTargetText(p: ProgramTargetStored): string {
  const tv = p.targetValue;
  const cv = p.currentValue;
  const tr = p.targetReps;
  const ts = p.targetSets;
  const w = (n: number | null | undefined) =>
    n != null && Number.isFinite(n) ? String(n) : '?';

  switch (p.id) {
    case 'bp_pause': {
      const cur = cv != null ? ` (current: ${cv})` : '';
      return `BP(P) - ${w(tv)}#${cur}`;
    }
    case 'bp_tng': {
      const cur = cv != null ? ` (current: ${cv})` : '';
      return `BP(TNG) - ${w(tv)}#${cur}`;
    }
    case 'cgbp':
      return `CGBP - ${w(tv)}x${w(tr)}`;
    case 'wgbp':
      return `WGBP - ${w(tv)}x${w(tr)}`;
    case 'ohp': {
      const cur = cv != null ? ` (current ${cv})` : '';
      return `OHP - ${w(tv)}#${cur}`;
    }
    case 'pp_barbell': {
      const cur = cv != null ? ` (current ${cv})` : '';
      return `PP - ${w(tv)}#${cur}`;
    }
    case 'pp_bodyweight':
      return `PP - bodyweight (eventually ${w(tv)})`;
    case 'p1_bw_reps': {
      const cur = cv != null ? ` (current ${cv})` : '';
      return `P1 - BW x ${w(tv)}${cur}`;
    }
    case 'p1_negative': {
      const cur = cv != null ? ` (current ${cv} lbs)` : '';
      return `P1#(e)- ${w(tv)}# negative${cur}`;
    }
    case 'p1_weighted':
      return `P1# - ${w(tv)}#x${w(tr)}`;
    case 'bbr': {
      const cur = cv != null ? ` (current ${cv}x5)` : '';
      return `BBR - ${w(tv)}x${w(tr)}${cur}`;
    }
    case 'dl': {
      const cur = cv != null ? ` (current ${cv})` : '';
      return `DL - ${w(tv)}#${cur}`;
    }
    case 'rdl':
      return `RDL - ${w(tv)}#x${w(tr)}`;
    case 'bs': {
      const cur = cv != null ? ` (current ${cv})` : '';
      return `BS - ${w(tv)}#${cur}`;
    }
    case 'bs_pause':
      return `BS(P) - ${w(tv)}#`;
    case 'fs':
      return `FS - ${w(tv)}#`;
    case 'bss':
      return `BSS - ${w(tv)}#x${w(tr)} L/R `;
    case 'bodyweight': {
      const cur = cv != null ? ` (current ~${cv})` : '';
      return `BW - ${w(tv)}#${cur}`;
    }
    case 'mindfulness':
      return `Mindfulness - ${w(tv)} minutes per day`;
    case 'bc':
      return `BC - ${w(tv)}x${w(ts)}x${w(tr)}`;
    case 'ur':
      return `UR - ${w(tv)}x${w(ts)}x${w(tr)}`;
    default: {
      let cur = '';
      if (cv != null) {
        cur =
          p.metric === 'bodyweight' && p.unit === 'lb'
            ? ` (current ~${cv})`
            : ` (current: ${cv})`;
      }
      if (p.metric === 'duration_min') {
        return `${p.label} - ${w(tv)} minutes per day${cur}`;
      }
      if (p.metric === 'reps' && p.unit === 'reps') {
        return `${p.label} - target ${w(tv)} reps${cur}`;
      }
      if (p.metric === 'working_set' && tr != null && ts != null) {
        return `${p.label} - ${w(tv)}x${ts}x${tr}${cur}`;
      }
      if (p.metric === 'working_set' && tr != null) {
        return `${p.label} - ${w(tv)}x${tr}${cur}`;
      }
      if (p.metric === '1rm' && tv != null) {
        return `${p.label} - ${tv}#${cur}`;
      }
      return p.label;
    }
  }
}

export function programTargetToExportRow(p: ProgramTargetStored): SummaryProgramTarget {
  return {
    id: p.id,
    label: p.label,
    text: deriveProgramTargetText(p),
    metric: p.metric,
    targetValue: p.targetValue ?? null,
    targetReps: p.targetReps ?? null,
    targetSets: p.targetSets ?? null,
    currentValue: p.currentValue ?? null,
    unit: p.unit,
    liftId: p.liftId ?? null,
  };
}

export const DEFAULT_PROGRAM_TARGETS_STORED: readonly ProgramTargetStored[] = [
  {
    id: 'bp_pause',
    label: 'BP(P)',
    metric: '1rm',
    targetValue: 225,
    targetReps: null,
    targetSets: null,
    currentValue: 205,
    unit: 'lb',
    liftId: 'bp_paused',
  },
  {
    id: 'bp_tng',
    label: 'BP(TNG)',
    metric: '1rm',
    targetValue: 245,
    targetReps: null,
    targetSets: null,
    currentValue: 225,
    unit: 'lb',
    liftId: 'bp',
  },
  {
    id: 'cgbp',
    label: 'CGBP',
    metric: 'working_set',
    targetValue: 185,
    targetReps: 10,
    targetSets: null,
    currentValue: null,
    unit: 'lb',
    liftId: 'cgbp',
  },
  {
    id: 'wgbp',
    label: 'WGBP',
    metric: 'working_set',
    targetValue: 185,
    targetReps: 10,
    targetSets: null,
    currentValue: null,
    unit: 'lb',
    liftId: 'wgbp',
  },
  {
    id: 'ohp',
    label: 'OHP',
    metric: '1rm',
    targetValue: 155,
    targetReps: null,
    targetSets: null,
    currentValue: 140,
    unit: 'lb',
    liftId: 'ohp',
  },
  {
    id: 'pp_barbell',
    label: 'PP',
    metric: '1rm',
    targetValue: 185,
    targetReps: null,
    targetSets: null,
    currentValue: 175,
    unit: 'lb',
    liftId: 'pp',
  },
  {
    id: 'pp_bodyweight',
    label: 'PP (BW)',
    metric: 'working_set',
    targetValue: 200,
    targetReps: null,
    targetSets: null,
    currentValue: null,
    unit: 'lb',
    liftId: null,
  },
  {
    id: 'p1_bw_reps',
    label: 'P1',
    metric: 'reps',
    targetValue: 10,
    targetReps: null,
    targetSets: null,
    currentValue: 4,
    unit: 'reps',
    liftId: 'p1_bw',
  },
  {
    id: 'p1_negative',
    label: 'P1#(e)',
    metric: 'working_set',
    targetValue: 45,
    targetReps: null,
    targetSets: null,
    currentValue: 10,
    unit: 'lb',
    liftId: 'p1_eccentric',
  },
  {
    id: 'p1_weighted',
    label: 'P1#',
    metric: 'working_set',
    targetValue: 25,
    targetReps: 3,
    targetSets: null,
    currentValue: null,
    unit: 'lb',
    liftId: 'p1_assisted',
  },
  {
    id: 'bbr',
    label: 'BBR',
    metric: 'working_set',
    targetValue: 225,
    targetReps: 4,
    targetSets: null,
    currentValue: 200,
    unit: 'lb',
    liftId: 'bbr',
  },
  {
    id: 'dl',
    label: 'DL',
    metric: '1rm',
    targetValue: 450,
    targetReps: null,
    targetSets: null,
    currentValue: 435,
    unit: 'lb',
    liftId: 'dl',
  },
  {
    id: 'rdl',
    label: 'RDL',
    metric: 'working_set',
    targetValue: 275,
    targetReps: 8,
    targetSets: null,
    currentValue: null,
    unit: 'lb',
    liftId: 'rdl',
  },
  {
    id: 'bs',
    label: 'BS',
    metric: '1rm',
    targetValue: 350,
    targetReps: null,
    targetSets: null,
    currentValue: 335,
    unit: 'lb',
    liftId: 'back_squat',
  },
  {
    id: 'bs_pause',
    label: 'BS(P)',
    metric: '1rm',
    targetValue: 315,
    targetReps: null,
    targetSets: null,
    currentValue: null,
    unit: 'lb',
    liftId: 'back_squat_paused',
  },
  {
    id: 'fs',
    label: 'FS',
    metric: '1rm',
    targetValue: 185,
    targetReps: null,
    targetSets: null,
    currentValue: null,
    unit: 'lb',
    liftId: 'front_squat',
  },
  {
    id: 'bss',
    label: 'BSS',
    metric: 'working_set',
    targetValue: 65,
    targetReps: 8,
    targetSets: null,
    currentValue: null,
    unit: 'lb',
    liftId: 'bss',
  },
  {
    id: 'bodyweight',
    label: 'BW',
    metric: 'bodyweight',
    targetValue: 200,
    targetReps: null,
    targetSets: null,
    currentValue: 245,
    unit: 'lb',
    liftId: null,
  },
  {
    id: 'mindfulness',
    label: 'Mindfulness',
    metric: 'duration_min',
    targetValue: 3,
    targetReps: null,
    targetSets: null,
    currentValue: null,
    unit: 'min',
    liftId: null,
  },
  {
    id: 'bc',
    label: 'BC',
    metric: 'working_set',
    targetValue: 65,
    targetReps: 10,
    targetSets: 4,
    currentValue: null,
    unit: 'lb',
    liftId: 'supinated_barbell_curls',
  },
  {
    id: 'ur',
    label: 'UR',
    metric: 'working_set',
    targetValue: 75,
    targetReps: 10,
    targetSets: 4,
    currentValue: null,
    unit: 'lb',
    liftId: 'ubr',
  },
];

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

/** Merge partial row from meta over defaults — keeps omitted fields defaulted for known IDs. */
export function normalizeProgramTargetStored(
  partial: Partial<ProgramTargetStored> & { id?: string },
  fallback?: ProgramTargetStored,
): ProgramTargetStored | null {
  const id = String(partial.id ?? '').trim();
  if (!id) return null;
  const base = fallback ??
    DEFAULT_PROGRAM_TARGETS_STORED.find((d) => d.id === id) ?? {
      id,
      label: id,
      metric: '1rm' as ProgramTargetMetric,
      targetValue: null,
      targetReps: null,
      targetSets: null,
      currentValue: null,
      unit: 'lb' as ProgramTargetUnit,
      liftId: null,
    };
  return {
    id,
    label: typeof partial.label === 'string' && partial.label.trim() ? partial.label.trim() : base.label,
    metric: isMetric(partial.metric) ? partial.metric : base.metric,
    targetValue: numOrNull(partial.targetValue) ?? base.targetValue,
    targetReps: numOrNull(partial.targetReps) ?? base.targetReps,
    targetSets: numOrNull(partial.targetSets) ?? base.targetSets,
    currentValue: numOrNull(partial.currentValue) ?? base.currentValue,
    unit: isUnit(partial.unit) ? partial.unit : base.unit,
    liftId:
      partial.liftId === null || partial.liftId === ''
        ? null
        : typeof partial.liftId === 'string' && partial.liftId.trim()
          ? partial.liftId.trim()
          : base.liftId,
  };
}

function isLegacyTextOnlyProgramTargets(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return false;
  const a = raw[0];
  if (!a || typeof a !== 'object') return false;
  const o = a as Record<string, unknown>;
  return 'text' in o && typeof o.text === 'string' && !('metric' in o);
}

export async function loadProgramTargetsStored(): Promise<ProgramTargetStored[]> {
  const row = await getDb().meta.get(PROGRAM_TARGETS_META_KEY);
  const raw = row?.value;
  if (isLegacyTextOnlyProgramTargets(raw)) {
    await getDb().meta.delete(PROGRAM_TARGETS_META_KEY);
    return DEFAULT_PROGRAM_TARGETS_STORED.map((x) => ({ ...x }));
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_PROGRAM_TARGETS_STORED.map((x) => ({ ...x }));
  }
  const out: ProgramTargetStored[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = String((item as { id?: string }).id ?? '').trim();
    if (!id) continue;
    const fallback = DEFAULT_PROGRAM_TARGETS_STORED.find((d) => d.id === id);
    const merged = normalizeProgramTargetStored(item as Partial<ProgramTargetStored>, fallback);
    if (merged) out.push(merged);
  }
  if (out.length === 0) {
    return DEFAULT_PROGRAM_TARGETS_STORED.map((x) => ({ ...x }));
  }
  return out;
}

export async function saveProgramTargetsStored(rows: ProgramTargetStored[]): Promise<void> {
  await getDb().meta.put({ key: PROGRAM_TARGETS_META_KEY, value: rows });
}

export async function loadExportProgramTargetsForSummary(): Promise<SummaryProgramTarget[]> {
  const stored = await loadProgramTargetsStored();
  return stored.map(programTargetToExportRow);
}
