'use client';

import Link from 'next/link';
import { useDirtyQueueCount, useOnline } from '@/lib/hooks';

/** Compact online/offline + dirty-queue hint for gym-floor confidence. */
export function SyncStatusBar() {
  const pending = useDirtyQueueCount();
  const online = useOnline();

  if (pending === undefined) return null;

  const statusDot = online ? 'bg-emerald-500' : 'bg-amber-500';
  let message: string;
  if (!online) {
    message = pending > 0 ? `Offline · ${pending} saved on this device` : 'Offline · changes stay on this device';
  } else if (pending > 0) {
    message = `${pending} waiting to upload`;
  } else {
    message = 'Up to date';
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/85 px-3 py-2 text-xs text-zinc-400 backdrop-blur-sm"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot}`} aria-hidden />
        <span className="truncate">{message}</span>
      </span>
      <Link href="/program" className="shrink-0 font-medium text-amber-400 hover:text-amber-300">
        Sync
      </Link>
    </div>
  );
}
