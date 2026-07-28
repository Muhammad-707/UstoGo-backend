import type { Env } from '../env.schema';

export type StorageConfig = {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly presignTtlSeconds: number;
};

export const buildStorageConfig = (env: Env): StorageConfig =>
  Object.freeze({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    bucket: env.S3_BUCKET,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    presignTtlSeconds: env.S3_PRESIGN_TTL,
  });
