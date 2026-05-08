import type { ExportSummary } from './exportModelSchema';
import type { SummaryProgramTarget } from './programExportTargets';
import type { BodyweightLog, Lift, ReadinessLog, SessionLog, SetLog } from './types';
import {
  bodyweightLbForSessionVolume,
  readinessBySessionId,
  strengthVolumeLbForSet,
} from './p1AssistedVolume';
import { mesocyclePosition, type MesocycleConfig } from './mesocycle';
import { todayIso } from './time';
import { SET_INTENTS, type SetIntent } from './types';

function intentOf(s: SetLog): SetIntent {
  if (s.intent && (SET_INTENTS as readonly string[]).includes(s.intent)) return s.intent;
  return 'working';
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
    mesoStartDate,
    mesoEndDate,
  } = args;

  const liftById = new Map(lifts.map((l) => [l.id, l]));
  const rxBySession = readinessBySessionId(readiness_logs);
  const sessionById = new Map(session_logs.map((s) => [s.id, s]));

  let totalVolumeLbReps = 0;
  for (const st of set_logs) {
    const session = sessionById.get(st.sessionLogId);
    if (!session) continue;
    const bw = bodyweightLbForSessionVolume(session, rxBySession.get(session.id), bodyweight_logs);
    totalVolumeLbReps += strengthVolumeLbForSet(st, liftById.get(st.liftId), bw);
  }

  const prFlags: ExportSummary['prFlags'] = [];
  for (const st of set_logs) {
    if (intentOf(st) !== 'max_test') continue;
    if (st.status !== 'completed') continue;
    const session = sessionById.get(st.sessionLogId);
    if (!session) continue;
    prFlags.push({
      liftId: st.liftId,
      liftName: liftById.get(st.liftId)?.name ?? st.liftId,
      weight: st.weight,
      reps: st.reps,
      date: session.date,
      sessionId: session.id,
    });
  }

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
    sessionCount: session_logs.length,
    totalSets: set_logs.length,
    totalVolumeLbReps,
    prFlags,
    activePhaseName,
    activePhaseWeek,
    programTargets,
    mesoStartDate: mesoStartNorm,
    mesoEndDate: mesoEndNorm,
  };
}
