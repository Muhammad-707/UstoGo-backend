import { FilePurpose } from '@prisma/client';

const MB = 1024 * 1024;

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type PurposeRule = {
  readonly mimeTypes: readonly string[];
  readonly maxBytes: number;
  /** Path prefix in the bucket; keeps a listing readable and a lifecycle rule targetable. */
  readonly prefix: string;
};

/**
 * Per-purpose upload constraints (API.md §5).
 *
 * Avatars, certificates and message attachments carry the limits the specification
 * states. Banners and category icons are not given limits there, so they take the
 * image rules — both are operator-supplied artwork, and leaving them unconstrained
 * would make `purpose` a way to bypass every other limit on this table.
 */
export const PURPOSE_RULES: Readonly<Record<FilePurpose, PurposeRule>> = Object.freeze({
  [FilePurpose.AVATAR]: { mimeTypes: IMAGE_TYPES, maxBytes: 5 * MB, prefix: 'avatars' },
  [FilePurpose.CERTIFICATE]: {
    mimeTypes: [...IMAGE_TYPES, 'application/pdf'],
    maxBytes: 10 * MB,
    prefix: 'certificates',
  },
  [FilePurpose.MESSAGE_ATTACHMENT]: {
    mimeTypes: [...IMAGE_TYPES, 'application/pdf'],
    maxBytes: 10 * MB,
    prefix: 'attachments',
  },
  [FilePurpose.BANNER]: { mimeTypes: IMAGE_TYPES, maxBytes: 5 * MB, prefix: 'banners' },
  [FilePurpose.CATEGORY_ICON]: { mimeTypes: IMAGE_TYPES, maxBytes: 5 * MB, prefix: 'categories' },
});

/** API.md §5 — 20 presigns per hour per user. */
export const PRESIGN_THROTTLE = { limit: 20, ttl: 3_600_000 } as const;

/** An unconfirmed row and its object are removed after this long (ARCHITECTURE.md §9). */
export const UNCONFIRMED_TTL_HOURS = 24;

/** Bounded so one cleanup pass cannot hold a connection for an unbounded time. */
export const CLEANUP_BATCH_SIZE = 200;
