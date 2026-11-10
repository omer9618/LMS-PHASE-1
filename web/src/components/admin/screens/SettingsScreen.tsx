'use client';

import { type FormEvent } from 'react';
import { Button, Checkbox, Input, Loadable, PageHeader, Section, Textarea } from '@/components/ui';
import { listSettings, updateSetting, type PlatformSetting } from '@/lib/api/admin';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import { formatDateTime, MutationStatus, useMutation } from '../kit';
import { useMemo } from 'react';
import { z } from 'zod';
import { settingValue } from '@/lib/forms/admin';
import { useZodForm } from '@/lib/use-zod-form';

/** #8: values admins change without a deploy. Each change is audited by the API. */
export function SettingsScreen() {
  const settings = useApi('admin-settings', (signal) => listSettings(signal));
  return (
    <>
      <PageHeader
        title="Platform settings"
        description="Changes apply at once and are recorded in the audit log."
      />
      <Loadable state={settings} what="settings">
        {(rows) => (
          <div className={styles.grid}>
            {rows.map((setting) => (
              <SettingForm key={setting.key} setting={setting} onSaved={settings.reload} />
            ))}
          </div>
        )}
      </Loadable>
    </>
  );
}

function SettingForm({ setting, onSaved }: { setting: PlatformSetting; onSaved: () => void }) {
  const schema = useMemo(() => z.object({ value: settingValue(setting.defaultValue) }), [setting]);
  const form = useZodForm(schema, {
    value: typeof setting.value === 'boolean' ? setting.value : String(setting.value),
  });
  const mutation = useMutation();
  const isLong = typeof setting.defaultValue === 'string';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = form.check();
    if (!body) return;
    if (await mutation.run(() => updateSetting(setting.key, body.value), 'Saved.')) onSaved();
  }

  return (
    <Section title={<code>{setting.key}</code>}>
      <form className={styles.inlineForm} onSubmit={submit} noValidate>
        {typeof setting.defaultValue === 'boolean' ? (
          <Checkbox label={setting.description} {...form.bindCheck('value')} />
        ) : isLong ? (
          <Textarea label={setting.description} {...form.bind('value')} />
        ) : (
          <Input label={setting.description} inputMode="decimal" {...form.bind('value')} />
        )}
        <p className="muted">
          Default: {String(setting.defaultValue) || '(empty)'}
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
