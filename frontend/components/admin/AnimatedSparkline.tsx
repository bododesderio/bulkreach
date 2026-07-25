'use client';

import { motion } from 'framer-motion';

interface AnimatedSparklineProps {
  points: string;
  color: string;
  dotCx: number;
  dotCy: number;
  height?: number;
  delay?: number;
}

/** Sparkline whose line draws itself in on view, with a pop-in end dot. */
export default function AnimatedSparkline({
  points,
  color,
  dotCx,
  dotCy,
  height = 24,
  delay = 0,
}: AnimatedSparklineProps) {
  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 120 ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <motion.polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0.4 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.1, ease: 'easeInOut', delay }}
      />
      <motion.circle
        cx={dotCx}
        cy={dotCy}
        r={2.5}
        fill={color}
        initial={{ scale: 0, opacity: 0 }}
        whileInView={{ scale: 1, opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.3, delay: delay + 1.0 }}
      />
    </svg>
  );
}
