import * as Joi from 'joi';
import { parseYCloudTestSenders } from '../integrations/ycloud/ycloud-policy';

export const envValidationSchema = Joi.object({
  YCLOUD_ENABLED: Joi.string().valid('true', 'false').default('false'),
  YCLOUD_ALLOW_NON_AD_TEST_MESSAGES: Joi.string()
    .valid('true', 'false')
    .default('false'),
  YCLOUD_TEST_SENDERS: Joi.string()
    .custom((value: string, helpers) => {
      try {
        parseYCloudTestSenders(value);
        return value;
      } catch {
        return helpers.error('any.invalid');
      }
    })
    .when('YCLOUD_ALLOW_NON_AD_TEST_MESSAGES', {
      is: 'true',
      then: Joi.string().trim().min(1).required(),
      otherwise: Joi.allow(''),
    }),
  YCLOUD_WEBHOOK_SECRET: Joi.string()
    .max(512)
    .when('YCLOUD_ENABLED', {
      is: 'true',
      then: Joi.required(),
      otherwise: Joi.allow(''),
    }),
  YCLOUD_WABA_ID: Joi.string()
    .pattern(/^\d{1,64}$/)
    .when('YCLOUD_ENABLED', {
      is: 'true',
      then: Joi.required(),
      otherwise: Joi.allow(''),
    }),
  YCLOUD_BUSINESS_PHONE_NUMBER: Joi.string()
    .pattern(/^\+[1-9]\d{6,14}$/)
    .when('YCLOUD_ENABLED', {
      is: 'true',
      then: Joi.required(),
      otherwise: Joi.allow(''),
    }),
  YCLOUD_LEAD_SOURCE_CODE: Joi.string()
    .pattern(/^[A-Za-z0-9_-]{1,100}$/)
    .when('YCLOUD_ENABLED', {
      is: 'true',
      then: Joi.required(),
      otherwise: Joi.allow(''),
    }),
  R2_ACCOUNT_ID: Joi.string()
    .pattern(/^[a-f0-9]{32}$/)
    .allow(''),
  R2_ACCESS_KEY_ID: Joi.string().allow(''),
  R2_SECRET_ACCESS_KEY: Joi.string().allow(''),
  R2_BUCKET_NAME: Joi.string()
    .pattern(/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/)
    .allow(''),
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3001),
  DATABASE_URL: Joi.string().uri().required(),
  JWT_ACCESS_SECRET: Joi.string()
    .min(32)
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.string().pattern(/^(?!.*(?:change-me|replace-with)).+$/),
    })
    .required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string()
    .pattern(/^[1-9]\d*[smhd]$/)
    .default('15m'),
  JWT_REFRESH_EXPIRES_IN: Joi.string()
    .pattern(/^[1-9]\d*[smhd]$/)
    .default('7d'),
  CORS_ORIGIN: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://localhost:3000'),
});
