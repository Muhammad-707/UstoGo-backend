import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';
import type { File, FilePurpose } from '@prisma/client';

import { AppConfigService } from '@config/app-config.service';
import { PrismaService } from '@prisma-lib/prisma.service';
import { STORAGE_PROVIDER, type StorageProvider } from '@shared/storage/storage.provider';

import { PURPOSE_RULES } from '../constants/file.constants';
import {
  FileNotConfirmedException,
  FileNotFoundException,
  FileTooLargeException,
  InvalidFileException,
  UnsupportedMimeTypeException,
} from '../exceptions/files.exceptions';

export type PresignResult = {
  readonly fileId: string;
  readonly uploadUrl: string;
  readonly fileKey: string;
  readonly expiresIn: number;
};

export type PresignInput = {
  readonly purpose: FilePurpose;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly fileName?: string | undefined;
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /**
   * Issues an upload URL and records the intent.
   *
   * The declared type and size are checked here only to fail fast and to bound what the
   * signed URL will accept — they are not trusted. Nothing is usable until `confirm`
   * has read the object's real metadata (SECURITY.md §2.7).
   */
  async presign(userId: string, input: PresignInput): Promise<PresignResult> {
    const rule = PURPOSE_RULES[input.purpose];

    if (!rule.mimeTypes.includes(input.mimeType)) {
      throw new UnsupportedMimeTypeException(input.mimeType, rule.mimeTypes);
    }
    if (input.sizeBytes > rule.maxBytes) {
      throw new FileTooLargeException(rule.maxBytes);
    }

    const key = this.buildKey(rule.prefix, userId, input.fileName);
    const upload = await this.storage.createUploadUrl(key, input.mimeType, input.sizeBytes);

    const file = await this.prisma.db.file.create({
      data: {
        key,
        bucket: this.config.storage.bucket,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        purpose: input.purpose,
        uploadedByUserId: userId,
      },
    });

    return {
      fileId: file.id,
      uploadUrl: upload.url,
      fileKey: key,
      expiresIn: upload.expiresInSeconds,
    };
  }

  /**
   * Verifies the stored object and marks the row usable.
   *
   * This is the only place a file becomes usable, and it reads the store rather than
   * the request: the declared MIME type and the extension are both attacker-controlled,
   * so the object's own metadata is the authority (SECURITY.md §2.7).
   *
   * Idempotent — confirming an already-confirmed file returns it unchanged, so a client
   * retrying after a dropped response does not get an error.
   */
  async confirm(fileId: string, userId: string): Promise<File> {
    const file = await this.getOwned(fileId, userId);

    if (file.isConfirmed) {
      return file;
    }

    const object = await this.storage.head(file.key);

    if (object === null) {
      throw new InvalidFileException('The upload was not found in storage.');
    }

    const rule = PURPOSE_RULES[file.purpose];

    if (!rule.mimeTypes.includes(object.contentType)) {
      // The object is not what it claimed. Remove it rather than leave an unreferenced
      // payload of an unexpected type sitting in the bucket.
      await this.storage.remove(file.key);
      await this.prisma.db.file.delete({ where: { id: file.id } });
      throw new InvalidFileException();
    }

    if (object.sizeBytes > rule.maxBytes || object.sizeBytes === 0) {
      await this.storage.remove(file.key);
      await this.prisma.db.file.delete({ where: { id: file.id } });
      throw new InvalidFileException();
    }

    return this.prisma.db.file.update({
      where: { id: file.id },
      data: {
        isConfirmed: true,
        // Recorded from the object, not from the request that created the row.
        mimeType: object.contentType,
        sizeBytes: BigInt(object.sizeBytes),
      },
    });
  }

  /**
   * A short-lived read URL for a file the caller uploaded. Confirmed files only —
   * nothing else is servable.
   *
   * Scoped to the uploader: an id alone must not mint a URL, or any authenticated user
   * could walk ids and read another master's certificates (SECURITY.md §3, API1). A
   * file that is visible to others — a master's avatar in a search result — is served
   * by the module that owns that projection calling {@link createReadUrlForKey}, which
   * has already decided the caller may see it.
   */
  async createReadUrl(fileId: string, userId: string): Promise<string> {
    const file = await this.getOwned(fileId, userId);

    if (!file.isConfirmed) {
      throw new FileNotConfirmedException();
    }

    return this.storage.createReadUrl(file.key);
  }

  /**
   * A read URL for a file another module has already authorised the caller to see.
   *
   * Takes the key rather than an id because the caller reached it through a row it
   * loaded and checked — a public master profile, a banner — so re-deriving ownership
   * here would be both redundant and wrong.
   */
  async createReadUrlForKey(key: string): Promise<string> {
    return this.storage.createReadUrl(key);
  }

  /**
   * Resolves a file the caller may attach, for use by other modules.
   *
   * @throws {FileNotFoundException} when it is unknown or belongs to someone else —
   *   404 rather than 403, so an id cannot be probed for existence
   *   (AUTHORIZATION.md §1).
   * @throws {FileNotConfirmedException} when it has not been verified.
   */
  async getAttachable(fileId: string, userId: string, purpose: FilePurpose): Promise<File> {
    const file = await this.getOwned(fileId, userId);

    if (!file.isConfirmed) {
      throw new FileNotConfirmedException();
    }
    if (file.purpose !== purpose) {
      throw new FileNotFoundException();
    }

    return file;
  }

  /** Detaching an old avatar leaves the object for the cleanup job to remove. */
  async softDelete(fileId: string): Promise<void> {
    await this.prisma.db.file.updateMany({
      where: { id: fileId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  private async getOwned(fileId: string, userId: string): Promise<File> {
    const file = await this.prisma.db.file.findFirst({
      where: { id: fileId, uploadedByUserId: userId, deletedAt: null },
    });

    if (file === null) {
      throw new FileNotFoundException();
    }

    return file;
  }

  /**
   * `<prefix>/<userId>/<uuid><ext>`.
   *
   * The name the client sent never becomes part of the key — only its extension, and
   * only after being restricted to a short alphanumeric run. A key built from user
   * input is a path-traversal and content-type-confusion surface, and object stores
   * happily accept `../` in a key.
   */
  private buildKey(prefix: string, userId: string, fileName?: string): string {
    const raw = fileName === undefined ? '' : extname(fileName).toLowerCase();
    const extension = /^\.[a-z0-9]{1,8}$/.test(raw) ? raw : '';

    return `${prefix}/${userId}/${randomUUID()}${extension}`;
  }
}
