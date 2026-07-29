import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'isTimeZone', async: false })
export class IsTimeZoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }

    // Validated against the runtime's own IANA database rather than a hard-coded list:
    // a list would need updating every time the tz database changes, and a master whose
    // region gains a zone should not have to wait for a release.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(): string {
    return '$property must be a valid IANA time zone, for example Asia/Tashkent';
  }
}

/** Master profile timezone (DATABASE.md §3.3, VALIDATION.md §3). */
export const IsTimeZone = (validationOptions?: ValidationOptions): PropertyDecorator =>
  function decorate(target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isTimeZone',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [],
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: IsTimeZoneConstraint,
    });
  };
