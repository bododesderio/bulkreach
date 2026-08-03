/**
 * @author Bodo Desderio <rooiboktechltd@gmail.com>
 * @copyright 2026 Rooibok Technologies. All rights reserved.
 *
 * Human-friendly labels for backend enum tokens shown to users, so raw slugs like
 * "mtn_momo" never surface as "Mtn_momo".
 */

const KNOWN: Record<string, string> = {
  mtn_momo: 'MTN MoMo',
  momo: 'MTN MoMo',
  mtn: 'MTN',
  airtel_money: 'Airtel Money',
  airtel: 'Airtel Money',
  flutterwave: 'Flutterwave',
  pesapal: 'Pesapal',
  card: 'Card',
  simulator: 'Simulator',
  sms: 'SMS',
  email: 'Email',
  hot: 'Hot',
  warm: 'Warm',
  glacier: 'Glacier',
};

/** Title-case a snake_case token, honouring the known-brand map above. */
export function humanizeLabel(raw?: string | null): string {
  if (!raw) return '—';
  const key = String(raw).toLowerCase();
  if (KNOWN[key]) return KNOWN[key];
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export const paymentMethodLabel = humanizeLabel;
export const paymentProviderLabel = humanizeLabel;
export const storageTierLabel = humanizeLabel;
