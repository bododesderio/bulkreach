'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import Topbar from '@/components/admin/Topbar';
import FormGrid, { FormActions, FormCard } from '@/components/admin/FormGrid';
import FormField from '@/components/admin/FormField';
import { Reveal } from '@/components/admin/Reveal';

interface SettingsForm {
  platformName: string;
  supportEmail: string;
  smsSenderId: string;
  archiveRetentionMonths: number;
  mailgunDomain: string;
  flutterwaveMode: 'test' | 'live';
}

const defaults: SettingsForm = {
  platformName: 'BulkReach',
  supportEmail: 'support@bulkreach.ug',
  smsSenderId: 'BULKREACH',
  archiveRetentionMonths: 24,
  mailgunDomain: 'mg.bulkreach.ug',
  flutterwaveMode: 'test',
};

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>(defaults);

  function update<K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    toast.success('Settings saved');
  }

  function handleCancel() {
    setForm(defaults);
  }

  return (
    <>
      <Topbar title="Settings" subtitle="Platform configuration" />

      <div className="p-[18px]">
        <form onSubmit={handleSubmit}>
          <Reveal>
          <FormCard>
            <FormGrid columns={2}>
              <FormField
                label="Platform name"
                htmlFor="platformName"
                hint="Shown in emails and branded reports."
              >
                <input
                  id="platformName"
                  type="text"
                  className="input"
                  value={form.platformName}
                  onChange={(e) => update('platformName', e.target.value)}
                />
              </FormField>

              <FormField
                label="Support email"
                htmlFor="supportEmail"
                hint="Replies to automated emails go here."
              >
                <input
                  id="supportEmail"
                  type="email"
                  className="input"
                  value={form.supportEmail}
                  onChange={(e) => update('supportEmail', e.target.value)}
                />
              </FormField>

              <FormField
                label="Default SMS sender ID"
                htmlFor="smsSenderId"
                hint="Max 11 alphanumeric characters."
              >
                <input
                  id="smsSenderId"
                  type="text"
                  className="input"
                  maxLength={11}
                  value={form.smsSenderId}
                  onChange={(e) => update('smsSenderId', e.target.value)}
                />
              </FormField>

              <FormField
                label="Archive retention (months)"
                htmlFor="archiveRetentionMonths"
                hint="Campaign data is purged after this period."
              >
                <input
                  id="archiveRetentionMonths"
                  type="number"
                  className="input"
                  min={1}
                  max={120}
                  value={form.archiveRetentionMonths}
                  onChange={(e) =>
                    update('archiveRetentionMonths', Number(e.target.value))
                  }
                />
              </FormField>

              <FormField
                label="Mailgun domain"
                htmlFor="mailgunDomain"
                hint="Must match your verified Mailgun sending domain."
              >
                <input
                  id="mailgunDomain"
                  type="text"
                  className="input"
                  value={form.mailgunDomain}
                  onChange={(e) => update('mailgunDomain', e.target.value)}
                />
              </FormField>

              <FormField
                label="Flutterwave mode"
                htmlFor="flutterwaveMode"
                hint="Switch to Live only after completing Flutterwave KYC."
              >
                <select
                  id="flutterwaveMode"
                  className="input"
                  value={form.flutterwaveMode}
                  onChange={(e) =>
                    update('flutterwaveMode', e.target.value as 'test' | 'live')
                  }
                >
                  <option value="test">Test</option>
                  <option value="live">Live</option>
                </select>
              </FormField>
            </FormGrid>

            <FormActions>
              <button
                type="button"
                className="btn-outline"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-full font-display font-bold text-[13px] px-4 py-2 transition hover:opacity-90"
                style={{ background: '#00D4AA', color: '#0D0F2E' }}
              >
                Save changes
              </button>
            </FormActions>
          </FormCard>
          </Reveal>
        </form>
      </div>
    </>
  );
}
