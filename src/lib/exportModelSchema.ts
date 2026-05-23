import type { DirtyRow } from './db';

/**
 * JSON export top-level `schemaVersion` — bump when new top-level export fields or shapes ship
 * (independent of Dexie `SCHEMA_VERSION`).
 */
export const EXPORT_SCHEMA_VERSION = 20;
import {
  NUTRITION_DAY_TYPES,
  SESSION_LABEL_TYPES,
  SET_INTENTS,
} from './types';
import {
  PROGRAM_TARGET_METRICS,
  PROGRAM_TARGET_UNITS,
  type SummaryProgramTarget,
} from './programExportTargets';

export type { SummaryProgramTarget } from './programExportTargets';
export type { MesoAnalysisReport } from './mesoAnalysis';

export type ExportedFitnessGoal = {
  id: string;
  text: string;
  category: 'long-term' | 'current';
  metric: string | null;
  target: number | null;
  unit: string | null;
  direction: 'above' | 'below' | 'exact' | null;
};

export type LiftingGoalSnapshot = {
  goalId: string;
  label: string;
  liftId: string;
  targetValue: number;
  targetReps: number | null;
  currentValue: number;
  pct: number;
  lbsToGo: number | null;
  repsToGo: number | null;
  done: boolean;
  type: 'main' | 'accessory';
};

export type ExportSummary = {
  exportedAt: string;
  dateRange: { start: string | null; end: string | null };
  sessionCount: number;
  /** Sessions with zero set_logs (excluded from sessionCount and meso aggregates). */
  ghostSessions: Array<{ sessionId: string; date: string; templateId: string }>;
  totalSets: number;
  totalVolumeLbReps: number;
  prFlags: Array<{
    liftId: string;
    liftName: string;
    weight: number;
    reps: number;
    date: string;
    sessionId: string;
    prType: '1rm' | 'rep_pr' | 'volume_pr';
  }>;
  activePhaseName: 'accumulation' | 'deload' | null;
  activePhaseWeek: number | null;
  /** Canonical training targets / notes bundled with computed summary stats (see `programExportTargets.ts`). */
  programTargets: SummaryProgramTarget[];
  /** Mesocycle window chosen at export for mesoAnalysis (optional). */
  mesoStartDate: string | null;
  mesoEndDate: string | null;
};

const joinEnums = (arr: readonly string[]) => arr.join(' | ');

type SchemaEntry = { fields: Record<string, string> };

function dirtyRowFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      table: 'string (sync table name)',
      rowId: 'string',
      op: '"upsert" | "delete"',
      enqueuedAt: 'number (ms)',
    },
  };
}

function exportedGoalFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      text: 'string',
      category: '"long-term" | "current"',
      metric: 'string | null',
      target: 'number | null',
      unit: 'string | null',
      direction: '"above" | "below" | "exact" | null',
    },
  };
}

function summarySchema(): SchemaEntry {
  return {
    fields: {
      exportedAt: 'string (ISO-8601)',
      'dateRange.start': 'YYYY-MM-DD | null',
      'dateRange.end': 'YYYY-MM-DD | null',
      sessionCount: 'number',
      'ghostSessions[].sessionId': 'string',
      'ghostSessions[].date': 'YYYY-MM-DD',
      'ghostSessions[].templateId': 'TemplateId',
      totalSets: 'number',
      totalVolumeLbReps: 'number',
      'prFlags[].liftId': 'string',
      'prFlags[].liftName': 'string',
      'prFlags[].weight': 'number',
      'prFlags[].reps': 'number',
      'prFlags[].date': 'YYYY-MM-DD',
      'prFlags[].sessionId': 'string',
      'prFlags[].prType': joinEnums(['1rm', 'rep_pr', 'volume_pr']),
      activePhaseName: `${joinEnums(['accumulation', 'deload'])} | null`,
      activePhaseWeek: 'number | null',
      'programTargets[].id': 'string',
      'programTargets[].label': 'string',
      'programTargets[].text': 'string (derived for humans)',
      'programTargets[].metric': joinEnums(PROGRAM_TARGET_METRICS),
      'programTargets[].targetValue': 'number | null',
      'programTargets[].targetReps': 'number | null',
      'programTargets[].targetSets': 'number | null',
      'programTargets[].currentValue': 'number | null',
      'programTargets[].currentValueSource': '"manual" | "computed" | null',
      'programTargets[].unit': joinEnums(PROGRAM_TARGET_UNITS),
      'programTargets[].liftId': 'string | null (lifts[].id)',
      mesoStartDate: 'YYYY-MM-DD | null',
      mesoEndDate: 'YYYY-MM-DD | null',
    },
  };
}

