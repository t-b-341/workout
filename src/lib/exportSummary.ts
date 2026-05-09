import type { ExportSummary } from './exportModelSchema';
import {
  deriveProgramTargetText,
  type ProgramTargetStored,
  type SummaryProgramTarget,
} from './programExportTargets';
import {
  SET_INTENTS,
  type BodyweightLog,
  type Lift,
  type MindfulnessLog,
  type Prescription,
  type ReadinessLog,
  type SessionLog,
  type SetIntent,
  type SetLog,
} from './types';
import { deriveSessionStatus } from './sessionStatus';
import {
  bodyweightLbForSessionVolume,
  readinessBySessionId,
  strengthVolumeLbForSet,
} from './p1AssistedVolume';
import { mesocyclePosition, type MesocycleConfig } from './mesocycle';
import { est1RM, prFeed } from './stats';
import { todayIso } from './time';

function intentOf(s: SetLog): SetIntent {
  if (s.intent && (SET_INTENTS as readonly string[]).includes(s.intent)) return s.intent;
  return 'working';
}

function toProgramTargetStored(row: SummaryProgramTarget, currentValue: number | null): ProgramTargetStored {
  return {
    id: row.id,
    label: row.label,
    metric: row.metric,
    targetValue: row.targetValue,
    targetReps: row.targetReps,
    targetSets: row.targetSets,
    currentValue,
    unit: row.unit,
    liftId: row.liftId,
  };
}

/** Mean duration across mindfulness rows that logged minutes (> 0). */
function averageMindfulnessDurationMin(logs: MindfulnessLog[]): number | null {
  const vals = logs
    .map((m) => m.durationMin)
    .filter((m): m is number => m != null && Number.isFinite(m) && m > 0);
  if (vals.length === 0) return null;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return Math.round(avg * 10) / 10;
}

/**
 * Derive currentValue from logs when the export row has no manual current.
 * Used only inside `enrichProgramTargetsAtExport`.
 */
export function computeProgramTargetCurrentFromLogs(
  pt: SummaryProgramTarget,
  set_logs: SetLog[],
  prescriptions: Prescription[],
  mindfulness_logs: MindfulnessLog[],
): number | null {
  if (pt.metric === 'duration_min') {
    return averageMindfulnessDurationMin(mindfulness_logs);
  }

  const liftId = pt.liftId;
  if (!liftId) return null;

  const rxById = new Map(prescriptions.map((p) => [p.id, p]));
  const sets = set_logs.filter((s) => s.liftId === liftId && s.status === 'completed');

  switch (pt.metric) {
    case '1rm': {
      let maxTest = -Infinity;
      let maxSingle = -Infinity;
      let bestEst = -Infinity;
      for (const s of sets) {
        if (intentOf(s) === 'max_test' && Number.isFinite(s.weight) && s.weight > maxTest) {
          maxTest = s.weight;
        }
        if (s.reps === 1 && Number.isFinite(s.weight) && s.weight > maxSingle) {
          maxSingle = s.weight;
        }
        const intent = intentOf(s);
        if (
          intent === 'working' ||
          intent === 'backoff'
        ) {
          if (
            Number.isFinite(s.weight)
            && s.weight > 0
            && s.reps >= 2
            && s.reps <= 20
          ) {
            const e = est1RM(s.weight, s.reps);
            if (Number.isFinite(e) && e > bestEst) bestEst = e;
          }
        }
      }
      let best = -Infinity;
      if (maxTest > -Infinity) best = Math.max(best, maxTest);
      if (maxSingle > -Infinity) best = Math.max(best, maxSingle);
      if (bestEst > -Infinity) best = Math.max(best, bestEst);
      return best > -Infinity ? Math.round(best * 10) / 10 : null;
    }
    case 'working_set': {
      const passing: number[] = [];
      const fallback: number[] = [];
      for (const s of sets) {
        const intent = intentOf(s);
        if (intent !== 'working' && intent !== 'backoff') continue;
        const rx = rxById.get(s.prescriptionId);
        const repMin = rx?.repMin ?? 1;
        if (!Number.isFinite(s.weight)) continue;
        if (s.reps >= repMin) passing.push(s.weight);
        else fallback.push(s.weight);
      }
      const pool = passing.length > 0 ? passing : fallback;
      if (pool.length === 0) return null;
      return Math.max(...pool);
    }
    case 'reps': {
      let bestReps = -Infinity;
      for (const s of sets) {
        if (s.weight !== 0) continue;
        if (Number.isFinite(s.reps) && s.reps > bestReps) bestReps = s.reps;
      }
      return bestReps > -Infinity ? bestReps : null;
    }
    default:
      return null;
  }
}

/**
 * Fill `currentValue`, `currentValueSource`, and human `text` for export summary rows.
 * Does not overwrite a non-null finite currentValue (treated as manual).
 */
