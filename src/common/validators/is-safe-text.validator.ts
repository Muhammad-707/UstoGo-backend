import {
  registerDecorator,
  ValidatorConstraint,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Code point ranges rejected in user-visible free text (VALIDATION.md §4).
 *
 * Expressed as numbers rather than as a character class, because the characters
 * themselves are invisible: written literally, this table and an empty one look
 * identical in a diff, and a reviewer cannot tell whether it is still correct.
 *
 * Bidirectional overrides can make one string render as another, and zero-width
 * joiners let two accounts occupy what looks like the same display name. Rejected
 * rather than stripped — silently mutating a submitted name is its own surprise.
 */
const UNSAFE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x0000, 0x0008], // C0 controls, excluding tab, line feed and carriage return
  [0x000b, 0x000c],
  [0x000e, 0x001f],
  [0x007f, 0x009f], // delete and the C1 controls
  [0x200b, 0x200f], // zero-width space through right-to-left mark
  [0x202a, 0x202e], // bidirectional embedding and override
  [0x2060, 0x2064], // word joiner through invisible plus
  [0x2066, 0x2069], // bidirectional isolates
  [0xfeff, 0xfeff], // zero-width no-break space (byte order mark)
];

export const isUnsafeCodePoint = (codePoint: number): boolean =>
  UNSAFE_RANGES.some(([start, end]) => codePoint >= start && codePoint <= end);

@ValidatorConstraint({ name: 'isSafeText', async: false })
export class IsSafeTextConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') {
      return false;
    }

    // Iterating the string yields whole code points, so characters outside the basic
    // multilingual plane are not split into surrogates and misjudged.
    for (const character of value) {
      const codePoint = character.codePointAt(0);
      if (codePoint !== undefined && isUnsafeCodePoint(codePoint)) {
        return false;
      }
    }

    return true;
  }

  defaultMessage(): string {
    return '$property must not contain zero-width, bidirectional or control characters';
  }
}

/** Applied to display names and any free text rendered back to other users. */
export const IsSafeText = (validationOptions?: ValidationOptions): PropertyDecorator =>
  function decorate(target: object, propertyName: string | symbol): void {
    registerDecorator({
      name: 'isSafeText',
      target: target.constructor,
      propertyName: propertyName as string,
      constraints: [],
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: IsSafeTextConstraint,
    });
  };
