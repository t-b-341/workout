/**
 * In-memory stand-in for the browser Supabase client, used by Playwright.
 * Active only when the caller has already checked
 * `NEXT_PUBLIC_E2E_STUB === '1' && NODE_ENV !== 'production'`.
 *
 * Signed in only when the `e2e-user=1` cookie is present. Rows live in
 * localStorage under `e2e:db:<table>`. `localStorage['e2e:fail']` is a comma
 * list of tables whose upsert and delete calls fail.
 *
 * A select with no `.range()` returns at most 1,000 rows, matching
 * PostgREST's default max-rows. `.range()` and `.order()` are honoured so a
 * paged pull can read past that cap.
 */

export const E2E_USER_ID = '00000000-0000-4000-8000-000000000001';

const DB_PREFIX = 'e2e:db:';
const FAIL_KEY = 'e2e:fail';
const COOKIE_NAME = 'e2e-user';
/** PostgREST default max-rows. Selects without `.range()` must not exceed it. */
const DEFAULT_MAX_ROWS = 1000;

type Row = Record<string, unknown>;

export type E2eQueryError = {
  code: string;
  message: string;
  status?: number;
};

export type E2eQueryResult = {
  data: Row[] | null;
  error: E2eQueryError | null;
  count: number | null;
  status: number;
  statusText: string;
};

type Filter = (row: Row) => boolean;

type Op = 'select' | 'upsert' | 'delete';

type OrderSpec = { column: string; ascending: boolean };

const LIFTS_ERROR: E2eQueryError = {
  code: 'PGRST205',
  message: "Could not find the table 'public.lifts' in the schema cache",
};

const FAIL_ERROR: E2eQueryError = {
  code: '42703',
  status: 400,
  message: 'e2e injected',
};

export type E2eUser = {
  id: string;
  aud: string;
  role: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
};

export type E2eSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: E2eUser;
};

type AuthCallback = (event: string, session: E2eSession | null) => void;

const authListeners = new Set<AuthCallback>();

function hasE2eUserCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((part) => {
    const [name, value] = part.trim().split('=');
    return name === COOKIE_NAME && value === '1';
  });
}

function e2eUser(): E2eUser {
  return {
    id: E2E_USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'e2e@localhost',
    app_metadata: {},
    user_metadata: {},
  };
}

function currentSession(): E2eSession | null {
  if (!hasE2eUserCookie()) return null;
  return {
    access_token: 'e2e-access-token',
    refresh_token: 'e2e-refresh-token',
    expires_in: 3600,
    token_type: 'bearer',
    user: e2eUser(),
  };
}

function emitAuth(event: string) {
  const session = currentSession();
  for (const cb of authListeners) {
    try {
      cb(event, session);
    } catch {
      // A listener must not break auth or sync.
    }
  }
}

function storage(): Storage {
  if (typeof localStorage === 'undefined') {
    throw new Error('e2e stub storage is only available in the browser');
  }
  return localStorage;
}

function readTable(table: string): Row[] {
  const raw = storage().getItem(`${DB_PREFIX}${table}`);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is Row => typeof row === 'object' && row !== null && !Array.isArray(row),
    );
  } catch {
    return [];
  }
}

function writeTable(table: string, rows: Row[]) {
  storage().setItem(`${DB_PREFIX}${table}`, JSON.stringify(rows));
}

function failingTables(): Set<string> {
  let raw = '';
  try {
    raw = storage().getItem(FAIL_KEY) ?? '';
  } catch {
    return new Set();
  }
  return new Set(
    raw
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  );
}

function compare(actual: unknown, op: string, expected: string): boolean {
  if (op === 'eq') return actual != null && String(actual) === expected;
  if (op === 'neq') return actual == null || String(actual) !== expected;
  if (actual == null) return false;
  const left = typeof actual === 'number' ? actual : String(actual);
  const right = typeof actual === 'number' && expected !== '' && !Number.isNaN(Number(expected))
    ? Number(expected)
    : expected;
  if (typeof left === 'number' && typeof right === 'number') {
    if (op === 'gt') return left > right;
    if (op === 'gte') return left >= right;
    if (op === 'lt') return left < right;
    if (op === 'lte') return left <= right;
    return false;
  }
  const a = String(actual);
  if (op === 'gt') return a > expected;
  if (op === 'gte') return a >= expected;
  if (op === 'lt') return a < expected;
  if (op === 'lte') return a <= expected;
  return false;
}

function parseOr(filters: string): Filter {
  const clauses = filters.split(',').map((part) => {
    const trimmed = part.trim();
    const first = trimmed.indexOf('.');
    const second = first < 0 ? -1 : trimmed.indexOf('.', first + 1);
    if (first <= 0 || second < 0) return () => false;
    const column = trimmed.slice(0, first);
    const op = trimmed.slice(first + 1, second);
    let value = trimmed.slice(second + 1);
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    return (row: Row) => compare(row[column], op, value);
  });
  return (row) => clauses.some((clause) => clause(row));
}

function cmp(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const as = String(a);
  const bs = String(b);
  if (as < bs) return -1;
  if (as > bs) return 1;
  return 0;
}

function ok(data: Row[] | null, count: number | null): E2eQueryResult {
  return { data, error: null, count, status: 200, statusText: 'OK' };
}

function failure(error: E2eQueryError, status: number, statusText: string): E2eQueryResult {
  return { data: null, error, count: null, status, statusText };
}

