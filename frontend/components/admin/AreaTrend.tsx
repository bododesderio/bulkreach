'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface SeriesDef {
  key: string;
  color: string;
  label: string;
  /** Dashed line (e.g. a target). */
  dashed?: boolean;
  fill?: boolean;
}

interface AreaTrendProps {
  data: Record<string, unknown>[];
  xKey: string;
  series: SeriesDef[];
  height?: number;
  /** Format Y-axis ticks + tooltip values. */
  format?: (v: number) => string;
}

/** Themed recharts area chart with soft gradients + custom tooltip. */
export default function AreaTrend({ data, xKey, series, height = 220, format }: AreaTrendProps) {
  const fmt = format ?? ((v: number) => String(v));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#eef0f5" vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9CA3AF' }}
          axisLine={false}
          tickLine={false}
          width={54}
          tickFormatter={(v) => fmt(Number(v))}
        />
        <Tooltip
          cursor={{ stroke: '#e5e7eb' }}
          contentStyle={{
            borderRadius: 10,
            border: '1px solid #e5e7eb',
            fontSize: 12,
            boxShadow: '0 8px 24px -12px rgba(27,31,74,0.25)',
          }}
          formatter={(v: number | string, name: string) => {
            const s = series.find((x) => x.label === name || x.key === name);
            return [fmt(Number(v)), s?.label ?? name];
          }}
        />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '5 4' : undefined}
            fill={s.fill === false || s.dashed ? 'transparent' : `url(#grad-${s.key})`}
            dot={false}
            activeDot={{ r: 4 }}
            isAnimationActive
            animationDuration={900}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
