import { seedProviderHealth } from '@/lib/seed-data';

export default function HealthList() {
  return (
    <div>
      {seedProviderHealth.map((provider) => (
        <div
          key={provider.name}
          className="bg-bg border rounded-[7px] px-3 py-[9px] flex justify-between items-center mb-2"
        >
          {/* Left */}
          <div className="flex gap-2 items-center">
            <div className="w-[7px] h-[7px] rounded-full bg-success flex-shrink-0" />
            <div>
              <div className="text-[12px] font-semibold text-navy">{provider.name}</div>
              <div className="text-[10.5px] text-text-muted">{provider.detail}</div>
            </div>
          </div>

          {/* Right */}
          <span className="text-[11px] font-bold text-success flex-shrink-0">{provider.status}</span>
        </div>
      ))}
    </div>
  );
}
