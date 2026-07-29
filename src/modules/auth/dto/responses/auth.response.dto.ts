import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus, type User } from '@prisma/client';

/**
 * Response DTOs are explicit classes and entities are never serialised directly
 * (VALIDATION.md §2.6). That is what keeps `passwordHash` out of a response: it is not
 * that the mapper removes it, but that nothing ever copies it in.
 */
export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'aziz@example.com' })
  email!: string;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole', example: UserRole.CLIENT })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus', example: UserStatus.ACTIVE })
  status!: UserStatus;

  @ApiPropertyOptional({ example: '+998901234567', nullable: true })
  phone!: string | null;

  static fromEntity(user: User): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      phone: user.phone,
    };
  }
}

export class AuthResponseDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ description: 'Bearer JWT. Send as `Authorization: Bearer <token>`.' })
  accessToken!: string;

  @ApiProperty({
    description:
      'Opaque rotating token. Returned once and never again — store it in the most ' +
      'protected storage available and send it only to /auth/refresh.',
  })
  refreshToken!: string;

  @ApiProperty({ example: 900, description: 'Access-token lifetime in seconds' })
  expiresIn!: number;

  static from(
    user: User,
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    },
  ): AuthResponseDto {
    return {
      user: AuthUserDto.fromEntity(user),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    };
  }
}
