import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { Report, ReportStatus, ReportType } from '@prisma/client';

/** `POST /reports` response — the reporter's own view, no admin-only fields. */
export class ReportResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  reportedUserId!: string;

  @ApiProperty()
  type!: ReportType;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  status!: ReportStatus;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(entity: Report): ReportResponseDto {
    const dto = new ReportResponseDto();

    dto.id = entity.id;
    dto.reportedUserId = entity.reportedUserId;
    dto.type = entity.type;
    dto.description = entity.description;
    dto.status = entity.status;
    dto.createdAt = entity.createdAt;

    return dto;
  }
}

type ReportWithUsers = Report & {
  reporter: { id: string; email: string };
  reported: { id: string; email: string };
  resolvedBy: { id: string; email: string } | null;
};

/** `GET /admin/reports` / `POST /admin/reports/:id/resolve` — the moderation context
 *  an admin needs, unlike the reporter's own `ReportResponseDto`. */
export class AdminReportResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  reporterUserId!: string;

  @ApiProperty()
  reporterEmail!: string;

  @ApiProperty({ format: 'uuid' })
  reportedUserId!: string;

  @ApiProperty()
  reportedEmail!: string;

  @ApiProperty()
  type!: ReportType;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  status!: ReportStatus;

  @ApiPropertyOptional({ nullable: true })
  adminNote!: string | null;

  @ApiPropertyOptional({ nullable: true })
  resolvedByEmail!: string | null;

  @ApiPropertyOptional({ nullable: true })
  resolvedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  static fromEntity(entity: ReportWithUsers): AdminReportResponseDto {
    const dto = new AdminReportResponseDto();

    dto.id = entity.id;
    dto.reporterUserId = entity.reporterUserId;
    dto.reporterEmail = entity.reporter.email;
    dto.reportedUserId = entity.reportedUserId;
    dto.reportedEmail = entity.reported.email;
    dto.type = entity.type;
    dto.description = entity.description;
    dto.status = entity.status;
    dto.adminNote = entity.adminNote;
    dto.resolvedByEmail = entity.resolvedBy?.email ?? null;
    dto.resolvedAt = entity.resolvedAt;
    dto.createdAt = entity.createdAt;

    return dto;
  }
}
