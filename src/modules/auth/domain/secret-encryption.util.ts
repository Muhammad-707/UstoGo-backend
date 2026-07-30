import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM at rest for the one plaintext secret this codebase stores rather than
 * hashes — a TOTP seed has to be recovered to verify a code, unlike a password or a
 * refresh token, which only ever need a one-way comparison.
 *
 * Output is `iv.authTag.ciphertext`, each base64url, so it round-trips through a
 * `varchar` column without escaping concerns.
 */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export const encryptSecret = (plaintext: string, keyHex: string): string => {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [iv, authTag, ciphertext].map((part) => part.toString('base64url')).join('.');
};

export const decryptSecret = (encrypted: string, keyHex: string): string => {
  const [ivPart, tagPart, ciphertextPart] = encrypted.split('.');
  if (ivPart === undefined || tagPart === undefined || ciphertextPart === undefined) {
    throw new Error('Malformed encrypted secret.');
  }

  const key = Buffer.from(keyHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};
