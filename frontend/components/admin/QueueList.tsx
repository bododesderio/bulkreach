import { seedManagedQueue } from '@/lib/seed-data';

type BadgeType = 'ok' | 'review' | 'scheduled';

function badgeClasses(type: BadgeType): string {
  switch (type) {
    case 'ok':
      return 'bg-[rgba(16,185,129,0.1)] text-success';
    case 'review':
      return 'bg-[rgba(245,158,11,0.1)] text-amber';
    case 'scheduled':
      return 'bg-[rgba(99,102,241,0.1)] text-[#6366F1]';
  }
}

export default function QueueList() {
  return (
    <div>
      {seedManagedQueue.map((item) => (
        <div
          key={item.id}
          className="bg-bg border rounded-[7px] px-[11px] py-[9px] flex items-center gap-[9px] mb-2"
        >
          {/* Avatar */}
          <div
            className="w-7 h-7 rounded-[6px] flex items-center justify-center font-display text-[11px] font-bold flex-shrink-0"
            style={{ background: item.avatar_bg, color: item.avatar_color }}
          >
            {item.initials}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="text-[12.5px] font-semibold text-navy truncate">{item.name}</div>
            <div className="text-[10.5px] text-text-muted mt-0.5">{item.meta}</div>
          </div>

          {/* Badge */}
          <span
            className={`px-[7px] py-0.5 rounded-[4px] text-[9.5px] font-bold flex-shrink-0 ${badgeClasses(item.badge_type as BadgeType)}`}
          >
            {item.badge}
          </span>
        </div>
      ))}
    </div>
  );
}
