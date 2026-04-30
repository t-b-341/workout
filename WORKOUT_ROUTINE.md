# Workout routine

Default program from the app seed (`src/lib/seed.ts`). If you changed lifts or loads in **Program**, your live data may differ—export JSON from the app or compare with this file.

## Weekly split

| Day        | Session                         | Focus        |
| ---------- | ------------------------------- | ------------ |
| Monday     | Upper — Heavy                   | `U1`         |
| Tuesday    | Lower — Heavy                   | `L1`         |
| Wednesday  | Upper — Light                   | `U2`         |
| Thursday   | Lower — Light                   | `L2`         |
| Friday     | Upper — Moderate                | `U3`         |
| Saturday   | Lower — Moderate                | `L3`         |
| Sunday     | Rest (app defaults to Mon U1) | —            |

Program tab order in the app: **U1 → L1 → U2 → L2 → U3 → L3**.

---

## Monday — Upper (Heavy) · `U1`

| # | Exercise               | Sets | Reps   | Load   | Notes |
| - | ---------------------- | ---: | ------ | ------ | ----- |
| 1 | Push Press             |    2 | 4–8    | 135 lb | BRACE YOUR GODDAMN CORE, or you'll hurt your back again |
| 2 | OHP (dead-stop)        |    2 | 4–8    | 105 lb | |
| 3 | P1 Weighted Eccentric  |    4 | 1      | +5 lb  | 5 sec eccentric; start 5–10# added |
| 4 | Bench Press            |    3 | 4–8    | 175 lb | |
| 5 | Pec Flyes              |    3 | 12–15  | 17.5 lb | |
| 6 | Pendlay Row            |    3 | 4–8    | 170 lb | |
| 7 | Rear Delt Plate Flyes  |    4 | 15     | 10 lb  | Supinated; 10# plates/side |

---

## Tuesday — Lower (Heavy) · `L1`

| # | Exercise               | Sets | Reps   | Load    | Notes |
| - | ---------------------- | ---: | ------ | ------- | ----- |
| 1 | Back Squat             |    3 | 6–8    | 240 lb  | Shoot for 3×8 |
| 2 | Deadlift               |    3 | 3–6    | 325 lb  | |
| 3 | Bulgarian Split Squat  |    2 | 6–8    | 22.5 lb | **Per leg**; shoot for 8; learning |
| 4 | Breathing Back Squat   |    1 | 15–20  | 165 lb  | Bar on back; breathe between reps |
| 5 | LISS                   |    1 | 30 min | —       | 2.0 mph / 3.0% grade |

---

## Wednesday — Upper (Light) · `U2`

| # | Exercise                 | Sets | Reps   | Load   | Notes |
| - | ------------------------ | ---: | ------ | ------ | ----- |
| 1 | Seated DB Shoulder Press |    3 | 8–12   | 40 lb  | Shoot for 3×10 |
| 2 | P1 Assisted              |    8 | 2–4    | 50 lb  | Assistance in 5 lb steps → 0 unassisted |
| 3 | Wide-Grip Bench Press    |    3 | 8–12   | 125 lb | Shoot for 3×12 |
| 4 | Deficit Barbell Row      |    3 | 4–8    | 140 lb | |
| 5 | JM Press                 |    3 | 10–12  | 45 lb  | |
| 6 | Supinated Barbell Curls  |    4 | 10–12  | 45 lb  | |
| 7 | Rear Delt Plate Flyes    |    4 | 15     | 10 lb  | 10# plates/side |
| 8 | LISS                     |    1 | 30 min | —      | 2.0 mph / 3.0% grade |

---

## Thursday — Lower (Light) · `L2`

| # | Exercise           | Sets | Reps   | Load   | Notes |
| - | ------------------ | ---: | ------ | ------ | ----- |
| 1 | RDL                |    3 | 8–12   | 205 lb | Hinge movement |
| 2 | Bulgarian Split Squat | 3 | 10    | 22.5 lb | **Per leg**; light-day squat stim; learning |
| 3 | Planks             |    3 | 30 sec | —      | +5 sec/wk per set |
| 4 | Ab Rollouts        |    4 | 3      | —      | Full ROM; progress reps |
| 5 | Echo Bike Intervals |   1 | 16 min | —      | 8 × (30 s sprint / 90 s slow); HR ~170 on sprints |
| 6 | LISS               |    1 | 20 min | —      | 2.0 mph / 3.0% grade |

---

## Friday — Upper (Moderate) · `U3`

| # | Exercise               | Sets | Reps   | Load   | Notes |
| - | ---------------------- | ---: | ------ | ------ | ----- |
| 1 | Push Press             |    2 | 4–8    | 115 lb | BRACE YOUR GODDAMN CORE, or you'll hurt your back again |
| 2 | OHP (dead-stop)        |    3 | 8–12   | 85 lb  | |
| 3 | P1 (Bodyweight)        |    3 | 2      | BW     | 3×2 → 4×2 (elbows); BW 245# |
| 4 | Bench Press (paused)   |    3 | 4–8    | 155 lb | Paused at chest |
| 5 | Pec Flyes              |    3 | 12–15  | 17.5 lb | |
| 6 | Barbell Row            |    3 | 4–8    | 150 lb | |
| 7 | Rear Delt Plate Flyes  |    4 | 15     | 10 lb  | Shoulder insurance · 10# plates/side |

---

## Saturday — Lower (Moderate) · `L3`

| # | Exercise              | Sets | Reps  | Load    | Notes |
| - | --------------------- | ---: | ----- | ------- | ----- |
| 1 | Back Squat (paused) |    3 | 3–6   | 205 lb  | 3 sec pause |
| 2 | Deficit Deadlift    |    3 | 3–6   | 300 lb  | |
| 3 | Bulgarian Split Squat |  2 | 6–8   | 22.5 lb | **Per leg**; shoot for 8; learning |
| 4 | LISS                  |    1 | 60 min | —      | 2.0 mph / 3.0% grade |

---

## Pull-up progression (P1) across the week

- **U1 (heavy):** weighted **eccentric** (5 s lowering), low reps, small added load.
- **U2 (light):** **assisted** work in 5 lb assistance steps toward unassisted.
- **U3 (moderate):** **bodyweight** low reps; progression note in seed (3×2 → 4×2).

---

## Cardio targets (seed)

- **Weekly LISS-style target:** 150 minutes (`CARDIO_WEEKLY_TARGET_MIN` in seed).
- LISS notes in lifts: treadmill **2.0 mph @ 3.0%** unless you changed them in the app.

---

*Last aligned with repo seed data; regenerate or edit this file if your `seed.ts` changes.*
