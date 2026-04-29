/**
 * Session mindset cues — short, actionable reminders during training.
 * Tune copy here; UI reads these structures only.
 */

export type MindsetReminderId =
  | 'intensity'
  | 'focus'
  | 'technique'
  | 'roi'
  | 'delayedGratification'
  | 'effortPractice';

export type MindsetReminder = {
  id: MindsetReminderId;
  label: string;
  /** One line shown in the UI */
  line: string;
  /** Optional extra detail when expanded */
  detail?: string;
};

export const MINDSET_REMINDERS: MindsetReminder[] = [
  {
    id: 'intensity',
    label: 'Intensity',
    line: 'Treat every working set like it earns your next progression.',
    detail:
      'Quality tension beats cruising — bias the top of your rep range when form stays crisp.',
  },
  {
    id: 'focus',
    label: 'Focus',
    line: 'One set, one intent: execute the pattern, then pour effort into those reps.',
    detail: 'Let the room fade; this set is the only thing on the clock.',
  },
  {
    id: 'technique',
    label: 'Technique',
    line: 'Bracing, bar path, and overhead stability beat chasing sloppy weight.',
    detail:
      'Push press especially: tight brace, stacked joints, then legs — technique is your force multiplier.',
  },
  {
    id: 'roi',
    label: 'Return on investment',
    line: 'More honest effort now → more muscle and heavier numbers later. Compound interest.',
    detail: 'Each hard set is a deposit; skipping effort is leaving gains unclaimed.',
  },
  {
    id: 'delayedGratification',
    label: 'Delayed gratification',
    line: 'Discomfort in the set buys strength you keep; easy reps buy nothing.',
    detail: 'Pass on stopping early when you still had technically sound reps in the tank.',
  },
  {
    id: 'effortPractice',
    label: 'Practicing effort',
    line: 'Effort is a skill — rehearse showing up strong even when you don’t feel like it.',
    detail: 'Genuine effort at the top end of your rep range is the habit that moves every lift.',
  },
];

/** Training direction — grounded in your stated priorities (edit anytime). */
export const TRAINING_DIRECTION = {
  headline: 'Your direction',
  pillars: [
    'General strength across vertical & horizontal push and pull, squat patterns, hanging work, and overall health.',
    'Desired emphasis: chest development, bench, overhead strength, push press technique & bracing.',
    'Bias genuine effort — aim for the top end of your prescribed rep range when technique holds.',
  ],
  mantra: 'Effort means results.',
} as const;
