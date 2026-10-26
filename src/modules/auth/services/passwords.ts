import bcrypt from 'bcrypt';

/** Cost for new hashes. Existing hashes keep their own cost; bcrypt.compare reads it from the hash. */
export const BCRYPT_COST = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
