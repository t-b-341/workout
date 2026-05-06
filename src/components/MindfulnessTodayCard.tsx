'use client';

import { MindfulnessEntriesSection } from './MindfulnessEntriesSection';
import type { SessionLog } from '@/lib/types';

/** Today tab: mindfulness entries for the session’s calendar day. */
export function MindfulnessTodayCard({ session }: { session: SessionLog }) {
  return <MindfulnessEntriesSection date={session.date} showDailyGoalBar />;
}
