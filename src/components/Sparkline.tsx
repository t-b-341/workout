'use client';

import { fmtDate } from '@/lib/time';

type Props = {
  values: number[];
  /** Optional second series rendered as a dashed line over the same axes. */
  overlay?: number[];
  width?: number;
  height?: number;
  stroke?: string;
  overlayStroke?: string;
  fill?: string;
  showDots?: boolean;
};

export function Sparkline({
  values,
  overlay,
  width = 280,
  height = 60,
  stroke = '#f59e0b',
  overlayStroke = '#a1a1aa',
  fill = 'rgba(245, 158, 11, 0.12)',
  showDots = true,
}: Props) {
  if (values.length === 0) {
    return <div className="text-xs text-zinc-500 italic">No data yet</div>;
  }
  if (values.length === 1) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-300">
        <span className="font-mono">{values[0].toFixed(1)}</span>
        <span className="text-xs text-zinc-500">(single point)</span>
      </div>
    );
  }
  const allValues = overlay ? [...values, ...overlay] : values;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;
  const padX = 4;
  const padY = 6;
  const w = width - padX * 2;
  const h = height - padY * 2;
  const x = (i: number, len: number) => padX + (i / Math.max(1, len - 1)) * w;
  const y = (v: number) => padY + h - ((v - min) / range) * h;

  const pts = values.map((v, i) => `${x(i, values.length).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${padX},${height - padY} ${pts} ${(padX + w).toFixed(2)},${height - padY}`;
  const overlayPts = overlay
    ? overlay.map((v, i) => `${x(i, overlay.length).toFixed(2)},${y(v).toFixed(2)}`).join(' ')
    : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img">
      <polygon points={area} fill={fill} />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {overlayPts && (
        <polyline
          points={overlayPts}
          fill="none"
          stroke={overlayStroke}
          strokeWidth={1.5}
          strokeDasharray="4 3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      {showDots && values.map((v, i) => (
        <circle key={i} cx={x(i, values.length)} cy={y(v)} r={2.5} fill={stroke} />
      ))}
    </svg>
  );
}

/** Per-session line chart (time on X by index, value on Y). Optional dates label the timeline. */
export type ProgressLineChartProps = {
  values: number[];
  /** One ISO date per point; ticks show first / middle / last. */
  dates?: string[];
  height?: number;
  minWidth?: number;
  stroke?: string;
  fill?: string;
  /** Shown next to Y ticks (e.g. "lb"). */
  unit?: string;
  /** Decimal places for Y-axis labels */
  yDecimals?: number;
  'aria-label'?: string;
};

export function ProgressLineChart({
  values,
  dates,
  height = 168,
  minWidth = 280,
  stroke = '#f59e0b',
  fill = 'rgba(245, 158, 11, 0.1)',
  unit = '',
  yDecimals = 0,
  'aria-label': ariaLabel,
}: ProgressLineChartProps) {
  const n = values.length;
  if (n === 0) {
    return <div className="text-xs text-zinc-500 italic">No data yet</div>;
  }
  if (n === 1) {
    return (
      <div className="flex items-baseline gap-2 text-sm text-zinc-300 flex-wrap">
        <span className="font-mono text-lg">{values[0].toFixed(yDecimals)}</span>
        {unit && <span className="text-xs text-zinc-500">{unit}</span>}
        <span className="text-xs text-zinc-500">· one session</span>
        {dates?.[0] && <span className="text-xs text-zinc-500">{fmtDate(dates[0], 'MMM d, yyyy')}</span>}
      </div>
    );
  }

  const pad = { l: 44, r: 10, t: 12, b: 28 };
  const width = minWidth;
  const innerW = width - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const minV = Math.min(...values);
  const maxV = Math.max(...values);
  const span = maxV - minV || 1;

  const xAt = (i: number) => pad.l + (i / Math.max(1, n - 1)) * innerW;
  const yAt = (v: number) => pad.t + innerH - ((v - minV) / span) * innerH;

  const pts = values.map((v, i) => `${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');
  const floorPts = `${pad.l},${pad.t + innerH} ${pts} ${(pad.l + innerW).toFixed(2)},${pad.t + innerH}`;

  const tickIndices: number[] = [0];
  if (n > 2) tickIndices.push(Math.floor((n - 1) / 2));
  if (n > 1) tickIndices.push(n - 1);
  const uniqueTicks = [...new Set(tickIndices)].sort((a, b) => a - b);
  const dateList = dates && dates.length === n ? dates : null;

  const fmtYTick = (v: number) =>
    Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(yDecimals);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={ariaLabel ?? 'Progress line chart'}
      className="text-zinc-500"
    >
      {/* Y-axis range */}
      <text x={pad.l - 4} y={pad.t + 10} textAnchor="end" className="fill-zinc-400 text-[10px]">
        {fmtYTick(maxV)}
      </text>
      <text x={pad.l - 4} y={pad.t + innerH} textAnchor="end" className="fill-zinc-500 text-[10px]">
        {fmtYTick(minV)}
      </text>

      <polygon points={floorPts} fill={fill} />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => (
        <circle key={i} cx={xAt(i)} cy={yAt(v)} r={3} fill={stroke} stroke="#18181b" strokeWidth={1} />
      ))}

      {dateList &&
        uniqueTicks.map((ti) => (
          <text
            key={ti}
            x={xAt(ti)}
            y={height - 6}
            textAnchor={ti === 0 ? 'start' : ti === n - 1 ? 'end' : 'middle'}
            className="fill-zinc-500 text-[10px]"
          >
            {fmtDate(dateList[ti]!, 'MMM d')}
          </text>
        ))}
    </svg>
  );
}

type BarProps = {
  values: number[];
  height?: number;
  color?: string;
};

export function MiniBars({ values, height = 40, color = '#22c55e' }: BarProps) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            background: color,
            height: `${(v / max) * 100}%`,
            opacity: 0.4 + 0.6 * (v / max),
          }}
        />
      ))}
    </div>
  );
}
