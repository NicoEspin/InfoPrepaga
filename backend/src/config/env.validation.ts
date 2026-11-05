import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
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
