import { seedRevenuePlans } from '@/lib/seed-data';

export default function RevenueBars() {
  return (
    <div>
      {seedRevenuePlans.map((plan) => (
        <div key={plan.name} className="mb-3">
          {/* Top row */}
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-[12.5px] font-semibold text-navy">
              {plan.name}{' '}
              <span className="text-text-muted font-normal">
                {plan.accounts} accounts
              </span>
            </span>
            <span className="font-mono text-[12px] text-text-md">{plan.label}</span>
          </div>
          {/* Bar */}
          <div className="h-[5px] bg-[#EEF0FA] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${plan.fill_pct}%`, background: plan.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
