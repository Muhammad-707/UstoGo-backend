import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
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

import { CreateServiceDto } from '../dto/requests/create-service.dto';
import { UpdateServiceDto } from '../dto/requests/update-service.dto';
import { ServiceResponseDto } from '../dto/responses/service.response.dto';
import { ServicesService } from '../services/services.service';

const VALIDATION_FAILED = {
  description: 'VALIDATION_FAILED | CATEGORY_NOT_LEAF | SERVICE_CATEGORY_NOT_ATTACHED',
  type: ErrorResponseDto,
};
const NOT_FOUND = { description: 'SERVICE_NOT_FOUND', type: ErrorResponseDto };

@ApiTags('Master Cabinet')
@Controller('masters/me/services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'The caller’s services' })
  @ApiOkResponse({ type: ServiceResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ServiceResponseDto[]> {
    const services = await this.services.list(user.id);

    return services.map((service) => ServiceResponseDto.fromEntity(service));
  }

  @Post()
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Create a service' })
  @ApiCreatedResponse({ type: ServiceResponseDto })
  @ApiUnprocessableEntityResponse(VALIDATION_FAILED)
  async create(
    @Body() dto: CreateServiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceResponseDto> {
    const service = await this.services.create(user.id, dto);

    return ServiceResponseDto.fromEntity(service);
  }

  @Patch(':id')
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Update a service' })
  @ApiOkResponse({ type: ServiceResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'VALIDATION_FAILED', type: ErrorResponseDto })
  @ApiNotFoundResponse(NOT_FOUND)
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ServiceResponseDto> {
    const service = await this.services.update(user.id, id, dto);

    return ServiceResponseDto.fromEntity(service);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.MASTER)
  @ApiOperation({ summary: 'Delete a service', description: 'Soft delete.' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse(NOT_FOUND)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.services.remove(user.id, id);
  }
}
