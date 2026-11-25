import {
  CanActivate,
  ExecutionContext,
  Injectable,
  PayloadTooLargeException,
  RawBodyRequest,
  ServiceUnavailableException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import {
  YCLOUD_BODY_LIMIT,
  YCLOUD_SIGNATURE_TOLERANCE,
  ycloudConfig,
} from './ycloud.config';

export function validYCloudSignature(
  raw: Buffer | undefined,
  header: unknown,
  secret: string,
  now = Date.now(),
) {
  if (!raw || typeof header !== 'string' || !secret || header.length > 1024)
    return false;
  const parts = header.split(',').map((part) => part.trim());
  if (parts.some((part) => !/^(t=\d{1,12}|s=[a-fA-F0-9]{64})$/.test(part)))
    return false;
  const timestamps = parts.filter((part) => part.startsWith('t='));
  const signatures = parts.filter((part) => part.startsWith('s='));
  if (timestamps.length !== 1 || !signatures.length) return false;
  const timestamp = timestamps[0].slice(2);
  if (
    Math.abs(Math.floor(now / 1000) - Number(timestamp)) >
    YCLOUD_SIGNATURE_TOLERANCE
  )
    return false;
  const expected = createHmac('sha256', secret)
    .update(timestamp + '.')
    .update(raw)
    .digest();
  return signatures.some((signature) =>
    timingSafeEqual(expected, Buffer.from(signature.slice(2), 'hex')),
  );
}

@Injectable()
export class YCloudSignatureGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext) {
    const cfg = ycloudConfig(this.config);
    if (!cfg.enabled) throw new ServiceUnavailableException('YCLOUD_DISABLED');
    const request = context
      .switchToHttp()
      .getRequest<RawBodyRequest<Request>>();
    if (
      !/^application\/json(?:\s*;|$)/i.test(
        request.headers['content-type'] ?? '',
      ) ||
      (request.headers['content-encoding'] &&
        request.headers['content-encoding'] !== 'identity')
    )
      throw new UnsupportedMediaTypeException('YCLOUD_JSON_REQUIRED');
    if (request.rawBody && request.rawBody.length > YCLOUD_BODY_LIMIT)
      throw new PayloadTooLargeException('YCLOUD_BODY_TOO_LARGE');
    if (
      !validYCloudSignature(
        request.rawBody,
        request.headers['ycloud-signature'],
        cfg.secret,
      )
    )
      throw new UnauthorizedException('YCLOUD_SIGNATURE_INVALID');
    return true;
  }
}
