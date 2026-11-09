'use client';

import { useState, type FormEvent } from 'react';
import { Button, Checkbox, Input, Loadable, PageHeader, Section, Textarea } from '@/components/ui';
import { listSettings, updateSetting, type PlatformSetting } from '@/lib/api/admin';
import { useApi } from '@/lib/use-api';
import styles from '../Admin.module.css';
import { formatDateTime, MutationStatus, useMutation } from '../kit';

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

/** The value typed into the form → what the API expects for this setting's type. */
export function parseSettingInput(
  setting: Pick<PlatformSetting, 'defaultValue'>,
  raw: string | boolean,
): number | string | boolean | null {
  if (typeof setting.defaultValue === 'boolean') return Boolean(raw);
  if (typeof setting.defaultValue === 'number') {
    const text = String(raw).trim();
    if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
    return Number(text);
  }
  return String(raw);
}

function SettingForm({ setting, onSaved }: { setting: PlatformSetting; onSaved: () => void }) {
  const [value, setValue] = useState<string | boolean>(
    typeof setting.value === 'boolean' ? setting.value : String(setting.value),
  );
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation();
  const isLong = typeof setting.defaultValue === 'string';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = parseSettingInput(setting, value);
    if (parsed === null) {
      setError('Enter a number.');
      return;
    }
    setError(null);
    if (await mutation.run(() => updateSetting(setting.key, parsed), 'Saved.')) onSaved();
  }

  return (
    <Section title={<code>{setting.key}</code>}>
      <form className={styles.inlineForm} onSubmit={submit}>
        {typeof setting.defaultValue === 'boolean' ? (
          <Checkbox
            label={setting.description}
            checked={Boolean(value)}
            onChange={(e) => setValue(e.target.checked)}
          />
        ) : isLong ? (
          <Textarea
            label={setting.description}
            value={String(value)}
            onChange={(e) => setValue(e.target.value)}
          />
        ) : (
          <Input
            label={setting.description}
            inputMode="decimal"
            value={String(value)}
            error={error}
            onChange={(e) => setValue(e.target.value)}
          />
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