export interface E2eQuery extends PromiseLike<E2eQueryResult> {
  select(
    columns?: string,
    options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
  ): E2eQuery;
  upsert(
    values: Row | Row[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): E2eQuery;
  delete(): E2eQuery;
  eq(column: string, value: unknown): E2eQuery;
  gt(column: string, value: unknown): E2eQuery;
  or(filters: string): E2eQuery;
  order(column: string, options?: { ascending?: boolean }): E2eQuery;
  range(from: number, to: number): E2eQuery;
}

function createQuery(table: string): E2eQuery {
  let op: Op | null = null;
  let head = false;
  let countMode: string | null = null;
  let upsertRows: Row[] | null = null;
  let onConflict = 'id';
  let ignoreDuplicates = false;
  const filters: Filter[] = [];
  const ordering: OrderSpec[] = [];
  let rangeFrom: number | null = null;
  let rangeTo: number | null = null;
  let pending: Promise<E2eQueryResult> | null = null;

  const builder: E2eQuery = {
    select(_columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
      op = 'select';
      head = options?.head === true;
      countMode = options?.count ?? null;
      return builder;
    },
    upsert(values: Row | Row[], options?: { onConflict?: string; ignoreDuplicates?: boolean }) {
      op = 'upsert';
      const list = Array.isArray(values) ? values : [values];
      const now = new Date().toISOString();
      upsertRows = list.map((row) => ({ ...row, updated_at: now }));
      onConflict = options?.onConflict ?? 'id';
      ignoreDuplicates = options?.ignoreDuplicates === true;
      return builder;
    },
    delete() {
      op = 'delete';
      return builder;
    },
    eq(column: string, value: unknown) {
      filters.push((row) => row[column] === value);
      return builder;
    },
    gt(column: string, value: unknown) {
      filters.push((row) => {
        const actual = row[column];
        if (actual == null || value == null) return false;
        if (typeof actual === 'number' && typeof value === 'number') return actual > value;
        return String(actual) > String(value);
      });
      return builder;
    },
    or(filtersText: string) {
      filters.push(parseOr(filtersText));
      return builder;
    },
    order(column: string, options?: { ascending?: boolean }) {
      ordering.push({ column, ascending: options?.ascending !== false });
      return builder;
    },
    range(from: number, to: number) {
      rangeFrom = from;
      rangeTo = to;
      return builder;
    },
    then(onFulfilled, onRejected) {
      pending ??= Promise.resolve().then(execute);
      return pending.then(onFulfilled, onRejected);
    },
  };

  function execute(): E2eQueryResult {
    if (table === 'lifts') {
      return failure(LIFTS_ERROR, 404, 'Not Found');
    }
    if ((op === 'upsert' || op === 'delete') && failingTables().has(table)) {
      return failure(FAIL_ERROR, 400, 'Bad Request');
    }
    if (op === 'upsert') {
      const stored = readTable(table);
      for (const row of upsertRows ?? []) {
        const key = row[onConflict];
        const idx = key == null ? -1 : stored.findIndex((existing) => existing[onConflict] === key);
        if (idx >= 0) {
          if (ignoreDuplicates) continue;
          stored[idx] = { ...stored[idx], ...row };
        } else {
          stored.push(row);
        }
      }
      writeTable(table, stored);
      return ok(null, null);
    }
    if (op === 'delete') {
      const stored = readTable(table);
      const kept = stored.filter((row) => !filters.every((filter) => filter(row)));
      writeTable(table, kept);
      return ok(null, null);
    }
    let rows = readTable(table).filter((row) => filters.every((filter) => filter(row)));
    if (ordering.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const spec of ordering) {
          const c = cmp(a[spec.column], b[spec.column]);
          if (c !== 0) return spec.ascending ? c : -c;
        }
        return 0;
      });
    }
    const count = countMode ? rows.length : null;
    if (rangeFrom != null && rangeTo != null) {
      rows = rows.slice(rangeFrom, rangeTo + 1);
    } else {
      rows = rows.slice(0, DEFAULT_MAX_ROWS);
    }
    if (head) return ok(null, count);
    return ok(rows, count);
  }

  return builder;
}

async function getUser() {
  const session = currentSession();
  return { data: { user: session?.user ?? null }, error: null };
}

async function getSession() {
  return { data: { session: currentSession() }, error: null };
}

async function refreshSession() {
  const session = currentSession();
  return { data: { session, user: session?.user ?? null }, error: null };
}

function onAuthStateChange(callback: AuthCallback) {
  authListeners.add(callback);
  queueMicrotask(() => {
    if (!authListeners.has(callback)) return;
    try {
      callback('INITIAL_SESSION', currentSession());
    } catch {
      // ignore
    }
  });
  return {
    data: {
      subscription: {
        unsubscribe() {
          authListeners.delete(callback);
        },
      },
    },
  };
}

async function signOut() {
  if (typeof document !== 'undefined') {
    document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
  }
  emitAuth('SIGNED_OUT');
  return { error: null };
}

async function signInWithOAuth(credentials?: { provider?: string }) {
  return {
    data: { provider: credentials?.provider ?? 'github', url: null },
    error: null,
  };
}

function channel() {
  const ch = {
    on() {
      return ch;
    },
    subscribe() {
      return ch;
    },
  };
  return ch;
}

export function createE2eStubClient() {
  return {
    auth: {
      getUser,
      getSession,
      refreshSession,
      onAuthStateChange,
      signOut,
      signInWithOAuth,
    },
    from(table: string) {
      return createQuery(table);
    },
    channel,
    removeChannel() {
      return Promise.resolve('ok' as const);
    },
  };
}
