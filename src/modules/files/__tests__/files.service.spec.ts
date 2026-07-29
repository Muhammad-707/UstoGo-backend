import { FilePurpose } from '@prisma/client';

import type { AppConfigService } from '@config/app-config.service';
import type { PrismaService } from '@prisma-lib/prisma.service';
import type { ObjectMetadata, StorageProvider } from '@shared/storage/storage.provider';

import { PURPOSE_RULES } from '../constants/file.constants';
import {
  FileNotConfirmedException,
  FileNotFoundException,
  FileTooLargeException,
  InvalidFileException,
  UnsupportedMimeTypeException,
} from '../exceptions/files.exceptions';
import { FilesService } from '../services/files.service';

const firstArg = <T>(mock: jest.Mock): T => (mock.mock.calls[0] as unknown[])[0] as T;

const CONFIRMED = {
  id: 'f1',
  key: 'avatars/u1/abc.jpg',
  purpose: FilePurpose.AVATAR,
  isConfirmed: true,
  mimeType: 'image/jpeg',
  sizeBytes: BigInt(1024),
};

const build = (options: { file?: unknown; head?: ObjectMetadata | null } = {}) => {
  const fileStub = 'file' in options ? options.file : { ...CONFIRMED, isConfirmed: false };

  const fileDelegate = {
    create: jest.fn().mockResolvedValue({ id: 'f1' }),
    findFirst: jest.fn().mockResolvedValue(fileStub),
    findUnique: jest.fn().mockResolvedValue(fileStub),
    update: jest
      .fn()
      .mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...CONFIRMED, ...args.data }),
      ),
    delete: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };

  const storage = {
    createUploadUrl: jest.fn().mockResolvedValue({ url: 'https://s3/put', expiresInSeconds: 900 }),
    createReadUrl: jest.fn().mockResolvedValue('https://s3/get'),
    head: jest
      .fn()
      .mockResolvedValue(
        'head' in options ? options.head : { contentType: 'image/jpeg', sizeBytes: 1024 },
      ),
    remove: jest.fn().mockResolvedValue(undefined),
  } as unknown as StorageProvider & Record<string, jest.Mock>;

  const prisma = { db: { file: fileDelegate } } as unknown as PrismaService;
  const config = { storage: { bucket: 'ustogo-local' } } as AppConfigService;

  return { service: new FilesService(prisma, config, storage), fileDelegate, storage };
};

describe('FilesService.presign', () => {
  it('returns an upload URL and records the intent as unconfirmed', async () => {
    const { service, fileDelegate } = build();

    const result = await service.presign('u1', {
      purpose: FilePurpose.AVATAR,
      mimeType: 'image/jpeg',
      sizeBytes: 1024,
    });

    expect(result.uploadUrl).toBe('https://s3/put');
    const created = firstArg<{ data: { isConfirmed?: boolean } }>(fileDelegate.create);
    expect(created.data.isConfirmed).toBeUndefined();
  });

  it('rejects a type the purpose does not allow', async () => {
    const { service } = build();

    await expect(
      service.presign('u1', {
        purpose: FilePurpose.AVATAR,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      }),
    ).rejects.toBeInstanceOf(UnsupportedMimeTypeException);
  });

  it('accepts a pdf for a certificate, where the allowlist is wider', async () => {
    const { service } = build();

    await expect(
      service.presign('u1', {
        purpose: FilePurpose.CERTIFICATE,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      }),
    ).resolves.toBeDefined();
  });

  it('rejects a declared size beyond the purpose limit', async () => {
    const { service } = build();

    await expect(
      service.presign('u1', {
        purpose: FilePurpose.AVATAR,
        mimeType: 'image/jpeg',
        sizeBytes: PURPOSE_RULES.AVATAR.maxBytes + 1,
      }),
    ).rejects.toBeInstanceOf(FileTooLargeException);
  });

  // The limit is signed into the URL so the store rejects an oversized body itself,
  // rather than the bytes being paid for and then discarded.
  it('signs the size limit into the upload URL', async () => {
    const { service, storage } = build();

    await service.presign('u1', {
      purpose: FilePurpose.AVATAR,
      mimeType: 'image/jpeg',
      sizeBytes: 2048,
    });

    expect(storage.createUploadUrl).toHaveBeenCalledWith(expect.any(String), 'image/jpeg', 2048);
  });

  describe('key construction', () => {
    const keyFor = async (fileName?: string): Promise<string> => {
      const { service } = build();
      const result = await service.presign('u1', {
        purpose: FilePurpose.AVATAR,
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
        ...(fileName === undefined ? {} : { fileName }),
      });
      return result.fileKey;
    };

    it('namespaces by purpose and uploader', async () => {
      expect(await keyFor()).toMatch(/^avatars\/u1\/[0-9a-f-]{36}$/);
    });

    it('keeps a plausible extension', async () => {
      expect(await keyFor('portrait.JPG')).toMatch(/\.jpg$/);
    });

    // Object stores accept `../` in a key quite happily.
    it.each(['../../etc/passwd', 'a.tar.gz/../x', 'no-extension', 'x.thisisverylongext'])(
      'never lets %p reach the key',
      async (fileName) => {
        const key = await keyFor(fileName);

        expect(key).toMatch(/^avatars\/u1\/[0-9a-f-]{36}(\.[a-z0-9]{1,8})?$/);
        expect(key).not.toContain('..');
      },
    );
  });
});

