'use client';

import { LayoutModeProvider } from '@/lib/layoutMode';

export function Providers({ children }: { children: React.ReactNode }) {
  return <LayoutModeProvider>{children}</LayoutModeProvider>;
}
