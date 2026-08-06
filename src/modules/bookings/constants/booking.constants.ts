/** FR-7.1 #3: bookings must be made at least this far in advance. */
export const MIN_LEAD_MINUTES = 120;

/** FR-7.1 #6: a client may have at most this many open PENDING bookings at once. */
export const MAX_OPEN_PENDING_BOOKINGS = 5;

/** FR-7.3: cancelling an ACCEPTED booking inside this window is a late cancellation. */
export const LATE_CANCELLATION_WINDOW_MINUTES = 180;

/** FR-7.4: a booking cannot be started earlier than this many minutes before its slot. */
export const EARLY_START_WINDOW_MINUTES = 30;

/** FR-7.3: reject/cancel-by-master/cancel-by-admin reason length. */
export const REASON_MIN_LENGTH = 10;
export const REASON_MAX_LENGTH = 500;

/** B-15/B-24 — a master needs at least this reliability score, opted in, to auto-accept. */
export const INSTANT_BOOK_MIN_SCORE = 90;

/**
 * B-51: a client may reschedule a PENDING/ACCEPTED booking once, and only while its
 * current slot is at least this many hours away — mirrors `BACKLOG.md`'s own framing
 * of the feature ("rather than cancel + rebook").
 */
export const RESCHEDULE_WINDOW_HOURS = 24;
export const MAX_RESCHEDULE_COUNT = 1;

/** FR-7.5: the expiry job's cadence and batch size. */
export const EXPIRY_JOB_CRON = '*/10 * * * *';
export const EXPIRY_BATCH_SIZE = 100;

/**
 * The reminder job's lead time and cadence. Not specified by any FR/SRS document —
 * `FOLDER_STRUCTURE.md` and `ROADMAP.md` name the job as a Phase 4 deliverable without
 * timing, unlike the expiry job's explicit 10-minute/batch-100 spec. Default chosen and
 * applied per CLAUDE.md §3 ("propose a default and proceed"): reminds both parties once,
 * one hour before an ACCEPTED/IN_PROGRESS booking's `scheduledAt`.
 */
export const REMINDER_LEAD_MINUTES = 60;
export const REMINDER_JOB_CRON = '*/5 * * * *';
/** Matches the cron cadence above — the query window a due booking can only fall into once. */
export const REMINDER_WINDOW_MINUTES = 5;
export const REMINDER_BATCH_SIZE = 100;
