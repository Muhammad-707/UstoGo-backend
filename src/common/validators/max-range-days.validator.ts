import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';

export type MaxRangeDaysOptions = { from: string; to: string };

const MS_PER_DAY = 86_400_000;

const paramsOf = (args: ValidationArguments): [number, MaxRangeDaysOptions] =>
  args.constraints as [number, MaxRangeDaysOptions];

@ValidatorConstraint({ name: 'maxRangeDays', async: false })
export class MaxRangeDaysConstraint implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const [maxDays, { from, to }] = paramsOf(args);
    const object = args.object as Record<string, unknown>;
    const start = object[from];
    const end = object[to];

    if (typeof start !== 'string' || typeof end !== 'string') {
      return false;
    }

    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
      return false;
    }

    return (endMs - startMs) / MS_PER_DAY <= maxDays;
  }

  defaultMessage(args: ValidationArguments): string {
    const [maxDays, { from, to }] = paramsOf(args);
    return `the range from ${from} to ${to} must not exceed ${String(maxDays)} days`;
  }
}

/**
 * Caps a date range so an availability or reporting query cannot ask for a decade
 * (VALIDATION.md §3 — availability is capped at 31 days).
 *
 * Applied to any property on the class; it reads both endpoints from the object, so the
 * property it decorates is only an anchor for the message.
 */
export const MaxRangeDays = (
  maxDays: number,
  options: MaxRangeDaysOptions,
  validationOptions?: ValidationOptions,
): PropertyDecorator =>
  function decorate(target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'maxRangeDays',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [maxDays, options],
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: MaxRangeDaysConstraint,
    });
  };
