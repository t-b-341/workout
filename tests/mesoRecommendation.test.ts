import { describe, expect, it } from 'vitest';
import {
  analyzeCompletedBlockRecommendation,
  analyzeMesoLengthRecommendation,
  mesoBoundaryPromptContext,
} from '../src/lib/mesoRecommendation';
import type { MesocycleConfig } from '../src/lib/mesocycle';
import type { ReadinessLog } from '../src/lib/types';

describe('analyzeMesoLengthRecommendation', () => {
  const cfg: MesocycleConfig = {
    startDate: '2026-01-05',
    accumulation: 4,
    deload: 1,
  };

  it('with no sessions and neutral readiness, suggests keep at current lengths', () => {
    const readiness: ReadinessLog[] = [
      {
        id: 'r1',
        sessionLogId: 's-placeholder',
        date: '2026-02-25',
        sleepHours: 7,
        soreness: 2,
        motivation: 3,
        createdAt: '2026-02-25T08:00:00.000Z',
      },
    ];
    const r = analyzeMesoLengthRecommendation(cfg, [], [], readiness, [], '2026-03-01');
    expect(r.action).toBe('keep');
    expect(r.suggestedAccumulation).toBe(4);
    expect(r.suggestedDeload).toBe(1);
    expect(r.reason).toContain('Current block length');
  });
});

describe('analyzeCompletedBlockRecommendation', () => {
  const cfg: MesocycleConfig = {
    startDate: '2026-01-05',
    accumulation: 4,
    deload: 1,
  };

  it('returns null for invalid meso index', () => {
    expect(analyzeCompletedBlockRecommendation(cfg, 0, [], [], [], [])).toBeNull();
  });

  it('scores only meso block 1 calendar window with distinct “last mesocycle” copy', () => {
    const readiness: ReadinessLog[] = [
      {
        id: 'r1',
        sessionLogId: 's-placeholder',
        date: '2026-02-01',
        sleepHours: 7,
        soreness: 2,
        motivation: 3,
        createdAt: '2026-02-01T08:00:00.000Z',
      },
    ];
    const r = analyzeCompletedBlockRecommendation(cfg, 1, [], [], readiness, []);
    expect(r).not.toBeNull();
    expect(r!.action).toBe('keep');
    expect(r!.reason).toContain('Last mesocycle');
  });
});

describe('mesoBoundaryPromptContext', () => {
  const cfg: MesocycleConfig = {
    startDate: '2026-01-05',
    accumulation: 4,
    deload: 1,
  };

  it('is null on meso 1 week 1', () => {
    expect(mesoBoundaryPromptContext('2026-01-07', cfg, null)).toBeNull();
  });

  it('fires on week 1 of meso 2+ with completed meso index and new block Monday', () => {
    expect(mesoBoundaryPromptContext('2026-02-10', cfg, null)).toEqual({
      completedMesoIndex: 1,
      newMesoStartMonday: '2026-02-09',
    });
  });

  it('suppresses when this new-meso Monday was already dismissed', () => {
    expect(
      mesoBoundaryPromptContext('2026-02-10', cfg, {
        dismissedForNewMesoStartMonday: '2026-02-09',
      }),
    ).toBeNull();
  });
});
