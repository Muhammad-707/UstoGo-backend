import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalStatus, UserRole, UserStatus } from '@prisma/client';

import type { UserWithProfile } from '../../repositories/user.select';

export class ClientProfileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Aziz' }) firstName!: string;
  @ApiProperty({ example: 'Karimov' }) lastName!: string;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) cityId!: string | null;
  @ApiPropertyOptional({ nullable: true }) defaultAddress!: string | null;
}

export class MasterProfileDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() firstName!: string;
  @ApiProperty() lastName!: string;
  @ApiProperty({ example: 'Aziz — Plumbing & Heating' }) displayName!: string;
  @ApiPropertyOptional({ nullable: true }) bio!: string | null;
  @ApiProperty({ example: 8 }) yearsOfExperience!: number;
  @ApiProperty({ format: 'uuid' }) cityId!: string;
  @ApiProperty({ example: 15 }) serviceRadiusKm!: number;
  @ApiProperty({ example: 'Asia/Tashkent' }) timezone!: string;

  @ApiProperty({ enum: ApprovalStatus, enumName: 'ApprovalStatus' })
  approvalStatus!: ApprovalStatus;

  @ApiPropertyOptional({ nullable: true, description: 'Why an admin rejected this profile' })
  rejectionReason!: string | null;

  @ApiPropertyOptional({ nullable: true }) approvedAt!: Date | null;
  @ApiProperty({ example: false }) isActive!: boolean;
  @ApiProperty({ example: '4.85', description: 'Decimal, serialised as a string' })
  ratingAverage!: string;
  @ApiProperty({ example: 27 }) ratingCount!: number;
  @ApiProperty({ example: 31 }) completedBookingsCount!: number;
}

/**
 * FR-3.1. Built from a projection that never fetched `passwordHash`, so there is no
 * field to forget to remove — `UserWithProfile` does not have one to begin with.
 */
export class UserResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'aziz@example.com' }) email!: string;
  @ApiPropertyOptional({ nullable: true }) phone!: string | null;
  @ApiProperty({ enum: UserRole, enumName: 'UserRole' }) role!: UserRole;
  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' }) status!: UserStatus;
  @ApiPropertyOptional({ nullable: true }) lastLoginAt!: Date | null;
  @ApiProperty() createdAt!: Date;

  @ApiPropertyOptional({ type: ClientProfileDto, nullable: true })
  clientProfile!: ClientProfileDto | null;

  @ApiPropertyOptional({ type: MasterProfileDto, nullable: true })
  masterProfile!: MasterProfileDto | null;

  static fromEntity(user: UserWithProfile): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      clientProfile: user.clientProfile,
      masterProfile:
        user.masterProfile === null
          ? null
          : {
              ...user.masterProfile,
              // Decimal is serialised as a string rather than a float: a rating is a
              // fixed-scale value, and JSON numbers cannot carry that guarantee.
              ratingAverage: user.masterProfile.ratingAverage.toFixed(2),
            },
    };
  }
}
