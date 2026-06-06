'use client';

import { useEffect, useState } from 'react';
import {
  startEpisode,
  updateEpisode,
  useOverwhelmContacts,
} from '@/lib/overwhelmProtocol';
import type { OverwhelmEpisode, OverwhelmTier } from '@/lib/types';

type ProtocolStep =
  | 'rate_before'
  | 'tier_select'
  | 'tier1'
  | 'tier2_tipp'
  | 'tier3'
  | 'rate_after'
  | 'done';

type TippStep = {
  key: string;
  title: string;
  instruction: string;
  timerSec: number;
  timerLabel: string;
};

const TIPP_STEPS: TippStep[] = [
  {
    key: 'temperature',
    title: 'Temperature',
    instruction:
      'Splash cold water on your face, or hold ice if available. Cold water activates the dive reflex and rapidly lowers heart rate.',
    timerSec: 30,
    timerLabel: 'Start 30 sec timer',
  },
  {
    key: 'intense_exercise',
    title: 'Intense exercise',
    instruction:
      '5 minutes of movement — jumping jacks, brisk walking, anything. Burns off the adrenaline.',
    timerSec: 300,
    timerLabel: 'Start 5 min timer',
  },
  {
    key: 'paced_breathing',
    title: 'Paced breathing',
    instruction:
      'Breathe in for 4 counts, hold for 1, breathe out for 6 counts. Repeat 5 times.',
    timerSec: 55,
    timerLabel: 'Start breathing timer',
  },
  {
    key: 'progressive_relaxation',
    title: 'Progressive muscle relaxation',
    instruction:
      'Tense each muscle group for 5 seconds, then release. Start with feet, work up to face.',
    timerSec: 120,
    timerLabel: 'Start 2 min timer',
  },
];

function determineTier(rating: number): OverwhelmTier {
  if (rating <= 7) return 1;
  if (rating <= 9) return 2;
  return 3;
}

