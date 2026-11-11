'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { isUserAllowed } from '@/lib/authAllowlist';
import { createClient } from '@/lib/supabase/client';
import {
  importCompletedSession,
  PP_OHP_WORKOUT_MAY_15,
} from '@/lib/importCompletedSession';
import { getDb, initDb } from '@/lib/db';
import { AppShellImportTrigger } from '@/components/AppShellImportTrigger';
import { shellMaxClass, useLayoutMode } from '@/lib/layoutMode';
import {
  clearCachedUserId,
  ensureLocalSeed,
  flushDirty,
  localUpsert,
  pullAll,
  seedRemotePrescriptionsIfEmpty,
  seedRemoteTemplatesIfEmpty,
  ensureS1RemoteTemplate,
  setCachedUserId,
  subscribeRealtime,
} from '@/lib/sync';
import { backfillCardioFromSets } from '@/lib/backfill';
import { repairOpeningPrBaselineSession } from '@/lib/openingPrBaseline';
import { fireDueTrackerReminders, isTrackerRemindersEnabled } from '@/lib/trackerReminders';

declare global {
  interface Window {
    __workoutDev?: {
      importCompletedSession: typeof importCompletedSession;
      PP_OHP_WORKOUT_MAY_15: typeof PP_OHP_WORKOUT_MAY_15;
    };
  }
}

/** Gateway and "no HTTP response" statuses. These are not an auth decision. */
const RETRYABLE_AUTH_STATUSES = new Set([0, 502, 503, 504, 520, 521, 522, 523, 524, 530]);

const DEFINITIVE_AUTH_CODES = new Set([
  'session_not_found',
  'bad_jwt',
  'invalid_jwt',
  'user_not_found',
  'user_banned',
  'session_expired',
]);

function authErrorFields(error: unknown): { name: string; status?: number; code: string; message: string } | null {
  if (!error || typeof error !== 'object') return null;
  const err = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  return {
    name: typeof err.name === 'string' ? err.name : '',
    status: typeof err.status === 'number' ? err.status : undefined,
    code: typeof err.code === 'string' ? err.code : '',
    message: typeof err.message === 'string' ? err.message : '',
  };
}

/**
 * Network and retryable auth failures: no response, a fetch throw, or an
 * AuthRetryableFetchError (including gateway statuses). Stay signed in.
 * A plain `{ name, status }` object counts — the e2e stub does not construct
 * a real AuthError, and `isAuthRetryableFetchError` would miss it.
 */
function isRetryableAuthFailure(error: unknown): boolean {
  const fields = authErrorFields(error);
  if (!fields) {
    if (!(error instanceof Error)) return false;
    const message = error.message.toLowerCase();
    return (
      message.includes('failed to fetch')
      || message.includes('fetch failed')
      || message.includes('networkerror')
      || message.includes('network request failed')
      || message.includes('load failed')
    );
  }
  if (fields.name === 'AuthRetryableFetchError') return true;
  if (fields.status != null && RETRYABLE_AUTH_STATUSES.has(fields.status)) return true;
  const message = fields.message.toLowerCase();
  return (
    message.includes('failed to fetch')
    || message.includes('fetch failed')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('load failed')
  );
}

/** The server answered and the session itself is invalid. */
function isDefinitiveAuthRejection(error: unknown): boolean {
  const fields = authErrorFields(error);
  if (!fields || isRetryableAuthFailure(error)) return false;
  if (DEFINITIVE_AUTH_CODES.has(fields.code)) return true;
  if (fields.name === 'AuthSessionMissingError' || fields.name === 'AuthInvalidJwtError') return true;
  if (fields.status === 401 || fields.status === 403) return true;
  return fields.name === 'AuthApiError' && fields.status === 400;
}

async function backfillSessionDurations() {
  const db = getDb();
  const sessions = await db.session_logs
    .filter((s) =>
      s.startedAt != null
      && s.completedAt != null
      && (s.durationMin == null || s.durationMin === 0),
    )
    .toArray();

  for (const s of sessions) {
    const startMs = Date.parse(s.startedAt!);
    const endMs = Date.parse(s.completedAt!);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;
    const durationMin = Math.round((endMs - startMs) / 60000);
    if (durationMin > 0 && durationMin < 600) {
      // Go through localUpsert (not db.session_logs.update) so the change
      // enqueues to the dirty queue and propagates to other devices. A
      // direct Dexie write would leave durationMin computed only on the
      // device that first noticed the missing field.
      await localUpsert('session_logs', { ...s, durationMin });
    }
  }
}

