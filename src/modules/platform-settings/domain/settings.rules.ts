import { z } from 'zod';
import { DomainError } from '../../../common/errors/domain.error';

/**
 * Every admin-editable platform setting (#8): its type, bounds, default and meaning.
 * Values are stored as strings in platform_settings and parsed through these schemas on read,
 * so a bad stored value can never reach business logic.
 *
 * To add a setting: add an entry here. Nothing else needs to change for it to be editable.
 */
export const SETTING_DEFINITIONS = {
  VIDEO_COMPLETION_THRESHOLD_PCT: {
    schema: z.coerce.number().int().min(50).max(100),
    defaultValue: 90,
    description:
      'Percentage of a video (by furthest position reached) that marks the lesson complete.',
  },
  ORDER_EXPIRY_WINDOW_HOURS: {
    schema: z.coerce.number().int().min(1).max(720),
    defaultValue: 48,
    description: 'Hours a pending order waits for payment proof before it lapses.',
  },
  PAYOUT_DISPUTE_WINDOW_DAYS: {
    schema: z.coerce.number().int().min(1).max(60),
    defaultValue: 7,
    description: 'Days a teacher has to raise a concern about a payout before it auto-accepts.',
  },
  APPLICATION_RETENTION_DAYS: {
    schema: z.coerce.number().int().min(30).max(3650),
    defaultValue: 180,
    description: 'Days a rejected teacher application (and its CV) is kept before it is purged.',
  },
} as const;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValue<K extends SettingKey> = z.output<
  (typeof SETTING_DEFINITIONS)[K]['schema']
>;

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];

export class UnknownSettingError extends DomainError {
  readonly code = 'NOT_FOUND';

  constructor(key: string) {
    super(`Unknown setting: ${key}`, { key, known: SETTING_KEYS });
  }
}

export class InvalidSettingValueError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
}

export function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFINITIONS, key);
}

/** Parses a stored string, falling back to the default if it is missing or no longer valid. */
export function readSetting<K extends SettingKey>(
  key: K,
  stored: string | undefined,
): SettingValue<K> {
  const definition = SETTING_DEFINITIONS[key];
  if (stored === undefined) return definition.defaultValue as SettingValue<K>;
  const parsed = definition.schema.safeParse(stored);
  return (parsed.success ? parsed.data : definition.defaultValue) as SettingValue<K>;
}

/** Validates an admin's new value and returns the string to store. */
export function normaliseSettingValue(
  key: string,
  value: unknown,
): { key: SettingKey; stored: string } {
  if (!isSettingKey(key)) throw new UnknownSettingError(key);
  const parsed = SETTING_DEFINITIONS[key].schema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidSettingValueError(`Invalid value for ${key}`, {
      key,
      issues: parsed.error.issues.map((issue) => issue.message),
    });
  }
  return { key, stored: String(parsed.data) };
}
