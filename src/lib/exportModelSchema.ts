import type { DirtyRow } from './db';
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

export type ExportSummary = {
  exportedAt: string;
  dateRange: { start: string | null; end: string | null };
  sessionCount: number;
  totalSets: number;
  totalVolumeLbReps: number;
  prFlags: Array<{
    liftId: string;
    liftName: string;
    weight: number;
    reps: number;
    date: string;
    sessionId: string;
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
      totalSets: 'number',
      totalVolumeLbReps: 'number',
      'prFlags[].liftId': 'string',
      'prFlags[].liftName': 'string',
      'prFlags[].weight': 'number',
      'prFlags[].reps': 'number',
      'prFlags[].date': 'YYYY-MM-DD',
      'prFlags[].sessionId': 'string',
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
      targetDeltas: 'array | null',
      completionRates: 'array | null',
      intentBreakdown: 'object | null',
      nutritionAdherence: 'object | null',
      bodyweightTrend: 'object | null',
      wellnessCorrelations: 'object | null',
      'injuryFlags[].date': 'YYYY-MM-DD',
      'injuryFlags[].sessionId': 'string',
      'injuryFlags[].sessionType': 'string',
      'injuryFlags[].flag': '"injury_episode" | "abbreviated" | "note_keyword" | "high_skip_rate"',
      'injuryFlags[].affectedSite': 'string | null',
      'injuryFlags[].liftId': 'string | null',
      'injuryFlags[].liftName': 'string | null',
      'injuryFlags[].detail': 'string',
      mindfulnessAdherence: 'object | null',
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
      rpe: 'number | undefined',
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
    dirty: dirtyRowFields(),
  };
}

/** Compile-time tether: referenced so refactors rename `DirtyRow` together with exporters. */
export function _dirtyRowTyping(row?: DirtyRow): void {
  void row;
}
