'use client';

import Link from 'next/link';
import { useLayoutMode } from '@/lib/layoutMode';
import { PageShell } from './PageShell';
import { TodayPrescribedPrefCard, VisibleMeasurementsCard } from './TodayPrescribedPrefCard';
import { TrackerReminderCard } from './TrackerReminderCard';
import { WellnessTargetsCard } from './WellnessTargetsCard';

export function SettingsView() {
  return (
    <PageShell className="p-4 space-y-4">
      <h1 className="text-xl font-semibold text-zinc-100">Settings</h1>
      <TrackerReminderCard />
      <WellnessTargetsCard />
      <TodayPrescribedPrefCard />
      <VisibleMeasurementsCard />
      <LayoutChoiceCard />
      <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-2">
        <div className="text-xs uppercase tracking-wider text-zinc-500">Sync</div>
        <p className="text-xs text-zinc-500">
          Pending writes, recent errors, and a force sync live on Program.
        </p>
        <Link
          href="/program#sync-diagnostics"
          className="inline-flex h-11 items-center text-sm font-medium text-amber-400 hover:text-amber-300"
        >
          Sync diagnostics
        </Link>
      </div>
    </PageShell>
  );
}

function LayoutChoiceCard() {
  const { mode, setMode } = useLayoutMode();
  const choice =
    'h-11 rounded-xl border text-sm font-medium';
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div>
        <div className="text-xs uppercase tracking-wider text-zinc-500">Layout</div>
        <div className="text-sm font-medium text-zinc-200 mt-1">Wide / Phone</div>
        <p className="text-xs text-zinc-500 mt-1">
          Phone keeps the column narrow. Wide uses the full screen. This device only — same choice as the bottom-nav toggle.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={mode === 'mobile'}
          onClick={() => setMode('mobile')}
          className={`${choice} ${
            mode === 'mobile'
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-100'
              : 'bg-zinc-950 border-zinc-800 text-zinc-300'
          }`}
        >
          Phone
        </button>
        <button
          type="button"
          aria-pressed={mode === 'desktop'}
          onClick={() => setMode('desktop')}
          className={`${choice} ${
            mode === 'desktop'
              ? 'bg-amber-500/15 border-amber-500/50 text-amber-100'
              : 'bg-zinc-950 border-zinc-800 text-zinc-300'
          }`}
        >
          Wide
        </button>
      </div>
    </div>
  );
}
