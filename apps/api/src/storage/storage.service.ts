import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
  PutObjectCommand,
  PutBucketPolicyCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly log = new Logger(StorageService.name);
  /** Internal endpoint the API uses to reach storage (e.g. http://minio:9000 in Docker). */
  private readonly endpoint = process.env.S3_ENDPOINT ?? "http://localhost:9000";
  /** Public base URL stored in photo records, reachable from the user's browser. */
  private readonly publicBase = process.env.S3_PUBLIC_URL ?? process.env.S3_ENDPOINT ?? "http://localhost:9000";
  private readonly bucket = process.env.S3_BUCKET ?? "inspection-photos";
  private readonly client = new S3Client({
    region: "us-east-1",
    endpoint: this.endpoint,
    forcePathStyle: true, // required for MinIO
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    },
  });
  // Separate client bound to the PUBLIC endpoint: presigned URLs bake the host
  // into the signature, so they must be minted against the URL browsers use.
  private readonly publicClient = new S3Client({
    region: "us-east-1",
    endpoint: this.publicBase,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY ?? "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY ?? "minioadmin",
    },
  });

  async onModuleInit() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        // Public read so the web + PDF service can load images by URL (MVP).
        await this.client.send(
          new PutBucketPolicyCommand({
            Bucket: this.bucket,
            Policy: JSON.stringify({
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Principal: "*",
                  Action: ["s3:GetObject"],
                  Resource: [`arn:aws:s3:::${this.bucket}/*`],
                },
              ],
            }),
          }),
        );
        this.log.log(`Created bucket ${this.bucket}`);
      } catch (e) {
        this.log.warn(`Could not init bucket: ${(e as Error).message}`);
      }
    }
  }

  async upload(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    return this.publicUrl(key);
  }

  publicUrl(key: string): string {
    return `${this.publicBase}/${this.bucket}/${key}`;
  }

  /** Rewrite a stored public URL to the internal endpoint (no-op outside Docker). */
  internalUrl(url: string): string {
    return url.replace(this.publicBase, this.endpoint);
  }

  /** Delete a stored object given its public URL (best-effort). */
  async deleteByUrl(url: string): Promise<void> {
    const prefix = `${this.publicBase}/${this.bucket}/`;
    if (!url.startsWith(prefix)) return;
    const key = url.slice(prefix.length);
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      this.log.warn(`Could not delete object ${key}: ${(e as Error).message}`);
    }
  }

  /** Browser-openable, expiring link to a stored object (default 7 days, the S3 max). */
  presignedGetUrl(key: string, expiresInSeconds = 7 * 24 * 3600): Promise<string> {
    return getSignedUrl(
      this.publicClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
