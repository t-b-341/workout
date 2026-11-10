import { Suspense } from 'react';
import { AppShell } from '@/components/AppShell';
import { MesoAnalysisScreen } from '@/components/MesoAnalysisScreen';

export default function MesoAnalysisPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-6 text-zinc-500">Loading…</div>}>
        <MesoAnalysisScreen />
      </Suspense>
    </AppShell>
  );
}
