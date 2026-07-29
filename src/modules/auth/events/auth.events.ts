/**
 * Domain events (ARCHITECTURE.md §5, NAMING_CONVENTIONS.md §7).
 *
 * Past tense, because an event is a fact that has already happened — a listener can
 * react to it but cannot veto it. Emitted after the transaction commits, never inside:
 * a welcome email for a registration that rolled back is worse than none.
 *
 * Nothing listens yet. `NotificationsModule` (Phase 4) subscribes to these; emitting
 * them now is what lets it be added without touching this module.
 */
export const AUTH_EVENT = Object.freeze({
  USER_REGISTERED: 'user.registered',
  MASTER_REGISTERED: 'master.registered',
  PASSWORD_CHANGED: 'user.password-changed',
} as const);

/** Payloads carry identifiers, never entities and never credentials. */
export class UserRegisteredEvent {
  constructor(
    readonly userId: string,
    readonly clientProfileId: string,
  ) {}
}

export class MasterRegisteredEvent {
  constructor(
    readonly userId: string,
    readonly masterProfileId: string,
  ) {}
}

export class PasswordChangedEvent {
  constructor(readonly userId: string) {}
}
