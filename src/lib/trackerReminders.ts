import { format } from 'date-fns';

/** Local calendar day key for de-duping one notification per slot per day. */
export function localDateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export type TrackerReminderSlot = {
  id: string;
  hour: number;
  minute: number;
  /** Length of window after `hour:minute` when we may show the reminder once. */
  windowMinutes: number;
  title: string;
  body: string;
};

/** Fixed times (device local): 7:00, 14:00, 20:00 — align with meal logging + ad-hoc stress check-ins. */
export const TRACKER_REMINDER_SLOTS: TrackerReminderSlot[] = [
  {
    id: 'morning',
    hour: 7,
    minute: 0,
    windowMinutes: 180,
    title: 'Morning Daily Check-In',
    body: 'Log hydration, meal times, and stress check-ins (Recovery) as needed.',
  },
  {
    id: 'midday',
    hour: 14,
    minute: 0,
    windowMinutes: 240,
    title: 'Midday tracker',
    body: 'Meal check-ins and optional stress (1–5) on Recovery.',
  },
  {
    id: 'evening',
    hour: 20,
    minute: 0,
    windowMinutes: 180,
    title: 'Evening Daily Check-In',
    body: 'Log dinner, hydration, and stress check-in before wind-down.',
  },
];

const ENABLED_KEY = 'workout:tracker-reminders-enabled';
const FIRES_KEY = 'workout:tracker-reminders-fires';

export type TrackerReminderFires = Record<string, string>;

function readFires(): TrackerReminderFires {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(FIRES_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return {};
    return o as TrackerReminderFires;
  } catch {
    return {};
  }
}

function writeFires(f: TrackerReminderFires) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(FIRES_KEY, JSON.stringify(f));
  } catch {
    /* ignore quota / private mode */
  }
}

export function isTrackerRemindersEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setTrackerRemindersEnabled(on: boolean) {
  if (typeof window === 'undefined') return;
  try {
    if (on) localStorage.setItem(ENABLED_KEY, '1');
    else localStorage.removeItem(ENABLED_KEY);
  } catch {
    /* ignore */
  }
}

export function wasSlotFired(slotId: string, dateKey: string): boolean {
  return readFires()[slotId] === dateKey;
}

/** Mark after deciding to show, so a slow notification API cannot double-fire. */
export function markSlotFired(slotId: string, dateKey: string) {
  const next = { ...readFires(), [slotId]: dateKey };
  writeFires(next);
}

export function slotStartOnDay(day: Date, slot: TrackerReminderSlot): Date {
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    slot.hour,
    slot.minute,
    0,
    0,
  );
}

export function inReminderWindow(now: Date, slot: TrackerReminderSlot): boolean {
  const start = slotStartOnDay(now, slot);
  const end = new Date(start.getTime() + slot.windowMinutes * 60_000);
  return now >= start && now < end;
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  try {
    const r = await navigator.serviceWorker.getRegistration('/');
    if (r) return r;
  } catch {
    return undefined;
  }
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return undefined;
  }
}

const RECOVERY_PATH = '/recovery';

async function showTrackerSlotNotification(slot: TrackerReminderSlot): Promise<void> {
  const reg = await getServiceWorkerRegistration();
  if (reg && typeof reg.showNotification === 'function') {
    await reg.showNotification(slot.title, {
      body: slot.body,
      icon: '/icons/icon.svg',
      badge: '/icons/icon.svg',
      tag: `workout-tracker-${slot.id}`,
      data: { url: RECOVERY_PATH },
    });
    return;
  }
  if (typeof Notification !== 'undefined') {
    new Notification(slot.title, {
      body: slot.body,
      icon: '/icons/icon.svg',
      tag: `workout-tracker-${slot.id}`,
    });
  }
}

/**
 * Shows due reminders for the current instant. Safe to call often (interval + visibility).
 * Requires browser Notification permission === granted.
 */
export async function fireDueTrackerReminders(now: Date = new Date()): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!isTrackerRemindersEnabled()) return;
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted') return;

  const dateKey = localDateKey(now);
  for (const slot of TRACKER_REMINDER_SLOTS) {
    if (!inReminderWindow(now, slot)) continue;
    if (wasSlotFired(slot.id, dateKey)) continue;
    markSlotFired(slot.id, dateKey);
    try {
      await showTrackerSlotNotification(slot);
    } catch {
      // keep mark to avoid notification spam if the API errors transiently
    }
  }
}

/** Request notification permission; returns whether permission is granted. */
export async function requestTrackerReminderPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const p = await Notification.requestPermission();
  return p === 'granted';
}