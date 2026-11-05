import {
  Injectable,
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
  private client?: S3Client;
  constructor(private readonly config: ConfigService) {}

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
    } catch {
      throw new ServiceUnavailableException(
        'No se pudo confirmar la carga. Actualizá los adjuntos antes de reintentar.',
      );
    }
  }
  async remove(key: string) {
    const { client, bucket } = this.connection();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }), {
        abortSignal: AbortSignal.timeout(6000),
      });
    } catch {
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
