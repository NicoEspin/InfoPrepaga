import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { contactKeys } from '../../crm/contact-keys';
import { isISO8601 } from 'class-validator';
import { ycloudAdmission, type YCloudTestPolicy } from './ycloud-policy';

const userTypes = new Set([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contacts',
  'button',
  'interactive',
  'order',
]);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('YCLOUD_BODY_INVALID');
  return value as Record<string, unknown>;
}
function hasControl(value: string) {
  return [...value].some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
}
function str(value: unknown, max: number, required = false): string | null {
  if (value === undefined || value === null) {
    if (required) throw new BadRequestException('YCLOUD_FIELD_REQUIRED');
    return null;
  }
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > max ||
    hasControl(value)
  )
    throw new BadRequestException('YCLOUD_FIELD_INVALID');
  return value.trim();
}
function date(value: unknown) {
  const text = str(value, 40, true)!;
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      text,
    ) ||
    !isISO8601(text, { strict: true })
  )
    throw new BadRequestException('YCLOUD_DATE_INVALID');
  return new Date(text);
}
function internationalPhone(value: unknown, required = true) {
  const phone = str(value, 32, required);
  if (!phone) return null;
  if (!/^\+?[1-9]\d{6,14}$/.test(phone))
    throw new BadRequestException('YCLOUD_PHONE_INVALID');
  return contactKeys(null, phone.startsWith('+') ? phone : '+' + phone)
    .phoneKey;
}

/** Explicit allowlist: never store message contents, media links or the raw payload. */
export function mapYCloudEvent(
  body: unknown,
  cfg: { wabaId: string; businessPhone: string } & YCloudTestPolicy,
): Prisma.YCloudInboundEventCreateInput {
  const event = object(body);
  const base = {
    id: str(event.id, 160, true)!,
    eventType: str(event.type, 100, true)!,
    apiVersion: str(event.apiVersion, 32, true)!,
    emittedAt: date(event.createTime),
  };
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(base.id))
    throw new BadRequestException('YCLOUD_EVENT_ID_INVALID');
  if (base.eventType !== 'whatsapp.inbound_message.received')
    return { ...base, status: 'IGNORED', errorCode: 'EVENT_OUT_OF_SCOPE' };
  const message = object(event.whatsappInboundMessage);
  const wabaId = str(message.wabaId, 64, true)!;
  const businessPhone = internationalPhone(message.to);
  if (
    wabaId !== cfg.wabaId ||
    !businessPhone ||
    businessPhone !== cfg.businessPhone
  )
    throw new ForbiddenException('YCLOUD_ACCOUNT_MISMATCH');
  const messageType = str(message.type, 40, true)!;
  const phoneKey = internationalPhone(message.from, false);
  const referral = message.referral == null ? {} : object(message.referral);
  const attribution: Record<string, string> = {};
  for (const [key, max] of [
    ['source_id', 160],
    ['source_type', 32],
    ['source_url', 2048],
    ['headline', 500],
    ['ctwa_clid', 1024],
  ] as const) {
    const value = str(referral[key], max);
    if (value) attribution[key] = value;
  }
  if (attribution.source_url) {
    try {
      const url = new URL(String(attribution.source_url));
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password
      )
        throw new Error();
    } catch {
      throw new BadRequestException('YCLOUD_REFERRAL_URL_INVALID');
    }
  }
  // An invalid profile name is optional; discard it rather than losing a valid contact.
  let profileName: string | null = null;
  if (message.customerProfile != null) {
    const name = object(message.customerProfile).name;
    if (
      typeof name === 'string' &&
      name.trim().length <= 160 &&
      !hasControl(name)
    )
      profileName = name.trim() || null;
  }
  const admission = ycloudAdmission(attribution.source_type, phoneKey, cfg);
  const errorCode =
    base.apiVersion !== 'v2'
      ? 'API_VERSION_UNSUPPORTED'
      : !userTypes.has(messageType)
        ? 'MESSAGE_OUT_OF_SCOPE'
        : !admission.allowed
          ? 'ORGANIC_MESSAGE'
          : !phoneKey
            ? 'CONTACT_INSUFFICIENT'
            : null;
  const status =
    errorCode === 'CONTACT_INSUFFICIENT' ||
    errorCode === 'API_VERSION_UNSUPPORTED'
      ? 'REVIEW'
      : errorCode
        ? 'IGNORED'
        : 'PENDING';
  return {
    ...base,
    wabaId,
    businessPhone,
    messageId: str(message.id, 160, true)!,
    wamid: str(message.wamid, 256),
    messageType,
    phoneKey,
    profileName,
    externalUserId: str(message.fromUserId, 160),
    messageAt: date(message.sendTime),
    attribution,
    isTestMessage: !errorCode && admission.isTestMessage,
    status,
    errorCode,
  };
}
