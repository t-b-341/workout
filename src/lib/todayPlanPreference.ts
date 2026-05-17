'use client';

import type { TemplateId } from './types';
import { todayIso } from './time';

const STORAGE_KEY = 'workout:todayPlan:v1';

export type TodayPlanPreference = {
  date: string;
  templateId: TemplateId;
};

export function readTodayPlanPreference(): TodayPlanPreference | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as unknown;
    if (
      !v ||
      typeof v !== 'object' ||
      typeof (v as TodayPlanPreference).date !== 'string' ||
      typeof (v as TodayPlanPreference).templateId !== 'string'
    ) {
      return null;
    }
    const p = v as TodayPlanPreference;
    if (p.templateId === 'QUICK') return null;
    return p;
  } catch {
    return null;
  }
}

/** Remember which template the user is running "today" so /program matches the Today tab after navigation. */
export function writeTodayPlanPreference(pref: TodayPlanPreference): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Calendar day the stored preference applies to (must match for reads). */
export function todayPlanPreferenceIsForToday(pref: TodayPlanPreference | null): pref is TodayPlanPreference {
  return pref != null && pref.date === todayIso() && pref.templateId !== 'QUICK';
}
