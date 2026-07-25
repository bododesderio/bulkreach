import { seedClients } from '@/lib/seed-data';

type Plan = 'starter' | 'growth' | 'business' | 'managed';
type Status = 'active' | 'trial' | 'sending' | 'paused';

function planBadge(plan: Plan): string {
  switch (plan) {
    case 'starter':
      return 'bg-[rgba(107,114,128,0.1)] text-[#6B7280]';
    case 'growth':
      return 'bg-[rgba(0,212,170,0.12)] text-[#009980]';
    case 'business':
      return 'bg-[rgba(27,31,74,0.1)] text-navy';
    case 'managed':
      return 'bg-[rgba(245,158,11,0.1)] text-amber';
  }
}

function statusDot(status: Status): string {
  switch (status) {
    case 'active':
      return '#10B981';
    case 'trial':
      return '#00D4AA';
    case 'sending':
      return '#F59E0B';
    case 'paused':
      return '#9CA3AF';
  }
}

function statusLabel(status: Status): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default function ClientsTable() {
  const lastIndex = seedClients.length - 1;

  return (
    <div className="overflow-x-auto">
      <table className="table-fixed w-full border-collapse">
        <thead>
          <tr>
            {['Client', 'Plan', 'Messages', 'Status', ''].map((col) => (
              <th
                key={col}
                className="text-[10px] font-bold uppercase tracking-[0.06em] text-text-muted px-[9px] py-1.5 border-b text-left"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {seedClients.map((client, i) => (
            <tr key={client.id} className="hover:bg-bg">
              {/* Client */}
              <td className={`px-[9px] py-[9px] text-[12px] text-text-md ${i === lastIndex ? '' : 'border-b'}`}>
                <div className="text-[12px] font-semibold text-navy">{client.name}</div>
                <div className="text-[10px] text-text-muted mt-0.5">{client.sub}</div>
              </td>

              {/* Plan */}
              <td className={`px-[9px] py-[9px] text-[12px] text-text-md ${i === lastIndex ? '' : 'border-b'}`}>
                <span
                  className={`inline-block px-[7px] py-0.5 rounded-[4px] text-[9.5px] font-bold capitalize ${planBadge(client.plan as Plan)}`}
                >
                  {client.plan}
                </span>
              </td>

              {/* Messages */}
              <td className={`px-[9px] py-[9px] text-text-md ${i === lastIndex ? '' : 'border-b'}`}>
                <span className="font-mono text-[12px]">
                  {client.messages.toLocaleString()}
                </span>
              </td>

              {/* Status */}
              <td className={`px-[9px] py-[9px] text-[12px] text-text-md ${i === lastIndex ? '' : 'border-b'}`}>
                <span
                  className="inline-block w-[6px] h-[6px] rounded-full mr-1 align-middle"
                  style={{ background: statusDot(client.status as Status) }}
                />
                {statusLabel(client.status as Status)}
              </td>

              {/* Action */}
              <td className={`px-[9px] py-[9px] text-right ${i === lastIndex ? '' : 'border-b'}`}>
                <button className="text-[11px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-teal hover:text-navy transition-colors">
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
