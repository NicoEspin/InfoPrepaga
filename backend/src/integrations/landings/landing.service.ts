import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import { CrmService } from '../../crm/crm.service';
import { contactKeys } from '../../crm/contact-keys';
import { LandingLeadDto } from './landing.dto';

export const landingCatalog = {
  infoprepaga: {
    env: 'INFOPREPAGA',
    source: 'LANDING_IP',
    forms: ['modal', 'inferior'],
  },
  'coberturas-medicas': {
    env: 'COBERTURAS_MEDICAS',
    source: 'LANDING_CM',
    forms: ['principal', 'inferior'],
  },
} as const;
export type Landing = keyof typeof landingCatalog;
const digest = (value: string) => createHash('sha256').update(value).digest();

@Injectable()
export class LandingService {
  constructor(
    private readonly config: ConfigService,
    private readonly crm: CrmService,
  ) {}

  authenticate(landing: Landing, authorization?: string) {
    const prefix = `LANDING_${landingCatalog[landing].env}`;
    const current = this.config.get<string>(`${prefix}_TOKEN`) ?? '';
    const previous = this.config.get<string>(`${prefix}_PREVIOUS_TOKEN`) ?? '';
    const provided =
      /^Bearer ([!-~]{32,512})$/.exec(authorization ?? '')?.[1] ?? '';
    if (
      !provided ||
      ![current, previous].some(
        (token) =>
          token.length >= 32 &&
          token.length <= 512 &&
          timingSafeEqual(digest(token), digest(provided)),
      )
    )
      throw new UnauthorizedException('LANDING_UNAUTHORIZED');
    const controller = this.config.get<string>(`${prefix}_CONTROLLER_ID`);
    // This checkout has a single global commercial domain, not multi-tenancy.
    // Never admit another controller to its matching, allocation or ADMIN access.
    if (
      this.config.get<string>(`${prefix}_ENABLED`) !== 'true' ||
      !controller ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(controller) ||
      controller !== this.config.get<string>('CRM_DATA_CONTROLLER_ID')
    )
      throw new ServiceUnavailableException('LANDING_NOT_ENABLED');
    // Accidentally shared credentials would defeat per-landing scope.
    const other =
      landing === 'infoprepaga' ? 'COBERTURAS_MEDICAS' : 'INFOPREPAGA';
    if (
      ['TOKEN', 'PREVIOUS_TOKEN'].some((suffix) =>
        [current, previous]
          .filter(Boolean)
          .includes(
            this.config.get<string>(`LANDING_${other}_${suffix}`) ?? '',
          ),
      )
    )
      throw new ServiceUnavailableException('LANDING_CONFIGURATION_INVALID');
    return { controller, prefix };
  }

  async receive(
    landing: Landing,
    authorization: string | undefined,
    dto: LandingLeadDto,
  ) {
    const { controller, prefix } = this.authenticate(landing, authorization);
    const keys = contactKeys(dto.email, dto.phone);
    if (
      !keys.phoneKey?.startsWith('+54') ||
      dto.consent !== true ||
      !landingCatalog[landing].forms.some((form) => form === dto.formId) ||
      (landing === 'coberturas-medicas' && !dto.email) ||
      (landing === 'infoprepaga' &&
        (dto.age === undefined || !dto.group || !dto.plan))
    )
      throw new BadRequestException('LANDING_INVALID_INPUT');
    // Explicit, ordered canonical fields make property order/phone formatting irrelevant.
    const payload = {
      formId: dto.formId,
      name: dto.name,
      phone: keys.phoneKey,
      email: keys.emailKey,
      consent: true,
      privacyVersion: dto.privacyVersion,
      employment: dto.employment,
      age: dto.age ?? null,
      group: dto.group ?? null,
      plan: dto.plan ?? null,
      budget: dto.budget ?? null,
    };
    const requestHash = digest(JSON.stringify(payload)).toString('hex');
    return this.crm.write(async (tx) => {
      const prior = await tx.landingSubmission.findUnique({
        where: {
          landing_submissionId: { landing, submissionId: dto.submissionId },
        },
      });
      if (prior) {
        if (
          prior.requestHash !== requestHash ||
          prior.controllerId !== controller
        )
          throw new ConflictException('LANDING_SUBMISSION_CONFLICT');
        return { replay: true };
      }
      if (
        dto.privacyVersion !==
        this.config.get<string>(`${prefix}_PRIVACY_VERSION`)
      )
        throw new BadRequestException('LANDING_INVALID_INPUT');
      const source = await tx.leadSource.findFirst({
        where: { code: landingCatalog[landing].source, isActive: true },
      });
      if (!source) throw new ServiceUnavailableException('LANDING_NOT_ENABLED');
      // Legacy unkeyed rows must not silently disappear from identity matching.
      while (await this.crm.backfillContactKeysInTransaction(tx)) {
        /* bounded transaction */
      }
      const matches = await tx.lead.findMany({
        where: {
          OR: [
            { phoneKey: keys.phoneKey },
            ...(keys.emailKey ? [{ emailKey: keys.emailKey }] : []),
          ],
        },
        take: 2,
      });
      const needsReview = matches.length > 1;
      // Ambiguous identities are never merged. A separate inquiry is assigned normally
      // and flagged in its timeline for administrative review.
      const lead =
        matches.length === 1
          ? matches[0]
          : await this.crm.createSystemLeadInTransaction(tx, {
              name: dto.name,
              phone: keys.phoneKey!,
              email: keys.emailKey ?? undefined,
              sourceId: source.id,
            });
      const receipt = await tx.landingSubmission.create({
        data: {
          landing,
          submissionId: dto.submissionId,
          requestHash,
          controllerId: controller,
          formId: dto.formId,
          privacyVersion: dto.privacyVersion,
          consent: true,
          payload,
          needsReview,
          leadId: lead.id,
          sourceId: source.id,
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          kind: 'landing-inquiry',
          detail: {
            submissionId: receipt.id,
            sourceId: source.id,
            source: source.code,
            formId: dto.formId,
            receivedAt: receipt.receivedAt.toISOString(),
            contactName: dto.name,
            contactPhone: keys.phoneKey,
            contactEmail: keys.emailKey,
            consent: true,
            privacyVersion: dto.privacyVersion,
            needsReview,
            employment: dto.employment,
            age: dto.age ?? null,
            group: dto.group ?? null,
            plan: dto.plan ?? null,
            budget: dto.budget ?? null,
          },
        },
      });
      return { replay: false };
    });
  }
}
