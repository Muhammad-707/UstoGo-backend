import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole, UserStatus } from '@prisma/client';

type AdminUserListRow = {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  lastLoginAt: Date | null;
  clientProfile: { firstName: string; lastName: string } | null;
  masterProfile: { displayName: string } | null;
};

/** `GET /admin/users` row (MASTER_PROMPT.md §6.11) — a summary, not the full detail
 *  `GET /admin/users/:id` (`UserResponseDto`) already returns. */
export class AdminUserListItemResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiProperty({ enum: UserRole, enumName: 'UserRole' })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
  status!: UserStatus;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  lastLoginAt!: Date | null;

  static fromEntity(row: AdminUserListRow): AdminUserListItemResponseDto {
    const dto = new AdminUserListItemResponseDto();

    dto.id = row.id;
    dto.email = row.email;
    dto.phone = row.phone;
    dto.role = row.role;
    dto.status = row.status;
    dto.displayName =
      row.masterProfile?.displayName ??
      (row.clientProfile === null
        ? row.email
        : `${row.clientProfile.firstName} ${row.clientProfile.lastName}`.trim());
    dto.createdAt = row.createdAt;
    dto.lastLoginAt = row.lastLoginAt;

    return dto;
  }
}
