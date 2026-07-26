'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DollarSign,
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import Topbar from '@/components/admin/Topbar';
import StatCard from '@/components/admin/StatCard';
import { Reveal, RevealGroup, RevealItem } from '@/components/admin/Reveal';
import DataTable, { Column } from '@/components/admin/DataTable';
import Donut from '@/components/admin/Donut';
import { StatusPill } from '@/components/admin/StatusPill';

// ── types ─────────────────────────────────────────────────────────────────────
type BackendPayStatus =
  | 'created'
  | 'pending'
  | 'successful'
  | 'failed'
  | 'timeout'
  | 'refunded';

interface AdminPayment {
  id: string;
  tx_ref: string;
  account_id: string;
  account_name: string;
  account_email: string;
  amount_ugx: number;
  currency: string;
  method: string;
  status: BackendPayStatus;
  provider: string;
  purpose: string;
  created_at: string;
  refunded_at: string | null;
}

interface PaymentStats {
  total: number;
  successful: number;
  pending: number;
  failed: number;
  refunded: number;
  volume_ugx: number;
}

interface PaymentResponse {
  items: AdminPayment[];
  stats: PaymentStats;
}

// ── status config ─────────────────────────────────────────────────────────────
const PAY_STATUS: Record<
  BackendPayStatus,
  { label: string; color: string; pulse: boolean }
> = {
  successful: { label: 'Successful', color: '#10B981', pulse: false },
  pending:    { label: 'Pending',    color: '#F59E0B', pulse: true  },
  created:    { label: 'Processing', color: '#F59E0B', pulse: true  },
  failed:     { label: 'Failed',     color: '#EF4444', pulse: false },
  timeout:    { label: 'Timeout',    color: '#EF4444', pulse: false },
  refunded:   { label: 'Refunded',   color: '#9CA3AF', pulse: false },
};

// ── deterministic per-method donut colours ────────────────────────────────────
const METHOD_COLOR_MAP: Record<string, string> = {
  'MTN MoMo':    '#F59E0B',
  'mtn_momo':    '#F59E0B',
  'Airtel Money': '#EF4444',
  'airtel_money': '#EF4444',
  Visa:          '#1B1F4A',
  Mastercard:    '#00D4AA',
  card:          '#1B1F4A',
};
const FALLBACK_COLORS = ['#00D4AA', '#6366F1', '#8B5CF6', '#EC4899', '#14B8A6'];

function methodColor(method: string, i: number): string {
  return METHOD_COLOR_MAP[method] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
}

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

const cardBase = 'bg-white border rounded-[11px] p-4';

