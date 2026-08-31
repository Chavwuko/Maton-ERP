import { ConfigService } from '@nestjs/config';

const sendMock = jest.fn();

// Mock the AWS SDK entirely — these tests check that StorageService builds
// the right client config and sends the right commands, not that the SDK
// itself works. Each mocked Command class just echoes its constructor
// input back so assertions can inspect it.
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
  HeadBucketCommand: jest.fn().mockImplementation((input) => ({ commandName: 'HeadBucketCommand', input })),
  CreateBucketCommand: jest.fn().mockImplementation((input) => ({ commandName: 'CreateBucketCommand', input })),
  PutObjectCommand: jest.fn().mockImplementation((input) => ({ commandName: 'PutObjectCommand', input })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ commandName: 'GetObjectCommand', input })),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { StorageService } from './storage.service';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    get: jest.fn((key: string) => values[key]),
    getOrThrow: jest.fn((key: string) => {
      if (values[key] == null) throw new Error(`Missing config: ${key}`);
      return values[key];
    }),
  } as unknown as ConfigService;
}

describe('StorageService', () => {
  beforeEach(() => {
    sendMock.mockReset();
    (getSignedUrl as jest.Mock).mockReset();
    (S3Client as unknown as jest.Mock).mockClear();
  });

  describe('constructor', () => {
    it('requires DOCUMENTS_BUCKET to be configured', () => {
      expect(() => new StorageService(fakeConfig({}))).toThrow('Missing config: DOCUMENTS_BUCKET');
    });

    it('talks to real AWS with no endpoint override when S3_ENDPOINT is unset', () => {
      new StorageService(fakeConfig({ DOCUMENTS_BUCKET: 'prod-bucket' }));

      expect(S3Client).toHaveBeenCalledWith({ region: 'us-east-1' });
    });

    it('points at MinIO with path-style + explicit credentials when S3_ENDPOINT is set', () => {
      new StorageService(
        fakeConfig({
          DOCUMENTS_BUCKET: 'local-bucket',
          S3_ENDPOINT: 'http://localhost:9000',
          S3_ACCESS_KEY_ID: 'me',
          S3_SECRET_ACCESS_KEY: 'shh',
        }),
      );

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({
          endpoint: 'http://localhost:9000',
          forcePathStyle: true,
          credentials: { accessKeyId: 'me', secretAccessKey: 'shh' },
        }),
      );
    });

    it('defaults MinIO credentials when none are configured', () => {
      new StorageService(fakeConfig({ DOCUMENTS_BUCKET: 'b', S3_ENDPOINT: 'http://localhost:9000' }));

      expect(S3Client).toHaveBeenCalledWith(
        expect.objectContaining({ credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' } }),
      );
    });
  });

  describe('onModuleInit', () => {
    it('does nothing against real AWS (no S3_ENDPOINT) — Terraform already created the bucket', async () => {
      const service = new StorageService(fakeConfig({ DOCUMENTS_BUCKET: 'prod-bucket' }));

      await service.onModuleInit();

      expect(sendMock).not.toHaveBeenCalled();
    });

    it('in local mode, does not create the bucket when HeadBucket already succeeds', async () => {
      sendMock.mockResolvedValueOnce({});
      const service = new StorageService(
        fakeConfig({ DOCUMENTS_BUCKET: 'local-bucket', S3_ENDPOINT: 'http://localhost:9000' }),
      );

      await service.onModuleInit();

      expect(sendMock).toHaveBeenCalledTimes(1);
      expect(sendMock.mock.calls[0][0]).toEqual(
        expect.objectContaining({ commandName: 'HeadBucketCommand', input: { Bucket: 'local-bucket' } }),
      );
    });

    it('in local mode, creates the bucket when HeadBucket fails (first boot against a fresh MinIO)', async () => {
      sendMock.mockRejectedValueOnce(new Error('NotFound')).mockResolvedValueOnce({});
      const service = new StorageService(
        fakeConfig({ DOCUMENTS_BUCKET: 'local-bucket', S3_ENDPOINT: 'http://localhost:9000' }),
      );

      await service.onModuleInit();

      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(sendMock.mock.calls[1][0]).toEqual(
        expect.objectContaining({ commandName: 'CreateBucketCommand', input: { Bucket: 'local-bucket' } }),
      );
    });
  });

  describe('putObject', () => {
    it('sends a PutObjectCommand with the bucket, key, body, and content type', async () => {
      sendMock.mockResolvedValue({});
      const service = new StorageService(fakeConfig({ DOCUMENTS_BUCKET: 'my-bucket' }));
      const body = Buffer.from('hello');

      await service.putObject('documents/org-1/doc-1/v1/file.txt', body, 'text/plain');

      expect(sendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          commandName: 'PutObjectCommand',
          input: { Bucket: 'my-bucket', Key: 'documents/org-1/doc-1/v1/file.txt', Body: body, ContentType: 'text/plain' },
        }),
      );
    });
  });

  describe('getDownloadUrl', () => {
    it('requests a presigned URL for the given key, defaulting to a 300s expiry', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://minio/signed-url');
      const service = new StorageService(fakeConfig({ DOCUMENTS_BUCKET: 'my-bucket' }));

      const url = await service.getDownloadUrl('documents/org-1/doc-1/v1/file.txt');

      expect(url).toBe('https://minio/signed-url');
      expect(getSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          commandName: 'GetObjectCommand',
          input: { Bucket: 'my-bucket', Key: 'documents/org-1/doc-1/v1/file.txt' },
        }),
        { expiresIn: 300 },
      );
    });

    it('honors a custom expiry', async () => {
      (getSignedUrl as jest.Mock).mockResolvedValue('https://minio/signed-url');
      const service = new StorageService(fakeConfig({ DOCUMENTS_BUCKET: 'my-bucket' }));

      await service.getDownloadUrl('key', 60);

      expect(getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), { expiresIn: 60 });
    });
  });
});
