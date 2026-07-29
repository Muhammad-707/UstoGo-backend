export type ObjectMetadata = {
  readonly contentType: string;
  readonly sizeBytes: number;
};

export type PresignedUpload = {
  readonly url: string;
  readonly expiresInSeconds: number;
};

/**
 * The object-storage seam, declared by the application and implemented by
 * infrastructure (ARCHITECTURE.md §2).
 *
 * Every method deals in keys and URLs. Nothing here accepts or returns a stream:
 * binaries never pass through the API process (MODULES.md › FilesModule, SECURITY.md
 * §2.7), which is what lets the API scale without becoming a proxy for uploads.
 */
export interface StorageProvider {
  /** A URL the client PUTs the binary to directly. */
  createUploadUrl(key: string, contentType: string, maxBytes: number): Promise<PresignedUpload>;

  /** A short-lived URL for reading a private object. */
  createReadUrl(key: string): Promise<string>;

  /**
   * The object's real metadata, or `null` when it does not exist.
   *
   * This is the authoritative source: the declared MIME type and the file extension
   * are both attacker-controlled, so confirmation reads what the store actually holds.
   */
  head(key: string): Promise<ObjectMetadata | null>;

  remove(key: string): Promise<void>;
}

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
