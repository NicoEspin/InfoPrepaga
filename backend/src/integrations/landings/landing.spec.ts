import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CrmService } from '../../crm/crm.service';
import { contactKeys } from '../../crm/contact-keys';
import { LandingLeadDto } from './landing.dto';
import { LandingService } from './landing.service';

describe('Landing input and legal-controller gate', () => {
  const token = 'synthetic-infoprepaga-token-00000001';
  const other = 'synthetic-coberturas-token-000000001';
  let config: ConfigService;
  let service: LandingService;
  const originalEnv = { ...process.env };
  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('LANDING_') || key === 'CRM_DATA_CONTROLLER_ID') {
        if (originalEnv[key] === undefined) delete process.env[key];
        else process.env[key] = originalEnv[key];
      }
    }
  });
  beforeEach(() => {
    config = new ConfigService({
      CRM_DATA_CONTROLLER_ID: 'synthetic-controller',
      LANDING_INFOPREPAGA_ENABLED: 'true',
      LANDING_INFOPREPAGA_TOKEN: token,
      LANDING_INFOPREPAGA_CONTROLLER_ID: 'synthetic-controller',
      LANDING_COBERTURAS_MEDICAS_TOKEN: other,
    });
    service = new LandingService(config, {} as CrmService);
  });
  it('requires a landing-exclusive server credential, never a session', () => {
    expect(() => service.authenticate('infoprepaga')).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      service.authenticate('infoprepaga', `Bearer ${other}`),
    ).toThrow(UnauthorizedException);
    expect(
      service.authenticate('infoprepaga', `Bearer ${token}`).controller,
    ).toBe('synthetic-controller');
    config.set('LANDING_COBERTURAS_MEDICAS_PREVIOUS_TOKEN', token);
    expect(() =>
      service.authenticate('infoprepaga', `Bearer ${token}`),
    ).toThrow(ServiceUnavailableException);
  });
  it('fails closed for a distinct or unknown responsible entity, even with a valid token', () => {
    config.set('LANDING_INFOPREPAGA_CONTROLLER_ID', 'another-legal-entity');
    expect(() =>
      service.authenticate('infoprepaga', `Bearer ${token}`),
    ).toThrow(ServiceUnavailableException);
    config.set('LANDING_INFOPREPAGA_CONTROLLER_ID', '');
    expect(() =>
      service.authenticate('infoprepaga', `Bearer ${token}`),
    ).toThrow(ServiceUnavailableException);
  });
  it('defaults off and supports current/previous keys for scoped rotation', () => {
    config.set('LANDING_INFOPREPAGA_ENABLED', 'false');
    expect(() =>
      service.authenticate('infoprepaga', `Bearer ${token}`),
    ).toThrow(ServiceUnavailableException);
    config.set('LANDING_INFOPREPAGA_ENABLED', 'true');
    config.set(
      'LANDING_INFOPREPAGA_PREVIOUS_TOKEN',
      'synthetic-previous-token-0000000001',
    );
    expect(
      service.authenticate(
        'infoprepaga',
        'Bearer synthetic-previous-token-0000000001',
      ),
    ).toBeDefined();
  });
  it.each(['011 15 2345-6789', '+54 9 11 2345-6789', '0054 9 11 2345-6789'])(
    'uses the existing Argentina phone convention for %s',
    (phone) => {
      expect(contactKeys(undefined, phone).phoneKey).toBe('+5491123456789');
    },
  );
  it('normalizes accented compound names and rejects extra authority/PII fields', async () => {
    const dto = plainToInstance(LandingLeadDto, {
      submissionId: '2e2358f1-cd4f-4cc1-bcde-80d217dd2db3',
      formId: 'modal',
      name: '  María   José Pérez  ',
      phone: '011 15 2345-6789',
      consent: true,
      privacyVersion: 'ip-2026-01',
      employment: 'DEPENDENCIA',
    });
    expect(dto.name).toBe('María José Pérez');
    expect(
      await validate(dto, { whitelist: true, forbidNonWhitelisted: true }),
    ).toHaveLength(0);
    for (const field of [
      'sourceId',
      'assignedToId',
      'controllerId',
      'stage',
      'utm',
      'health',
    ]) {
      const invalid = Object.assign(new LandingLeadDto(), dto, {
        [field]: 'untrusted',
      });
      expect(
        (
          await validate(invalid, {
            whitelist: true,
            forbidNonWhitelisted: true,
          })
        ).length,
      ).toBeGreaterThan(0);
    }
  });
  it('requires email for Coberturas and valid consent/form for the landing', async () => {
    config.set('LANDING_COBERTURAS_MEDICAS_ENABLED', 'true');
    config.set(
      'LANDING_COBERTURAS_MEDICAS_CONTROLLER_ID',
      'synthetic-controller',
    );
    await expect(
      service.receive('coberturas-medicas', `Bearer ${other}`, {
        formId: 'principal',
        phone: '+5491123456789',
        consent: true,
      } as LandingLeadDto),
    ).rejects.toThrow(BadRequestException);
  });
});
