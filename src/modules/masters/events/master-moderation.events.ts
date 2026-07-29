/**
 * Domain events (ARCHITECTURE.md §5). Emitted after commit, never inside — a
 * notification for a rolled-back decision is worse than none. Nothing listens yet;
 * `NotificationsModule` (Phase 4) is what actually needs them, matching
 * `UserRegisteredEvent`/`MasterRegisteredEvent` in the auth module.
 */
export const MASTER_MODERATION_EVENT = Object.freeze({
  APPROVED: 'master.approved',
  REJECTED: 'master.rejected',
  ACTIVATED: 'master.activated',
  DEACTIVATED: 'master.deactivated',
} as const);

export class MasterApprovedEvent {
  constructor(readonly masterProfileId: string) {}
}

export class MasterRejectedEvent {
  constructor(
    readonly masterProfileId: string,
    readonly reason: string,
  ) {}
}

export class MasterActivatedEvent {
  constructor(readonly masterProfileId: string) {}
}

export class MasterDeactivatedEvent {
  constructor(
    readonly masterProfileId: string,
    readonly reason: string,
  ) {}
}
