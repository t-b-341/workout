import { AppShell } from '@/components/AppShell';
import { LiftDetailView } from '@/components/LiftDetailView';

export default async function LiftDetailPage({
  params,
}: {
  params: Promise<{ liftId: string }>;
}) {
  const { liftId } = await params;
  return (
    <AppShell>
      <LiftDetailView liftId={decodeURIComponent(liftId)} />
    </AppShell>
  );
}
