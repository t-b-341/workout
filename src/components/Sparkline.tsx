'use client';

import { fmtDate } from '@/lib/time';
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';

type SparkProps = {
  values: number[];
  /** Optional second series rendered as a dashed line over the same axes. */
  overlay?: number[];
  width?: number;
  height?: number;
  stroke?: string;
  overlayStroke?: string;
  fill?: string;
  showDots?: boolean;
  labels?: string[];
  tooltipUnit?: string;
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
  labels,
  tooltipUnit,
}: SparkProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const tooltipMode =
    labels != null && labels.length === values.length && values.length >= 2;

  const geo = useMemo(() => {
    if (values.length === 0) return null;
    const allValues = overlay ? [...values, ...overlay] : values;
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;
    const padX = 4;
    const padY = 6;
    const w = width - padX * 2;
    const h = height - padY * 2;
    const xAt = (i: number, len: number) => padX + (i / Math.max(1, len - 1)) * w;
    const yAt = (v: number) => padY + h - ((v - min) / range) * h;
    return { min, max, padX, padY, w, h, xAt, yAt };
  }, [values, overlay, width, height]);

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

  if (!geo) return null;

  const { padX, padY, w, xAt, yAt } = geo;
  const pts = values.map((v, i) => `${xAt(i, values.length).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');
  const area = `${padX},${height - padY} ${pts} ${(padX + w).toFixed(2)},${height - padY}`;
  const overlayPts = overlay
    ? overlay.map((v, i) => `${xAt(i, overlay.length).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ')
    : null;

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!tooltipMode) return;
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const vb = svg.viewBox.baseVal;
    const scaleX = vb.width / rect.width;
    const svgX = (e.clientX - rect.left) * scaleX;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < values.length; i++) {
      const dx = Math.abs(xAt(i, values.length) - svgX);
      if (dx < bestDist) {
        bestDist = dx;
        best = i;
      }
    }
    setHoverIdx(best);
  };

  const onPointerLeave = () => {
    setHoverIdx(null);
  };

  const hi = hoverIdx;
  const cx = hi != null ? xAt(hi, values.length) : 0;
  const cy = hi != null ? yAt(values[hi]!) : 0;
  const valStr = hi != null ? values[hi]!.toFixed(1) : '';
  const unitSuffix = tooltipUnit ? ` ${tooltipUnit}` : '';
  const line1 = hi != null ? `${valStr}${unitSuffix}`.trim() : '';
  const line2 = hi != null && labels ? labels[hi]! : '';
  const fs = 10;
  const padT = 5;
  const twEstimate = Math.max(line1.length, line2.length) * (fs * 0.52) + padT * 2;
  const tw = Math.min(width - 8, Math.max(56, twEstimate));
  const th = line2 ? fs * 2 + padT * 2 : fs + padT * 2;
  let tx = cx - tw / 2;
  tx = Math.max(4, Math.min(width - tw - 4, tx));
  let ty = cy - 8 - th;
  if (ty < 4) ty = cy + 8;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      onPointerMove={tooltipMode ? onPointerMove : undefined}
      onPointerLeave={tooltipMode ? onPointerLeave : undefined}
      style={tooltipMode ? { touchAction: 'none' } : undefined}
    >
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
      {showDots &&
        values.map((v, i) => {
          const isHover = tooltipMode && hoverIdx === i;
          const r = isHover ? 4.5 : 2.5;
          const sw = isHover ? 1.5 : 0;
          const strokeCol = isHover ? '#fafafa' : 'none';
          return (
            <circle
              key={i}
              cx={xAt(i, values.length)}
              cy={yAt(v)}
              r={r}
              fill={stroke}
              stroke={strokeCol}
              strokeWidth={sw}
            />
          );
        })}
      {tooltipMode && hi != null && (
        <g pointerEvents="none">
          <rect
            x={tx}
            y={ty}
            width={tw}
            height={th}
            rx={4}
            fill="#27272a"
            stroke="#3f3f46"
            strokeWidth={1}
          />
          <text x={tx + padT} y={ty + fs + 1} fill="#f4f4f5" fontSize={fs} fontFamily="system-ui, sans-serif">
            {line1}
          </text>
          {line2 ? (
            <text x={tx + padT} y={ty + fs * 2 + 3} fill="#a1a1aa" fontSize={fs - 1} fontFamily="system-ui, sans-serif">
              {/^\d{4}-\d{2}-\d{2}$/.test(line2) ? fmtDate(line2, 'MMM d, yyyy') : line2}
            </text>
          ) : null}
        </g>
      )}
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
  labels?: string[];
  tooltipUnit?: string;
};

export function MiniBars({ values, height = 40, color = '#22c55e', labels, tooltipUnit }: BarProps) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const tooltipMode = labels != null && labels.length === values.length;

  const bars = (
    <div className="flex items-end gap-1" style={{ height }}>
      {values.map((v, i) => (
        <div key={i} className="flex-1 h-full flex flex-col justify-end relative min-w-0">
          <div
            role="presentation"
            className="w-full rounded-sm cursor-default"
            style={{
              background: color,
              height: `${(v / max) * 100}%`,
              opacity: 0.4 + 0.6 * (v / max),
            }}
            onPointerEnter={() => tooltipMode && setHoverIdx(i)}
            onPointerLeave={() => tooltipMode && setHoverIdx(null)}
          />
          {tooltipMode && hoverIdx === i ? (
            <div
              className="pointer-events-none absolute left-1/2 z-10 mb-1 min-w-0 max-w-[140px] -translate-x-1/2 rounded bg-zinc-800 px-2 py-1 text-center text-xs text-zinc-100 shadow-lg"
              style={{
                bottom: `calc(${(v / max) * 100}% + 4px)`,
              }}
            >
              <div className="font-mono whitespace-nowrap">
                {Math.round(v).toLocaleString()}
                {tooltipUnit ? ` ${tooltipUnit}` : ''}
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                {labels![i]!.match(/^\d{4}-\d{2}-\d{2}$/)
                  ? fmtDate(labels![i]!, 'MMM d, yyyy')
                  : labels![i]}
              </div>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );

  if (!tooltipMode) return bars;

  return <div className="relative overflow-visible">{bars}</div>;
}
