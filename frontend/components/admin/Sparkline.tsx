interface SparklineProps {
  points: string;
  color: string;
  dotCx: number;
  dotCy: number;
  height?: number;
}

export default function Sparkline({ points, color, dotCx, dotCy, height = 24 }: SparklineProps) {
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 120 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
      <circle cx={dotCx} cy={dotCy} r={2.5} fill={color} />
    </svg>
  );
}
