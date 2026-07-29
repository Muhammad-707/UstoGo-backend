import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

import { AUTH } from '../../constants/auth.constants';

/** §7 — at least one letter and one digit. Special characters are not required. */
export const PASSWORD_PATTERN = /(?=.*[A-Za-z])(?=.*\d)/;
export const PASSWORD_RULE = 'must contain at least one letter and one digit';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

const normaliseEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

/**
 * Reused by registration, reset and change so the policy is declared once
 * (AUTHENTICATION.md §7).
 *
 * The maximum is bcrypt's 72-byte truncation boundary, enforced rather than silently
 * applied: without it, two different passwords sharing the first 72 bytes would both
 * open the account.
 */
export class PasswordField {
  @ApiProperty({
    minLength: AUTH.MIN_PASSWORD_LENGTH,
    maxLength: AUTH.MAX_PASSWORD_BYTES,
    example: 'correcthorse7',
    description: 'At least 8 characters, with at least one letter and one digit.',
  })
  @IsString()
  @MinLength(AUTH.MIN_PASSWORD_LENGTH)
  @MaxLength(AUTH.MAX_PASSWORD_BYTES)
  @Matches(PASSWORD_PATTERN, { message: `password ${PASSWORD_RULE}` })
  password!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'aziz@example.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  @Transform(normaliseEmail)
  email!: string;

  @ApiProperty({ example: 'correcthorse7' })
  @IsString()
  @MaxLength(AUTH.MAX_PASSWORD_BYTES)
  password!: string;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Opaque client-generated device identifier, stored for session forensics.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trim)
  deviceId?: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'aziz@example.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  @Transform(normaliseEmail)
  email!: string;
}

export class ResetPasswordDto extends PasswordField {
  @ApiProperty({ description: 'The single-use token from the emailed reset link.' })
  @IsString()
  @MaxLength(200)
  token!: string;
}

export class ChangePasswordDto extends PasswordField {
  @ApiProperty({ example: 'oldpassword1' })
  @IsString()
  @MaxLength(AUTH.MAX_PASSWORD_BYTES)
  currentPassword!: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token issued by login, registration or a prior refresh.',
  })
  @IsString()
  @MaxLength(200)
  refreshToken!: string;
}
