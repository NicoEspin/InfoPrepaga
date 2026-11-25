import type { ConfigService } from '@nestjs/config';

export const YCLOUD_BODY_LIMIT = 128 * 1024;
export const YCLOUD_SIGNATURE_TOLERANCE = 300;
export const YCLOUD_POLL_MS = 10_000;
export const YCLOUD_MAX_ATTEMPTS = 8;
export function ycloudConfig(config: ConfigService) {
  return {
    enabled: config.get<boolean>('ycloud.enabled') === true,
    allowNonAdTestMessages:
      config.get<boolean>('ycloud.allowNonAdTestMessages') === true,
    testSenders: config.get<string[]>('ycloud.testSenders', []),
    secret: config.get<string>('ycloud.webhookSecret', ''),
    wabaId: config.get<string>('ycloud.wabaId', ''),
    businessPhone: config.get<string>('ycloud.businessPhoneNumber', ''),
    sourceCode: config.get<string>('ycloud.leadSourceCode', ''),
  };
}
