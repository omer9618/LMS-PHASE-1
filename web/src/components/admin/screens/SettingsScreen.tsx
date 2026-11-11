'use client';

import { type FormEvent } from 'react';
import { Button, Checkbox, Input, Loadable, PageHeader, Section, Textarea } from '@/components/ui';
import { adminApi, type PlatformSetting } from '@/lib/api/admin';
import { useQuery } from '@tanstack/react-query';
import styles from '../Admin.module.css';
import { MutationStatus } from '@/components/ui';
import { useMutation } from '@/lib/use-mutation';
import { formatDateTime } from '@/lib/format';
import { useMemo } from 'react';
import { z } from 'zod';
import { settingValue } from '@/lib/forms/admin';
import { useZodForm } from '@/lib/forms/use-zod-form';

/**
 * How each setting reads on screen: a title in words, its unit and its allowed range (the same
 * bounds the API enforces, so a typo is caught before it is sent). The key stays visible, small,
 * for anyone matching it to the audit log.
 */
const SETTING_META: Record<string, { title: string; unit?: string; min?: number; max?: number }> = {
  VIDEO_COMPLETION_THRESHOLD_PCT: {
    title: 'A video counts as watched at',
    unit: '%',
    min: 50,
    max: 100,
  },
  ORDER_EXPIRY_WINDOW_HOURS: {
    title: 'Unpaid orders lapse after',
    unit: 'hours',
    min: 1,
    max: 720,
  },
  PAYOUT_DISPUTE_WINDOW_DAYS: {
    title: 'Time to raise a payout concern',
    unit: 'days',
    min: 1,
    max: 60,
  },
  APPLICATION_RETENTION_DAYS: {
    title: 'Rejected applications are kept for',
    unit: 'days',
    min: 30,
    max: 3650,
  },
  BANK_TRANSFER_INSTRUCTIONS: { title: 'Bank transfer instructions' },
  VERIFICATION_TURNAROUND_HOURS: {
    title: 'Payments are verified within',
    unit: 'hours',
    min: 1,
    max: 720,
  },
};

/** #8: values admins change without a deploy. Each change is audited by the API. */
export function SettingsScreen() {
  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: ({ signal }) => adminApi.listSettings(signal),
  });
  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Platform settings"
        description="Changes apply at once and are recorded in the audit log."
      />
      <Loadable state={settings} what="settings">
        {(rows) => (
          <div className={styles.grid}>
            {rows.map((setting) => (
              <SettingForm
                key={setting.key}
                setting={setting}
                onSaved={() => void settings.refetch()}
              />
            ))}
          </div>
        )}
      </Loadable>
    </>
  );
}

function SettingForm({ setting, onSaved }: { setting: PlatformSetting; onSaved: () => void }) {
  const meta = SETTING_META[setting.key];
  const schema = useMemo(
    () => z.object({ value: settingValue(setting.defaultValue, meta) }),
    [setting, meta],
  );
  const form = useZodForm(schema, {
    value: typeof setting.value === 'boolean' ? setting.value : String(setting.value),
  });
  const mutation = useMutation();
  const isLong = typeof setting.defaultValue === 'string';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = form.check();
    if (!body) return;
    if (await mutation.run(() => adminApi.updateSetting(setting.key, body.value), 'Saved.'))
      onSaved();
  }

  return (
    <Section title={meta?.title ?? setting.key}>
      <form className={styles.inlineForm} onSubmit={submit} noValidate>
        {typeof setting.defaultValue === 'boolean' ? (
          <Checkbox label={setting.description} {...form.bindCheck('value')} />
        ) : isLong ? (
          <Textarea label={setting.description} rows={5} {...form.bind('value')} />
        ) : (
          <Input
            label={meta?.unit ? `${setting.description} (${meta.unit})` : setting.description}
            hint={
              meta?.min !== undefined && meta.max !== undefined
                ? `From ${meta.min} to ${meta.max} ${meta.unit ?? ''}`.trim()
                : undefined
            }
            inputMode="decimal"
            {...form.bind('value')}
          />
        )}
        <p className="muted">
          <code>{setting.key}</code>
          {!isLong && ` · Default: ${String(setting.defaultValue) || '(empty)'}`}
          {setting.updatedAt &&
            ` · Changed ${formatDateTime(setting.updatedAt)}${setting.updatedBy ? ` by ${setting.updatedBy.email}` : ''}`}
        </p>
        <MutationStatus mutation={mutation} />
        <div className={styles.actions}>
          <Button type="submit" size="sm" loading={mutation.pending}>
            Save
          </Button>
        </div>
      </form>
    </Section>
  );
}
