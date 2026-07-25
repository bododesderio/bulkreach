import React from 'react';

interface StatusDotProps {
  color: string;
  pulse?: boolean;
  size?: number;
  className?: string;
}

/** A small round status dot; pulses by default to signal "live". */
export function StatusDot({ color, pulse = true, size = 7, className = '' }: StatusDotProps) {
  return (
    <span
      className={`${pulse ? 'animate-dot-pulse' : ''} ${className}`}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '9999px',
        background: color,
        flexShrink: 0,
        boxShadow: pulse ? `0 0 0 3px ${color}22` : undefined,
      }}
    />
  );
}

interface StatusPillProps {
  label: string;
  color: string;
  /** Tinted background pill. Defaults to a soft tint of `color`. */
  bg?: string;
  pulse?: boolean;
  dot?: boolean;
}

/** Label + optional pulsing dot, wrapped in a tinted pill. */
export function StatusPill({ label, color, bg, pulse = false, dot = true }: StatusPillProps) {
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-full font-bold whitespace-nowrap"
      style={{
        background: bg ?? `${color}1a`,
        color,
        padding: '2px 9px',
        fontSize: '9.5px',
        letterSpacing: '0.03em',
      }}
    >
      {dot && <StatusDot color={color} pulse={pulse} size={6} />}
      {label}
    </span>
  );
}
