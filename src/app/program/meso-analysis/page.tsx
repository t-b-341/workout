import { Suspense } from 'react';
import { MesoAnalysisScreen } from '@/components/MesoAnalysisScreen';

export default function MesoAnalysisPage() {
  return (
    <Suspense fallback={<div className="p-6 text-zinc-500">Loading…</div>}>
      <MesoAnalysisScreen />
    </Suspense>
  );
}
