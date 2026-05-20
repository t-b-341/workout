import {
  addDays,
  differenceInCalendarDays,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
  endOfISOWeek,
} from 'date-fns';

export function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

/** Calendar days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetweenIso(fromIso: string, toIso: string): number {
  return differenceInCalendarDays(
    new Date(`${toIso}T12:00:00`),
    new Date(`${fromIso}T12:00:00`),
  );
}

/** Add signed calendar days to `YYYY-MM-dd` (local noon anchor). */
export function addDaysIso(dateIso: string, days: number): string {
  return format(addDays(new Date(`${dateIso}T12:00:00`), days), 'yyyy-MM-dd');
}

export function isoWeekString(d: Date = new Date()): string {
  const wk = getISOWeek(d).toString().padStart(2, '0');
  return `${getISOWeekYear(d)}-W${wk}`;
}

/** ISO week string for a calendar date `YYYY-MM-DD` (local noon parse). */
export function isoWeekStringFromIsoDate(dateIso: string): string {
  return isoWeekString(new Date(`${dateIso}T12:00:00`));
}

export function weekRange(d: Date = new Date()): { start: Date; end: Date } {
  return { start: startOfISOWeek(d), end: endOfISOWeek(d) };
}

export function fmtDate(d: string | Date, pattern = 'EEE M/d'): string {
  return format(typeof d === 'string' ? new Date(d + 'T12:00:00') : d, pattern);
}
