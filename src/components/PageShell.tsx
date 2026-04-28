'use client';

import { pageMaxClass, useLayoutMode } from '@/lib/layoutMode';

export function PageShell({
  children,
  variant = 'default',
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'default' | 'program';
  className?: string;
}) {
  const { mode } = useLayoutMode();
  const max = pageMaxClass(mode, variant);
  return <div className={`${max} mx-auto w-full ${className}`.trim()}>{children}</div>;
}
