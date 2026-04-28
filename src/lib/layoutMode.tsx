'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export type LayoutMode = 'mobile' | 'desktop';

const STORAGE_KEY = 'workout:layout-mode';

type Ctx = {
  mode: LayoutMode;
  setMode: (m: LayoutMode) => void;
  toggleMode: () => void;
};

const LayoutModeContext = createContext<Ctx | null>(null);

function readStored(): LayoutMode {
  if (typeof window === 'undefined') return 'mobile';
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'desktop' || v === 'mobile') return v;
  } catch {
    /* ignore */
  }
  return 'mobile';
}

export function LayoutModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<LayoutMode>(() => readStored());

  const setMode = useCallback((m: LayoutMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'mobile' ? 'desktop' : 'mobile';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, setMode, toggleMode }), [mode, setMode, toggleMode]);

  return (
    <LayoutModeContext.Provider value={value}>{children}</LayoutModeContext.Provider>
  );
}

export function useLayoutMode(): Ctx {
  const ctx = useContext(LayoutModeContext);
  if (!ctx) {
    throw new Error('useLayoutMode must be used within LayoutModeProvider');
  }
  return ctx;
}

/** Max width for main app chrome (nav + page column). */
export function shellMaxClass(mode: LayoutMode): string {
  return mode === 'mobile' ? 'max-w-lg' : 'max-w-6xl';
}

/** Inner page column: a bit narrower than full shell on desktop for readability. */
export function pageMaxClass(mode: LayoutMode, variant: 'default' | 'program' = 'default'): string {
  if (variant === 'program') {
    return mode === 'mobile' ? 'max-w-4xl' : 'max-w-6xl';
  }
  return mode === 'mobile' ? 'max-w-2xl' : 'max-w-5xl';
}
