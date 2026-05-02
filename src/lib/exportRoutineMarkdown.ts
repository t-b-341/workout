/**
 * Builds a Markdown payload for external LLMs (e.g. Claude): prescriptions by day,
 * progression rules, equipment constraints, and recent nutrition / sleep / stress.
 */

import { format, subDays } from 'date-fns';
import { sortTemplatesProgramOrder } from '@/lib/seed';
import type { Lift, NutritionLog, Prescription, SessionTemplate, SleepLog, StressLog } from '@/lib/types';

const DOW_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const RECENT_SIGNAL_DAYS_DEFAULT = 14;

/** Narrative aligned with `decideProgression` + load snapping in `progression.ts`. */
export const PROGRESSION_RULES_MARKDOWN = `
### Double progression (strength work)

- **Sets are fixed** — the app never auto-adds sets.
- **Advance load** only when **every** logged set for that prescription is **completed** and reps are **≥ rep max** (top of the prescribed range).
- **Light**, **skip**, or **deload** sessions: **no** automatic progression for that session.
- Any **reduced**, **skipped**, or **substituted** set blocks progression for that lift that session.
- If fewer sets are logged than prescribed, progression is **held**.

### Load increments

- Default step is **5 lb** unless the prescription sets a different \`increment\`.
- After computing the next load, the app **snaps** to valid jumps by equipment (e.g. barbell **nearest 5 lb**).
- **Per-side / dumbbell** movements use a **2.5 lb** ladder (when dumbbells are available — see equipment constraint below).

### Pull-up variants (\`p1_eccentric\`, \`p1_assisted\`, \`p1_bw\`)

- Added load (or eccentric overload) snaps in **2.5 lb** steps where applicable.
- **Assisted** (\`p1_assisted\`): positive weight = counterweight assistance; progression **reduces** assistance toward **0** (unassisted) in **5 lb** steps.

### Cardio / time / planks

- Prescriptions with **no load** stay at working “weight” 0; progression rules above apply only where the app logs weighted sets.
`.trim();

export function isoDatesEndingToday(count: number, end: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(format(subDays(end, i), 'yyyy-MM-dd'));
  }
  return out;
}

