'use client';

import { useState } from 'react';
import { persistSessionUpdate } from '@/lib/sync';
import { fmtDate } from '@/lib/time';
import type { SessionLog, SessionTemplate } from '@/lib/types';

/** First non-empty line, so a saved note is visible on the collapsed row. */
function firstNoteLine(text: string | undefined): string | null {
  if (!text) return null;
  for (const part of text.split(/\r?\n/)) {
    const line = part.trim();
    if (line.length > 0) return line;
  }
  return null;
}

export function SessionHeader({
  template,
  session,
  templates,
  onTemplateChange,
  hideTemplatePicker = false,
}: {
  template: SessionTemplate;
  session: SessionLog;
  templates: SessionTemplate[];
  onTemplateChange: (t: SessionTemplate) => void;
  /** When true, session template is fixed (e.g. Sunday before early Monday unlock). */
  hideTemplatePicker?: boolean;
}) {
  const reasonSyncKey = `${session.id}|${session.reason ?? ''}`;
  const [reasonSyncSeen, setReasonSyncSeen] = useState(reasonSyncKey);
  const [reasonDraft, setReasonDraft] = useState(session.reason ?? '');
  const [noteOpen, setNoteOpen] = useState(false);
  if (reasonSyncKey !== reasonSyncSeen) {
    setReasonSyncSeen(reasonSyncKey);
    setReasonDraft(session.reason ?? '');
    setNoteOpen(false);
  }

  async function saveReasonNote() {
    const trimmed = reasonDraft.trim();
    const next = trimmed.length > 0 ? trimmed : undefined;
    if (next === session.reason) return;
    await persistSessionUpdate(session, { reason: next });
  }

  const savedLine = firstNoteLine(reasonDraft);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-zinc-500 uppercase tracking-wider">{fmtDate(session.date, 'EEEE, MMM d')}</div>
          <h1 className="mt-1 break-words text-2xl font-semibold">{template.name}</h1>
        </div>
        {!hideTemplatePicker ? (
          <select
            value={template.id}
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) onTemplateChange(t);
            }}
            className="h-11 shrink-0 rounded-lg bg-zinc-900 border border-zinc-800 px-2 text-sm"
            aria-label="Session template"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.id}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-zinc-500 tabular-nums px-2" aria-hidden>
            {template.id}
          </span>
        )}
      </div>

      {session.mode === 'light' && (
        <div className="text-xs text-amber-400">
          Light day active — main lifts shown at −20%. Progression won&apos;t advance even if you hit the top of the range.
        </div>
      )}
      {noteOpen ? (
        <label className="block text-xs text-zinc-500">
          Session note (why this mode?)
          <textarea
            autoFocus
            value={reasonDraft}
            onChange={(e) => setReasonDraft(e.target.value)}
            onBlur={() => {
              void saveReasonNote();
              setNoteOpen(false);
            }}
            rows={2}
            placeholder="Optional — e.g. poor sleep, joint tweak, time crunch…"
            className="mt-1 w-full rounded-lg bg-zinc-950 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 resize-y min-h-[2.5rem]"
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setNoteOpen(true)}
          className="flex min-h-11 w-full items-center rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-left"
        >
          <span className={`block min-w-0 flex-1 truncate ${savedLine ? 'text-zinc-200' : 'text-zinc-500'}`}>
            {savedLine ?? 'Add session note'}
          </span>
        </button>
      )}
      {session.deload && (
        <div className="text-xs text-indigo-400">
          Deload active — mains ~60% load; accessories ~half volume (sets, cardio time, or interval rounds).
          No progression.
        </div>
      )}
    </div>
  );
}
