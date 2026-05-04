import type { DirtyRow } from './db';

/** Same union as DirtyRow.table — avoids importing ./sync here (cycle). */
export type UndoRemoteTable = DirtyRow['table'];

export type DeleteUndoOfferRow = {
  kind: 'row';
  table: UndoRemoteTable;
  snapshot: Record<string, unknown>;
  label: string;
};

export type DeleteUndoOfferBatch = {
  kind: 'batch';
  label: string;
  restore: () => Promise<void>;
};

export type DeleteUndoOffer = DeleteUndoOfferRow | DeleteUndoOfferBatch;

let listener: ((offer: DeleteUndoOffer) => void) | null = null;

export function subscribeDeleteUndo(fn: (offer: DeleteUndoOffer) => void): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/** Surfaces snackbar Undo for deletes that opt in via `undoLabel` or batch offers. */
export function offerDeleteUndo(offer: DeleteUndoOffer): void {
  listener?.(offer);
}