function sanitizeCell(s: string | undefined): string {
  if (!s) return '';
  return s.replace(/\|/g, '/').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function dowLabel(dow: number): string {
  return DOW_NAMES[dow] ?? `day-${dow}`;
}

function liftMap(lifts: Lift[]): Map<string, Lift> {
  return new Map(lifts.map((l) => [l.id, l]));
}

function formatRepRange(p: Prescription): string {
  if (p.repMin === p.repMax) return `${p.repMin}`;
  return `${p.repMin}–${p.repMax}`;
}

function formatWeight(p: Prescription, lift?: Lift): string {
  if (!lift || lift.loadUnit === 'none' || lift.equipment === 'cardio' || lift.equipment === 'time') {
    if (p.weight === 0 && (!lift || lift.loadUnit === 'none')) return '—';
  }
  if (lift?.repUnit === 'seconds') return `${p.weight}s`;
  if (lift?.repUnit === 'minutes') return `${p.weight} min`;
  let w = `${p.weight}`;
  if (p.perSide) w += ' lb/side';
  else w += ' lb';
  if (lift?.loadUnit === 'bodyweight' && lift.id !== 'p1_assisted') w += ' added';
  if (lift?.id === 'p1_assisted' && p.weight > 0) w += ' assist';
  return w;
}

function prescriptionNotes(p: Prescription): string {
  const parts = [p.tempo, p.notes].filter(Boolean);
  return sanitizeCell(parts.join(' · '));
}

export type RoutineMarkdownInput = {
  exportedAtIso: string;
  templates: SessionTemplate[];
  lifts: Lift[];
  prescriptions: Prescription[];
  nutritionByDate: Map<string, NutritionLog | undefined>;
  sleepByDate: Map<string, SleepLog | undefined>;
  stressByDate: Map<string, StressLog | undefined>;
  /** Calendar days of nutrition/sleep/stress tables (oldest → newest). */
  signalDates: string[];
};

export function buildRoutineMarkdown(input: RoutineMarkdownInput): string {
  const {
    exportedAtIso,
    templates,
    lifts,
    prescriptions,
    nutritionByDate,
    sleepByDate,
    stressByDate,
    signalDates,
  } = input;

  const byLift = liftMap(lifts);
  const sortedTemplates = sortTemplatesProgramOrder(templates);
  const byTemplate = new Map<string, Prescription[]>();
  for (const pr of prescriptions) {
    const arr = byTemplate.get(pr.templateId) ?? [];
    arr.push(pr);
    byTemplate.set(pr.templateId, arr);
  }
  for (const arr of byTemplate.values()) {
    arr.sort((a, b) => a.order - b.order);
  }

  const dumbbellRows: string[] = [];
  for (const t of sortedTemplates) {
    const list = byTemplate.get(t.id) ?? [];
    for (const p of list) {
      const lift = byLift.get(p.liftId);
      if (lift?.equipment === 'dumbbell') {
        dumbbellRows.push(
          `- **${t.id}** (${dowLabel(t.dayOfWeek)}): **${lift.name}** — ${formatWeight(p, lift)}, ${p.sets}×${formatRepRange(p)}${p.notes ? ` · ${sanitizeCell(p.notes)}` : ''}`,
        );
      }
    }
  }

  const lines: string[] = [];
  lines.push('# Workout program export (for Claude)');
  lines.push('');
  lines.push(`Generated: ${exportedAtIso}`);
  lines.push('');
  lines.push('## Equipment constraint');
  lines.push('');
  lines.push('**No dumbbells.** Program any substitutions using barbell, machine, cable, plate, or bodyweight only.');
  lines.push('');
  if (dumbbellRows.length > 0) {
    lines.push('### Dumbbell movements currently stored in the app (must substitute)');
    lines.push('');
    dumbbellRows.forEach((r) => lines.push(r));
    lines.push('');
  } else {
    lines.push('*No dumbbell prescriptions in the database right now.*');
    lines.push('');
  }

  lines.push('## Progression logic (from app rules)');
  lines.push('');
  lines.push(PROGRESSION_RULES_MARKDOWN);
  lines.push('');

  lines.push('## Weekly lifting prescriptions');
  lines.push('');
  lines.push('Template order **U1 → L1 → U2 → L2 → U3 → L3**. Weights are **current working prescriptions** (not history).');
  lines.push('');

  for (const t of sortedTemplates) {
    const list = byTemplate.get(t.id) ?? [];
    lines.push(`### ${t.id} — ${dowLabel(t.dayOfWeek)} — ${sanitizeCell(t.name)}`);
    lines.push('');
    lines.push('| # | Exercise | Weight | Sets | Reps | Notes |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    let i = 1;
    for (const p of list) {
      const lift = byLift.get(p.liftId);
      const name = lift?.name ?? p.liftId;
      const equip = lift?.equipment === 'dumbbell' ? ' ⚠️ DB' : '';
      lines.push(
        `| ${i} | ${sanitizeCell(name)}${equip} | ${sanitizeCell(formatWeight(p, lift))} | ${p.sets} | ${formatRepRange(p)} | ${prescriptionNotes(p)} |`,
      );
      i += 1;
    }
    if (list.length === 0) {
      lines.push('| — | *No prescriptions* | — | — | — | — |');
    }
    lines.push('');
  }

  lines.push('## Recent tracking');
  lines.push('');
  lines.push(
    `Nutrition, sleep, and stress rows for the **last ${signalDates.length} calendar days** (app logs). Empty cells mean no log that day.`,
  );
  lines.push('');

  lines.push('### Nutrition (daily totals vs targets)');
  lines.push('');
  lines.push('| Date | Day | kcal actual/target | protein g actual/target | carbs g | fat g | meals / check-ins |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const d of signalDates) {
    const n = nutritionByDate.get(d);
    const day = dowLabel(new Date(`${d}T12:00:00`).getDay());
    if (!n) {
      lines.push(`| ${d} | ${day} | — | — | — | — | — |`);
      continue;
    }
    const meals =
      n.mealTimestamps?.length != null && n.mealTimestamps.length > 0
        ? `${n.mealTimestamps.length} timed`
        : `${n.mealsLoggedCount} meals`;
    lines.push(
      `| ${d} | ${day} | ${n.caloriesActual}/${n.caloriesTarget} | ${n.proteinActualG}/${n.proteinTargetG} | ${n.carbsActualG}/${n.carbsTargetG} | ${n.fatActualG}/${n.fatTargetG} | ${meals} |`,
    );
  }
  lines.push('');

  lines.push('### Sleep');
  lines.push('');
  lines.push('| Date | Day | Hours | Quality (1–5) |');
  lines.push('| --- | --- | --- | --- |');
  for (const d of signalDates) {
    const s = sleepByDate.get(d);
    const day = dowLabel(new Date(`${d}T12:00:00`).getDay());
    if (!s) {
      lines.push(`| ${d} | ${day} | — | — |`);
      continue;
    }
    lines.push(`| ${d} | ${day} | ${s.sleepHours} | ${s.sleepQuality} |`);
  }
  lines.push('');

  lines.push('### Stress (1–5 check-ins + management effectiveness)');
  lines.push('');
  lines.push('| Date | Day | Start | Mid | End | Avg | Mgmt eff. |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const d of signalDates) {
    const st = stressByDate.get(d);
    const day = dowLabel(new Date(`${d}T12:00:00`).getDay());
    if (!st) {
      lines.push(`| ${d} | ${day} | — | — | — | — | — |`);
      continue;
    }
    lines.push(
      `| ${d} | ${day} | ${st.startOfDay} | ${st.midDay} | ${st.endOfDay} | ${st.average.toFixed(1)} | ${st.managementEffectiveness} |`,
    );
  }
  lines.push('');

  lines.push('---');
  lines.push('');
  lines.push('*End of export.*');

  return lines.join('\n');
}
