import { parseYCloudTestSenders } from '../integrations/ycloud/ycloud-policy';

export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3001', 10),
  databaseUrl: process.env.DATABASE_URL,
  ycloud: {
    enabled: process.env.YCLOUD_ENABLED === 'true',
    allowNonAdTestMessages:
      process.env.YCLOUD_ALLOW_NON_AD_TEST_MESSAGES === 'true',
    testSenders: parseYCloudTestSenders(process.env.YCLOUD_TEST_SENDERS ?? ''),
    webhookSecret: process.env.YCLOUD_WEBHOOK_SECRET ?? '',
    wabaId: process.env.YCLOUD_WABA_ID ?? '',
    businessPhoneNumber: process.env.YCLOUD_BUSINESS_PHONE_NUMBER ?? '',
    leadSourceCode: process.env.YCLOUD_LEAD_SOURCE_CODE ?? '',
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  },
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
});
