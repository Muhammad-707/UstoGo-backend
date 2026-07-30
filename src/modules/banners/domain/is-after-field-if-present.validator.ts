import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';

const siblingOf = (args: ValidationArguments): string => {
  const [property] = args.constraints as [string];
  return property;
};

/**
 * Cross-field order check for a pair of *independently* optional dates.
 *
 * DATABASE.md §12 and FR-11.2 give a banner's `startsAt`/`endsAt` each as optional,
 * with `endsAt` after `startsAt` only "if both [are] given". The shared
 * `IsAfterFieldConstraint` (`@common/validators/is-after-field.validator.ts`) treats a
 * missing sibling as a failure — correct for a pair that is always submitted together
 * (`WorkingDayDto.startTime`/`endTime`, both required), but wrong here: a banner with
 * only an `endsAt` has nothing yet to be "after", and rejecting it would make setting
 * either bound alone impossible. This variant returns valid when the sibling is
 * absent and otherwise applies the same lexicographic comparison (ISO-8601 strings
 * sort correctly in their canonical form).
 */
@ValidatorConstraint({ name: 'isAfterFieldIfPresent', async: false })
export class IsAfterFieldIfPresentConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const other = (args.object as Record<string, unknown>)[siblingOf(args)];

    if (other === undefined || other === null) {
      return true;
    }
    if (typeof value !== 'string' || typeof other !== 'string') {
      return false;
    }

    return value > other;
  }

  defaultMessage(args: ValidationArguments): string {
    return `$property must be after ${siblingOf(args)} when both are given`;
  }
}

export const IsAfterFieldIfPresent = (
  property: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator =>
  function decorate(target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isAfterFieldIfPresent',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [property],
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: IsAfterFieldIfPresentConstraint,
    });
  };
