import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { HistoryView } from '@/components/HistoryView';

export default function HistoryPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-6 text-zinc-500">Loading…</div>}>
        <HistoryView />
      </Suspense>
    </AppShell>
  );
}
