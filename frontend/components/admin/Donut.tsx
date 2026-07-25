'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  data: DonutSlice[];
  height?: number;
  /** Big number shown in the centre. */
  centerLabel?: string;
  centerSub?: string;
  format?: (v: number) => string;
}

/** Donut chart with a centred label and hover tooltip. */
export default function Donut({ data, height = 200, centerLabel, centerSub, format }: DonutProps) {
  const fmt = format ?? ((v: number) => String(v));

  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            cx="50%"
            cy="50%"
            innerRadius="62%"
            outerRadius="86%"
            paddingAngle={2}
            stroke="none"
            animationDuration={800}
          >
            {data.map((slice) => (
              <Cell key={slice.label} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #e5e7eb',
              fontSize: 12,
            }}
            formatter={(v: number | string, name: string) => [fmt(Number(v)), name]}
          />
        </PieChart>
      </ResponsiveContainer>
      {centerLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="font-mono font-semibold text-navy text-[18px] leading-none">
            {centerLabel}
          </div>
          {centerSub && <div className="text-[10.5px] text-text-muted mt-1">{centerSub}</div>}
        </div>
      )}
    </div>
  );
}
