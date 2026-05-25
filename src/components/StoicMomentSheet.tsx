'use client';

import { useEffect, useState } from 'react';
import { flushDirty, localUpsert } from '@/lib/sync';

export function StoicMomentSheet({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const [reflection, setReflection] = useState('');
  const [action, setAction] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSave() {
    if (!reflection.trim()) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await localUpsert('stoic_moments', {
        id: `stoicm-${Date.now()}`,
        date,
        createdAt: now,
        reflection: reflection.trim(),
        action: action.trim() || undefined,
        updatedAt: now,
      });
      await flushDirty().catch(() => {});
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-t-3xl border border-zinc-800 bg-zinc-950 flex flex-col">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-base font-semibold text-zinc-100">Stoic moment</h3>
            <p className="text-[11px] text-zinc-600 mt-0.5">
              What&apos;s happening, and what&apos;s within your control?
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">
              What&apos;s within your control right now?
            </label>
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="The situation, what you can control, what you can't..."
              rows={3}
              autoFocus
              className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-zinc-400">One action (optional)</label>
            <textarea
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="One specific thing within your control..."
              rows={2}
              className="w-full rounded-xl bg-zinc-900 border border-zinc-700 px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        <div className="p-4 border-t border-zinc-800 shrink-0">
          <button
            type="button"
            disabled={!reflection.trim() || busy}
            onClick={() => void handleSave()}
            className="w-full h-11 rounded-xl bg-amber-600 text-zinc-950 text-sm font-medium disabled:opacity-40 hover:bg-amber-500 transition-colors"
          >
            {busy ? 'Saving…' : 'Save moment'}
          </button>
        </div>
      </div>
    </div>
  );
}
