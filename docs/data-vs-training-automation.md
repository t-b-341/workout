# Data vs training automation

This document describes **fields and concepts the app already stores or displays** that **do not currently drive automatic training decisions** (loads, volume, progression, or session mode)—or only do so partially. It is meant for developers and power users who want to know what could be wired up later versus what already affects the “muscle” of the app.

**Related:** automated progression lives in `src/lib/progression.ts` (`decideProgression`). Session display scaling (light/deload) is applied in `src/components/TodayView.tsx` via `applySessionMode` / `effort.ts`. Recovery scoring is in `src/lib/recovery.ts` (`buildRecoveryScore`, `readinessScore`, etc.).

### Cursor-assisted difficulty (how hard to automate *with Cursor*)

These ratings are about **implementation effort and risk when an agent edits the repo**, not about sports-science correctness.

| Rating | Meaning |
|--------|---------|
| **S** | Small: few files, mostly pure logic or UI wiring; follows existing patterns; little or no schema/sync work. |
| **M** | Medium: multiple call sites, tests important, or product thresholds need explicit choices; possible edge cases (e.g. per-side lifts, assisted pull-ups). |
| **L** | Large: new Supabase/Dexie shape or sync semantics, cross-surface UX, or easy to get wrong without a spec (progression “source of truth” splits). |
| **XL** | Extra-large: research / domain pick (e.g. which HR model), broad refactors, or high ambiguity until you define the rule precisely. |

**Bias:** Cursor is strong when you can point at one function (e.g. `recommendMode`, `hydrationScore`) and add parameters + tests. It is weaker when behavior must stay consistent across **offline Dexie**, **sync**, and **UI** without a written rule sheet.

