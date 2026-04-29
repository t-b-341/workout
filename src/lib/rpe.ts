export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 1 RIR = 9 RPE, 2 RIR = 8 RPE, etc. */
export function rpeFromRir(rir: number): number {
  return clamp(10 - rir, 1, 10);
}

/** Only track RPE when set reps are 12 or less. */
export function shouldTrackRpeForReps(reps: number): boolean {
  return reps > 0 && reps <= 12;
}
