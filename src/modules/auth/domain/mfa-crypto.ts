import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Encryption for TOTP secrets and keyed hashing for recovery codes (#16). Pure: no I/O.
 * Both derive their own subkey from MFA_ENCRYPTION_KEY with HKDF, so one key never serves two
 * purposes.
 */
export const MFA_KEY_BYTES = 32;
const VERSION = 'v1';

function subkey(masterKey: Buffer, purpose: string): Buffer {
  return Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), `lms-mfa-${purpose}`, 32));
}

/** Parses MFA_ENCRYPTION_KEY (base64, 32 bytes). */
export function parseMfaKey(base64: string): Buffer {
  const key = Buffer.from(base64, 'base64');
  if (key.length !== MFA_KEY_BYTES) {
    throw new Error(`MFA_ENCRYPTION_KEY must be ${MFA_KEY_BYTES} bytes, base64-encoded`);
  }
  return key;
}

/** AES-256-GCM: `v1:<base64 iv|tag|ciphertext>`. Tampering fails decryption. */
export function encryptSecret(plain: string, masterKey: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', subkey(masterKey, 'secret'), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return `${VERSION}:${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64')}`;
}

export function decryptSecret(stored: string, masterKey: Buffer): string {
  const [version, payload] = stored.split(':');
  if (version !== VERSION || !payload) throw new Error('Unknown MFA secret format');
  const data = Buffer.from(payload, 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    subkey(masterKey, 'secret'),
    data.subarray(0, 12),
  );
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
export const RECOVERY_CODE_COUNT = 10;

/** Ten codes like `K7QM-2XRP-9D`: ten random characters, about 50 bits each. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const chars = Array.from(
      randomBytes(10),
      (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length],
    );
    const raw = chars.join('');
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  });
}

/** Case, spaces and dashes don't matter when the user types a code back. */
export function normaliseRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}

export function hashRecoveryCode(code: string, masterKey: Buffer): string {
  return createHmac('sha256', subkey(masterKey, 'recovery'))
    .update(normaliseRecoveryCode(code))
    .digest('hex');
}