See **[Appendix: option-by-option ratings](#appendix-cursor-assisted-difficulty-by-option)** at the end of this doc.

---

## Session / program metadata (mostly unused for automation)

### `SessionTemplate.group` and `SessionTemplate.intensity`

**What they are:** Each template in `src/lib/seed.ts` (`TEMPLATES`) has `group: 'upper' | 'lower'` and `intensity: 'heavy' | 'light' | 'moderate'`. These are part of the `SessionTemplate` type in `src/lib/types.ts`.

**What the app uses today:** Template **id** (`U1`…`L3`), **name**, and **dayOfWeek** drive scheduling, the Today/Program pickers, and export (`src/lib/exportRoutineMarkdown.ts`). The human-readable names encode “upper/lower” and “heavy/light” for the user, but **no code branches on `group` or `intensity`** to change prescription weights, set counts, progression rules, or cardio targets.

**What you could build:** e.g. auto-scaling loads by intensity band, enforcing upper/lower volume rules, or defaulting effort presets from template intensity.

---

### `SessionLog.reason` (session-level)

**What it is:** `SessionLog` in `src/lib/types.ts` includes optional `reason?: string`, distinct from `notes?: string`.

**What the app uses today:** **Session notes** are editable from history (`SessionEditSheet.tsx`) and persisted on the session row. **Session-level `reason`”** is not surfaced in the session header UI and is not read by `decideProgression` or Today’s lift flow. By contrast, **`SetLog.reason`** is used when logging reduced/skipped/substituted sets (`LiftCard.tsx`, `SessionEditSheet.tsx`) and can appear in history.

**What you could build:** A short “why this mode” field on skip/light days, or reuse `reason` in analytics.

---

### Mesocycle config

**What it is:** Mesocycle anchor and block length (`accumulation` + `deload` weeks) live in Dexie **`meta`** (`src/lib/mesocycle.ts`), not in Supabase. `ProgramEditor.tsx` shows position-in-block and advisory copy (including recommendations about block length).

**What the app uses today:** **Display and text guidance** on the Program tab. It does **not** flip `SessionLog.deload`, alter `decideProgression`, or change `recommendMode`. A new device does not get mesocycle config from sync until the user re-enters it.

**What you could build:** Server-backed mesocycle, auto-deload weeks tied to block position, or gating progression when “deload week” is active.

---

## Check-in and recovery signals (logged but not in “training” automation)

### `ReadinessLog.hrvRmssd`, `hrvSkipped`, `hrvMeasuredMin`

**What they are:** Morning check-in fields on `ReadinessLog` (`src/lib/types.ts`), captured in `ReadinessForm.tsx` / `ReadinessEditForm.tsx`.

**What the app uses today:**

- **`readinessScore()`** in `src/lib/recovery.ts` blends subjective readiness (sleep hours, soreness, motivation) with HRV when RMSSD is present and not skipped.
- **`buildRecoveryScore()`** feeds the Recovery tab’s composite score and band (`push` / `normal` / `conservative` / `recovery`).
- **`recommendMode()`** (same file family, used from `ReadinessForm.tsx` for standard/light/skip) uses **only** `sleepHours`, `soreness`, and **`motivation`**—**not** HRV.

So HRV can move **recovery scoring text** on the Recovery page but does **not** change the **default session mode** chosen at check-in.

**What you could build:** Fold HRV into `recommendMode`, or require HRV before a “push” band when you want stricter guardrails.

---

### `ReadinessLog.mindfulnessMinutes`

**What it is:** Minutes of mindfulness/meditation logged with readiness (and/or via the Today tab card / pending meta until check-in).

**What the app uses today:** Weekly **mindfulness minute totals** vs target (`useThisWeekMindfulness`, `MindfulnessWeeklyBanner`), and History **week summaries** (`mindfulnessMin` in `buildWeeklySummaries` in `src/lib/stats.ts`). It is **not** an input to `buildRecoveryScore` or `decideProgression`.

**What you could build:** Add mindfulness into recovery band, or correlate with adherence in reports.

---

### `BodyReadinessLog` and `InjuryEpisode`

**What they are:** Daily body score (`body_readiness_logs`) and injury episodes (`injury_episodes`) with site keys, kinds, and optional notes—see `InjuryTrackingPanel.tsx` on the Daily Check-In / Recovery flow.

**What the app uses today:** **Capture + sync + export**. No logic **automatically** removes lifts from the day, lowers weights, blocks progression, or changes `recommendMode` based on an active injury or a low body-readiness score.

**What you could build:** Lift allowlists/denylists by injury site, soft caps on volume or intensity, or check-in prompts when pain sites overlap with scheduled lifts.

---

### `StressLog`

**What it is:** Start/mid/end-of-day stress plus management effectiveness (`src/lib/types.ts`), edited on Recovery (`RecoveryView.tsx`).

**What the app uses today:**

- **Narrative recommendations** on Recovery (`buildTodayPerformanceRecommendations` and related copy when stress is high).
- **History → Weeks** trend charts (`HistoryView.tsx` / `buildWeeklyStress`).

**Stress is not a term** in `buildRecoveryScore` (weights are sleep, hydration, nutrition, readiness only).

**What you could build:** Add stress into the composite score, or tie high stress to suggested light mode (similar to HRV).

---

## Set-level and prescription fields (underused for rules)

### `repMin` on `Prescription`

**What it is:** Lower bound of the rep range; `repMax` is the upper bound (`types.ts`, `seed.ts`, `ProgramEditor.tsx`).

**What the app uses today:** **Display** on lift cards and exports, and **default reps** when logging a set (`LiftCard.tsx`). **`decideProgression`** only checks that **every completed set** has **reps ≥ `repMax`** before advancing weight—there is **no** “double progression” inside the range (e.g. add reps until `repMax`, then add load).

**What you could build:** Classic double progression, or different rules for accessories vs main lifts.

---

### `SetLog.rir` and `SetLog.rpe`

**What they are:** Optional effort fields; RPE is derived from RIR in places (`src/lib/rpe.ts`, `LiftCard.tsx`, `SessionEditSheet.tsx`).

**What the app uses today:** **Logging and editing** for the trainee; helpful for history and manual review. **Progression does not** read RIR/RPE (e.g. to hold load when effort is too high).

**What you could build:** Autoregulation: e.g. if top-set RPE > target, repeat load next time or cap progression.

---

### `substituteLiftId` and substitute flow

**What it is:** When a set is marked substituted, `SetLog` can point at `substituteLiftId` (`types.ts`, `LiftCard.tsx`).

**What the app uses today:** **Recording** what you actually did. **Progression** still follows the **original prescription** row (`prescriptionId`, prescribed lift id, and weight ladder) unless you manually edit prescriptions.

**What you could build:** Branch progression rules for substitutions, or separate prescription rows for “swap this session only.”

---

### `prescription.tempo`, prescription notes, `Lift.notes`

**What they are:** Human-readable cues (tempo strings, coach notes, lift card footnotes).

**What the app uses today:** **UI and exports** only. Nothing parses tempo strings (e.g. “3-0-X-0”) into timers or progression constraints.

**What you could build:** Structured tempo fields, or validation (“pause reps must be logged as reduced if short on time”).

---

## Sleep / nutrition / hydration (partial use)

### `SleepLog.sleepOnsetLatencyMin` and `wakeCount`

**What they are:** Optional fields on `SleepLog` for latency and wake count.

**What the app uses today:** **Stored** from Recovery. **`sleepScore()`** in `recovery.ts` uses **sleep duration** and **sleep quality** only—not latency or wake count.

**What you could build:** Penalize fragmented sleep in the score, or show trends for those metrics.

---

### `NutritionLog.mealTimestamps` and `deriveMealMetrics`

**What they are:** Timestamps of “I ate” check-ins; `src/lib/mealTiming.ts` derives gaps, first/last meal clock times, etc. Shown in Recovery UI.

**What the app uses today:** **`effectiveMealCount`** feeds a small bonus in **`nutritionScore()`**. **`buildMacroTrendAdvice`** (`src/lib/macroTrend.ts`) looks at **protein/calories/hydration** against targets over prior days—it does **not** use meal spacing or `deriveMealMetrics`.

**What you could build:** Trend hints for “eating window” or very long fasts, if you want that in product language.

---

### `HydrationLog.urineColor`

**What it is:** Optional 1–8 urine color scale on `HydrationLog`.

**What the app uses today:** **`hydrationScore()`** applies a **fixed penalty** when `urineColor >= 7` (very dark). Values **below 7** do not fine-tune the score (they neither help nor hurt beyond the main water % vs target).

**What you could build:** Graduated scoring across the scale, or education-only labels without score impact.

---

## Cardio extras

### `CardioLog.avgHr` and `peakHr`

**What they are:** Optional HR fields for interval (and related) entries.

**What the app uses today:** **Cardio list** UI (`CardioView.tsx`) shows them when present. **Weekly cardio totals** (`useThisWeekCardio`, History week summaries) sum **`durationMin` only**—no intensity or HR volume metrics.

**What you could build:** HR trends, TRIMP-like load, or interval quality charts.

---

## Summary table

| Area | Stored / shown? | Drives progression or check-in mode? | Main code notes |
|------|-----------------|--------------------------------------|---------------|
| Template group/intensity | Yes | No | `seed.ts`, `types.ts` |
| Session reason | Rarely used in UI | No | `types.ts`, vs `notes` in `SessionEditSheet` |
| Mesocycle | Yes (local meta) | No | `mesocycle.ts`, `ProgramEditor.tsx` |
| HRV | Yes | Recovery score only, not `recommendMode` | `recovery.ts`, `ReadinessForm.tsx` |
| Mindfulness minutes | Yes | Weekly target/stats only | hooks, `stats.ts`, `MindfulnessTodayCard` |
| Injury / body readiness | Yes | No automatic training rules | `InjuryTrackingPanel.tsx`, sync tables |
| Stress | Yes | Text + charts, not composite score | `RecoveryView.tsx`, `HistoryView.tsx` |
| repMin | Yes | Not used in `decideProgression` | `progression.ts` |
| RIR/RPE | Yes | Display only for progression | `LiftCard.tsx`, `progression.ts` |
| Substitutions | Yes | Progression ignores substitute lift | `LiftCard.tsx` |
| Tempo / notes | Yes | Informational | — |
| Sleep latency / wakes | Yes | Not in `sleepScore` | `recovery.ts` |
| Meal timestamps (timing) | Yes | Not in macro trend | `macroTrend.ts`, `mealTiming.ts` |
| Urine color mid-range | Yes | Only strong penalty at 7+ | `recovery.ts` |
| Cardio HR | Yes | Weekly totals = minutes only | `hooks.ts`, `stats.ts` |

---

## Appendix: Cursor-assisted difficulty by option

Each row is a concrete “what you could build” from the sections above. Ratings assume **one focused PR** unless noted.

| Option | Difficulty | Why (Cursor / codebase) |
|--------|------------|-------------------------|
| Auto-scaling loads by template `intensity` / `group` | **M** | Touches display weights (`TodayView` / `applyEffortScale` path), must agree with `snapWorkingWeight` and seed data; easy to desync “display vs progression” if not careful. |
| Upper/lower volume “rules” or caps | **L** | Needs a clear definition of volume (sets × muscle?), new aggregations or enforcement points, and UX when a “rule” trips. |
| Default `effortScale` (or similar) from template intensity | **M–L** | Small if only default on session create; **L** if it must persist, sync, and interact with user overrides in `SessionHeader`. |
| Surface `SessionLog.reason` in UI (“why this mode”) | **S** | Form + `localUpsert`; type already exists. |
| Use `SessionLog.reason` in History/analytics | **M** | Depends on report design; may need filters, exports, empty-state handling. |
| Server-backed mesocycle (sync across devices) | **L** | New remote table or profile field, migration, RLS, `syncCodec` + dirty tables, migration story for existing meta-only config. |
| Auto-deload week from mesocycle position (e.g. set `deload` flag) | **M** | Local-only: derive from `mesocyclePosition` + session date; must not fight manual toggles; needs tests around week boundaries. |
| Gate / adjust `decideProgression` during meso deload week | **M** | Central change in `progression.ts` + finish-session flow; test matrix grows (deload + light + per-side). |
| Fold HRV into `recommendMode` | **M** | Pure logic change + tests + copy; watch interactions with `hrvSkipped` and missing HRV. |
| Require HRV for “push” band or aggressive standard mode | **M** | Same as above plus edge cases (“what if user never measures HRV?”). |
| Add mindfulness minutes into `buildRecoveryScore` | **S** | Weight tuning + tests; watch double-counting with readiness already reflecting “headspace.” |
| Mindfulness vs adherence / completion in reports | **M** | Define adherence; join sessions + logs; likely History or new aggregation helper. |
| Injury site → lift allow/deny or hide card | **L** | Map `injurySites` ↔ `Lift.muscleGroups` / patterns; UX for overrides; don’t block editing by accident. |
| Soft volume or intensity caps from injury / body readiness | **L** | Same mapping + policy (%, set removal?); progression interaction. |
| Check-in **prompts** when injury overlaps scheduled lifts (no auto change) | **M** | Read-only compare + banner; fewer edge cases than auto-removal. |
| Add stress into `buildRecoveryScore` composite | **S–M** | Formula + which field (`average` vs peak check-in); small if one numeric blend. |
| High stress nudges `recommendMode` toward light | **M** | Couples Recovery data to check-in path; may need “stress not logged yet” behavior. |
| Classic double progression (`repMin`…`repMax` then load) | **M** | `decideProgression` becomes stateful across sessions (rep target memory) unless encoded in prescription; BSS and pull-up specials need cases. |
| Different rep rules for “main” vs “accessory” | **M–L** | **M** if keyed off lift metadata flag; **L** if user-defined per prescription. |
| RPE/RIR autoregulation (hold load if too hard) | **M** | Define “top set,” target RPE, behavior on reduced sets; tests for multi-set prescriptions. |
| Progression follows substitution / alternate lift | **L** | Today progression keys off prescription lift id + weight; substitution fork affects PRs, history, and snap rules. |
| Structured tempo fields (not string parse) | **M** | Types + forms + export + maybe LiftCard display; migration for existing `tempo` strings optional. |
| “Pause reps validation” / enforced logging rules from tempo | **L** | High ambiguity without a precise spec; easy to frustrate users. |
| Factor sleep latency / wake count into `sleepScore` | **S** | Extend `sleepScore`; tune weights; optional Vitest on boundaries. |
| Trends for latency / wake count (History or Recovery) | **M** | Reuse weekly/rolling patterns from `HistoryView` / stats. |
| Meal timing / gaps in `buildMacroTrendAdvice` | **S–M** | **S** for simple thresholds on `deriveMealMetrics`; **M** if copy and thresholds need iteration. |
| Graduated `urineColor` in `hydrationScore` | **S** | Replace step function with a curve; test monotonicity. |
| Cardio HR summary in week stats (avg peak, simple trend) | **M** | Extend `WeekSummary` + `buildWeeklySummaries` or a parallel cardio rollup; chart in History. |
| TRIMP-like load or “interval quality” scoring | **L–XL** | Domain formula choice, validation, and explaining it in UI; more research than plumbing. |

---

*Last expanded to match product behavior as of the surrounding codebase. If you add automation, update this file or link to ADR-style notes so “what’s decorative vs causal” stays clear.*
