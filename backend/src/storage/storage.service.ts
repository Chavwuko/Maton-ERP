import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

// Thin wrapper around the S3 bucket provisioned in infra/storage.tf
// (`DOCUMENTS_BUCKET`). Any module needing versioned file attachments
// (Document Control, and later Maintenance/HSE attachments) should go
// through this service rather than instantiating its own S3Client.
//
// Local dev (AUTH_MODE=local) points this at the MinIO container from
// docker-compose.yml via S3_ENDPOINT, so file upload/download can be
// exercised without an AWS account. In real environments S3_ENDPOINT is
// unset and the SDK talks to AWS directly using the task's IAM role.
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly isLocal: boolean;

  constructor(private readonly config: ConfigService) {
    const endpoint = this.config.get<string>('S3_ENDPOINT');
    this.isLocal = !!endpoint;
    this.bucket = this.config.getOrThrow<string>('DOCUMENTS_BUCKET');

    this.client = new S3Client({
      region: this.config.get<string>('AWS_REGION') ?? 'us-east-1',
      ...(endpoint
        ? {
            endpoint,
            forcePathStyle: true, // required for MinIO's path-style URLs
            credentials: {
              accessKeyId: this.config.get<string>('S3_ACCESS_KEY_ID') ?? 'minioadmin',
              secretAccessKey: this.config.get<string>('S3_SECRET_ACCESS_KEY') ?? 'minioadmin',
            },
          }
        : {}),
    });
  }

  async onModuleInit() {
    // Terraform creates the bucket in real AWS; MinIO starts empty, so
    // create it here on first boot when running against MinIO.
    if (!this.isLocal) return;

    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      this.logger.log(`Creating local bucket "${this.bucket}" in MinIO`);
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  getDownloadUrl(key: string, expiresInSeconds = 300): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), {
      expiresIn: expiresInSeconds,
    });
  }
}
