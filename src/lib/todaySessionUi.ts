import type { Prescription, SetLog } from './types';

export function expectedSetSlots(prescriptions: Prescription[]): number {
  let n = 0;
  for (const p of prescriptions) {
    const sides = p.perSide ? 2 : 1;
    n += p.sets * sides;
  }
  return n;
}

export function sessionSetsForPrescriptions(
  sessionId: string,
  prescriptions: Prescription[],
  allSets: SetLog[],
): SetLog[] {
  const ids = new Set(prescriptions.map((p) => p.id));
  return allSets.filter((s) => s.sessionLogId === sessionId && ids.has(s.prescriptionId));
}

export function firstOpenPrescriptionId(
  prescriptions: Prescription[],
  sessionSets: SetLog[],
): string | null {
  for (const p of prescriptions) {
    const sides = p.perSide ? 2 : 1;
    const needed = p.sets * sides;
    const have = sessionSets.filter((s) => s.prescriptionId === p.id).length;
    if (have < needed) return p.id;
  }
  return null;
}

export function lastLoggedAtInSession(sessionSets: SetLog[]): string | undefined {
  const ts = sessionSets
    .map((s) => s.loggedAt)
    .filter((x): x is string => !!x)
    .sort();
  return ts.length ? ts[ts.length - 1] : undefined;
}
