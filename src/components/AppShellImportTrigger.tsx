'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { getDb } from '@/lib/db';
import {
  importCompletedSession,
  PP_OHP_WORKOUT_MAY_15,
} from '@/lib/importCompletedSession';

const PP_OHP_IMPORT_META_KEY = 'import-once:pp-ohp-20260515';

export function AppShellImportTrigger({ onError }: { onError: (msg: string) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('import') !== 'pp-ohp') return;
    let cancelled = false;
    (async () => {
      const db = getDb();
      if ((await db.meta.get(PP_OHP_IMPORT_META_KEY))?.value) {
        router.replace(pathname);
        return;
      }
      try {
        await importCompletedSession(PP_OHP_WORKOUT_MAY_15);
        await db.meta.put({ key: PP_OHP_IMPORT_META_KEY, value: true });
        if (!cancelled) router.replace(pathname);
      } catch (e) {
        if (!cancelled) onError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, pathname, router, onError]);

  return null;
}
