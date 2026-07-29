import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, Matches, MaxLength } from 'class-validator';

import { IsSafeText } from '@common/validators/is-safe-text.validator';

import { PASSWORD_PATTERN, PASSWORD_RULE } from './credentials.dto';
import { AUTH } from '../../constants/auth.constants';

/** E.164, as stored (DATABASE.md §3.1). */
export const E164 = /^\+[1-9]\d{7,14}$/;

export const trimValue = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export const normaliseEmailValue = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/**
 * The fields both registrations share.
 *
 * A shared base rather than master extending client: the two disagree about whether
 * `phone` and `cityId` are optional, and re-declaring an inherited property to change
 * its optionality replaces the parent's decorators in ways that are easy to get subtly
 * wrong. Composing from a common base keeps each DTO's rules readable in one place.
 *
 * There is deliberately no `role` property on either. With `whitelist` and
 * `forbidNonWhitelisted` on the global pipe, `{"role":"ADMIN"}` is rejected before any
 * service runs — which is what makes "admin registration is impossible" structural
 * rather than a check someone could forget (VALIDATION.md §1, FR-1.3).
 */
export abstract class RegisterBaseDto {
  @ApiProperty({ example: 'aziz@example.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  @Transform(normaliseEmailValue)
  email!: string;

  @ApiProperty({
    minLength: AUTH.MIN_PASSWORD_LENGTH,
    maxLength: AUTH.MAX_PASSWORD_BYTES,
    example: 'correcthorse7',
    description: 'At least 8 characters, with at least one letter and one digit.',
  })
  @IsString()
  @Length(AUTH.MIN_PASSWORD_LENGTH, AUTH.MAX_PASSWORD_BYTES)
  @Matches(PASSWORD_PATTERN, { message: `password ${PASSWORD_RULE}` })
  password!: string;

  @ApiProperty({ example: 'Aziz', minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  @IsSafeText()
  @Transform(trimValue)
  firstName!: string;

  @ApiProperty({ example: 'Karimov', minLength: 2, maxLength: 100 })
  @IsString()
  @Length(2, 100)
  @IsSafeText()
  @Transform(trimValue)
  lastName!: string;
}
