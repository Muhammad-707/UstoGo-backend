import { randomBytes } from 'node:crypto';

/**
 * A short, URL-safe, human-typeable code — the payload a completion certificate's QR
 * encodes. Not a security token (the verification endpoint is intentionally public,
 * matching "anyone who has the code/QR can verify a completed job happened"), so
 * `node:crypto` randomness is for uniqueness, not secrecy.
 */
export const generateVerificationCode = (): string => {
  const hex = randomBytes(6).toString('hex').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
};
