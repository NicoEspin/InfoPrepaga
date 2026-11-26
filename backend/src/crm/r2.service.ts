import {
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class R2Service implements OnModuleDestroy {
  private readonly logger = new Logger(R2Service.name);
  private client?: S3Client;
  constructor(private readonly config: ConfigService) {}

  private logFailure(
    operation: 'put' | 'remove',
    error: unknown,
    started: number,
  ) {
    const failure = error as {
      name?: unknown;
      code?: unknown;
      cause?: { code?: unknown };
      $metadata?: { httpStatusCode?: unknown };
    } | null;
    // Only known technical codes: provider messages can contain keys or URLs.
    const allowed = new Set([
      'AccessDenied',
      'InvalidAccessKeyId',
      'SignatureDoesNotMatch',
      'NoSuchBucket',
      'RequestTimeout',
      'TimeoutError',
      'AbortError',
      'NotImplemented',
      'InvalidRequest',
      'InvalidArgument',
      'InternalError',
      'ServiceUnavailable',
      'SlowDown',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'CERT_HAS_EXPIRED',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    ]);
    const safeCode = (value: unknown) =>
      typeof value === 'string' && allowed.has(value) ? value : undefined;
    const status = failure?.$metadata?.httpStatusCode;
    this.logger.error({
      event: 'r2-operation-failed',
      operation,
      errorCode:
        safeCode(failure?.code) ?? safeCode(failure?.name) ?? 'UnknownError',
      networkCode: safeCode(failure?.cause?.code),
      httpStatusCode:
        typeof status === 'number' &&
        Number.isInteger(status) &&
        status >= 100 &&
        status <= 599
          ? status
          : undefined,
      elapsedMs: Date.now() - started,
    });
  }

  private connection() {
    const account = this.config.get<string>('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY');
    const bucket = this.config.get<string>('R2_BUCKET_NAME');
    if (!account || !accessKeyId || !secretAccessKey || !bucket)
      throw new ServiceUnavailableException(
        'El almacenamiento de archivos todavía no está configurado',
      );
    this.client ??= new S3Client({
      region: 'auto',
      endpoint: `https://${account}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 1,
      requestHandler: { connectionTimeout: 2000, requestTimeout: 6000 },
    });
    return { client: this.client, bucket };
  }
  assertConfigured() {
    this.connection();
  }
  async put(key: string, body: Buffer, contentType: string) {
    const { client, bucket } = this.connection();
    const started = Date.now();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
        { abortSignal: AbortSignal.timeout(6000) },
      );
    } catch (error) {
      this.logFailure('put', error, started);
      throw new ServiceUnavailableException(
        'No se pudo confirmar la carga. Actualizá los adjuntos antes de reintentar.',
      );
    }
  }
  async remove(key: string) {
    const { client, bucket } = this.connection();
    const started = Date.now();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(6000),
      });
    } catch (error) {
      this.logFailure('remove', error, started);
      throw new ServiceUnavailableException(
        'No se pudo confirmar el borrado en R2. Reintentá eliminar el adjunto.',
      );
    }
  }
  async download(key: string, name: string) {
    const { client, bucket } = this.connection();
    return {
      url: await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          ResponseContentType: 'application/octet-stream',
          ResponseContentDisposition: `attachment; filename="archivo"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`)}`,
          ResponseCacheControl: 'private, no-store',
        }),
        { expiresIn: 60 },
      ),
      expiresIn: 60,
    };
  }
  onModuleDestroy() {
    this.client?.destroy();
  }
}
