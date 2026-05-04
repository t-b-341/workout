import type { ReadinessLog } from '@/lib/types';

export const DEFAULT_HRV_VAR_WINDOW = 7;

export type HrvVariabilityPoint = {
  date: string;
  /** Sample SD of RMSSD values in the trailing window (ms). */
  sdRmssd: number;
  /** Coefficient of variation of RMSSD in the window (%). */
  cvPct: number;
  /** Mean RMSSD in the same window (ms). */
  meanRmssd: number;
  windowN: number;
};

function sampleStd(vals: number[]): number {
  const n = vals.length;
  if (n < 2) return 0;
  const mean = vals.reduce((a, b) => a + b, 0) / n;
  const variance = vals.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

/**
 * Rolling variability of RMSSD: at each check-in, SD and CV% over the trailing
 * window of readings (default 7). Aligns 1:1 with `measuredAsc` rows.
 */
export function buildHrvVariabilitySeries(
  measuredAsc: Array<{ date: string; hrvRmssd: number }>,
  windowSize: number = DEFAULT_HRV_VAR_WINDOW,
): HrvVariabilityPoint[] {
  const out: HrvVariabilityPoint[] = [];
  for (let i = 0; i < measuredAsc.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const slice = measuredAsc.slice(start, i + 1);
    const window = slice.map((x) => x.hrvRmssd);
    const meanRmssd = window.reduce((a, b) => a + b, 0) / window.length;
    const sdRmssd = sampleStd(window);
    const cvPct = meanRmssd > 0 ? (sdRmssd / meanRmssd) * 100 : 0;
    out.push({
      date: measuredAsc[i].date,
      sdRmssd,
      cvPct,
      meanRmssd,
      windowN: window.length,
    });
  }
  return out;
}

/** Filter and sort ascending by date; drops skips and invalid RMSSD. */
export function measuredHrvAsc(readiness: ReadinessLog[]): Array<{ date: string; hrvRmssd: number }> {
  const asc = [...readiness].sort((a, b) => a.date.localeCompare(b.date));
  return asc
    .filter((r) => !r.hrvSkipped && r.hrvRmssd != null && Number.isFinite(r.hrvRmssd))
    .map((r) => ({ date: r.date, hrvRmssd: r.hrvRmssd! }));
}

/**
 * Short interpretive line combining absolute level (window mean) and variability.
 * Informational only — does not change training prescriptions.
 */
export function describeHrvRecoveryVariability(
  latest: HrvVariabilityPoint | undefined,
): string | null {
  if (!latest) return null;
  if (latest.windowN < 3) {
    return 'A few more HRV readings will make variability (and this readout) more reliable.';
  }
  const { cvPct, meanRmssd, sdRmssd } = latest;
  const vol =
    cvPct < 12 ? 'tight'
      : cvPct < 22 ? 'typical'
        : 'wide';
  const level =
    meanRmssd >= 48 ? 'higher'
      : meanRmssd >= 32 ? 'middle'
        : 'lower';

  const volPhrase =
    vol === 'tight'
      ? 'readings have stayed in a narrow band — day-to-day change in RMSSD has been small.'
      : vol === 'typical'
        ? 'readings show a normal amount of scatter between check-ins.'
        : 'readings have bounced more between check-ins than in a steady stretch.';

  const levelPhrase =
    level === 'higher'
      ? 'Absolute RMSSD in that window sits on the stronger side for you lately.'
      : level === 'middle'
        ? 'Absolute RMSSD in that window sits mid-range.'
        : 'Absolute RMSSD in that window sits on the softer side — useful alongside sleep and load context.';

  return `Recent variability (${latest.windowN} readings, up to ${DEFAULT_HRV_VAR_WINDOW} lookback): ${volPhrase} ${levelPhrase} Rolling SD ≈ ${sdRmssd.toFixed(1)} ms, CV ≈ ${cvPct.toFixed(0)}%.`;
}
