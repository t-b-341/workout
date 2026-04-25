'use client';

type Props = {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  showDots?: boolean;
};

export function Sparkline({
  values,
  width = 280,
  height = 60,
  stroke = '#f59e0b',
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
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padX = 4;
  const padY = 6;
  const w = width - padX * 2;
  const h = height - padY * 2;
  const x = (i: number) => padX + (i / (values.length - 1)) * w;
  const y = (v: number) => padY + h - ((v - min) / range) * h;

  const pts = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(' ');
  const area = `${padX},${height - padY} ${pts} ${(padX + w).toFixed(2)},${height - padY}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img">
      <polygon points={area} fill={fill} />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {showDots && values.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={stroke} />
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
