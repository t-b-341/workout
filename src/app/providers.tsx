'use client';

import { LayoutModeProvider } from '@/lib/layoutMode';
import { DeleteUndoBanner } from '@/components/DeleteUndoBanner';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LayoutModeProvider>
      {children}
      <DeleteUndoBanner />
    </LayoutModeProvider>
  );
}
