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

@ValidatorConstraint({ name: 'isAfterField', async: false })
export class IsAfterFieldConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const other = (args.object as Record<string, unknown>)[siblingOf(args)];

    if (typeof value !== 'string' || typeof other !== 'string') {
      return false;
    }

    // Compares `HH:mm` strings and ISO-8601 timestamps alike: both are ordered
    // lexicographically in their canonical form, so no parsing is needed and no
    // timezone is silently applied.
    return value > other;
  }

  defaultMessage(args: ValidationArguments): string {
    return `$property must be after ${siblingOf(args)}`;
  }
}

/** Cross-field time comparison — working days, schedule exceptions, date ranges. */
export const IsAfterField = (
  property: string,
  validationOptions?: ValidationOptions,
): PropertyDecorator =>
  function decorate(target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isAfterField',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [property],
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: IsAfterFieldConstraint,
    });
  };
