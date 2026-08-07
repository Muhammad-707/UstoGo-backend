import { isPaymentNoteRequired } from '../payment-confirmation.util';

describe('isPaymentNoteRequired', () => {
  it('is true when the client paid less than the agreed price', () => {
    expect(isPaymentNoteRequired(40, 50)).toBe(true);
  });

  it('is false when the client paid exactly the agreed price', () => {
    expect(isPaymentNoteRequired(50, 50)).toBe(false);
  });

  it('is false when the client paid more than the agreed price (a tip)', () => {
    expect(isPaymentNoteRequired(60, 50)).toBe(false);
  });
});
