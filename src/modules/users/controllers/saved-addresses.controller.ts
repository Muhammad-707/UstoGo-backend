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

import { CreateSavedAddressDto } from '../dto/requests/create-saved-address.dto';
import { UpdateSavedAddressDto } from '../dto/requests/update-saved-address.dto';
import { SavedAddressResponseDto } from '../dto/responses/saved-address.response.dto';
import { SavedAddressesService } from '../services/saved-addresses.service';

const SAVED_ADDRESS_NOT_FOUND = { description: 'SAVED_ADDRESS_NOT_FOUND', type: ErrorResponseDto };

/** B-50. A client's labeled, reusable addresses — CLIENT only. */
@ApiTags('Users')
@Controller('users/me/addresses')
export class SavedAddressesController {
  constructor(private readonly addresses: SavedAddressesService) {}

  @Get()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: "List the caller's saved addresses" })
  @ApiOkResponse({ type: SavedAddressResponseDto, isArray: true })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<SavedAddressResponseDto[]> {
    const addresses = await this.addresses.list(user.id);
    return addresses.map((address) => SavedAddressResponseDto.fromEntity(address));
  }

  @Post()
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Save a new address' })
  @ApiCreatedResponse({ type: SavedAddressResponseDto })
  @ApiNotFoundResponse({ description: 'CITY_NOT_FOUND', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'SAVED_ADDRESS_LIMIT_EXCEEDED',
    type: ErrorResponseDto,
  })
  async create(
    @Body() dto: CreateSavedAddressDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SavedAddressResponseDto> {
    const address = await this.addresses.create(user.id, dto);
    return SavedAddressResponseDto.fromEntity(address);
  }

  @Patch(':id')
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Update a saved address, or promote it to the default' })
  @ApiOkResponse({ type: SavedAddressResponseDto })
  @ApiNotFoundResponse({
    description: 'SAVED_ADDRESS_NOT_FOUND | CITY_NOT_FOUND',
    type: ErrorResponseDto,
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateSavedAddressDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SavedAddressResponseDto> {
    const address = await this.addresses.update(user.id, id, dto);
    return SavedAddressResponseDto.fromEntity(address);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAuth(UserRole.CLIENT)
  @ApiOperation({ summary: 'Remove a saved address' })
  @ApiNoContentResponse()
  @ApiNotFoundResponse(SAVED_ADDRESS_NOT_FOUND)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.addresses.remove(user.id, id);
  }
}
