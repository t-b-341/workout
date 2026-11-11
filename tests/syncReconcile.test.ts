import { describe, expect, it } from 'vitest';
import { planFullPull } from '../src/lib/syncReconcile';

describe('planFullPull', () => {
  it('deletes a local-only clean row', () => {
    expect(planFullPull({
      localIds: ['clean'],
      remoteLocalIds: ['server'],
      dirtyUpsertIds: [],
      dirtyDeleteIds: [],
    })).toEqual({
      deleteLocalIds: ['clean'],
      skipRemoteLocalIds: [],
    });
  });

  it('keeps a local-only row with a dirty upsert', () => {
    expect(planFullPull({
      localIds: ['pending'],
      remoteLocalIds: [],
      dirtyUpsertIds: ['pending'],
      dirtyDeleteIds: [],
    })).toEqual({
      deleteLocalIds: [],
      skipRemoteLocalIds: [],
    });
  });

  it('skips a server row with a dirty local upsert', () => {
    expect(planFullPull({
      localIds: ['pending', 'synced'],
      remoteLocalIds: ['pending', 'synced'],
      dirtyUpsertIds: ['pending'],
      dirtyDeleteIds: [],
    })).toEqual({
      deleteLocalIds: [],
      skipRemoteLocalIds: ['pending'],
    });
  });

  it('skips a server row with a dirty local delete', () => {
    expect(planFullPull({
      localIds: ['synced'],
      remoteLocalIds: ['gone', 'synced'],
      dirtyUpsertIds: [],
      dirtyDeleteIds: ['gone'],
    })).toEqual({
      deleteLocalIds: [],
      skipRemoteLocalIds: ['gone'],
    });
  });

  it('deletes nothing dirty when the server returns no rows', () => {
    expect(planFullPull({
      localIds: ['clean', 'pending'],
      remoteLocalIds: [],
      dirtyUpsertIds: ['pending'],
      dirtyDeleteIds: ['already-removed'],
    })).toEqual({
      deleteLocalIds: ['clean'],
      skipRemoteLocalIds: [],
    });
  });
});
