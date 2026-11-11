'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createE2eStubClient } from './e2eStub';

export function createClient(): SupabaseClient {
  if (process.env.NEXT_PUBLIC_E2E_STUB === '1' && process.env.NODE_ENV !== 'production') {
    return createE2eStubClient() as unknown as SupabaseClient;
  }
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );
}