export function enrichProgramTargetsAtExport(
  rows: SummaryProgramTarget[],
  set_logs: SetLog[],
  prescriptions: Prescription[],
  mindfulness_logs: MindfulnessLog[],
): SummaryProgramTarget[] {
  const liftIdsForCompute = [
    ...new Set(
      rows
        .filter((row) => {
          const hasManual = row.currentValue != null && Number.isFinite(row.currentValue);
          if (hasManual) return false;
          return row.metric === 'duration_min' || (row.liftId != null && row.liftId !== '');
        })
        .map((row) => row.liftId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ].sort();
  console.log('[export programTargets] currentValue computation liftIds:', liftIdsForCompute);

  return rows.map((row) => {
    const hasManual =
      row.currentValue != null && Number.isFinite(row.currentValue);

    if (hasManual) {
      const cv = row.currentValue!;
      return {
        ...row,
        currentValue: cv,
        currentValueSource: 'manual',
        text: deriveProgramTargetText(toProgramTargetStored(row, cv)),
      };
    }

    const eligible =
      row.metric === 'duration_min' ||
      (row.liftId != null && row.liftId !== '');

    if (!eligible) {
      return {
        ...row,
        currentValue: null,
        currentValueSource: null,
        text: deriveProgramTargetText(toProgramTargetStored(row, null)),
      };
    }

    const computed = computeProgramTargetCurrentFromLogs(
      row,
      set_logs,
      prescriptions,
      mindfulness_logs,
    );

    if (computed != null && Number.isFinite(computed)) {
      return {
        ...row,
        currentValue: computed,
        currentValueSource: 'computed',
        text: deriveProgramTargetText(toProgramTargetStored(row, computed)),
      };
    }

    return {
      ...row,
      currentValue: null,
      currentValueSource: null,
      text: deriveProgramTargetText(toProgramTargetStored(row, null)),
    };
  });
}

function dateRangeFromIsoDates(dates: string[]): { start: string | null; end: string | null } {
  const sorted = [...dates].filter(Boolean).sort();
  if (sorted.length === 0) return { start: null, end: null };
  return { start: sorted[0]!, end: sorted[sorted.length - 1]! };
}

export function computeExportSummary(args: {
  exportedAtIso: string;
  session_logs: SessionLog[];
  set_logs: SetLog[];
  lifts: Lift[];
  readiness_logs: ReadinessLog[];
  bodyweight_logs: BodyweightLog[];
  /** Nutrition + other daily logs extend the visible calendar window. */
  extraDates?: string[];
  mesoConfig: MesocycleConfig;
  programTargets: SummaryProgramTarget[];
  prescriptions: Prescription[];
  mindfulness_logs: MindfulnessLog[];
  /** Optional mesocycle window for analysis (export UI); omitted → null in summary. */
  mesoStartDate?: string | null;
  mesoEndDate?: string | null;
}): ExportSummary {
  const {
    exportedAtIso,
    session_logs,
    set_logs,
    lifts,
    readiness_logs,
    bodyweight_logs,
    extraDates = [],
    mesoConfig,
    programTargets,
    prescriptions,
    mindfulness_logs,
    mesoStartDate,
    mesoEndDate,
  } = args;

  const enrichedProgramTargets = enrichProgramTargetsAtExport(
    programTargets,
    set_logs,
    prescriptions,
    mindfulness_logs,
  );

  const liftById = new Map(lifts.map((l) => [l.id, l]));
  const rxBySession = readinessBySessionId(readiness_logs);
  const sessionById = new Map(session_logs.map((s) => [s.id, s]));

  const setsBySessionId = new Map<string, SetLog[]>();
  for (const st of set_logs) {
    const arr = setsBySessionId.get(st.sessionLogId) ?? [];
    arr.push(st);
    setsBySessionId.set(st.sessionLogId, arr);
  }

  const ghostSessions: ExportSummary['ghostSessions'] = [];
  let sessionCount = 0;
  for (const s of session_logs) {
    const status = deriveSessionStatus(s, prescriptions, setsBySessionId.get(s.id) ?? []);
    if (status === 'ghost') {
      ghostSessions.push({ sessionId: s.id, date: s.date, templateId: s.templateId });
    } else {
      sessionCount += 1;
    }
  }

  let totalVolumeLbReps = 0;
  for (const st of set_logs) {
    const session = sessionById.get(st.sessionLogId);
    if (!session) continue;
    const bw = bodyweightLbForSessionVolume(session, rxBySession.get(session.id), bodyweight_logs);
    totalVolumeLbReps += strengthVolumeLbForSet(st, liftById.get(st.liftId), bw);
  }

  const prFlags: ExportSummary['prFlags'] = prFeed(set_logs, session_logs, lifts).map((p) => ({
    liftId: p.liftId,
    liftName: p.liftName,
    weight: p.weight,
    reps: p.reps,
    date: p.date,
    sessionId: p.sessionLogId,
    prType: p.prType,
  }));

  const dates = [
    ...session_logs.map((s) => s.date),
    ...set_logs.map((s) => sessionById.get(s.sessionLogId)?.date).filter((d): d is string => !!d),
    ...extraDates,
  ];
  const { start, end } = dateRangeFromIsoDates(dates);

  const pos = mesocyclePosition(todayIso(), mesoConfig);
  const activePhaseName =
    pos == null ? null : pos.isDeload ? 'deload' : 'accumulation';
  const activePhaseWeek = pos == null ? null : pos.weekInMeso;

  const ms = mesoStartDate?.trim();
  const me = mesoEndDate?.trim();
  const mesoStartNorm =
    ms && /^\d{4}-\d{2}-\d{2}$/.test(ms) ? ms : null;
  const mesoEndNorm =
    me && /^\d{4}-\d{2}-\d{2}$/.test(me) ? me : null;

  return {
    exportedAt: exportedAtIso,
    dateRange: { start, end },
    sessionCount,
    ghostSessions,
    totalSets: set_logs.length,
    totalVolumeLbReps,
    prFlags,
    activePhaseName,
    activePhaseWeek,
    programTargets: enrichedProgramTargets,
    mesoStartDate: mesoStartNorm,
    mesoEndDate: mesoEndNorm,
  };
}
