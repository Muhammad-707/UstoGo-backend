import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { CurrentUser } from '@common/decorators/current-user.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';
import type { AuthenticatedUser } from '@common/types/authenticated-user.type';
import { AppConfigService } from '@config/app-config.service';

import { PRESIGN_THROTTLE } from '../constants/file.constants';
import {
  FileResponseDto,
  PresignRequestDto,
  PresignResponseDto,
  ReadUrlResponseDto,
} from '../dto/files.dto';
import { FilesService } from '../services/files.service';

@ApiTags('Files')
@Controller('files')
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly config: AppConfigService,
  ) {}

  @Post('presign')
  @ApiAuth()
  @Throttle({ default: PRESIGN_THROTTLE })
  @ApiOperation({
    summary: 'Request an upload URL',
    description:
      'Returns a short-lived URL to PUT the binary to directly — binaries never pass ' +
      'through the API. The declared type and size are checked here to fail fast and to ' +
      'bound what the signed URL accepts, but they are **not** trusted: the file is ' +
      'unusable until `POST /files/:id/confirm` has read the stored object’s real ' +
      'metadata. Limited to 20 requests per hour.',
  })
  @ApiCreatedResponse({ type: PresignResponseDto })
  @ApiUnprocessableEntityResponse({
    description: 'UNSUPPORTED_MIME_TYPE | FILE_TOO_LARGE | VALIDATION_FAILED',
    type: ErrorResponseDto,
  })
  @ApiTooManyRequestsResponse({ description: 'TOO_MANY_REQUESTS', type: ErrorResponseDto })
  async presign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PresignRequestDto,
  ): Promise<PresignResponseDto> {
    return this.files.presign(user.id, dto);
  }

  @Post(':id/confirm')
  @ApiAuth()
  // Verifies an existing row rather than creating one, so 200 — not the 201 a POST
  // handler returns by default, which would contradict the documented response.
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm an upload',
    description:
      'The server HEADs the stored object and checks its real content type and size ' +
      'against the limits for its purpose. A mismatch deletes both the object and the ' +
      'row. Idempotent: confirming an already-confirmed file returns it unchanged.',
  })
  @ApiOkResponse({ type: FileResponseDto })
  @ApiNotFoundResponse({ description: 'FILE_NOT_FOUND', type: ErrorResponseDto })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_FILE', type: ErrorResponseDto })
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<FileResponseDto> {
    return FileResponseDto.fromEntity(await this.files.confirm(id, user.id));
  }

  @Get(':id/url')
  @ApiAuth()
  @ApiOperation({
    summary: 'Get a short-lived read URL for an own file',
    description:
      'Confirmed files the caller uploaded. The URL expires so that a link leaked from ' +
      'a client cannot be shared indefinitely. A file belonging to someone else returns ' +
      '404, not 403, so an id cannot be probed for existence.',
  })
  @ApiOkResponse({ type: ReadUrlResponseDto })
  @ApiNotFoundResponse({ description: 'FILE_NOT_FOUND', type: ErrorResponseDto })
  @ApiConflictResponse({ description: 'FILE_NOT_CONFIRMED', type: ErrorResponseDto })
  async readUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReadUrlResponseDto> {
    return {
      url: await this.files.createReadUrl(id, user.id),
      expiresIn: this.config.storage.presignTtlSeconds,
    };
  }
}
