/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 */
'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import Topbar from '@/components/admin/Topbar';
import FormGrid, { FormActions, FormCard } from '@/components/admin/FormGrid';
import FormField from '@/components/admin/FormField';
import { Reveal } from '@/components/admin/Reveal';
import { api, ApiError } from '@/lib/api';
import { useApiQuery, useApiMutation } from '@/lib/hooks';

// ── types ─────────────────────────────────────────────────────────────────────

interface CredentialField {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
  placeholder: string;
}

interface ProviderConfig {
  slug: string;
  display_name: string;
  enabled: boolean;
  mode: 'test' | 'live';
  supported_methods: string[];
  credential_fields: CredentialField[];
  credentials: Record<string, string>;
}

interface RoutingConfig {
  routing: Record<string, string>;
  default_currency: string;
}

// ── constants ─────────────────────────────────────────────────────────────────

const METHODS = [
  { key: 'mtn_momo', label: 'MTN MoMo' },
  { key: 'airtel_money', label: 'Airtel Money' },
  { key: 'card', label: 'Card (Visa / Mastercard)' },
];

// ── sub-components ────────────────────────────────────────────────────────────

function Toggle({
  id,
  checked,
  onChange,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex flex-shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4AA] focus-visible:ring-offset-2"
      style={{
        width: '40px',
        height: '22px',
        background: checked ? '#00D4AA' : '#D1D5DB',
      }}
    >
      <span className="sr-only">{checked ? 'Enabled' : 'Disabled'}</span>
      <span
        className="inline-block rounded-full bg-white shadow transition-transform"
        style={{
          width: '16px',
          height: '16px',
          transform: checked ? 'translateX(20px)' : 'translateX(3px)',
        }}
      />
    </button>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function PaymentProvidersPage() {
  const [routing, setRouting] = useState<RoutingConfig>({
    routing: {},
    default_currency: 'UGX',
  });

  // Local edit state (per-slug maps so each card is independent)
  const [localEnabled, setLocalEnabled] = useState<Record<string, boolean>>({});
  const [localMode, setLocalMode] = useState<Record<string, 'test' | 'live'>>({});
  const [localCreds, setLocalCreds] = useState<Record<string, Record<string, string>>>({});
  const [routingForm, setRoutingForm] = useState<Record<string, string>>({});

  // ── data loading ────────────────────────────────────────────────────────────

  const { data, isLoading: loading, isError, error } = useApiQuery(
    ['admin', 'payments', 'config'],
    async () => {
      const [providers, routing] = await Promise.all([
        api<ProviderConfig[]>('/admin/payments/providers', { auth: true }),
        api<RoutingConfig>('/admin/payments/routing', { auth: true }),
      ]);
      return { providers, routing };
    },
  );

  const providers = data?.providers ?? [];

  useEffect(() => {
    if (isError) {
      toast.error(error instanceof ApiError ? error.message : 'Failed to load providers');
    }
  }, [isError, error]);

  // Seed local edit state whenever fresh config arrives
  useEffect(() => {
    if (!data) return;
    setRouting(data.routing);
    setRoutingForm(data.routing.routing);

    const enabled: Record<string, boolean> = {};
    const modes: Record<string, 'test' | 'live'> = {};
    const creds: Record<string, Record<string, string>> = {};
    for (const p of data.providers) {
      enabled[p.slug] = p.enabled;
      modes[p.slug] = p.mode;
      creds[p.slug] = { ...p.credentials };
    }
    setLocalEnabled(enabled);
    setLocalMode(modes);
    setLocalCreds(creds);
  }, [data]);

  // ── save handlers ───────────────────────────────────────────────────────────

  const saveProviderMutation = useApiMutation<unknown, string>(
    (slug) => {
      const provider = providers.find((p) => p.slug === slug);
      const rawCreds = localCreds[slug] ?? {};

      // Per contract: for secret fields, omit values that are unchanged (masked or empty)
      const credentials: Record<string, string> = {};
      if (provider) {
        for (const field of provider.credential_fields) {
          const val = rawCreds[field.key] ?? '';
          if (field.secret && (val === '' || val.startsWith('••••'))) {
            // Skip — backend treats absence as "unchanged"
            continue;
          }
          credentials[field.key] = val;
        }
      }

      return api(`/admin/payments/providers/${slug}`, {
        method: 'PUT',
        auth: true,
        body: JSON.stringify({
          enabled: localEnabled[slug] ?? false,
          mode: localMode[slug] ?? 'test',
          credentials,
        }),
      });
    },
    {
      invalidate: [['admin', 'payments', 'config']],
      onSuccess: (_d, slug) => {
        const provider = providers.find((p) => p.slug === slug);
        toast.success(`${provider?.display_name ?? slug} saved`);
      },
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Save failed'),
    },
  );
  const saving = saveProviderMutation.isPending ? saveProviderMutation.variables ?? null : null;

  function saveProvider(slug: string) {
    saveProviderMutation.mutate(slug);
  }

  const routingMutation = useApiMutation<unknown, void>(
    () => {
      // Omit empty-string keys (leave unrouted)
      const cleaned: Record<string, string> = {};
      for (const [method, slug] of Object.entries(routingForm)) {
        if (slug) cleaned[method] = slug;
      }
      return api('/admin/payments/routing', {
        method: 'PUT',
        auth: true,
        body: JSON.stringify({
          routing: cleaned,
          default_currency: routing.default_currency,
        }),
      });
    },
    {
      invalidate: [['admin', 'payments', 'config']],
      onSuccess: () => toast.success('Routing saved'),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Save failed'),
    },
  );
  const savingRouting = routingMutation.isPending;

  function saveRouting() {
    routingMutation.mutate();
  }

  // ── render ──────────────────────────────────────────────────────────────────

  return (
    <>
      <Topbar
        title="Payment providers"
        subtitle="Gateways, credentials & method routing"
        showPeriod={false}
      />

      <div className="p-[18px] space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 animate-pulse rounded-[11px] border bg-white"
              />
            ))}
          </div>
        ) : (
          <>
            {/* Per-provider cards */}
            {providers.map((p, i) => {
              const isLive = localMode[p.slug] === 'live';

              return (
                <Reveal key={p.slug} delay={i * 0.07}>
                  <FormCard>
                    {/* Header: logo + name + method chips + enable toggle */}
                    <div className="flex items-start justify-between mb-4 gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/logos/payments/${p.slug}.svg`}
                          alt={p.display_name}
                          style={{ height: '26px', maxWidth: '80px', objectFit: 'contain', flexShrink: 0 }}
                        />
                        <div className="min-w-0">
                          <div className="font-display font-bold text-[14px] text-navy leading-tight">
                            {p.display_name}
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {p.supported_methods.map((m) => (
                              <span
                                key={m}
                                className="rounded-full font-semibold uppercase whitespace-nowrap"
                                style={{
                                  background: 'rgba(0,212,170,0.1)',
                                  color: '#007a65',
                                  padding: '1px 8px',
                                  fontSize: '9.5px',
                                  letterSpacing: '0.05em',
                                }}
                              >
                                {m.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <label
                          htmlFor={`toggle-${p.slug}`}
                          className="text-[12px] text-text-muted select-none"
                        >
                          {localEnabled[p.slug] ? 'Enabled' : 'Disabled'}
                        </label>
                        <Toggle
                          id={`toggle-${p.slug}`}
                          checked={!!localEnabled[p.slug]}
                          onChange={(v) =>
                            setLocalEnabled((prev) => ({ ...prev, [p.slug]: v }))
                          }
                        />
                      </div>
                    </div>

                    {/* Live mode warning */}
                    {isLive && (
                      <div
                        className="flex items-start gap-2 rounded-[8px] p-3 mb-4"
                        style={{
                          background: 'rgba(245,158,11,0.08)',
                          border: '1px solid rgba(245,158,11,0.25)',
                        }}
                        role="alert"
                      >
                        <AlertTriangle
                          size={14}
                          style={{ color: '#F59E0B', flexShrink: 0, marginTop: '1px' }}
                          aria-hidden="true"
                        />
                        <p className="text-[11.5px]" style={{ color: '#92400E' }}>
                          Live mode is active — real money will be processed. Ensure KYC is
                          complete and you are using production credentials.
                        </p>
                      </div>
                    )}

                    {/* Form fields */}
                    <FormGrid columns={2}>
                      <FormField label="Mode" htmlFor={`mode-${p.slug}`}>
                        <select
                          id={`mode-${p.slug}`}
                          className="input"
                          value={localMode[p.slug] ?? 'test'}
                          onChange={(e) =>
                            setLocalMode((prev) => ({
                              ...prev,
                              [p.slug]: e.target.value as 'test' | 'live',
                            }))
                          }
                        >
                          <option value="test">Test</option>
                          <option value="live">Live</option>
                        </select>
                      </FormField>

                      {p.credential_fields.map((field) => (
                        <FormField
                          key={field.key}
                          label={field.label}
                          htmlFor={`${p.slug}-${field.key}`}
                        >
                          <input
                            id={`${p.slug}-${field.key}`}
                            type={field.secret ? 'password' : 'text'}
                            className="input"
                            placeholder={field.placeholder}
                            value={localCreds[p.slug]?.[field.key] ?? ''}
                            onChange={(e) =>
                              setLocalCreds((prev) => ({
                                ...prev,
                                [p.slug]: {
                                  ...(prev[p.slug] ?? {}),
                                  [field.key]: e.target.value,
                                },
                              }))
                            }
                            autoComplete="off"
                            required={field.required}
                          />
                        </FormField>
                      ))}
                    </FormGrid>

                    <FormActions>
                      <button
                        type="button"
                        disabled={saving === p.slug}
                        onClick={() => saveProvider(p.slug)}
                        className="rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ background: '#00D4AA', color: '#0D0F2E' }}
                      >
                        {saving === p.slug ? 'Saving…' : 'Save'}
                      </button>
                    </FormActions>
                  </FormCard>
                </Reveal>
              );
            })}

            {/* Method routing card */}
            <Reveal delay={providers.length * 0.07}>
              <FormCard>
                <div className="font-display font-bold text-[15px] text-navy mb-1">
                  Method routing
                </div>
                <p className="text-[11.5px] text-text-muted mb-4">
                  Route each payment method to an enabled provider. Card = Visa / Mastercard.
                  A method with no provider selected will be unavailable to clients.
                </p>

                <FormGrid columns={2}>
                  {METHODS.map((method) => {
                    const eligible = providers.filter(
                      (p) =>
                        localEnabled[p.slug] &&
                        p.supported_methods.includes(method.key),
                    );
                    return (
                      <FormField
                        key={method.key}
                        label={method.label}
                        htmlFor={`route-${method.key}`}
                      >
                        <select
                          id={`route-${method.key}`}
                          className="input"
                          value={routingForm[method.key] ?? ''}
                          onChange={(e) =>
                            setRoutingForm((prev) => ({
                              ...prev,
                              [method.key]: e.target.value,
                            }))
                          }
                        >
                          <option value="">— none —</option>
                          {eligible.map((p) => (
                            <option key={p.slug} value={p.slug}>
                              {p.display_name}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    );
                  })}
                </FormGrid>

                <FormActions>
                  <button
                    type="button"
                    disabled={savingRouting}
                    onClick={saveRouting}
                    className="rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{ background: '#00D4AA', color: '#0D0F2E' }}
                  >
                    {savingRouting ? 'Saving…' : 'Save routing'}
                  </button>
                </FormActions>
              </FormCard>
            </Reveal>
          </>
        )}
      </div>
    </>
  );
}
