import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';

export type FutureDateOptions = { minLeadMinutes?: number };

const optionsOf = (args: ValidationArguments): FutureDateOptions => {
  // The constraints array is populated by the decorator below, so index 0 is always
  // present; the assertion narrows what class-validator types as unknown[].
  const [options] = args.constraints as [FutureDateOptions | undefined];
  return options ?? {};
};

@ValidatorConstraint({ name: 'isFutureDate', async: false })
export class IsFutureDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    const target = new Date(value);
    if (Number.isNaN(target.getTime())) {
      return false;
    }

    const { minLeadMinutes = 0 } = optionsOf(args);
    return target.getTime() >= Date.now() + minLeadMinutes * 60_000;
  }

  defaultMessage(args: ValidationArguments): string {
    const { minLeadMinutes = 0 } = optionsOf(args);
    return minLeadMinutes > 0
      ? `$property must be at least ${String(minLeadMinutes)} minutes in the future`
      : '$property must be in the future';
  }
}

/** Booking lead time and similar rules (VALIDATION.md §5). */
export const IsFutureDate = (
  options: FutureDateOptions = {},
  validationOptions?: ValidationOptions,
): PropertyDecorator =>
  function decorate(target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isFutureDate',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [options],
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: IsFutureDateConstraint,
    });
  };
