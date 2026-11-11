'use client';

import { useCallback, useMemo, useState } from 'react';

export type PagingSummary = {
  shown: number;
  total: number;
  hasMore: boolean;
  /** How many rows the next "show more" reveals, capped at one page. */
  nextCount: number;
};

function pageSizeOf(pageSize: number): number {
  const size = Math.floor(pageSize);
  return size >= 1 ? size : 1;
}

/** Visible-row maths for a 1-based page count. Clamps when `items` shrink. */
export function pagingSummary(total: number, pageSize: number, pages: number): PagingSummary {
  const size = pageSizeOf(pageSize);
  const shownPages = Math.max(1, Math.floor(pages));
  const safeTotal = Math.max(0, Math.floor(total));
  const shown = Math.min(safeTotal, size * shownPages);
  const remaining = safeTotal - shown;
  return {
    shown,
    total: safeTotal,
    hasMore: remaining > 0,
    nextCount: Math.min(size, remaining),
  };
}

export function takePaged<T>(items: readonly T[], pageSize: number, pages: number): T[] {
  return items.slice(0, pagingSummary(items.length, pageSize, pages).shown);
}

export function usePagedList<T>(items: readonly T[], pageSize: number) {
  const [pages, setPages] = useState(1);
  const visible = useMemo(
    () => takePaged(items, pageSize, pages),
    [items, pageSize, pages],
  );
  const summary = pagingSummary(items.length, pageSize, pages);
  const showMore = useCallback(() => {
    setPages((current) => current + 1);
  }, []);
  return { visible, ...summary, showMore };
}
