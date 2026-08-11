import { S3Client, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function boolEnv(name: string, defaultValue = false): boolean {
  const v = process.env[name];
  if (!v) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

export type PresignPutInput = {
  bucket: string;
  key: string;
  contentType: string;
  expiresInSeconds?: number; // default 10 min
};

export class S3StorageService {
  private readonly internalClient: S3Client;
  private readonly publicClient: S3Client;
  private readonly region: string;
  private readonly forcePathStyle: boolean;

  constructor() {
    this.region = process.env.S3_REGION || 'us-east-1';
    this.forcePathStyle = boolEnv('S3_FORCE_PATH_STYLE', true);

    const accessKeyId = requiredEnv('S3_ACCESS_KEY');
    const secretAccessKey = requiredEnv('S3_SECRET_KEY');

    const internalEndpoint = requiredEnv('S3_INTERNAL_ENDPOINT');
    const publicEndpoint = requiredEnv('S3_PUBLIC_ENDPOINT');

    this.internalClient = new S3Client({
      region: this.region,
      endpoint: internalEndpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: this.forcePathStyle,
    });

    // IMPORTANTE: este endpoint é usado só para assinar URLs para o browser
    this.publicClient = new S3Client({
      region: this.region,
      endpoint: publicEndpoint,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: this.forcePathStyle,
    });
  }

  async presignPut(input: PresignPutInput): Promise<{ url: string; requiredHeaders: Record<string, string> }> {
    const expiresIn = input.expiresInSeconds ?? 600;

    const cmd = new PutObjectCommand({
      Bucket: input.bucket,
      Key: input.key,
      ContentType: input.contentType,
    });

    const url = await getSignedUrl(this.publicClient, cmd, { expiresIn });

    // O browser precisa mandar os mesmos headers usados na assinatura
    return { url, requiredHeaders: { 'Content-Type': input.contentType } };
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.internalClient.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return true;
    } catch (e: any) {
      const code = String(e?.name || e?.Code || '');
      if (code.includes('NotFound') || code.includes('NoSuchKey')) return false;
      // MinIO às vezes usa 404 genérico
      if (String(e?.$metadata?.httpStatusCode) === '404') return false;
      throw e;
    }
  }

  async downloadToFile(bucket: string, key: string, destPath: string): Promise<void> {
    await fsp.mkdir(path.dirname(destPath), { recursive: true });

    const out = fs.createWriteStream(destPath);

    const resp = await this.internalClient.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

    const body = resp.Body;
    if (!body || typeof (body as any).pipe !== 'function') {
      throw new Error('Invalid S3 body stream');
    }

    await pipeline(body as any, out);
  }
}