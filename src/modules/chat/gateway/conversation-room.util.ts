/**
 * Rooms are keyed by conversation id, per ARCHITECTURE.md §7 ("rooms keyed by
 * conversation id"), not by user id. A conversation has exactly two participants
 * and every event this gateway emits — `message:new`, `message:read` — is scoped to
 * one conversation, so the room a message belongs to is also exactly the set of
 * sockets that may see it; a per-user room would need the same membership computed
 * twice, once to build the room and once to decide who is allowed to receive the
 * event placed in it.
 */
export const roomFor = (conversationId: string): string => `conversation:${conversationId}`;
