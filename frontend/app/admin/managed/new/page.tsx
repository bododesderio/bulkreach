/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 *
 * New managed brief — intake step. Pick the client account and capture the
 * brief; on save we drop straight into the job workspace to start the content.
 */
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { useApiQuery } from '@/lib/hooks';
import Topbar from '@/components/admin/Topbar';
import { Reveal } from '@/components/admin/Reveal';
import { DataState } from '@/components/ui';
import type { Managed, AccountLite } from '@/lib/managed';

const cardBase = 'bg-white border rounded-[11px] p-5';

export default function NewBriefPage() {
  const router = useRouter();
  const [accountId, setAccountId] = useState('');
  const [brief, setBrief] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: accounts, isLoading, isError, error, refetch } = useApiQuery(
    ['admin', 'accounts', 'lite'],
    async () => {
      const res = await api<{ items: AccountLite[] }>('/admin/accounts?limit=500', { auth: true });
      return res.items.map((a) => ({ id: a.id, name: a.name }));
    },
  );

  async function create() {
    if (!accountId) { toast.error('Select a client account'); return; }
    if (!brief.trim()) { toast.error('Enter a brief'); return; }
    setSaving(true);
    try {
      const job = await api<Managed>('/admin/managed', {
        method: 'POST', auth: true,
        body: JSON.stringify({ account_id: accountId, brief_text: brief.trim() }),
      });
      toast.success('Brief created');
      router.push(`/admin/managed/${job.id}`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Create failed');
      setSaving(false);
    }
  }

  return (
    <>
      <Topbar title="New brief" subtitle="Start a full-service campaign" showPeriod={false} />

      <div className="p-[18px]">
        <Link href="/admin/managed" className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal hover:underline">
          <ArrowLeft size={14} aria-hidden /> Back to queue
        </Link>

        <Reveal>
          <div className={`${cardBase} max-w-xl`}>
            {isLoading || isError ? (
              <DataState
                loading={isLoading}
                error={isError ? error : undefined}
                onRetry={() => refetch()}
                loadingLabel="Loading accounts…"
              />
            ) : (
              <div className="space-y-4">
                <div>
                  <label htmlFor="account" className="mb-1 block text-[12px] font-semibold text-navy">
                    Client account
                  </label>
                  <select
                    id="account"
                    className="input w-full text-[13px]"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">Select an account…</option>
                    {(accounts ?? []).map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="brief" className="mb-1 block text-[12px] font-semibold text-navy">
                    Brief
                  </label>
                  <textarea
                    id="brief"
                    className="input min-h-[130px] w-full text-[13px]"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                    disabled={saving}
                    placeholder="Goal, audience, key message, timing, any assets…"
                  />
                  <p className="mt-1 text-[11px] text-text-muted">
                    You&apos;ll draft the copy and link the campaign in the next step.
                  </p>
                </div>

                <div className="flex justify-end gap-2">
                  <Link
                    href="/admin/managed"
                    className="rounded-full border px-4 py-2 text-[13px] font-semibold text-text-muted hover:text-navy"
                  >
                    Cancel
                  </Link>
                  <button
                    type="button"
                    onClick={create}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-display text-[13px] font-bold transition hover:opacity-90 disabled:opacity-50"
                    style={{ background: '#00D4AA', color: '#0D0F2E' }}
                  >
                    {saving && <Loader2 size={14} className="animate-spin" aria-hidden />}
                    Create brief
                  </button>
                </div>
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </>
  );
}
