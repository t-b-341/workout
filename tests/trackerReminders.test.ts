/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  inReminderWindow,
  localDateKey,
  markSlotFired,
  setTrackerRemindersEnabled,
  slotStartOnDay,
  TRACKER_REMINDER_SLOTS,
  wasSlotFired,
} from '../src/lib/trackerReminders';

const morning = TRACKER_REMINDER_SLOTS[0]!;
const midday = TRACKER_REMINDER_SLOTS[1]!;
const evening = TRACKER_REMINDER_SLOTS[2]!;

describe('trackerReminders', () => {
  beforeEach(() => {
    localStorage.clear();
    setTrackerRemindersEnabled(false);
  });

  it('computes local date keys in local timezone', () => {
    const d = new Date(2026, 4, 2, 15, 30, 0);
    expect(localDateKey(d)).toBe('2026-05-02');
  });

  it('marks morning slot inside window and outside', () => {
    expect(inReminderWindow(new Date(2026, 4, 2, 6, 59, 0), morning)).toBe(false);
    expect(inReminderWindow(new Date(2026, 4, 2, 7, 0, 0), morning)).toBe(true);
    expect(inReminderWindow(new Date(2026, 4, 2, 9, 59, 0), morning)).toBe(true);
    expect(inReminderWindow(new Date(2026, 4, 2, 10, 0, 0), morning)).toBe(false);
  });

  it('covers midday and evening windows', () => {
    expect(inReminderWindow(new Date(2026, 4, 2, 13, 59, 0), midday)).toBe(false);
    expect(inReminderWindow(new Date(2026, 4, 2, 14, 0, 0), midday)).toBe(true);
    expect(inReminderWindow(new Date(2026, 4, 2, 17, 59, 0), midday)).toBe(true);
    expect(inReminderWindow(new Date(2026, 4, 2, 18, 0, 0), midday)).toBe(false);

    expect(inReminderWindow(new Date(2026, 4, 2, 19, 59, 0), evening)).toBe(false);
    expect(inReminderWindow(new Date(2026, 4, 2, 20, 0, 0), evening)).toBe(true);
    expect(inReminderWindow(new Date(2026, 4, 2, 22, 59, 0), evening)).toBe(true);
    expect(inReminderWindow(new Date(2026, 4, 2, 23, 0, 0), evening)).toBe(false);
  });

  it('persists fired slots for dedupe', () => {
    const dk = '2026-05-02';
    expect(wasSlotFired('morning', dk)).toBe(false);
    markSlotFired('morning', dk);
    expect(wasSlotFired('morning', dk)).toBe(true);
    expect(wasSlotFired('midday', dk)).toBe(false);
  });

  it('slotStartOnDay matches slot clock', () => {
    const day = new Date(2026, 4, 2, 22, 0, 0);
    const s = slotStartOnDay(day, evening);
    expect(s.getFullYear()).toBe(2026);
    expect(s.getMonth()).toBe(4);
    expect(s.getDate()).toBe(2);
    expect(s.getHours()).toBe(20);
    expect(s.getMinutes()).toBe(0);
  });
});
