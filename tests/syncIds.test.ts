import { describe, expect, it } from 'vitest';
import { localIdFor, remoteIdFor } from '../src/lib/sync';

describe('remoteIdFor', () => {
  it('prefixes templates with the user id', () => {
    expect(remoteIdFor('templates', 'L1', 'user-abc')).toBe('user-abc:L1');
  });

  it('prefixes nutrition_logs with the user id', () => {
    expect(remoteIdFor('nutrition_logs', 'nutrition-2026-05-27', 'user-abc')).toBe(
      'user-abc:nutrition-2026-05-27',
    );
  });

  it('prefixes the other collision-prone tables', () => {
    const tables = [
      'session_logs',
      'readiness_logs',
      'hydration_logs',
      'bodyweight_logs',
      'oral_health_logs',
      'sleep_logs',
      'stoic_checkins',
      'relationship_checkins',
      'body_measurement_logs',
      'supplement_logs',
      'block_templates',
      'phase_goals',
    ] as const;
    for (const t of tables) {
      expect(remoteIdFor(t, 'shared-id', 'user-abc')).toBe('user-abc:shared-id');
    }
  });

  it('leaves set_logs and cardio_logs PKs untouched (UUID/timestamp-keyed)', () => {
    // The session_log_id FK on these tables IS transformed in pushOne,
    // but the primary key itself stays bare because the local pattern
    // already includes Date.now() / session-derived uniqueness.
    expect(remoteIdFor('set_logs', 'sl-xyz', 'user-abc')).toBe('sl-xyz');
    expect(remoteIdFor('cardio_logs', 'cardio-xyz', 'user-abc')).toBe('cardio-xyz');
  });

  it('leaves an already-prefixed id untouched', () => {
    expect(remoteIdFor('nutrition_logs', 'user-abc:nutrition-2026-05-27', 'user-abc')).toBe(
      'user-abc:nutrition-2026-05-27',
    );
  });

  it('returns the bare id when no user id is available', () => {
    expect(remoteIdFor('nutrition_logs', 'nutrition-2026-05-27', null)).toBe(
      'nutrition-2026-05-27',
    );
  });
});

describe('localIdFor', () => {
  it('strips a single user prefix for affected tables', () => {
    expect(localIdFor('nutrition_logs', 'user-abc:nutrition-2026-05-27')).toBe(
      'nutrition-2026-05-27',
    );
    expect(localIdFor('templates', 'user-abc:L1')).toBe('L1');
  });

  it('only strips the first segment when the local id itself contains colons', () => {
    expect(localIdFor('templates', 'user-abc:custom:L1')).toBe('custom:L1');
  });

  it('returns a bare id unchanged for affected tables', () => {
    expect(localIdFor('templates', 'L1')).toBe('L1');
    expect(localIdFor('nutrition_logs', 'nutrition-2026-05-27')).toBe('nutrition-2026-05-27');
  });

  it('returns the id untouched for non-affected tables, even if it contains a colon', () => {
    expect(localIdFor('set_logs', 'user-abc:not-actually-prefixed')).toBe(
      'user-abc:not-actually-prefixed',
    );
    expect(localIdFor('cardio_logs', 'foo:bar')).toBe('foo:bar');
  });

  it('round-trips back to the original bare id via remoteIdFor', () => {
    const tables = ['templates', 'nutrition_logs', 'bodyweight_logs'] as const;
    for (const t of tables) {
      expect(localIdFor(t, remoteIdFor(t, 'log-2026-05-27', 'user-xyz'))).toBe(
        'log-2026-05-27',
      );
    }
  });
});
