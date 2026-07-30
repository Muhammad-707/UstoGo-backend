export const CHAT = Object.freeze({
  /** DATABASE.md §9.2 / FUNCTIONAL_REQUIREMENTS.md §10. */
  MESSAGE_MAX_LENGTH: 4000,
  /** API.md §11 preview shown in the conversation list. */
  PREVIEW_MAX_LENGTH: 200,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const);
