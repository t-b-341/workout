'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { shellMaxClass, useLayoutMode } from '@/lib/layoutMode';
import {
  ensureLocalSeed,
  flushDirty,
  pullAll,
  seedRemotePrescriptionsIfEmpty,
  subscribeRealtime,
} from '@/lib/sync';
import { backfillCardioFromSets } from '@/lib/backfill';
import { repairOpeningPrBaselineSession } from '@/lib/openingPrBaseline';
import { fireDueTrackerReminders, isTrackerRemindersEnabled } from '@/lib/trackerReminders';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, toggleMode } = useLayoutMode();
  const shell = shellMaxClass(mode);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/login');
          return;
        }
        await ensureLocalSeed();
        await seedRemotePrescriptionsIfEmpty(user.id);
        setSyncing(true);
        await pullAll();
        await repairOpeningPrBaselineSession();
        await backfillCardioFromSets();
        await flushDirty();
        if (!cancelled) {
          setUserId(user.id);
          setSyncing(false);
          setReady(true);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

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

  if (error) {
    return (
      <main className="min-h-dvh p-6 flex flex-col gap-3">
        <h1 className="text-xl font-semibold">Sync error</h1>
        <pre className="text-sm text-red-400 whitespace-pre-wrap">{error}</pre>
        <button onClick={() => location.reload()} className="rounded-lg bg-zinc-800 h-11 px-4">Retry</button>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <div className="text-zinc-400 text-sm">{syncing ? 'Syncing…' : 'Loading…'}</div>
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
      <main className="flex-1 w-full pb-28 supports-[padding:max(0px)]:pb-[max(7rem,env(safe-area-inset-bottom,0px)+4.5rem)]">
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