// ── refund confirm modal ───────────────────────────────────────────────────────
function RefundModal({
  txRef,
  onCancel,
  onConfirm,
  loading,
}: {
  txRef: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  loading: boolean;
}) {
  const [reason, setReason] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(13,15,46,0.55)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-dialog-title"
    >
      <div className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-2xl animate-fade-up">
        <h3
          id="refund-dialog-title"
          className="font-display font-bold text-[15px] text-navy mb-1"
        >
          Confirm refund
        </h3>
        <p className="text-[11px] text-text-muted mb-3">
          Tx ref:{' '}
          <span className="font-mono">{txRef}</span>
        </p>

        <label
          htmlFor="refund-reason"
          className="block text-[10.5px] font-semibold uppercase tracking-wide text-text-muted mb-1"
        >
          Reason (optional)
        </label>
        <textarea
          id="refund-reason"
          className="input w-full resize-none text-[12px]"
          rows={2}
          placeholder="e.g. duplicate payment, customer request…"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <div className="flex gap-2 mt-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 text-[12px] rounded-[6px] border bg-transparent font-semibold text-text-muted px-3 py-2 hover:border-navy hover:text-navy transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => onConfirm(reason)}
            className="flex-1 text-[12px] rounded-[6px] font-semibold px-3 py-2 transition-colors disabled:opacity-60"
            style={{ background: '#EF4444', color: '#fff' }}
          >
            {loading ? 'Processing…' : 'Refund'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function PaymentsPage() {
  const [items, setItems] = useState<AdminPayment[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmTx, setConfirmTx] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<PaymentResponse>('/admin/payments/transactions', {
        auth: true,
      });
      setItems(data.items);
      setStats(data.stats);
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleRefund(txRef: string, reason: string) {
    setRefunding(txRef);
    try {
      await api(`/admin/payments/transactions/${txRef}/refund`, {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ reason }),
      });
      toast.success('Refund initiated');
      setConfirmTx(null);
      await fetchData();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Refund failed');
    } finally {
      setRefunding(null);
    }
  }

  // ── derive donut slices from live items ────────────────────────────────────
  const methodTotals = items.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = (acc[p.method] ?? 0) + p.amount_ugx;
    return acc;
  }, {});
  const donutData = Object.entries(methodTotals).map(([method, value], i) => ({
    label: method,
    value,
    color: methodColor(method, i),
  }));

  const volumeM = stats ? stats.volume_ugx / 1_000_000 : 0;

  // ── column definitions ─────────────────────────────────────────────────────
  const columns: Column<AdminPayment>[] = [
    {
      key: 'account',
      label: 'Account',
      render: (row) => (
        <div>
          <div className="text-[12px] font-semibold text-navy">{row.account_name}</div>
          <div className="text-[10.5px] text-text-muted">{row.account_email}</div>
        </div>
      ),
    },
    {
      key: 'tx_ref',
      label: 'Tx ref',
      render: (row) => (
        <span className="font-mono text-[10.5px] text-text-muted">
          {row.tx_ref.length > 16 ? `${row.tx_ref.slice(0, 16)}…` : row.tx_ref}
        </span>
      ),
    },
    {
      key: 'amount_ugx',
      label: 'Amount',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-[12px] text-navy">
          UGX {row.amount_ugx.toLocaleString()}
        </span>
      ),
    },
    {
      key: 'method',
      label: 'Method',
      render: (row) => (
        <span className="text-[11px] text-text-md">{row.method}</span>
      ),
    },
    {
      key: 'provider',
      label: 'Provider',
      render: (row) => (
        <span className="text-[11px] text-text-muted">{row.provider}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => {
        const s = PAY_STATUS[row.status] ?? {
          label: row.status,
          color: '#9CA3AF',
          pulse: false,
        };
        return <StatusPill label={s.label} color={s.color} pulse={s.pulse} />;
      },
    },
    {
      key: 'created_at',
      label: 'Date',
      render: (row) => (
        <span className="text-[11px] text-text-muted whitespace-nowrap">
          {fmtDate(row.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      label: '',
      align: 'right',
      render: (row) => {
        if (row.status !== 'successful') return null;
        return (
          <button
            type="button"
            onClick={() => setConfirmTx(row.tx_ref)}
            className="text-[11px] rounded-[5px] border bg-transparent font-semibold text-text-muted px-2 py-1 hover:border-red-400 hover:text-red-500 transition-colors"
          >
            Refund
          </button>
        );
      },
    },
  ];

  return (
    <>
      <Topbar
        title="Payments"
        subtitle="All providers · Settlement history"
        showPeriod={false}
      />

      <div className="p-[18px]">
        {loading && (
          <div className="flex items-center justify-center py-16 text-[12px] text-text-muted">
            Loading transactions…
          </div>
        )}

        {!loading && stats && (
          <>
            {/* KPI row */}
            <RevealGroup className="grid grid-cols-5 gap-3 mb-[18px]">
              <RevealItem lift>
                <StatCard
                  label="VOLUME (TOTAL)"
                  value={volumeM}
                  prefix="UGX "
                  suffix="M"
                  decimals={1}
                  valueSize={22}
                  icon={DollarSign}
                  sparklineKey="revenue"
                  change={`${stats.total} transactions`}
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="SUCCESSFUL"
                  value={stats.successful}
                  valueSize={26}
                  icon={CheckCircle2}
                  change="Completed"
                  changeType="up"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="PENDING"
                  value={stats.pending}
                  valueSize={26}
                  icon={Clock}
                  change="Awaiting confirmation"
                  changeType="warn"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="FAILED"
                  value={stats.failed}
                  valueSize={26}
                  icon={XCircle}
                  warn
                  changeType="down"
                  change="Needs investigation"
                />
              </RevealItem>
              <RevealItem lift>
                <StatCard
                  label="REFUNDED"
                  value={stats.refunded}
                  valueSize={26}
                  icon={RotateCcw}
                  change="Returned to senders"
                  changeType="warn"
                />
              </RevealItem>
            </RevealGroup>

            {/* Donut (conditional on having items) + transactions table */}
            <div
              className="grid gap-3 mb-[18px]"
              style={{
                gridTemplateColumns:
                  donutData.length > 0 ? '1fr 1.8fr' : '1fr',
              }}
            >
              {donutData.length > 0 && (
                <Reveal delay={0.15} lift className={cardBase}>
                  <div className="font-display text-[14px] font-bold text-navy mb-0.5">
                    Payment methods
                  </div>
                  <div className="text-[11px] text-text-muted mb-3">
                    Share of collected volume
                  </div>
                  <div className="flex items-center gap-4">
                    <div style={{ width: 160, flexShrink: 0 }}>
                      <Donut
                        data={donutData}
                        height={160}
                        centerLabel={`UGX ${volumeM.toFixed(1)}M`}
                        centerSub="total"
                        format={(v) => `UGX ${(v / 1e6).toFixed(2)}M`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      {donutData.map((m) => (
                        <div
                          key={m.label}
                          className="flex items-center justify-between py-[7px] border-b last:border-0"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="flex-shrink-0 rounded-full"
                              style={{ width: 8, height: 8, background: m.color }}
                            />
                            <span className="text-[11.5px] font-semibold text-navy truncate">
                              {m.label}
                            </span>
                          </div>
                          <span className="text-[10.5px] text-text-muted ml-2 whitespace-nowrap">
                            UGX {(m.value / 1e6).toFixed(1)}M
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Reveal>
              )}

              <Reveal delay={0.22} lift className={cardBase}>
                <div className="font-display text-[14px] font-bold text-navy mb-0.5">
                  All transactions
                </div>
                <div className="text-[11px] text-text-muted mb-4">
                  {items.length} transaction{items.length !== 1 ? 's' : ''}
                </div>
                <DataTable<AdminPayment>
                  columns={columns}
                  rows={items}
                  rowKey={(row) => row.id}
                  stagger={0.03}
                  baseDelay={0.08}
                  empty="No transactions found"
                />
              </Reveal>
            </div>
          </>
        )}

        {!loading && !stats && (
          <div className="py-16 text-center text-[12px] text-text-muted">
            No payment data available.
          </div>
        )}
      </div>

      {confirmTx && (
        <RefundModal
          txRef={confirmTx}
          onCancel={() => setConfirmTx(null)}
          onConfirm={(reason) => handleRefund(confirmTx, reason)}
          loading={refunding === confirmTx}
        />
      )}
    </>
  );
}
