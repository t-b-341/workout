'use client';

import {
  durationHrForShift,
  normalizeWorkdayValue,
  saveWorkday,
  type WorkdayShift,
  useWorkdayForDate,
} from '@/lib/workday';

type Props = { date: string };

function localDayOfWeek(dateIso: string): number {
  return new Date(`${dateIso}T12:00:00`).getDay();
}

export function WorkdayCard({ date }: Props) {
  const metaRow = useWorkdayForDate(date);
  const payload = normalizeWorkdayValue(metaRow?.value);
  const selected = payload.shift;
  const dow = localDayOfWeek(date);
  const isSunday = dow === 0;

  const toggle = (next: WorkdayShift) => {
    void saveWorkday(date, selected === next ? null : next);
  };

  const durationLabel =
    selected != null ? `${durationHrForShift(selected)} hr` : null;

  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-4 space-y-3">
      <div className="text-sm font-medium">Work day?</div>
      {isSunday ? (
        <div className="flex flex-wrap gap-2">
          <PillButton
            label="Shift"
            sub="8.5 hr"
            active={selected === 'sunday'}
            onClick={() => toggle('sunday')}
          />
          <PillButton label="Off" sub="" active={selected === 'off'} onClick={() => toggle('off')} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <PillButton
            label="AM"
            sub="6.5 hr"
            active={selected === 'am'}
            onClick={() => toggle('am')}
          />
          <PillButton
            label="PM"
            sub="6.5 hr"
            active={selected === 'pm'}
            onClick={() => toggle('pm')}
          />
          <PillButton
            label="Double"
            sub="10.5 hr"
            active={selected === 'double'}
            onClick={() => toggle('double')}
          />
          <PillButton label="Off" sub="" active={selected === 'off'} onClick={() => toggle('off')} />
        </div>
      )}
      {selected != null && durationLabel != null && (
        <p className="text-xs text-zinc-500">
          {selected === 'off' ? 'Off day' : <span>Shift length · {durationLabel}</span>}
        </p>
      )}
    </div>
  );
}

function PillButton({
  label,
  sub,
  active,
  onClick,
}: {
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-amber-500 bg-amber-500/15 text-amber-200'
          : 'border-zinc-700 bg-zinc-950/60 text-zinc-400 hover:border-zinc-600'
      }`}
    >
      <span>{label}</span>
      {sub ? <span className="text-zinc-500 font-normal"> · {sub}</span> : null}
    </button>
  );
}
