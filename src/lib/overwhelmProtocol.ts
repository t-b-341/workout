'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { getDb } from './db';
import { getAuthUserId, localUpsert } from './sync';
import { todayIso } from './time';
import type { OverwhelmContact, OverwhelmEpisode, OverwhelmTier } from './types';

const CONTACTS_META_KEY = 'overwhelm:contacts:v1';

export function newEpisodeId(): string {
  return `overwhelm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function startEpisode(
  tier: OverwhelmTier,
  distressBefore: number,
): Promise<OverwhelmEpisode> {
  const authUserId = await getAuthUserId();
  const now = new Date().toISOString();
  const episode: OverwhelmEpisode = {
    id: newEpisodeId(),
    userId: authUserId ?? undefined,
    date: todayIso(),
    startedAt: now,
    tier,
    distressBefore,
    tippStepsCompleted: [],
    updatedAt: now,
  };
  await localUpsert('overwhelm_episodes', episode);
  return episode;
}

export async function updateEpisode(
  episode: OverwhelmEpisode,
  patch: Partial<OverwhelmEpisode>,
): Promise<OverwhelmEpisode> {
  const updated = { ...episode, ...patch, updatedAt: new Date().toISOString() };
  await localUpsert('overwhelm_episodes', updated);
  return updated;
}

export function useOverwhelmContacts(): OverwhelmContact[] {
  return useLiveQuery(async () => {
    const row = await getDb().meta.get(CONTACTS_META_KEY);
    return (row?.value as OverwhelmContact[] | undefined) ?? [];
  }, []) ?? [];
}

export async function saveOverwhelmContacts(contacts: OverwhelmContact[]): Promise<void> {
  await getDb().meta.put({ key: CONTACTS_META_KEY, value: contacts });
}

export function useRecentOverwhelmEpisodes(days = 30): OverwhelmEpisode[] | undefined {
  return useLiveQuery(async () => {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    return getDb().overwhelm_episodes
      .where('date').aboveOrEqual(cutoff)
      .reverse()
      .toArray();
  }, [days]);
}
