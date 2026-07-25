import { FlaskConical } from 'lucide-react';

/** Honest marker: admin portal runs on seed data until the M5 superadmin API. */
export default function DemoBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${className}`}
      style={{
        background: 'rgba(245,158,11,0.1)',
        border: '1px solid rgba(245,158,11,0.22)',
        color: '#B45309',
        padding: '3px 10px',
        fontSize: '10px',
      }}
    >
      <FlaskConical size={11} />
      Demo data
    </span>
  );
}
