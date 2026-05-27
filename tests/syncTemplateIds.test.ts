import { describe, expect, it } from 'vitest';
import { localTemplateId, remoteTemplateId } from '../src/lib/sync';

describe('remoteTemplateId', () => {
  it('prefixes a bare id with the user id', () => {
    expect(remoteTemplateId('L1', 'user-abc')).toBe('user-abc:L1');
  });

  it('leaves an already-prefixed id untouched', () => {
    expect(remoteTemplateId('user-abc:L1', 'user-abc')).toBe('user-abc:L1');
  });

  it('prefixes ids that contain colons but are not the current user prefix', () => {
    expect(remoteTemplateId('other-user:L1', 'user-abc')).toBe('user-abc:other-user:L1');
  });

  it('returns the bare id when no user id is available', () => {
    expect(remoteTemplateId('L1', null)).toBe('L1');
  });
});

describe('localTemplateId', () => {
  it('strips a single user prefix', () => {
    expect(localTemplateId('user-abc:L1')).toBe('L1');
  });

  it('only strips the first segment when multiple colons exist', () => {
    expect(localTemplateId('user-abc:custom:L1')).toBe('custom:L1');
  });

  it('returns a bare id unchanged', () => {
    expect(localTemplateId('L1')).toBe('L1');
  });

  it('round-trips back to the original bare id via remoteTemplateId', () => {
    expect(localTemplateId(remoteTemplateId('UMAX', 'user-xyz'))).toBe('UMAX');
  });
});
