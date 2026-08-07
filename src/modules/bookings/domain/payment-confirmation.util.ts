/**
 * Client-recorded payment confirmation (ADR-8: payments stay off-platform — this
 * records what the client says already changed hands, it never moves money). The
 * comparison needs the booking's frozen `price` snapshot, which the request DTO does
 * not carry, so it cannot be a DTO-level validator (VALIDATION.md §6) — it is decided
 * here, as pure logic, and enforced by `BookingPaymentService`.
 */
export const isPaymentNoteRequired = (paidAmount: number, price: number): boolean =>
  paidAmount < price;
