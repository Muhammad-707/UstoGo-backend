/** BR-20: categories form a tree of maximum depth 3. */
export const MAX_CATEGORY_DEPTH = 3;

/** Reference data; the whole active tree is meant to be fetched once and cached. */
export const MAX_CATEGORIES = 2000;

/** FR-5.1: the public tree endpoint is cached, in-process, for this long. */
export const TREE_CACHE_TTL_MS = 5 * 60 * 1000;

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
