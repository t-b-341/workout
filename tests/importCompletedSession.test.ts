import { describe, expect, it } from 'vitest';
import { PP_OHP_WORKOUT_MAY_15 } from '../src/lib/importCompletedSession';
import { PRESCRIPTIONS } from '../src/lib/seed';

describe('PP_OHP_WORKOUT_MAY_15', () => {
  it('targets Friday U3 shoulder lifts with 30 min duration', () => {
    expect(PP_OHP_WORKOUT_MAY_15.durationMin).toBe(30);
    expect(PP_OHP_WORKOUT_MAY_15.lifts.map((l) => l.liftId)).toEqual(['pp', 'ohp']);
    expect(PP_OHP_WORKOUT_MAY_15.lifts[0].weight).toBe(185);
    expect(PP_OHP_WORKOUT_MAY_15.lifts[1].weight).toBe(165);
  });

  it('matches U3 prescription set counts when reps are omitted', () => {
    const u3 = PRESCRIPTIONS.filter((p) => p.templateId === 'U3');
    const pp = u3.find((p) => p.liftId === 'pp');
    const ohp = u3.find((p) => p.liftId === 'ohp');
    expect(pp?.sets).toBe(2);
    expect(ohp?.sets).toBe(3);
  });
});