describe('FilesService.confirm', () => {
  it('marks the file confirmed', async () => {
    const { service } = build();

    await expect(service.confirm('f1', 'u1')).resolves.toMatchObject({ isConfirmed: true });
  });

  // The declared type and the extension are both attacker-controlled; the object's own
  // metadata is the authority (SECURITY.md §2.7).
  it('records the store’s metadata, not the request’s', async () => {
    const { service, fileDelegate } = build({ head: { contentType: 'image/png', sizeBytes: 77 } });

    await service.confirm('f1', 'u1');
    const update = firstArg<{ data: { mimeType: string; sizeBytes: bigint } }>(fileDelegate.update);

    expect(update.data.mimeType).toBe('image/png');
    expect(update.data.sizeBytes).toBe(BigInt(77));
  });

  it('rejects when the object is not in storage', async () => {
    const { service } = build({ head: null });

    await expect(service.confirm('f1', 'u1')).rejects.toBeInstanceOf(InvalidFileException);
  });

  it('rejects and removes an object whose real type is not allowed', async () => {
    const { service, storage, fileDelegate } = build({
      head: { contentType: 'application/x-msdownload', sizeBytes: 1024 },
    });

    await expect(service.confirm('f1', 'u1')).rejects.toBeInstanceOf(InvalidFileException);
    expect(storage.remove).toHaveBeenCalledWith('avatars/u1/abc.jpg');
    expect(fileDelegate.delete).toHaveBeenCalledTimes(1);
  });

  it('rejects and removes an object larger than the purpose allows', async () => {
    const { service, storage } = build({
      head: { contentType: 'image/jpeg', sizeBytes: PURPOSE_RULES.AVATAR.maxBytes + 1 },
    });

    await expect(service.confirm('f1', 'u1')).rejects.toBeInstanceOf(InvalidFileException);
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });

  it('rejects a zero-byte object', async () => {
    const { service } = build({ head: { contentType: 'image/jpeg', sizeBytes: 0 } });

    await expect(service.confirm('f1', 'u1')).rejects.toBeInstanceOf(InvalidFileException);
  });

  // A client retrying after a dropped response must not get an error.
  it('is idempotent, and does not re-read the store', async () => {
    const { service, storage } = build({ file: CONFIRMED });

    await expect(service.confirm('f1', 'u1')).resolves.toMatchObject({ isConfirmed: true });
    expect(storage.head).not.toHaveBeenCalled();
  });

  // 404 rather than 403, so an id cannot be probed for existence.
  it('reports a file belonging to someone else as not found', async () => {
    const { service } = build({ file: null });

    await expect(service.confirm('f1', 'u1')).rejects.toBeInstanceOf(FileNotFoundException);
  });
});

describe('FilesService.createReadUrl', () => {
  it('signs a URL for a confirmed file', async () => {
    const { service } = build({ file: CONFIRMED });

    await expect(service.createReadUrl('f1', 'u1')).resolves.toBe('https://s3/get');
  });

  it('refuses an unconfirmed file', async () => {
    const { service } = build();

    await expect(service.createReadUrl('f1', 'u1')).rejects.toBeInstanceOf(
      FileNotConfirmedException,
    );
  });

  it('refuses an unknown file', async () => {
    const { service } = build({ file: null });

    await expect(service.createReadUrl('f1', 'u1')).rejects.toBeInstanceOf(FileNotFoundException);
  });

  // API1 Broken Object Level Authorization: an id alone must not mint a URL, or ids
  // could be walked for another user's certificates.
  it('scopes the lookup to the uploader', async () => {
    const { service, fileDelegate } = build({ file: CONFIRMED });

    await service.createReadUrl('f1', 'u1');

    expect(
      firstArg<{ where: Record<string, unknown> }>(fileDelegate.findFirst).where,
    ).toMatchObject({ id: 'f1', uploadedByUserId: 'u1', deletedAt: null });
  });
});

describe('FilesService.createReadUrlForKey', () => {
  // Used by modules that have already authorised the caller against the row they
  // loaded — a public master profile, a banner.
  it('signs a URL without a second ownership check', async () => {
    const { service, fileDelegate } = build();

    await expect(service.createReadUrlForKey('avatars/u9/x.jpg')).resolves.toBe('https://s3/get');
    expect(fileDelegate.findFirst).not.toHaveBeenCalled();
  });
});

describe('FilesService.getAttachable', () => {
  it('resolves a confirmed file of the right purpose', async () => {
    const { service } = build({ file: CONFIRMED });

    await expect(service.getAttachable('f1', 'u1', FilePurpose.AVATAR)).resolves.toMatchObject({
      id: 'f1',
    });
  });

  it('refuses an unconfirmed file', async () => {
    const { service } = build();

    await expect(service.getAttachable('f1', 'u1', FilePurpose.AVATAR)).rejects.toBeInstanceOf(
      FileNotConfirmedException,
    );
  });

  // A certificate must not become an avatar just because both are images.
  it('refuses a file uploaded for a different purpose', async () => {
    const { service } = build({ file: { ...CONFIRMED, purpose: FilePurpose.CERTIFICATE } });

    await expect(service.getAttachable('f1', 'u1', FilePurpose.AVATAR)).rejects.toBeInstanceOf(
      FileNotFoundException,
    );
  });
});
