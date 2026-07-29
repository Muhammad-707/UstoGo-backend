import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '@config/app-config.service';

import type { ObjectMetadata, PresignedUpload, StorageProvider } from './storage.provider';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly logger = new Logger(S3StorageProvider.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly ttl: number;

  constructor(config: AppConfigService) {
    const { endpoint, region, accessKeyId, secretAccessKey, bucket, presignTtlSeconds } =
      config.storage;

    this.bucket = bucket;
    this.ttl = presignTtlSeconds;
    this.client = new S3Client({
      region,
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      // MinIO serves buckets as a path segment rather than a subdomain. AWS accepts
      // path style too, so one setting works against both.
      forcePathStyle: true,
    });
  }

  /**
   * `ContentLength` is signed into the URL, so the store rejects an oversized body
   * itself. Checking size only after the upload would mean the bytes have already been
   * paid for in bandwidth and storage.
   */
  async createUploadUrl(
    key: string,
    contentType: string,
    maxBytes: number,
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: maxBytes,
    });

    return {
      url: await getSignedUrl(this.client, command, { expiresIn: this.ttl }),
      expiresInSeconds: this.ttl,
    };
  }

  /** GetObject, not PutObject — a read URL signed for PUT would grant write access. */
  async createReadUrl(key: string): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: this.ttl,
    });
  }

  async head(key: string): Promise<ObjectMetadata | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );

      return {
        contentType: response.ContentType ?? 'application/octet-stream',
        sizeBytes: Number(response.ContentLength ?? 0),
      };
    } catch {
      // A missing object and an unreadable one are the same answer to the caller:
      // this key cannot be confirmed.
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch {
      // Deleting an object that is already gone is the outcome we wanted. The cleanup
      // job runs on a schedule and must not stall on one unremovable key.
      this.logger.warn(`Could not remove object ${key}`);
    }
  }
}
