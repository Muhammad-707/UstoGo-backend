import type { ActorType, BookingStatus } from '@prisma/client';

import { IllegalBookingTransitionException } from '../exceptions/bookings.exceptions';

/**
 * Pure logic only (CLAUDE.md §6/§9, FOLDER_STRUCTURE.md `domain/`). The type-only import
 * above is erased at compile time — it costs nothing at runtime and keeps one definition
 * of the status/actor vocabulary rather than a second, hand-maintained copy that could
 * drift from `schema.prisma`.
 *
 * The authoritative table is `FUNCTIONAL_REQUIREMENTS.md` §7.1 — reproduced here as data
 * rather than as a chain of `if`s, which is what makes the 9×9 status cross product in
 * `TESTING.md` §4 exhaustively testable against a single source of truth.
 */
type Transition = {
  readonly from: BookingStatus;
  readonly to: BookingStatus;
  readonly actor: ActorType;
};

const TRANSITIONS: readonly Transition[] = [
  { from: 'PENDING', to: 'ACCEPTED', actor: 'MASTER' },
  { from: 'PENDING', to: 'REJECTED', actor: 'MASTER' },
  { from: 'PENDING', to: 'CANCELLED_BY_CLIENT', actor: 'CLIENT' },
  { from: 'PENDING', to: 'EXPIRED', actor: 'SYSTEM' },
  { from: 'ACCEPTED', to: 'IN_PROGRESS', actor: 'MASTER' },
  { from: 'ACCEPTED', to: 'CANCELLED_BY_CLIENT', actor: 'CLIENT' },
  { from: 'ACCEPTED', to: 'CANCELLED_BY_MASTER', actor: 'MASTER' },
  { from: 'ACCEPTED', to: 'CANCELLED_BY_ADMIN', actor: 'ADMIN' },
  { from: 'IN_PROGRESS', to: 'COMPLETED', actor: 'MASTER' },
  { from: 'IN_PROGRESS', to: 'CANCELLED_BY_ADMIN', actor: 'ADMIN' },
] as const;

/** Stateless — takes a `{ status }`-shaped booking so callers can pass the loaded entity directly. */
export class BookingStateMachine {
  /** Throws `409 ILLEGAL_BOOKING_TRANSITION` for anything not in the table above. */
  assertCanTransition(
    booking: { status: BookingStatus },
    to: BookingStatus,
    actor: ActorType,
  ): void {
    const allowed = TRANSITIONS.some(
      (transition) =>
        transition.from === booking.status && transition.to === to && transition.actor === actor,
    );

    if (!allowed) {
      throw new IllegalBookingTransitionException();
    }
  }

  /** No transition in the table originates from a terminal status. */
  isTerminal(status: BookingStatus): boolean {
    return !TRANSITIONS.some((transition) => transition.from === status);
  }
}
