import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';

import { ReplaceScheduleDto } from '../dto/requests/replace-schedule.dto';
import { CreateScheduleExceptionDto } from '../dto/requests/schedule-exception.dto';
import { ScheduleExceptionResponseDto } from '../dto/responses/schedule-exception.response.dto';
import { WorkingDayResponseDto } from '../dto/responses/working-day.response.dto';
import { ScheduleService } from '../services/schedule.service';

@ApiTags('Master Cabinet')
@Controller('masters/me/schedule')
export class ScheduleMeController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get()
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'The caller’s weekly working hours' })
  @ApiOkResponse({ type: WorkingDayResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<WorkingDayResponseDto[]> {
    const days = await this.schedule.listWorkingDays(user.id);
    return days.map((day) => WorkingDayResponseDto.fromEntity(day));
  }

  @Put()
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Replace the whole weekly schedule', description: 'Atomic.' })
  @ApiOkResponse({ type: WorkingDayResponseDto, isArray: true })
  @ApiUnprocessableEntityResponse({ description: 'SCHEDULE_OVERLAP', type: ErrorResponseDto })
  async replace(
    @Body() dto: ReplaceScheduleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WorkingDayResponseDto[]> {
    const days = await this.schedule.replaceWorkingDays(user.id, dto);
    return days.map((day) => WorkingDayResponseDto.fromEntity(day));
  }

  @Get('exceptions')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'The caller’s date-specific overrides' })
  @ApiOkResponse({ type: ScheduleExceptionResponseDto, isArray: true })
  async listExceptions(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ScheduleExceptionResponseDto[]> {
    const exceptions = await this.schedule.listExceptions(user.id);
    return exceptions.map((exception) => ScheduleExceptionResponseDto.fromEntity(exception));
  }

  @Post('exceptions')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Add a date-specific override' })
  @ApiCreatedResponse({ type: ScheduleExceptionResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_TIME_RANGE', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'EXCEPTION_ALREADY_EXISTS', type: ErrorResponseDto })
  async addException(
    @Body() dto: CreateScheduleExceptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ScheduleExceptionResponseDto> {
    const exception = await this.schedule.createException(user.id, dto);
    return ScheduleExceptionResponseDto.fromEntity(exception);
  }

  @Delete('exceptions/:exceptionId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Remove a date-specific override', description: 'Idempotent.' })
  @ApiNoContentResponse()
  async removeException(
    @Param('exceptionId') exceptionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.schedule.removeException(user.id, exceptionId);
  }
}
