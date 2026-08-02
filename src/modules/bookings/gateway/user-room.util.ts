/**
 * Rooms keyed by user id, not booking id — unlike chat's per-conversation rooms
 * (`ChatGateway`'s `roomFor`), a booking-lifecycle event has exactly one recipient
 * (`clientUserId`/`masterUserId`/`notifyUserId` on the domain event), so the room
 * a socket needs to be in is fixed at connect time and never changes per event.
 */
export const userRoom = (userId: string): string => `user:${userId}`;
