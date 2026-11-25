import { createHmac } from 'node:crypto';
import { validYCloudSignature } from './ycloud-signature.guard';
import { mapYCloudEvent } from './ycloud-payload';
import { envValidationSchema } from '../../config/env.validation';
import { parseYCloudTestSenders } from './ycloud-policy';

const secret = 'synthetic-signing-secret';
const now = 1_800_000_000_000;
const timestamp = String(now / 1000);
const cfg = { wabaId: '123456789', businessPhone: '+14155550100' };
function signature(raw: Buffer, time = timestamp) {
  return `t=${time},s=${createHmac('sha256', secret)
    .update(time + '.')
    .update(raw)
    .digest('hex')}`;
}
const event = () => ({
  id: 'evt_synthetic',
  type: 'whatsapp.inbound_message.received',
  apiVersion: 'v2',
  createTime: '2026-11-01T10:00:00.000Z',
  whatsappInboundMessage: {
    id: 'message_synthetic',
    wamid: 'wamid.synthetic',
    wabaId: cfg.wabaId,
    from: '14155550101',
    to: '14155550100',
    type: 'text',
    sendTime: '2026-11-01T09:59:00.000Z',
    customerProfile: { name: 'Contacto sintético' },
    referral: {
      source_type: 'ad',
      source_id: 'ad_synthetic',
      source_url: 'https://example.com/ad',
      headline: 'Consulta',
      ctwa_clid: 'click_synthetic',
    },
  },
});
describe('YCloud signature policy', () => {
  const raw = Buffer.from('{  "text": "¡Hola, á! 👋" }\n');
  it('authenticates exact whitespace and Unicode bytes', () => {
    expect(validYCloudSignature(raw, signature(raw), secret, now)).toBe(true);
    expect(
      validYCloudSignature(
        Buffer.from(JSON.stringify(JSON.parse(raw.toString()))),
        signature(raw),
        secret,
        now,
      ),
    ).toBe(false);
    expect(
      validYCloudSignature(
        Buffer.from(raw.toString().replace('Hola', 'Chau')),
        signature(raw),
        secret,
        now,
      ),
    ).toBe(false);
  });
  it.each([
    undefined,
    '',
    'bad',
    't=1',
    't=x,s=abc',
    `t=${timestamp},t=${timestamp},s=${'0'.repeat(64)}`,
    `t=${timestamp},s=${'g'.repeat(64)}`,
    `t=${timestamp},s=${'0'.repeat(64)},extra=1`,
  ])('rejects missing or malformed headers: %s', (header) => {
    expect(validYCloudSignature(raw, header, secret, now)).toBe(false);
  });
  it('allows signature rotation but rejects bad secrets and absent raw bytes', () => {
    expect(
      validYCloudSignature(
        raw,
        signature(raw) + ',s=' + '0'.repeat(64),
        secret,
        now,
      ),
    ).toBe(true);
    expect(validYCloudSignature(raw, signature(raw), 'wrong', now)).toBe(false);
    expect(validYCloudSignature(undefined, signature(raw), secret, now)).toBe(
      false,
    );
  });
  it.each([-301, 301])(
    'rejects timestamps outside tolerance (%s seconds)',
    (offset) => {
      expect(
        validYCloudSignature(
          raw,
          signature(raw, String(+timestamp + offset)),
          secret,
          now,
        ),
      ).toBe(false);
    },
  );
  it.each([-300, 300])('accepts tolerance boundary (%s seconds)', (offset) => {
    expect(
      validYCloudSignature(
        raw,
        signature(raw, String(+timestamp + offset)),
        secret,
        now,
      ),
    ).toBe(true);
  });
});
describe('YCloud minimal payload mapping', () => {
  it('maps only admitted metadata and normalizes international numbers', () => {
    const input = event();
    const result = mapYCloudEvent(
      {
        ...input,
        extra: 'extension',
        whatsappInboundMessage: {
          ...input.whatsappInboundMessage,
          text: { body: 'Never persist me' },
          image: { link: 'https://example.com/private' },
        },
      },
      cfg,
    );
    expect(result).toMatchObject({
      status: 'PENDING',
      phoneKey: '+14155550101',
      attribution: { source_id: 'ad_synthetic' },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /Never persist me|private|extension/,
    );
  });
  it.each([
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
  ])('admits user message type %s', (type) => {
    const input = event();
    input.whatsappInboundMessage.type = type;
    expect(mapYCloudEvent(input, cfg).status).toBe('PENDING');
  });
  it.each([
    'system',
    'reaction',
    'request_welcome',
    'unsupported',
    'future_type',
  ])('excludes %s even with advertising referral', (type) => {
    const input = event();
    input.whatsappInboundMessage.type = type;
    expect(mapYCloudEvent(input, cfg)).toMatchObject({
      status: 'IGNORED',
      errorCode: 'MESSAGE_OUT_OF_SCOPE',
    });
  });
  it('keeps unknown events diagnostically without their payload', () => {
    const input = event();
    input.type = 'whatsapp.message.updated';
    expect(mapYCloudEvent(input, cfg)).toMatchObject({
      status: 'IGNORED',
      errorCode: 'EVENT_OUT_OF_SCOPE',
    });
    expect(mapYCloudEvent(input, cfg).phoneKey).toBeUndefined();
  });
  it('excludes organic messages and sends incompatible versions to review', () => {
    const input = event();
    input.whatsappInboundMessage.referral.source_type = 'post';
    expect(mapYCloudEvent(input, cfg).errorCode).toBe('ORGANIC_MESSAGE');
    input.apiVersion = 'v3';
    expect(mapYCloudEvent(input, cfg).status).toBe('REVIEW');
  });
  it('rejects a different account, recipient, invalid dates and unsafe referral URLs', () => {
    expect(() => mapYCloudEvent(event(), { ...cfg, wabaId: 'other' })).toThrow(
      'YCLOUD_ACCOUNT_MISMATCH',
    );
    expect(() =>
      mapYCloudEvent(event(), { ...cfg, businessPhone: '+14155550999' }),
    ).toThrow('YCLOUD_ACCOUNT_MISMATCH');
    const input = event();
    input.createTime = 'yesterday';
    expect(() => mapYCloudEvent(input, cfg)).toThrow('YCLOUD_DATE_INVALID');
    input.createTime = event().createTime;
    input.whatsappInboundMessage.referral.source_url = 'javascript:alert(1)';
    expect(() => mapYCloudEvent(input, cfg)).toThrow(
      'YCLOUD_REFERRAL_URL_INVALID',
    );
  });
  it('validates lengths and falls back from an invalid optional profile', () => {
    const input = event();
    input.whatsappInboundMessage.customerProfile.name = 'x'.repeat(161);
    expect(mapYCloudEvent(input, cfg).profileName).toBeNull();
    input.whatsappInboundMessage.referral.headline = 'x'.repeat(501);
    expect(() => mapYCloudEvent(input, cfg)).toThrow('YCLOUD_FIELD_INVALID');
  });
  it('reviews contacts that expose only a user id, without inventing a phone', () => {
    const input = event();
    const message: Record<string, unknown> = {
      ...input.whatsappInboundMessage,
    };
    delete message.from;
    expect(
      mapYCloudEvent(
        {
          ...input,
          whatsappInboundMessage: { ...message, fromUserId: 'US.synthetic' },
        },
        cfg,
      ),
    ).toMatchObject({ status: 'REVIEW', errorCode: 'CONTACT_INSUFFICIENT' });
  });
});
describe('YCloud environment', () => {
  const base = {
    DATABASE_URL: 'postgresql://synthetic:synthetic@localhost/test',
    JWT_ACCESS_SECRET: 'synthetic-secret-for-environment-tests',
  };
  it('validates an explicit international test allowlist, even with the integration disabled', () => {
    expect(
      (envValidationSchema.validate(base).value as Record<string, unknown>)
        .YCLOUD_ALLOW_NON_AD_TEST_MESSAGES,
    ).toBe('false');
    for (const value of [
      undefined,
      '',
      ' ',
      'invalid',
      '+14155550101,',
      '+123',
      '4155550101',
    ]) {
      expect(
        envValidationSchema.validate({
          ...base,
          YCLOUD_ALLOW_NON_AD_TEST_MESSAGES: 'true',
          YCLOUD_TEST_SENDERS: value,
        }).error,
      ).toBeDefined();
    }
    for (const flag of ['yes', '1', 'TRUE'])
      expect(
        envValidationSchema.validate({
          ...base,
          YCLOUD_ALLOW_NON_AD_TEST_MESSAGES: flag,
        }).error,
      ).toBeDefined();
    expect(
      envValidationSchema.validate({
        ...base,
        NODE_ENV: 'production',
        YCLOUD_ALLOW_NON_AD_TEST_MESSAGES: 'true',
        YCLOUD_TEST_SENDERS: '+1 (415) 555-0101, +14155550101',
      }).error,
    ).toBeUndefined();
    expect(parseYCloudTestSenders('+1 (415) 555-0101, +14155550101')).toEqual([
      '+14155550101',
    ]);
    expect(
      envValidationSchema.validate({ ...base, YCLOUD_TEST_SENDERS: 'invalid' })
        .error,
    ).toBeDefined();
  });
  it('starts disabled without YCloud credentials', () => {
    expect(envValidationSchema.validate(base).error).toBeUndefined();
    expect(
      envValidationSchema.validate({
        ...base,
        YCLOUD_ENABLED: 'false',
        YCLOUD_WEBHOOK_SECRET: '',
        YCLOUD_WABA_ID: '',
        YCLOUD_BUSINESS_PHONE_NUMBER: '',
        YCLOUD_LEAD_SOURCE_CODE: '',
      }).error,
    ).toBeUndefined();
  });
  it('accepts the existing BASE_uuid catalog code format', () => {
    expect(
      envValidationSchema.validate({
        ...base,
        YCLOUD_ENABLED: 'true',
        YCLOUD_WEBHOOK_SECRET: secret,
        YCLOUD_WABA_ID: cfg.wabaId,
        YCLOUD_BUSINESS_PHONE_NUMBER: cfg.businessPhone,
        YCLOUD_LEAD_SOURCE_CODE: 'BASE_11111111-aaaa-4111-8111-111111111111',
      }).error,
    ).toBeUndefined();
  });
  it.each([
    'YCLOUD_WEBHOOK_SECRET',
    'YCLOUD_WABA_ID',
    'YCLOUD_BUSINESS_PHONE_NUMBER',
    'YCLOUD_LEAD_SOURCE_CODE',
  ])('requires %s when enabled', (key) => {
    const values: Record<string, string> = {
      ...base,
      YCLOUD_ENABLED: 'true',
      YCLOUD_WEBHOOK_SECRET: secret,
      YCLOUD_WABA_ID: cfg.wabaId,
      YCLOUD_BUSINESS_PHONE_NUMBER: cfg.businessPhone,
      YCLOUD_LEAD_SOURCE_CODE: 'META_1',
    };
    expect(envValidationSchema.validate(values).error).toBeUndefined();
    delete values[key];
    expect(envValidationSchema.validate(values).error).toBeDefined();
  });
});

describe('YCloud non-ad test policy', () => {
  const enabled = {
    ...cfg,
    allowNonAdTestMessages: true,
    testSenders: ['+14155550101'],
  };
  it('requires the flag and an authorized sender without fabricating referral', () => {
    const input = event();
    const organic = {
      ...input,
      whatsappInboundMessage: {
        ...input.whatsappInboundMessage,
        referral: undefined,
        isTestMessage: true,
      },
    };
    expect(mapYCloudEvent(organic, cfg)).toMatchObject({
      status: 'IGNORED',
      errorCode: 'ORGANIC_MESSAGE',
      isTestMessage: false,
    });
    expect(mapYCloudEvent(organic, enabled)).toMatchObject({
      status: 'PENDING',
      errorCode: null,
      isTestMessage: true,
      attribution: {},
    });
    expect(
      mapYCloudEvent(organic, { ...enabled, testSenders: ['+14155550102'] }),
    ).toMatchObject({ status: 'IGNORED', isTestMessage: false });
    expect(mapYCloudEvent(input, enabled)).toMatchObject({
      status: 'PENDING',
      isTestMessage: false,
      attribution: { source_type: 'ad' },
    });
  });
  it.each(['system', 'reaction', 'unsupported'])(
    'does not admit excluded type %s',
    (type) => {
      const input = event();
      expect(
        mapYCloudEvent(
          {
            ...input,
            whatsappInboundMessage: {
              ...input.whatsappInboundMessage,
              referral: undefined,
              type,
            },
          },
          enabled,
        ),
      ).toMatchObject({
        status: 'IGNORED',
        isTestMessage: false,
        errorCode: 'MESSAGE_OUT_OF_SCOPE',
      });
    },
  );
});
