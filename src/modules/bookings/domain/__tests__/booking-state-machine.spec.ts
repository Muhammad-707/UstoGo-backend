import type { ActorType, BookingStatus } from '@prisma/client';

import { IllegalBookingTransitionException } from '../../exceptions/bookings.exceptions';
import { BookingStateMachine } from '../booking-state-machine';

const ALL_STATUSES: readonly BookingStatus[] = [
  'PENDING',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED_BY_CLIENT',
  'CANCELLED_BY_MASTER',
  'CANCELLED_BY_ADMIN',
];

const ALL_ACTORS: readonly ActorType[] = ['CLIENT', 'MASTER', 'ADMIN', 'SYSTEM'];

const booking = (status: BookingStatus): { status: BookingStatus } => ({ status });

/** Every legal transition from `FUNCTIONAL_REQUIREMENTS.md` §7.1 — the single source of truth this test verifies against. */
const LEGAL: ReadonlyArray<[BookingStatus, BookingStatus, ActorType]> = [
  ['PENDING', 'ACCEPTED', 'MASTER'],
  ['PENDING', 'REJECTED', 'MASTER'],
  ['PENDING', 'CANCELLED_BY_CLIENT', 'CLIENT'],
  ['PENDING', 'EXPIRED', 'SYSTEM'],
  ['ACCEPTED', 'IN_PROGRESS', 'MASTER'],
  ['ACCEPTED', 'CANCELLED_BY_CLIENT', 'CLIENT'],
  ['ACCEPTED', 'CANCELLED_BY_MASTER', 'MASTER'],
  ['ACCEPTED', 'CANCELLED_BY_ADMIN', 'ADMIN'],
  ['IN_PROGRESS', 'COMPLETED', 'MASTER'],
  ['IN_PROGRESS', 'CANCELLED_BY_ADMIN', 'ADMIN'],
];

const isLegal = (from: BookingStatus, to: BookingStatus, actor: ActorType): boolean =>
  LEGAL.some(([f, t, a]) => f === from && t === to && a === actor);

describe('BookingStateMachine', () => {
  const machine = new BookingStateMachine();

  describe('assertCanTransition', () => {
    it('allows PENDING → ACCEPTED for the master', () => {
      expect(() =>
        machine.assertCanTransition(booking('PENDING'), 'ACCEPTED', 'MASTER'),
      ).not.toThrow();
    });

    it('rejects PENDING → ACCEPTED for the client', () => {
      expect(() => machine.assertCanTransition(booking('PENDING'), 'ACCEPTED', 'CLIENT')).toThrow(
        IllegalBookingTransitionException,
      );
    });

    it.each([
      'COMPLETED',
      'REJECTED',
      'EXPIRED',
      'CANCELLED_BY_CLIENT',
      'CANCELLED_BY_MASTER',
      'CANCELLED_BY_ADMIN',
    ] as const)('treats %s as terminal', (terminal) => {
      for (const target of ALL_STATUSES) {
        for (const actor of ALL_ACTORS) {
          expect(() => machine.assertCanTransition(booking(terminal), target, actor)).toThrow(
            IllegalBookingTransitionException,
          );
        }
      }
    });

    it('exhaustively matches the 9×9×4 status/status/actor cross product against FUNCTIONAL_REQUIREMENTS.md §7.1', () => {
      for (const from of ALL_STATUSES) {
        for (const to of ALL_STATUSES) {
          for (const actor of ALL_ACTORS) {
            if (isLegal(from, to, actor)) {
              expect(() => machine.assertCanTransition(booking(from), to, actor)).not.toThrow();
            } else {
              expect(() => machine.assertCanTransition(booking(from), to, actor)).toThrow(
                IllegalBookingTransitionException,
              );
            }
          }
        }
      }
    });
  });

  describe('isTerminal', () => {
    it.each([
      'COMPLETED',
      'REJECTED',
      'EXPIRED',
      'CANCELLED_BY_CLIENT',
      'CANCELLED_BY_MASTER',
      'CANCELLED_BY_ADMIN',
    ] as const)('%s has no outgoing transition', (status) => {
      expect(machine.isTerminal(status)).toBe(true);
    });

    it.each(['PENDING', 'ACCEPTED', 'IN_PROGRESS'] as const)('%s is not terminal', (status) => {
      expect(machine.isTerminal(status)).toBe(false);
    });
  });
});
