'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fireDueTrackerReminders,
  isTrackerRemindersEnabled,
  requestTrackerReminderPermission,
  setTrackerRemindersEnabled,
  TRACKER_REMINDER_SLOTS,
} from '@/lib/trackerReminders';

function formatSlotTime(hour: number, minute: number): string {
  const d = new Date(2000, 0, 1, hour, minute);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function TrackerReminderCard() {
  const [enabled, setEnabled] = useState(false);
  const [denied, setDenied] = useState(false);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    setEnabled(isTrackerRemindersEnabled());
    setUnsupported(typeof window === 'undefined' || typeof Notification === 'undefined');
  }, []);

  const toggle = useCallback(async () => {
    if (unsupported) return;
    if (enabled) {
      setTrackerRemindersEnabled(false);
      setEnabled(false);
      setDenied(false);
      return;
    }
    const ok = await requestTrackerReminderPermission();
    if (!ok) {
      setDenied(true);
      return;
    }
    setDenied(false);
    setTrackerRemindersEnabled(true);
    setEnabled(true);
    void fireDueTrackerReminders();
  }, [enabled, unsupported]);

  if (unsupported) return null;

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div className="text-xs uppercase tracking-wider text-zinc-500">Reminders</div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-200">Daily check-in notifications</div>
          <p className="text-xs text-zinc-500 mt-1">
            {TRACKER_REMINDER_SLOTS.map((s) => formatSlotTime(s.hour, s.minute)).join(', ')} local time — Recovery check-ins
            check-ins, meals, hydration. Works best when the app is open or you return to it; many browsers
            cannot wake a site at an exact time without a server push.
          </p>
        </div>
        {enabled ? (
          <button
            type="button"
            aria-pressed="true"
            aria-label="Disable daily check-in notifications"
            onClick={() => void toggle()}
            className="shrink-0 h-9 w-14 rounded-full relative transition-colors bg-amber-500"
          >
            <span className="absolute top-1 left-6 h-7 w-7 rounded-full bg-zinc-950 transition-[left]" />
          </button>
        ) : (
          <button
            type="button"
            aria-pressed="false"
            aria-label="Enable daily check-in notifications"
            onClick={() => void toggle()}
            className="shrink-0 h-9 w-14 rounded-full relative transition-colors bg-zinc-700"
          >
            <span className="absolute top-1 left-1 h-7 w-7 rounded-full bg-zinc-950 transition-[left]" />
          </button>
        )}
      </div>
      {denied && (
        <p className="text-xs text-rose-400">
          Notifications are blocked for this site. Enable them in the browser or OS settings, then try again.
        </p>
      )}
    </div>
  );
}
