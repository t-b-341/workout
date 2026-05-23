'use client';

import { useEffect, useState } from 'react';
import { flushDirty, localUpsert } from '@/lib/sync';

type Props = {
  date: string;
  stressLogId?: string | null;
  onClose: () => void;
};

export function CbtThoughtRecordSheet({ date, stressLogId, onClose }: Props) {
  const [situation, setSituation] = useState('');
  const [automaticThought, setAutomaticThought] = useState('');
  const [emotion, setEmotion] = useState('');
  const [emotionIntensity, setEmotionIntensity] = useState(5);
  const [evidence, setEvidence] = useState('');
  const [alternativeThought, setAlternativeThought] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await localUpsert('cbt_thought_records', {
        id: `cbt-${date}-${Date.now()}`,
        date,
        createdAt: now,
        situation: situation.trim(),
        automaticThought: automaticThought.trim(),
        emotion: emotion.trim(),
        emotionIntensity,
        evidence: evidence.trim(),
        alternativeThought: alternativeThought.trim(),
        stressLogId: stressLogId ?? null,
        updatedAt: now,
      });
      await flushDirty().catch(() => {});
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const textareaClass =
    'mt-1 block w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-y min-h-[4rem]';

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center sm:items-center p-0 sm:p-4">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cbt-thought-record-title"
        className="relative w-full max-w-lg rounded-t-3xl sm:rounded-3xl border border-zinc-800 bg-zinc-950 shadow-2xl max-h-[min(92dvh,720px)] flex flex-col mb-14 sm:mb-0"
      >
        <div className="p-4 border-b border-zinc-800 shrink-0 flex items-center justify-between gap-2">
          <h2 id="cbt-thought-record-title" className="text-lg font-semibold text-zinc-100">
            Thought record
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-200 text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-4 space-y-4">
          <label className="block text-xs text-zinc-500">
            Situation
            <textarea
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              rows={3}
              placeholder="What happened? Just the facts, no interpretation."
              className={textareaClass}
            />
          </label>

          <label className="block text-xs text-zinc-500">
            Automatic thought
            <textarea
              value={automaticThought}
              onChange={(e) => setAutomaticThought(e.target.value)}
              rows={3}
              placeholder="What did your mind immediately say?"
              className={textareaClass}
            />
          </label>

          <div className="space-y-2">
            <label className="block text-xs text-zinc-500">
              Emotion
              <input
                type="text"
                value={emotion}
                onChange={(e) => setEmotion(e.target.value)}
                placeholder="e.g. anxiety, frustration"
                className="mt-1 block w-full rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600"
              />
            </label>
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-500 shrink-0">Intensity</span>
              <button
                type="button"
                onClick={() => setEmotionIntensity((v) => Math.max(1, v - 1))}
                className="h-9 w-9 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-lg font-medium flex items-center justify-center disabled:opacity-40"
                disabled={emotionIntensity <= 1}
              >
                −
              </button>
              <div className="text-center min-w-[3rem]">
                <div className="text-2xl font-mono font-semibold text-zinc-100">{emotionIntensity}</div>
                <div className="text-[10px] text-zinc-500 mt-0.5">/ 10</div>
              </div>
              <button
                type="button"
                onClick={() => setEmotionIntensity((v) => Math.min(10, v + 1))}
                className="h-9 w-9 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-lg font-medium flex items-center justify-center disabled:opacity-40"
                disabled={emotionIntensity >= 10}
              >
                +
              </button>
            </div>
          </div>

          <label className="block text-xs text-zinc-500">
            Evidence
            <textarea
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              rows={3}
              placeholder="What's the evidence for and against this thought being completely true?"
              className={textareaClass}
            />
          </label>

          <label className="block text-xs text-zinc-500">
            Alternative thought
            <textarea
              value={alternativeThought}
              onChange={(e) => setAlternativeThought(e.target.value)}
              rows={3}
              placeholder="What's a more accurate, balanced way to see this?"
              className={textareaClass}
            />
          </label>
        </div>

        <div className="p-4 border-t border-zinc-800 shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="w-full h-11 rounded-lg bg-amber-500 text-zinc-950 font-medium text-sm disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