function fmtTime(sec: number): string {
  const m = Math.floor(Math.max(0, sec) / 60);
  const s = Math.max(0, sec) % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function looksLikePhone(value: string): boolean {
  return /\d/.test(value);
}

function RatingGrid({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`h-12 rounded-xl text-base font-semibold transition-colors ${
            value === n
              ? 'bg-amber-500 text-zinc-950'
              : 'bg-zinc-800 text-zinc-300 active:bg-zinc-700'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function OverwhelmProtocol({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<ProtocolStep>('rate_before');
  const [episode, setEpisode] = useState<OverwhelmEpisode | null>(null);
  const [distressBefore, setDistressBefore] = useState(7);
  const [distressAfter, setDistressAfter] = useState(5);
  const [timerSec, setTimerSec] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const [timerKind, setTimerKind] = useState<string | null>(null);
  const [peakPassed, setPeakPassed] = useState(false);
  const [breathing, setBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'in' | 'out'>('in');
  const [tippStepsDone, setTippStepsDone] = useState<string[]>([]);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const contacts = useOverwhelmContacts();

  // Countdown timer: decrement once per second while active; stop at 0.
  // State updates happen inside the deferred timeout callback (not the effect
  // body) so we don't trigger cascading synchronous renders.
  useEffect(() => {
    if (!timerActive || timerSec <= 0) return;
    const id = setTimeout(() => {
      const next = timerSec - 1;
      setTimerSec(next);
      if (next <= 0) {
        setTimerActive(false);
        setBreathing(false);
        if (timerKind === 'peak') setPeakPassed(true);
      }
    }, 1000);
    return () => clearTimeout(id);
  }, [timerActive, timerSec, timerKind]);

  // Breathing guide phase: in (4s) ↔ out (6s) while breathing is active.
  useEffect(() => {
    if (!breathing) return;
    const dur = breathPhase === 'in' ? 4000 : 6000;
    const id = setTimeout(
      () => setBreathPhase((p) => (p === 'in' ? 'out' : 'in')),
      dur,
    );
    return () => clearTimeout(id);
  }, [breathing, breathPhase]);

  // Auto-advance from tier_select to the matched tier after 1.5s.
  useEffect(() => {
    if (step !== 'tier_select' || !episode) return;
    const t = episode.tier;
    const id = setTimeout(() => {
      setStep(t === 1 ? 'tier1' : t === 2 ? 'tier2_tipp' : 'tier3');
    }, 1500);
    return () => clearTimeout(id);
  }, [step, episode]);

  function stopTimers() {
    setTimerActive(false);
    setBreathing(false);
  }

  function startTimer(kind: string, seconds: number) {
    if (kind === 'peak') setPeakPassed(false);
    setTimerKind(kind);
    setTimerSec(seconds);
    setTimerActive(true);
    if (kind === 'breathing') {
      setBreathPhase('in');
      setBreathing(true);
    } else {
      setBreathing(false);
    }
  }

  async function handleClose() {
    if (episode && !episode.endedAt) {
      await updateEpisode(episode, { endedAt: new Date().toISOString() });
    }
    onClose();
  }

  async function handleStart() {
    const tier = determineTier(distressBefore);
    const ep = await startEpisode(tier, distressBefore);
    setEpisode(ep);
    setStep('tier_select');
  }

  async function goToTier(tier: OverwhelmTier) {
    stopTimers();
    if (episode && episode.tier !== tier) {
      setEpisode(await updateEpisode(episode, { tier }));
    }
    setStep(tier === 1 ? 'tier1' : tier === 2 ? 'tier2_tipp' : 'tier3');
  }

  async function markTippDone(key: string) {
    const next = tippStepsDone.includes(key)
      ? tippStepsDone
      : [...tippStepsDone, key];
    setTippStepsDone(next);
    setExpandedStep(null);
    if (episode) {
      setEpisode(await updateEpisode(episode, { tippStepsCompleted: next }));
    }
  }

  async function handleTier3Safe() {
    stopTimers();
    if (episode) {
      setEpisode(
        await updateEpisode(episode, {
          endedAt: new Date().toISOString(),
          note: note || undefined,
        }),
      );
    }
    setStep('rate_after');
  }

  async function handleSaveAfter() {
    if (episode) {
      setEpisode(
        await updateEpisode(episode, {
          distressAfter,
          endedAt: new Date().toISOString(),
          note: note || undefined,
        }),
      );
    }
    setStep('done');
  }

  const primaryBtn =
    'w-full h-12 rounded-xl font-semibold bg-amber-500 text-zinc-950 active:bg-amber-400';
  const secondaryBtn =
    'w-full h-12 rounded-xl font-medium bg-zinc-800 text-zinc-200 active:bg-zinc-700';
  const crisisBtn =
    'w-full h-12 rounded-xl font-semibold bg-rose-600 text-zinc-50 active:bg-rose-500';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-zinc-950">
      <div className="shrink-0 flex items-center justify-between p-4 border-b border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-200">Overwhelm Protocol</h2>
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          className="h-9 w-9 rounded-full text-2xl leading-none text-zinc-400 active:bg-zinc-800"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {step === 'rate_before' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-semibold text-zinc-100">
                How intense is it right now?
              </h3>
              <p className="text-sm text-zinc-500 mt-1">
                1 = unsettled · 10 = crisis
              </p>
            </div>
            <div className="text-center">
              <span className="text-6xl font-bold tabular-nums text-amber-400">
                {distressBefore}
              </span>
            </div>
            <RatingGrid value={distressBefore} onChange={setDistressBefore} />
            <p className="text-sm text-zinc-500">
              This will always pass. Let&apos;s work through it.
            </p>
          </div>
        )}

        {step === 'tier_select' && episode && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-semibold text-zinc-100">
                {episode.tier === 1 && 'Tier 1'}
                {episode.tier === 2 && 'Tier 2'}
                {episode.tier === 3 && 'Tier 3'}
              </h3>
              <p className="text-sm text-zinc-400 mt-1">
                {episode.tier === 1 && 'Elevated — Breathing + grounding'}
                {episode.tier === 2 &&
                  'Significantly dysregulated — TIPP skills'}
                {episode.tier === 3 && 'Crisis — Connect now'}
              </p>
              <p className="text-xs text-zinc-600 mt-2">Starting in a moment…</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-zinc-600">
                Or choose a different tier
              </p>
              <button
                type="button"
                onClick={() => goToTier(1)}
                className={secondaryBtn}
              >
                Tier 1 — Regulate
              </button>
              <button
                type="button"
                onClick={() => goToTier(2)}
                className={secondaryBtn}
              >
                Tier 2 — TIPP skills
              </button>
              <button
                type="button"
                onClick={() => goToTier(3)}
                className={secondaryBtn}
              >
                Tier 3 — Crisis support
              </button>
            </div>
          </div>
        )}

        {step === 'tier1' && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold text-zinc-100">
              Tier 1 — Regulate
            </h3>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-amber-400">
                The 90-second rule
              </h4>
              <p className="text-sm text-zinc-400">
                The physiological peak of any emotion lasts 90 seconds.
                Don&apos;t act. Don&apos;t speak. Just observe it.
              </p>
              <div className="text-center">
                <span className="text-5xl font-bold tabular-nums text-amber-400">
                  {fmtTime(
                    timerKind === 'peak' ? timerSec : peakPassed ? 0 : 90,
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => startTimer('peak', 90)}
                disabled={timerActive && timerKind === 'peak'}
                className={`${secondaryBtn} disabled:opacity-50`}
              >
                Start 90 seconds
              </button>
              {peakPassed && (
                <p className="text-sm text-emerald-400 text-center">
                  The peak has passed.
                </p>
              )}
            </section>

            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-amber-400">
                Extended exhale breathing
              </h4>
              <p className="text-sm text-zinc-400">
                4 counts in · 6 counts out · 5 cycles
              </p>
              <button
                type="button"
                onClick={() => startTimer('breathing', 50)}
                className={secondaryBtn}
              >
                Start breathing guide
              </button>
              {breathing && (
                <div className="text-center space-y-1">
                  <p className="text-2xl font-semibold text-emerald-300">
                    {breathPhase === 'in'
                      ? 'Breathe in... (4)'
                      : 'Breathe out... (6)'}
                  </p>
                  <p className="font-mono text-zinc-500">{fmtTime(timerSec)}</p>
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-zinc-300">
                Optional note
              </h4>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What triggered this?"
                rows={3}
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-sm text-zinc-200 placeholder:text-zinc-600"
              />
            </section>
          </div>
        )}

        {step === 'tier2_tipp' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xl font-semibold text-zinc-100">
                Tier 2 — TIPP Skills
              </h3>
              <p className="text-sm text-zinc-400 mt-1">
                Work through each step. Skip any that don&apos;t apply.
              </p>
            </div>

            <div className="space-y-2">
              {TIPP_STEPS.map((s) => {
                const isDone = tippStepsDone.includes(s.key);
                const isOpen = expandedStep === s.key;
                return (
                  <div
                    key={s.key}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedStep(isOpen ? null : s.key)}
                      className="w-full flex items-center justify-between p-3 text-left"
                    >
                      <span
                        className={`text-sm font-medium ${
                          isDone ? 'text-emerald-400' : 'text-zinc-200'
                        }`}
                      >
                        {isDone ? '✓ ' : ''}
                        {s.title}
                      </span>
                      <span className="text-zinc-500 text-lg leading-none">
                        {isOpen ? '−' : '+'}
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-3 space-y-3">
                        <p className="text-sm text-zinc-400">{s.instruction}</p>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => startTimer(s.key, s.timerSec)}
                            className="h-10 px-4 rounded-lg bg-zinc-800 text-sm text-zinc-200 active:bg-zinc-700"
                          >
                            {s.timerLabel}
                          </button>
                          {timerKind === s.key && (
                            <span className="font-mono text-lg text-amber-400 tabular-nums">
                              {fmtTime(timerSec)}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => markTippDone(s.key)}
                          className="h-10 px-4 rounded-lg bg-emerald-700 text-sm font-medium text-zinc-50 active:bg-emerald-600"
                        >
                          Mark done ✓
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-sm italic text-amber-400/80">
              This feeling is temporary. The intensity always passes.
            </p>
          </div>
        )}

        {step === 'tier3' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-rose-400">
                Crisis Support
              </h3>
              <p className="text-sm text-zinc-400 mt-1">
                You don&apos;t have to handle this alone.
              </p>
            </div>

            <section className="space-y-2 text-center">
              <span className="text-5xl font-bold tracking-wide text-rose-300">
                988
              </span>
              <p className="text-sm text-zinc-400">
                Suicide &amp; Crisis Lifeline — call or text, 24/7
              </p>
              <a
                href="tel:988"
                className={`${crisisBtn} flex items-center justify-center`}
              >
                Call 988
              </a>
            </section>

            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-zinc-300">
                Your support contacts
              </h4>
              {contacts.length > 0 ? (
                <ul className="space-y-2">
                  {contacts.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
                    >
                      <p className="text-sm font-medium text-zinc-200">
                        {c.name}
                      </p>
                      {looksLikePhone(c.contact) ? (
                        <a
                          href={`tel:${c.contact.replace(/[^\d+]/g, '')}`}
                          className="text-sm text-amber-400 underline underline-offset-2"
                        >
                          {c.contact}
                        </a>
                      ) : (
                        <p className="text-sm text-zinc-400">{c.contact}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">
                  No support contacts saved. Add them in Settings.
                </p>
              )}
            </section>

            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-zinc-300">Note</h4>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Write anything. You don't have to show this to anyone."
                rows={3}
                className="w-full rounded-xl bg-zinc-900 border border-zinc-800 p-3 text-sm text-zinc-200 placeholder:text-zinc-600"
              />
            </section>
          </div>
        )}

        {step === 'rate_after' && (
          <div className="space-y-5">
            <h3 className="text-xl font-semibold text-zinc-100">
              How are you feeling now?
            </h3>
            <div className="text-center">
              <span className="text-6xl font-bold tabular-nums text-amber-400">
                {distressAfter}
              </span>
            </div>
            <RatingGrid value={distressAfter} onChange={setDistressAfter} />
            <p className="text-sm text-zinc-400">
              You started at {distressBefore}.
            </p>
            {distressAfter < distressBefore && (
              <p className="text-sm text-emerald-400">↓ That helped.</p>
            )}
            {distressAfter === distressBefore && (
              <p className="text-sm text-zinc-400">
                → Sometimes it takes time.
              </p>
            )}
            {distressAfter > distressBefore && (
              <p className="text-sm text-amber-400">
                If you&apos;re still struggling, please reach out to someone.
              </p>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-emerald-400">
              You made it through.
            </h3>
            <p className="text-base text-zinc-200">
              {episode?.distressAfter != null
                ? `Your distress went from ${distressBefore} to ${episode.distressAfter}.`
                : 'Episode logged.'}
            </p>
            <p className="text-sm text-zinc-500">
              This information is saved privately to help you track patterns over
              time.
            </p>
          </div>
        )}
      </div>

      {step !== 'tier_select' && (
        <div className="shrink-0 p-4 border-t border-zinc-800 space-y-2">
          {step === 'rate_before' && (
            <button type="button" onClick={handleStart} className={primaryBtn}>
              Continue →
            </button>
          )}
          {step === 'tier1' && (
            <>
              <button
                type="button"
                onClick={() => {
                  stopTimers();
                  setStep('rate_after');
                }}
                className={primaryBtn}
              >
                I feel better — finish
              </button>
              <button
                type="button"
                onClick={() => goToTier(2)}
                className={secondaryBtn}
              >
                I need more — go to Tier 2
              </button>
            </>
          )}
          {step === 'tier2_tipp' && (
            <>
              <button
                type="button"
                onClick={() => {
                  stopTimers();
                  setStep('rate_after');
                }}
                className={primaryBtn}
              >
                I feel better — finish
              </button>
              <button
                type="button"
                onClick={() => goToTier(3)}
                className={crisisBtn}
              >
                I need crisis support
              </button>
            </>
          )}
          {step === 'tier3' && (
            <button
              type="button"
              onClick={handleTier3Safe}
              className={primaryBtn}
            >
              I&apos;m safe — close
            </button>
          )}
          {step === 'rate_after' && (
            <button
              type="button"
              onClick={handleSaveAfter}
              className={primaryBtn}
            >
              Save and close
            </button>
          )}
          {step === 'done' && (
            <button type="button" onClick={onClose} className={primaryBtn}>
              Close
            </button>
          )}
        </div>
      )}
    </div>
  );
}
