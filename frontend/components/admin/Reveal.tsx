import React from "react";

/** CSS fade-up entrance (staggered via animation-delay) + optional hover lift.
 *  Pure CSS — no animation library, works in both server and client trees. */
export function Reveal({
  children,
  delay = 0,
  lift = false,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  lift?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`animate-fade-up ${lift ? "hover-lift" : ""} ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

/** Staggers its direct children by injecting an incremental delay into each. */
export function RevealGroup({
  children,
  className = "",
  stagger = 0.07,
}: {
  children: React.ReactNode;
  className?: string;
  stagger?: number;
}) {
  return (
    <div className={className}>
      {React.Children.map(children, (child, i) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ delay?: number }>, { delay: i * stagger })
          : child,
      )}
    </div>
  );
}

export function RevealItem({
  children,
  className = "",
  lift = false,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  lift?: boolean;
  delay?: number;
}) {
  return (
    <div
      className={`animate-fade-up ${lift ? "hover-lift" : ""} ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}