/**
 * Confirms the stored session with the server. A retryable or network
 * failure leaves the local session in place. A definitive rejection, or a
 * user id outside the allowlist, clears the cache and sends the user to login.
 */
async function verifyStoredSession(
  supabase: ReturnType<typeof createClient>,
  stillCurrent: () => boolean,
  replace: (href: string) => void,
) {
  let user: { id: string } | null = null;
  let error: unknown = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
    error = result.error;
  } catch (err) {
    if (!stillCurrent() || isRetryableAuthFailure(err)) return;
    console.warn('[AppShell] getUser failed:', err);
    return;
  }
  if (!stillCurrent() || isRetryableAuthFailure(error)) return;
  if (user && isUserAllowed(user.id) && !isDefinitiveAuthRejection(error)) return;
  if (user && !isUserAllowed(user.id)) {
    clearCachedUserId();
    replace('/login?error=not_allowed');
    return;
  }
  if ((!user && !error) || isDefinitiveAuthRejection(error)) {
    clearCachedUserId();
    replace('/login');
    return;
  }
  if (error) console.warn('[AppShell] getUser unverified:', error);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, toggleMode } = useLayoutMode();
  const shell = shellMaxClass(mode);
  const [dbReady, setDbReady] = useState(false);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onImportError = useCallback((msg: string) => setError(msg), []);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        // Stored session only — no network. Offline getUser() returns a null
        // user plus a fetch error, which must not send a signed-in gym
        // session to /login.
        const { data: { session } } = await supabase.auth.getSession();
        const sessionUserId = session?.user?.id;
        if (!sessionUserId || !isUserAllowed(sessionUserId)) {
          clearCachedUserId();
          router.replace(
            sessionUserId && !isUserAllowed(sessionUserId)
              ? '/login?error=not_allowed'
              : '/login',
          );
          return;
        }
        await initDb(sessionUserId);
        setCachedUserId(sessionUserId);
        // Allow the browser client to register the session on its headers.
        await new Promise((resolve) => setTimeout(resolve, 100));
        await ensureLocalSeed();

        // App is ready to render with local data.
        // Sync happens in background — failures don't block UI.
        if (!cancelled) {
          setUserId(sessionUserId);
          setDbReady(true);
          setSyncing(true);
          setReady(true);
        }

        void verifyStoredSession(supabase, () => cancelled, (href) => {
          router.replace(href);
        });

        try {
          await backfillSessionDurations();
          // Flush any pending writes BEFORE pullAll clears local tables —
          // otherwise rows queued offline get silently dropped because
          // pushOne can't find them after the wipe.
          await flushDirty();
          await seedRemotePrescriptionsIfEmpty(sessionUserId);
          await seedRemoteTemplatesIfEmpty(sessionUserId);
          await ensureS1RemoteTemplate(sessionUserId);
          await Promise.race([
            pullAll({ full: true }),
            new Promise<void>((_, reject) =>
              setTimeout(
                () => reject(new Error('Sync timed out')),
                15_000,
              ),
            ),
          ]).catch((err) => {
            console.warn('[AppShell] pullAll failed:', err);
          });
          await repairOpeningPrBaselineSession();
          await backfillCardioFromSets();
          await flushDirty();
        } catch (syncErr) {
          console.warn('[AppShell] background sync error:', syncErr);
        } finally {
          if (!cancelled) setSyncing(false);
        }
      } catch (e) {
        console.error('[AppShell] critical init error:', e);
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic flush, plus a periodic incremental pull. Visibility & online
  // events also trigger an immediate pull+flush so resuming the app feels
  // instant after coming back from background or losing+regaining wifi.
  useEffect(() => {
    if (!ready) return;
    const flush = () => flushDirty().catch(() => {});
    const pullThenFlush = async () => {
      try {
        await pullAll();
        await flushDirty();
      } catch {
        // Network errors are normal offline; the SW + dirty queue handle the
        // recovery. Surface only via the Sync button on /program.
      }
    };
    const onVis = () => { if (document.visibilityState === 'visible') pullThenFlush(); };
    const flushId = setInterval(flush, 30_000);
    const pullId = setInterval(pullThenFlush, 5 * 60_000);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', pullThenFlush);
    return () => {
      clearInterval(flushId);
      clearInterval(pullId);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', pullThenFlush);
    };
  }, [ready]);

  // Realtime fan-in. When another device (or the SQL editor) writes to one
  // of our tables, the change shows up locally without waiting for the
  // periodic pull.
  useEffect(() => {
    if (!ready || !userId) return;
    const unsubscribe = subscribeRealtime(userId);
    return unsubscribe;
  }, [ready, userId]);

  // Service worker registration — provides cache-first shell loading so the
  // app boots offline. We register lazily after first sync to avoid blocking
  // the critical path.
  useEffect(() => {
    if (!ready) return;
    if (typeof navigator === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return; // dev: don't cache stale assets
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => {
        // SW failure is non-fatal — we still work online.
      });
  }, [ready]);

  // Daily tracker reminders (7 / 14 / 20 local): poll while the app can run, plus catch-up on resume.
  useEffect(() => {
    if (!ready) return;
    const tick = () => {
      if (isTrackerRemindersEnabled()) void fireDueTrackerReminders();
    };
    tick();
    const id = setInterval(tick, 45_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ready]);

  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      window.__workoutDev = { importCompletedSession, PP_OHP_WORKOUT_MAY_15 };
    }
  }, []);

  if (!dbReady || !ready) {
    return (
      <main className="min-h-dvh flex items-center justify-center p-6">
        {error ? (
          <div className="space-y-4 text-center max-w-sm">
            <div className="text-rose-400 text-sm font-medium">Failed to load</div>
            <div className="text-zinc-500 text-xs leading-snug">{error}</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 px-6 rounded-xl bg-zinc-800 border border-zinc-700 text-sm text-zinc-300 hover:text-zinc-100 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="text-zinc-400 text-sm">
            {!dbReady ? 'Loading…' : syncing ? 'Syncing…' : 'Loading…'}
          </div>
        )}
      </main>
    );
  }

  const tabs = [
    { href: '/', label: 'Today' },
    { href: '/recovery', label: 'Daily Check-In' },
    { href: '/history', label: 'History' },
    { href: '/cardio', label: 'Cardio' },
    { href: '/program', label: 'Program' },
  ];

  return (
    <div className="min-h-dvh flex flex-col">
      {ready && (
        <Suspense fallback={null}>
          <AppShellImportTrigger onError={onImportError} />
        </Suspense>
      )}
      <main className="flex-1 w-full min-w-0 pb-28 supports-[padding:max(0px)]:pb-[max(7rem,env(safe-area-inset-bottom,0px)+4.5rem)]">
        {children}
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur supports-[padding:max(0px)]:pb-[max(env(safe-area-inset-bottom),0px)]">
        <div className={`grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] items-stretch gap-0 mx-auto w-full ${shell}`}>
          {tabs.map((t) => {
            const active =
              pathname === t.href ||
              (t.href === '/history' && pathname.startsWith('/lifts'));
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`h-16 flex items-center justify-center text-xs sm:text-sm px-0.5 ${active ? 'text-amber-400' : 'text-zinc-400'}`}
              >
                <span className="min-w-0 truncate text-center leading-tight">{t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={toggleMode}
            className="h-16 w-12 shrink-0 flex flex-col items-center justify-center gap-0.5 border-l border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/80"
            aria-label={mode === 'mobile' ? 'Use wide layout for this screen' : 'Use phone-width layout'}
            title={mode === 'mobile' ? 'Wide layout' : 'Phone layout'}
          >
            {mode === 'mobile' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
                <rect x="6" y="2" width="12" height="20" rx="2" />
                <path d="M10 18h4" strokeLinecap="round" />
              </svg>
            )}
            <span className="text-[9px] font-medium leading-none">{mode === 'mobile' ? 'Wide' : 'Phone'}</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
