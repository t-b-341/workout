'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  ensureLocalSeed,
  flushDirty,
  pullAll,
  seedRemotePrescriptionsIfEmpty,
  subscribeRealtime,
} from '@/lib/sync';
import { backfillCardioFromSets } from '@/lib/backfill';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
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
      <main className="flex-1 pb-28 supports-[padding:max(0px)]:pb-[max(7rem,env(safe-area-inset-bottom,0px)+4.5rem)]">
        {children}
      </main>
      <nav className="fixed bottom-0 inset-x-0 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur supports-[padding:max(0px)]:pb-[max(env(safe-area-inset-bottom),0px)]">
        <div className="grid grid-cols-5 mx-auto max-w-2xl">
          {tabs.map((t) => {
            const active =
              pathname === t.href ||
              (t.href === '/history' && pathname.startsWith('/lifts')) ||
              (t.href !== '/' && pathname.startsWith(t.href));
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`h-16 flex items-center justify-center text-sm ${active ? 'text-amber-400' : 'text-zinc-400'}`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