function mesoAnalysisFields(): SchemaEntry {
  return {
    fields: {
      generatedAt: 'ISO-8601',
      windowStart: 'YYYY-MM-DD',
      windowEnd: 'YYYY-MM-DD',
      volumeProgression: 'array | null',
      'volumeProgression[].primaryTemplateId': 'TemplateId | null (template used for load trend / loadDelta)',
      targetDeltas: 'array | null',
      completionRates: 'array | null',
      intentBreakdown: 'object | null',
      nutritionAdherence: 'object | null',
      bodyweightTrend: 'object | null',
      bodyMeasurementDelta: 'object | null',
      'bodyMeasurementDelta.protocolConsistent': 'boolean',
      'bodyMeasurementDelta.protocol': 'string | null',
      'bodyMeasurementDelta.measurementCount': 'number',
      'bodyMeasurementDelta.firstDate': 'YYYY-MM-DD | null',
      'bodyMeasurementDelta.lastDate': 'YYYY-MM-DD | null',
      'bodyMeasurementDelta.waistDeltaIn': 'number | null',
      'bodyMeasurementDelta.abdomenDeltaIn': 'number | null',
      'bodyMeasurementDelta.hipsDeltaIn': 'number | null',
      'bodyMeasurementDelta.reliabilityNote': 'string | null',
      wellnessCorrelations: 'object | null',
      'wellnessCorrelations.lowSleepQualitySessionCompletion': '{ sessions, avgCompletionPct }',
      'wellnessCorrelations.highSleepQualitySessionCompletion': '{ sessions, avgCompletionPct }',
      'wellnessCorrelations.highStressSessionCompletion': '{ sessions, avgCompletionPct }',
      'wellnessCorrelations.highMotivationSessionCompletion':
        '{ sessions, avgCompletionPct } (readiness motivation ≥ 4 same session)',
      'wellnessCorrelations.lowMotivationSessionCompletion':
        '{ sessions, avgCompletionPct } (readiness motivation ≤ 2 same session)',
      'injuryFlags[].date': 'YYYY-MM-DD',
      'injuryFlags[].sessionId': 'string',
      'injuryFlags[].sessionType': 'string',
      'injuryFlags[].flag': '"injury_episode" | "abbreviated" | "note_keyword" | "high_skip_rate"',
      'injuryFlags[].affectedSite': 'string | null',
      'injuryFlags[].liftId': 'string | null',
      'injuryFlags[].liftName': 'string | null',
      'injuryFlags[].detail': 'string',
      mindfulnessAdherence: 'object | null',
      repRangeCompliance: 'array | null',
      'repRangeCompliance[].templateId': 'TemplateId',
      'repRangeCompliance[].liftId': 'string',
      'repRangeCompliance[].liftName': 'string',
      'repRangeCompliance[].prescribedMin': 'number',
      'repRangeCompliance[].prescribedMax': 'number',
      'repRangeCompliance[].avgActualReps': 'number',
      'repRangeCompliance[].compliancePct': 'number (working sets within prescription rep range)',
      'repRangeCompliance[].belowRangeSets': 'number',
      'repRangeCompliance[].aboveRangeSets': 'number',
      'repRangeCompliance[].note': 'string | null',
      prescriptionDivergence: 'array | null',
      'prescriptionDivergence[].liftId': 'string',
      'prescriptionDivergence[].liftName': 'string',
      'prescriptionDivergence[].prescribedWeight': 'number (lb, mean across working sets in full export)',
      'prescriptionDivergence[].avgActualWeight': 'number',
      'prescriptionDivergence[].divergenceLb': 'number',
      'prescriptionDivergence[].divergencePct': 'number',
      'prescriptionDivergence[].direction': '"over" | "under"',
      'prescriptionDivergence[].sessionsLogged': 'number',
      'prescriptionDivergence[].suggestPrescriptionUpdate': 'boolean',
      liftRecommendations: 'array | null',
      sectionNullNotes: 'Record<section, string> | undefined',
    },
  };
}

function liftFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      name: 'string',
      equipment: 'Equipment enum',
      loadUnit: 'LoadUnit enum',
      repUnit: 'RepUnit enum',
      increment: 'number',
      loadScale: '"normal" | "inverse" | undefined (defaults to "normal")',
      notes: 'string | undefined',
      muscleGroups: 'MuscleGroup[] | undefined',
      pattern: 'MovementPattern | undefined',
    },
  };
}

function templateFields(): SchemaEntry {
  return {
    fields: {
      id: 'TemplateId',
      name: 'string',
      dayOfWeek: 'number (0 Sun … 6 Sat)',
      group: '"upper" | "lower"',
      intensity: '"heavy" | "light" | "moderate"',
    },
  };
}

function prescriptionFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      templateId: 'TemplateId',
      liftId: 'string',
      order: 'number',
      weight: 'number',
      sets: 'number',
      repMin: 'number',
      repMax: 'number',
      increment: 'number | undefined',
      perSide: 'boolean | undefined',
      tempo: 'string | undefined',
      notes: 'string | undefined',
    },
  };
}

function sessionLogFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      date: 'YYYY-MM-DD',
      templateId: 'TemplateId',
      mode: '"standard" | "light" | "skip"',
      deload: 'boolean',
      sessionType: joinEnums(SESSION_LABEL_TYPES),
      reason: 'string | undefined',
      watchFlags: 'WatchFlag[]',
      notes: 'string | undefined',
      startedAt: 'ISO timestamp | undefined',
      completedAt: 'ISO timestamp | undefined',
      workoutPausedAccumMs: 'number | undefined',
      workoutPausedAt: 'ISO timestamp | undefined',
      effortScale: '-1 | 0 | 1 | undefined',
      readinessCompletedAt: 'ISO timestamp | undefined',
      tags: 'SessionStrategyTagId[] | undefined',
      sessionStatus:
        '"completed" | "skipped" | "partial" | "ghost" | undefined (derived at export; persisted when skipped)',
      mesoBoundary: '"start" | "end" | null (export-only marker from selected mesocycle window)',
    },
  };
}

function setLogFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      sessionLogId: 'string',
      date: 'YYYY-MM-DD (export denormalized from parent SessionLog)',
      intent: joinEnums(SET_INTENTS),
      liftId: 'string',
      prescriptionId: 'string',
      setIndex: 'number',
      weight: 'number (lb)',
      reps: 'number',
      rir: 'number | undefined',
      rpe: 'number 1–10 | null (export-normalized; omitted or null when unknown)',
      status: '"completed" | "reduced" | "skipped" | "substituted"',
      substituteLiftId: 'string | undefined',
      reason: 'string | undefined',
      side: '"L" | "R" | undefined',
      loggedAt: 'ISO timestamp | undefined',
      speedMph: 'number | undefined',
      gradePct: 'number | undefined',
    },
  };
}

function cardioFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      sessionLogId: 'string | undefined',
      date: 'YYYY-MM-DD',
      type: '"liss" | "intervals"',
      durationMin: 'number',
      startedAt: 'ISO | undefined',
      endedAt: 'ISO | undefined',
      speedMph: 'number | undefined',
      gradePct: 'number | undefined',
      avgHr: 'number | undefined',
      peakHr: 'number | undefined',
      notes: 'string | undefined',
    },
  };
}

function bodyweightFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      date: 'YYYY-MM-DD',
      isoWeek: 'string',
      bodyweight: 'number',
    },
  };
}

function bodyMeasurementFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      date: 'YYYY-MM-DD',
      waist: 'number',
      abdomen: 'number',
      hips: 'number',
      protocol: 'string | null | undefined',
      timeOfDay: '"morning" | "afternoon" | "evening" | null | undefined',
    },
  };
}

function readinessFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      sessionLogId: 'string',
      date: 'YYYY-MM-DD',
      sleepHours: 'number',
      sleepInterruptions: 'number | undefined',
      soreness: 'number',
      motivation: 'number',
      hrvRmssd: 'number | undefined',
      hrvMeasuredMin: 'number | undefined',
      hrvSkipped: 'boolean | undefined',
      bodyweight: 'number | undefined',
      mindfulnessMinutes: 'number | undefined (legacy)',
      createdAt: 'ISO timestamp',
    },
  };
}

function nutritionFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      date: 'YYYY-MM-DD',
      dayType: joinEnums(NUTRITION_DAY_TYPES),
      caloriesTarget: 'number',
      caloriesActual: 'number',
      proteinTargetG: 'number',
      proteinActualG: 'number',
      carbsTargetG: 'number',
      carbsActualG: 'number',
      fatTargetG: 'number',
      fatActualG: 'number',
      mealsLoggedCount: 'number',
      mealTimestamps: 'ISO timestamp[] | undefined',
    },
  };
}

function hydrationFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      date: 'YYYY-MM-DD',
      waterTargetMl: 'number',
      waterActualMl: 'number',
      electrolytes: 'boolean',
      urineColor: '1–8 | undefined',
    },
  };
}

function sleepFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      date: 'YYYY-MM-DD',
      sleepHours: 'number',
      sleepQuality: '1–5',
      sleepOnsetLatencyMin: 'number | undefined',
      wakeCount: 'number | undefined',
    },
  };
}

function stressFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      date: 'YYYY-MM-DD',
      loggedAt: 'ISO timestamp',
      rating: '1–5',
      comment: 'string | undefined',
      kidsDay: 'boolean | undefined',
    },
  };
}

function mindfulnessFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      date: 'YYYY-MM-DD',
      loggedAt: 'ISO timestamp',
      durationMin: 'number | undefined',
    },
  };
}

function injuryFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      siteKey: 'string',
      kind: '"acute" | "chronic"',
      notes: 'string | undefined',
      startedAt: 'ISO timestamp',
      endedAt: 'ISO timestamp | undefined',
    },
  };
}

function bodyReadinessFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      date: 'YYYY-MM-DD',
      score: '1–5',
    },
  };
}

function hrvLogsExportFields(): SchemaEntry {
  return {
    fields: {
      date: 'YYYY-MM-DD',
      hrvMs: 'number (RMSSD)',
      source: '"manual" | "device"',
      notes: 'string | null',
    },
  };
}

function workdayLogsExportFields(): SchemaEntry {
  return {
    fields: {
      date: 'YYYY-MM-DD',
      shift: '"am" | "pm" | "double" | "off" | "sunday"',
      durationHr: 'number',
      updatedAt: 'ISO-8601',
    },
  };
}

function supplementLogsExportFields(): SchemaEntry {
  return {
    fields: {
      date: 'YYYY-MM-DD',
      zma: 'boolean',
      d3k2: 'boolean',
      multi: 'boolean',
      creatine: 'boolean',
      allTaken: 'boolean',
      updatedAt: 'ISO-8601',
    },
  };
}

function userGoalsFields(): SchemaEntry {
  return {
    fields: {
      id: 'string',
      liftId: 'string',
      label: 'string',
      metric: '"1rm" | "working_set" | "reps"',
      targetValue: 'number',
      targetReps: 'number | null',
      deadline: 'YYYY-MM-DD | null',
      createdAt: 'ISO-8601',
      achievedAt: 'ISO-8601 | null',
      baselineValue: 'number',
      active: 'boolean',
      updatedAt: 'ISO-8601',
    },
  };
}

function mesocycleExportFields(): SchemaEntry {
  return {
    fields: {
      name: 'string (e.g. Meso 1)',
      anchorDate: 'YYYY-MM-DD (Monday of Meso 1 · Week 1)',
      accumulationWeeks: 'number',
      deloadWeeks: 'number',
      currentWeek: 'number (1-based within block)',
      'weekByWeek[].week': 'number',
      'weekByWeek[].type': '"accumulation" | "deload"',
      'weekByWeek[].dateStart': 'YYYY-MM-DD',
      'weekByWeek[].dateEnd': 'YYYY-MM-DD',
      'weekByWeek[].status': '"completed" | "current" | "upcoming"',
      'weekByWeek[].volumeLbReps': 'number | null',
      'weekByWeek[].avgRpe': 'number | null',
      'weekByWeek[].avgHrvMs': 'number | null',
      'weekByWeek[].sessionsDone': 'number | null',
      'weekByWeek[].sessionsTotal': 'number | null',
      'weekByWeek[].prCount': 'number | null',
      'weekByWeek[].avgSoreness': 'number | null',
      'weekByWeek[].shortPct': 'number | null (0–100)',
      'lengthRecommendation.suggestedAccumWeeks': 'number',
      'lengthRecommendation.suggestedDeloadWeeks': 'number',
      'lengthRecommendation.action': '"shorten" | "extend" | "maintain"',
      'lengthRecommendation.rationale': 'string',
      'lengthRecommendation.signals.soreness': 'number (1–5 mean)',
      'lengthRecommendation.signals.motivation': 'number (1–5 mean)',
      'lengthRecommendation.signals.modifiedSetsPct': 'number (0–100)',
    },
  };
}

/** Top-level `schema` object in workout JSON exports (`fields` maps match `types.ts` + exporters). */
export function buildExportSchemaDocumentation(): Record<string, SchemaEntry> {
  return {
    lifts: liftFields(),
    templates: templateFields(),
    prescriptions: prescriptionFields(),
    session_logs: sessionLogFields(),
    set_logs: setLogFields(),
    cardio_logs: cardioFields(),
    bodyweight_logs: bodyweightFields(),
    body_measurement_logs: bodyMeasurementFields(),
    readiness_logs: readinessFields(),
    nutrition_logs: nutritionFields(),
    hydration_logs: hydrationFields(),
    sleep_logs: sleepFields(),
    stress_logs: stressFields(),
    mindfulness_logs: mindfulnessFields(),
    injury_episodes: injuryFields(),
    body_readiness_logs: bodyReadinessFields(),
    fitness_goals: exportedGoalFields(),
    summary: summarySchema(),
    mesoAnalysis: mesoAnalysisFields(),
    mesocycle: mesocycleExportFields(),
    hrv_logs: hrvLogsExportFields(),
    workday_logs: workdayLogsExportFields(),
    supplement_logs: supplementLogsExportFields(),
    user_goals: userGoalsFields(),
    dirty: dirtyRowFields(),
  };
}

/** Compile-time tether: referenced so refactors rename `DirtyRow` together with exporters. */
export function _dirtyRowTyping(row?: DirtyRow): void {
  void row;
}
