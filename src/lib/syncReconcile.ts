/**
 * Decide which local rows a full pull may delete, and which server rows
 * must not overwrite a change that is still waiting in the dirty queue.
 * All ids are local ids (`localIdFor` on the way in).
 */
export type FullPullPlanInput = {
  localIds: readonly string[];
  remoteLocalIds: readonly string[];
  dirtyUpsertIds: readonly string[];
  dirtyDeleteIds: readonly string[];
};

export type FullPullPlan = {
  deleteLocalIds: string[];
  skipRemoteLocalIds: string[];
};

export function planFullPull(input: FullPullPlanInput): FullPullPlan {
  const remote = new Set(input.remoteLocalIds);
  const dirtyUpsert = new Set(input.dirtyUpsertIds);
  const dirtyLocal = new Set<string>([
    ...input.dirtyUpsertIds,
    ...input.dirtyDeleteIds,
  ]);

  return {
    deleteLocalIds: input.localIds.filter((id) => !remote.has(id) && !dirtyUpsert.has(id)),
    skipRemoteLocalIds: input.remoteLocalIds.filter((id) => dirtyLocal.has(id)),
  };
}
