import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { E2E_USER_ID, createE2eStubClient } from '@/lib/supabase/e2eStub';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

let cookieJar = '';

beforeEach(() => {
  cookieJar = '';
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('document', {
    get cookie() {
      return cookieJar;
    },
    set cookie(value: string) {
      const [pair, ...attrs] = value.split(';').map((part) => part.trim());
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq);
      const stored = pair.slice(eq + 1);
      const drop = attrs.some((attr) => attr.toLowerCase().startsWith('max-age=0'));
      const parts = cookieJar
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && !part.startsWith(`${name}=`));
      if (!drop && stored.length > 0) parts.push(`${name}=${stored}`);
      cookieJar = parts.join('; ');
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('e2e supabase stub', () => {
  it('returns a null user until the e2e-user cookie is set', async () => {
    const client = createE2eStubClient();
    const signedOut = await client.auth.getUser();
    expect(signedOut.data.user).toBeNull();

    document.cookie = 'e2e-user=1';
    const signedIn = await client.auth.getUser();
    expect(signedIn.data.user?.id).toBe(E2E_USER_ID);
    const session = await client.auth.getSession();
    expect(session.data.session?.user.id).toBe(E2E_USER_ID);

    await client.auth.signOut();
    const after = await client.auth.getUser();
    expect(after.data.user).toBeNull();
  });

  it('getUser reports a retryable fetch error when e2e:auth-offline is set', async () => {
    document.cookie = 'e2e-user=1';
    localStorage.setItem('e2e:auth-offline', '1');
    const client = createE2eStubClient();
    await expect(client.auth.getUser()).resolves.toEqual({
      data: { user: null },
      error: { name: 'AuthRetryableFetchError', status: 0 },
    });
    const session = await client.auth.getSession();
    expect(session.data.session?.user.id).toBe(E2E_USER_ID);
  });

  it('reports the missing lifts table and does not store rows', async () => {
    const client = createE2eStubClient();
    const result = await client.from('lifts').select('*');
    expect(result.error).toEqual({
      code: 'PGRST205',
      message: "Could not find the table 'public.lifts' in the schema cache",
    });
    expect(localStorage.getItem('e2e:db:lifts')).toBeNull();
  });

  it('stamps a strictly later updated_at on every write when the clock is frozen', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T16:00:00.000Z'));
    try {
      const client = createE2eStubClient();
      await client.from('session_logs').upsert({ id: 'a' });
      await client.from('session_logs').upsert({ id: 'b' });
      await client.from('set_logs').upsert([{ id: 'c' }, { id: 'd' }]);

      const sessions = JSON.parse(localStorage.getItem('e2e:db:session_logs') ?? '[]') as Array<{
        id: string;
        updated_at: string;
      }>;
      const sets = JSON.parse(localStorage.getItem('e2e:db:set_logs') ?? '[]') as Array<{
        id: string;
        updated_at: string;
      }>;
      const stamps = ['a', 'b'].map((id) => sessions.find((row) => row.id === id)!.updated_at);
      for (const id of ['c', 'd']) stamps.push(sets.find((row) => row.id === id)!.updated_at);
      expect(stamps).toEqual([
        '2026-11-09T16:00:00.001Z',
        '2026-11-09T16:00:00.002Z',
        '2026-11-09T16:00:00.003Z',
        '2026-11-09T16:00:00.004Z',
      ]);

      localStorage.setItem('e2e:updated-at-seq', '4');
      await client.from('session_logs').upsert({ id: 'e' });
      const again = JSON.parse(localStorage.getItem('e2e:db:session_logs') ?? '[]') as Array<{
        id: string;
        updated_at: string;
      }>;
      expect(again.find((row) => row.id === 'e')?.updated_at).toBe('2026-11-09T16:00:00.005Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('upserts with updated_at, filters, and honours inclusive range', async () => {
    const client = createE2eStubClient();
    const { error } = await client.from('set_logs').upsert([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]);
    expect(error).toBeNull();

    const stored = JSON.parse(localStorage.getItem('e2e:db:set_logs') ?? '[]') as Array<{
      id: string;
      updated_at: string;
    }>;
    expect(stored.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(stored.every((row) => typeof row.updated_at === 'string' && row.updated_at.length > 0)).toBe(true);

    const page = await client.from('set_logs').select('*').order('id').range(0, 1);
    expect(page.data?.map((row) => row.id)).toEqual(['a', 'b']);

    const filtered = await client.from('set_logs').select('*').eq('id', 'b');
    expect(filtered.data).toHaveLength(1);

    const newer = await client.from('set_logs').select('*').gt('id', 'a');
    expect(newer.data?.map((row) => row.id).sort()).toEqual(['b', 'c']);

    const either = await client.from('set_logs').select('id', { count: 'exact', head: true }).or('id.eq.a,id.eq.c');
    expect(either.data).toBeNull();
    expect(either.count).toBe(2);

    const removed = await client.from('set_logs').delete().eq('id', 'b');
    expect(removed.error).toBeNull();
    const left = await client.from('set_logs').select('*');
    expect(left.data?.map((row) => row.id).sort()).toEqual(['a', 'c']);
  });

  it('returns at most 1,000 rows unless a range is given', async () => {
    const client = createE2eStubClient();
    const seeded = Array.from({ length: 2500 }, (_, i) => ({
      id: `row-${String(i).padStart(4, '0')}`,
    }));
    localStorage.setItem('e2e:db:set_logs', JSON.stringify(seeded));

    const capped = await client.from('set_logs').select('*');
    expect(capped.error).toBeNull();
    expect(capped.data).toHaveLength(1000);

    const page = await client
      .from('set_logs')
      .select('*')
      .order('id', { ascending: true })
      .range(1000, 1999);
    expect(page.data).toHaveLength(1000);
    expect(page.data?.[0]?.id).toBe('row-1000');
    expect(page.data?.[999]?.id).toBe('row-1999');

    const tail = await client
      .from('set_logs')
      .select('*')
      .order('id', { ascending: true })
      .range(2000, 2999);
    expect(tail.data).toHaveLength(500);
    expect(tail.data?.[0]?.id).toBe('row-2000');
  });

  it('fails upsert and delete for tables listed in e2e:fail', async () => {
    const client = createE2eStubClient();
    await client.from('bodyweight_logs').upsert({ id: 'keep', bodyweight: 1 });
    localStorage.setItem('e2e:fail', 'bodyweight_logs, set_logs');

    const write = await client.from('bodyweight_logs').upsert({ id: 'new', bodyweight: 2 });
    expect(write.error).toEqual({ code: '42703', status: 400, message: 'e2e injected' });
    const del = await client.from('bodyweight_logs').delete().eq('id', 'keep');
    expect(del.error).toEqual({ code: '42703', status: 400, message: 'e2e injected' });

    const still = await client.from('bodyweight_logs').select('*');
    expect(still.error).toBeNull();
    expect(still.data?.map((row) => row.id)).toEqual(['keep']);
  });

  it('notifies auth listeners with the current session', async () => {
    document.cookie = 'e2e-user=1';
    const client = createE2eStubClient();
    const seen: Array<string | null> = [];
    client.auth.onAuthStateChange((_event, session) => {
      seen.push(session?.user.id ?? null);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen).toEqual([E2E_USER_ID]);
  });
});
