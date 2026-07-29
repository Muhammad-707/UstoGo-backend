import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';

const divisorOf = (args: ValidationArguments): number => {
  const [divisor] = args.constraints as [number];
  return divisor;
};

@ValidatorConstraint({ name: 'isMultipleOf', async: false })
export class IsMultipleOfConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const divisor = divisorOf(args);
    return (
      typeof value === 'number' && Number.isFinite(value) && divisor !== 0 && value % divisor === 0
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `$property must be a multiple of ${String(divisorOf(args))}`;
  }
}

/** Service durations land on 15-minute boundaries (DATABASE.md §5.3). */
export const IsMultipleOf = (
  divisor: number,
  validationOptions?: ValidationOptions,
): PropertyDecorator =>
  function decorate(target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isMultipleOf',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [divisor],
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: IsMultipleOfConstraint,
    });
  };
