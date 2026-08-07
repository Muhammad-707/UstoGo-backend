import { randomUUID } from 'node:crypto';

/**
 * Valid entities by default, so a test overrides only the field it is about and the
 * intent is visible in the diff (`TESTING.md` §8).
 *
 * Every identifier is unique per call. Registration enforces uniqueness on email and
 * phone among live rows, so fixtures sharing a constant would couple tests to their
 * execution order — the failure mode that is hardest to read when it appears.
 */
export const VALID_PASSWORD = 'correcthorse7';

const unique = (): string => randomUUID().replaceAll('-', '').slice(0, 10);

/** E.164, and inside the range the `+998` prefix leaves for a subscriber number. */
export const uniquePhone = (): string =>
  `+9989${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`;

export const uniqueEmail = (label = 'user'): string => `${label}.${unique()}@example.test`;

export type ClientRegistration = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  cityId?: string;
  referralCode?: string;
};

export const clientRegistration = (
  overrides: Partial<ClientRegistration> = {},
): ClientRegistration => ({
  email: uniqueEmail('client'),
  password: VALID_PASSWORD,
  firstName: 'Aziz',
  lastName: 'Karimov',
  phone: uniquePhone(),
  ...overrides,
});

export type MasterRegistration = ClientRegistration & {
  phone: string;
  cityId: string;
  displayName: string;
  timezone: string;
  bio?: string;
  yearsOfExperience?: number;
};

export const masterRegistration = (
  cityId: string,
  overrides: Partial<MasterRegistration> = {},
): MasterRegistration => ({
  email: uniqueEmail('master'),
  password: VALID_PASSWORD,
  firstName: 'Sardor',
  lastName: 'Usmonov',
  phone: uniquePhone(),
  cityId,
  displayName: 'Sardor — Plumbing & Heating',
  timezone: 'Asia/Tashkent',
  yearsOfExperience: 8,
  ...overrides,
});
