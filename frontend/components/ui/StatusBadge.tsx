/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
import React from 'react';
import { resolveStatus, type StatusDomain } from '@/lib/status';

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

interface StatusBadgeProps {
  /** Which status vocabulary to resolve against. */
  domain: StatusDomain;
  /** The raw backend status token (case/underscore-insensitive). */
  status: string | null | undefined;
  /** Override the resolved label (rare — e.g. to append a count). */
  label?: string;
  /** Override the resolved pulse. */
  pulse?: boolean;
  dot?: boolean;
}

/**
 * Domain-aware status badge. Resolves colour/label/pulse from the single
 * `lib/status` source of truth, so every table and detail view agrees and an
 * unknown status renders a legible grey "Unknown" pill rather than a blank one.
 */
export function StatusBadge({ domain, status, label, pulse, dot }: StatusBadgeProps) {
  const cfg = resolveStatus(domain, status);
  // `channel` is a classifier, not a live state — no leading dot by default.
  const showDot = dot ?? domain !== 'channel';
  return (
    <StatusPill
      label={label ?? cfg.label}
      color={cfg.color}
      bg={cfg.bg}
      pulse={pulse ?? cfg.pulse ?? false}
      dot={showDot}
    />
  );
}
