'use client';

import { useId, useSyncExternalStore, type ReactNode } from 'react';

/** Per-row open state for Today trackers and Daily Check-In. Missing keys stay collapsed. */
export const TODAY_SECTIONS_STORAGE_KEY = 'workout:todaySections:v1';

const CHANGE_EVENT = 'workout-today-sections';

type SectionMap = Record<string, boolean>;

function readMap(): SectionMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(TODAY_SECTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: SectionMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === true) out[key] = true;
    }
    return out;
  } catch {
    return {};
  }
}

function readSectionOpen(sectionId: string): boolean {
  return readMap()[sectionId] === true;
}

function writeSectionOpen(sectionId: string, open: boolean) {
  const next = readMap();
  if (open) next[sectionId] = true;
  else delete next[sectionId];
  try {
    localStorage.setItem(TODAY_SECTIONS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* private mode or quota */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribeSections(onStoreChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  window.addEventListener('storage', onStoreChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
    window.removeEventListener('storage', onStoreChange);
  };
}

/**
 * One tracker row. The header is always mounted; `children` mount only while open
 * so a collapsed card cannot write on view.
 */
export function CollapsibleCard({
  sectionId,
  title,
  summary,
  children,
}: {
  sectionId: string;
  title: string;
  summary: string;
  children: ReactNode;
}) {
  const panelId = useId();
  const open = useSyncExternalStore(
    subscribeSections,
    () => readSectionOpen(sectionId),
    () => false,
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => writeSectionOpen(sectionId, !open)}
        className="flex min-h-[44px] w-full items-center gap-3 px-3 text-left hover:bg-zinc-800/50"
      >
        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium text-zinc-100">{title}</span>
          <span className="text-zinc-500"> · {summary}</span>
        </span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M5 7.5 L10 12.5 L15 7.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <div id={panelId} hidden={!open} className={open ? 'border-t border-zinc-800 p-2' : undefined}>
        {open ? children : null}
      </div>
    </div>
  );
}
