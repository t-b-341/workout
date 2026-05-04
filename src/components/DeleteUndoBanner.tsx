'use client';

import { useEffect, useRef, useState } from 'react';
import { subscribeDeleteUndo, type DeleteUndoOffer } from '@/lib/deleteUndoCoordinator';
import { flushDirty, restoreDeletedRow, type RemoteTable } from '@/lib/sync';

const DISMISS_MS = 14_000;

export function DeleteUndoBanner() {
  const [offer, setOffer] = useState<DeleteUndoOffer | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearDismissTimer() {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  useEffect(() => {
    const unsub = subscribeDeleteUndo((next) => {
      clearDismissTimer();
      setOffer(next);
      timerRef.current = setTimeout(() => setOffer(null), DISMISS_MS);
    });
    return () => {
      unsub();
      clearDismissTimer();
    };
  }, []);

  async function onUndo(current: DeleteUndoOffer) {
    clearDismissTimer();
    setOffer(null);
    try {
      if (current.kind === 'row') {
        await restoreDeletedRow(current.table as RemoteTable, current.snapshot);
      } else {
        await current.restore();
      }
      await flushDirty().catch(() => {});
    } catch {
      // Non-fatal; user can restore from backups / pull once online.
    }
  }

  if (!offer) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-28 z-[100] px-4 pb-2 flex justify-center pointer-events-none"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-zinc-700 bg-zinc-900/98 backdrop-blur shadow-lg px-3 py-2.5 max-w-md w-full">
        <p className="flex-1 min-w-0 text-sm text-zinc-200">
          <span className="font-medium text-zinc-100">Removed</span>
          {' · '}
          <span className="break-words">{offer.label}</span>
        </p>
        <div className="flex items-center shrink-0 gap-1">
          <button
            type="button"
            className="h-10 px-3 rounded-lg bg-amber-500 text-zinc-950 text-sm font-semibold hover:bg-amber-400"
            onClick={() => void onUndo(offer)}
          >
            Undo
          </button>
          <button
            type="button"
            className="h-10 w-10 rounded-lg border border-transparent text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 text-xl leading-none"
            aria-label="Dismiss"
            onClick={() => {
              clearDismissTimer();
              setOffer(null);
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}
