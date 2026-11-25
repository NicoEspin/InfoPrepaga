import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { configureYCloudHttp } from '../src/integrations/ycloud/ycloud-http';
import { YCloudService } from '../src/integrations/ycloud/ycloud.service';
import { CrmService } from '../src/crm/crm.service';
import { PrismaService } from '../src/prisma/prisma.service';

const database = process.env.CRM_TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;
suite(
  'YCloud HTTP inbox and commercial transactions (isolated PostgreSQL)',
  () => {
    let app: NestExpressApplication;
    let db: PrismaClient;
    let service: YCloudService;
    let crm: CrmService;
    let config: ConfigService;
    let adminToken: string, sellerToken: string, otherToken: string;
    let adminId: string, sellerId: string, sourceId: string;
    const secret = 'synthetic-ycloud-endpoint-secret';
    const schema = `ycloud_test_${randomUUID().replaceAll('-', '')}`;
    const api = () => request(app.getHttpServer());
    const auth = (token = adminToken) => ({ Authorization: `Bearer ${token}` });
    const event = (phone = '14155550101') => {
      const id = randomUUID();
      return {
        id: `evt_${id}`,
        type: 'whatsapp.inbound_message.received',
        apiVersion: 'v2',
        createTime: '2026-11-01T10:00:00.000Z',
        whatsappInboundMessage: {
          id: `message_${id}`,
          wamid: `wamid.${id}`,
          wabaId: '123456789',
          from: phone,
          to: '14155550100',
          type: 'text',
          sendTime: '2026-11-01T09:59:00.000Z',
          customerProfile: { name: 'Contacto sintético á 👋' },
          text: { body: 'Contenido privado que no debe persistirse' },
          referral: {
            source_type: 'ad',
            source_id: 'ad_synthetic',
            source_url: 'https://example.com/ad',
            headline: 'Consulta sintética',
            ctwa_clid: 'click_synthetic',
          },
        },
      };
    };
    const sign = (raw: string, offset = 0) => {
      const timestamp = String(Math.floor(Date.now() / 1000) + offset);
      return `t=${timestamp},s=${createHmac('sha256', secret)
        .update(timestamp + '.')
        .update(raw)
        .digest('hex')}`;
    };
    const nonAd = (phone = '14155550201') => {
      const input = event(phone);
      return {
        ...input,
        whatsappInboundMessage: {
          ...input.whatsappInboundMessage,
          referral: undefined,
        },
      };
    };
    const deliver = (input: unknown) => {
      const raw = JSON.stringify(input, null, 2) + '\n';
      return api()
        .post('/webhooks/ycloud')
        .set('Content-Type', 'application/json')
        .set('YCloud-Signature', sign(raw))
        .send(raw);
    };
    const stored = (id: string) =>
      db.yCloudInboundEvent.findUniqueOrThrow({ where: { id } });
    const leadFor = async (id: string) =>
      db.lead.findUniqueOrThrow({ where: { id: (await stored(id)).leadId! } });

    beforeAll(async () => {
      const url = new URL(database!);
      if (
        !['localhost', '127.0.0.1'].includes(url.hostname) ||
        url.pathname !== '/starter_test'
      )
        throw new Error('Use only localhost/starter_test for YCloud tests');
      url.searchParams.set('schema', schema);
      process.env.DATABASE_URL = url.href;
      process.env.NODE_ENV = 'test';
      process.env.JWT_ACCESS_SECRET = 'synthetic-ycloud-test-jwt-access-secret';
      process.env.YCLOUD_ENABLED = 'true';
      process.env.YCLOUD_ALLOW_NON_AD_TEST_MESSAGES = 'false';
      process.env.YCLOUD_TEST_SENDERS = '';
      process.env.YCLOUD_WEBHOOK_SECRET = secret;
      process.env.YCLOUD_WABA_ID = '123456789';
      process.env.YCLOUD_BUSINESS_PHONE_NUMBER = '+14155550100';
      process.env.YCLOUD_LEAD_SOURCE_CODE = 'META_1';
      execFileSync(
        process.execPath,
        [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
        { env: process.env, stdio: 'pipe' },
      );
      db = new PrismaClient();
      const password = 'Synthetic-YCloud-test-password';
      const hash = await bcrypt.hash(password, 4);
      for (const [name, roleName] of [
        ['admin', 'ADMIN'],
        ['seller', 'VENDEDOR'],
        ['other', 'VENDEDOR'],
      ]) {
        const role = await db.role.upsert({
          where: { name: roleName },
          create: { name: roleName },
          update: {},
        });
        const user = await db.user.create({
          data: {
            email: `${name}@ycloud.example`,
            password: hash,
            receivesLeads: name === 'seller',
            roles: { create: { roleId: role.id } },
          },
        });
        if (name === 'admin') adminId = user.id;
        if (name === 'seller') sellerId = user.id;
      }
      // Keep ordinary tests deterministic; exercise the real lifecycle separately.
      const lifecycle = jest
        .spyOn(YCloudService.prototype, 'onModuleInit')
        .mockImplementation(() => undefined);
      const { AppModule } = await import('../src/app.module.js');
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication<NestExpressApplication>({
        rawBody: true,
      });
      configureYCloudHttp(app);
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      lifecycle.mockRestore();
      service = app.get(YCloudService);
      crm = app.get(CrmService);
      config = app.get(ConfigService);
      for (const name of ['admin', 'seller', 'other']) {
        const response = await api()
          .post('/auth/login')
          .send({ email: `${name}@ycloud.example`, password })
          .expect(200);
        const token = (response.body as { accessToken: string }).accessToken;
        if (name === 'admin') adminToken = token;
        if (name === 'seller') sellerToken = token;
        if (name === 'other') otherToken = token;
      }
      sourceId = (
        await db.leadSource.findUniqueOrThrow({ where: { code: 'META_1' } })
      ).id;
    }, 90_000);
    afterAll(async () => {
      if (app) await app.close();
      if (db) await db.$disconnect();
    });
    afterEach(() => {
      jest.restoreAllMocks();
      config.set('ycloud.enabled', true);
      config.set('ycloud.allowNonAdTestMessages', false);
      config.set('ycloud.testSenders', []);
      config.set('ycloud.leadSourceCode', 'META_1');
    });

    it('enforces the real HTTP raw-body signature path and never stores unauthenticated input', async () => {
      const input = event();
      const raw = JSON.stringify(input, null, 2);
      for (const header of [
        '',
        'bad',
        `t=1,s=${'0'.repeat(64)}`,
        sign(raw, -301),
        sign(raw, 301),
        sign(raw + ' '),
      ]) {
        const call = api()
          .post('/webhooks/ycloud')
          .set('Content-Type', 'application/json');
        if (header) call.set('YCloud-Signature', header);
        await call.send(raw).expect(401);
      }
      expect(await db.yCloudInboundEvent.count()).toBe(0);
      await deliver(input).expect(200);
      expect(await stored(input.id)).toMatchObject({
        status: 'PENDING',
        phoneKey: '+14155550101',
      });
      expect(JSON.stringify(await stored(input.id))).not.toContain(
        'Contenido privado',
      );
      await service.processPending();
      const lead = await leadFor(input.id);
      expect(lead).toMatchObject({
        status: 'NEW',
        commercialStage: 'NEW',
        portfolioClass: 'ACTIVE',
        intakeMode: 'NEW',
        sourceId,
        entrySourceId: sourceId,
        assignedToId: sellerId,
        originDate: null,
      });
      expect(lead.createdAt.getTime()).toBeGreaterThan(
        Date.parse(input.createTime),
      );
      expect(lead.commercialStartedAt.getTime()).toBeGreaterThan(
        Date.parse(input.createTime),
      );
      expect(
        await db.leadActivity.findMany({ where: { leadId: lead.id } }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'registered', actorId: null }),
          expect.objectContaining({ kind: 'ycloud-inbound', actorId: null }),
        ]),
      );
    });
    it('rejects malformed bodies, wrong account/recipient, overlong fields, large requests and unsupported media types', async () => {
      for (const raw of ['{', '[]', '{}'])
        await api()
          .post('/webhooks/ycloud')
          .set('Content-Type', 'application/json')
          .set('YCloud-Signature', sign(raw))
          .send(raw)
          .expect(400);
      const input = event();
      input.whatsappInboundMessage.wabaId = '999';
      await deliver(input).expect(403);
      input.whatsappInboundMessage.wabaId = '123456789';
      input.whatsappInboundMessage.to = '14155550999';
      await deliver(input).expect(403);
      input.whatsappInboundMessage.to = '14155550100';
      input.whatsappInboundMessage.referral.headline = 'x'.repeat(501);
      await deliver(input).expect(400);
      const raw = JSON.stringify({ extra: 'x'.repeat(128 * 1024) });
      await api()
        .post('/webhooks/ycloud')
        .set('Content-Type', 'application/json')
        .set('YCloud-Signature', sign(raw))
        .send(raw)
        .expect(413);
      await api()
        .post('/webhooks/ycloud')
        .set('Content-Type', 'text/plain')
        .set('YCloud-Signature', sign('{}'))
        .send('{}')
        .expect(415);
    });
    it('accepts compatible extra fields above the ordinary JSON limit and uses an identifiable name fallback', async () => {
      const input = event('14155550118');
      input.whatsappInboundMessage.customerProfile.name = '';
      const raw = JSON.stringify({
        ...input,
        compatibleExtension: 'x'.repeat(110 * 1024),
      });
      await api()
        .post('/webhooks/ycloud')
        .set('Content-Type', 'application/json')
        .set('YCloud-Signature', sign(raw))
        .send(raw)
        .expect(200);
      await service.processPending();
      expect((await leadFor(input.id)).name).toBe('WhatsApp 0118');
      expect(JSON.stringify(await stored(input.id))).not.toContain(
        'compatibleExtension',
      );
    });
    it('deduplicates event IDs, message IDs under another event, and wamid under another message', async () => {
      const input = event('14155550102');
      await deliver(input).expect(200);
      await service.processPending();
      const original = await leadFor(input.id);
      expect((await deliver(input).expect(200)).body).toMatchObject({
        result: 'duplicate',
      });
      const alias = { ...input, id: 'evt_' + randomUUID() };
      expect((await deliver(alias).expect(200)).body).toMatchObject({
        result: 'duplicate',
      });
      alias.whatsappInboundMessage = {
        ...alias.whatsappInboundMessage,
        id: 'different-message',
      };
      expect((await deliver(alias).expect(200)).body).toMatchObject({
        result: 'duplicate',
      });
      await service.processPending();
      expect(
        await db.lead.count({ where: { phoneKey: original.phoneKey } }),
      ).toBe(1);
      expect(
        await db.leadActivity.count({
          where: { leadId: original.id, kind: 'ycloud-inbound' },
        }),
      ).toBe(1);
    });
    it('serializes concurrent messages and workers for the same contact', async () => {
      const inputs = [
        event('14155550103'),
        event('14155550103'),
        event('14155550103'),
      ];
      await Promise.all(inputs.map((input) => deliver(input).expect(200)));
      const secondWorker = new YCloudService(
        app.get(PrismaService),
        crm,
        config,
      );
      await Promise.all([
        service.processPending(),
        secondWorker.processPending(),
      ]);
      await service.processPending();
      const events = await db.yCloudInboundEvent.findMany({
        where: { id: { in: inputs.map((i) => i.id) } },
      });
      expect(events.every((entry) => entry.status === 'PROCESSED')).toBe(true);
      expect(new Set(events.map((entry) => entry.leadId)).size).toBe(1);
      expect(await db.lead.count({ where: { phoneKey: '+14155550103' } })).toBe(
        1,
      );
    });
    it('links normalized and legacy contacts while preserving all edited commercial fields and initial attribution', async () => {
      const otherSource = await db.leadSource.findUniqueOrThrow({
        where: { code: 'META_2' },
      });
      for (const [phone, legacy] of [
        ['14155550104', false],
        ['14155550105', true],
      ] as const) {
        const lead = await db.lead.create({
          data: {
            name: 'Nombre editado',
            phone: '+1 (415) 555-' + phone.slice(-4),
            phoneKey: legacy ? null : '+' + phone,
            contactKeysVersion: legacy ? 0 : 1,
            sourceId: otherSource.id,
            entrySourceId: otherSource.id,
            assignedToId: sellerId,
            status: 'PROSPECT',
            commercialStage: 'PROPOSAL',
            originDate: new Date('2020-01-01'),
            createdAt: new Date('2020-01-02'),
            commercialStartedAt: new Date('2020-01-02'),
          },
        });
        const input = event(phone);
        await deliver(input).expect(200);
        await service.processPending();
        expect((await stored(input.id)).leadId).toBe(lead.id);
        const after = await db.lead.findUniqueOrThrow({
          where: { id: lead.id },
        });
        for (const key of [
          'name',
          'phone',
          'sourceId',
          'entrySourceId',
          'assignedToId',
          'status',
          'commercialStage',
          'originDate',
          'createdAt',
          'commercialStartedAt',
        ] as const)
          expect(after[key]).toEqual(lead[key]);
        expect(after.phoneKey).toBe('+' + phone);
        expect((await stored(input.id)).attribution).toMatchObject({
          source_id: 'ad_synthetic',
        });
      }
    });
    it('retains multiple, historical, unclassified and insufficient contacts for administrative review', async () => {
      for (const [phone, classes] of [
        ['14155550106', ['ACTIVE', 'ACTIVE']],
        ['14155550107', ['HISTORICAL']],
        ['14155550108', ['UNCLASSIFIED']],
      ] as const) {
        for (const portfolioClass of classes)
          await db.lead.create({
            data: {
              name: 'Registro sintético',
              phone: '+' + phone,
              phoneKey: '+' + phone,
              sourceId,
              portfolioClass,
            },
          });
        const input = event(phone);
        await deliver(input).expect(200);
        await service.processPending();
        expect(await stored(input.id)).toMatchObject({
          status: 'REVIEW',
          leadId: null,
          errorCode:
            classes.length > 1 ? 'CONTACT_AMBIGUOUS' : 'CONTACT_HISTORICAL',
        });
        expect(await db.lead.count({ where: { phoneKey: '+' + phone } })).toBe(
          classes.length,
        );
      }
      const input = event();
      const message: Record<string, unknown> = {
        ...input.whatsappInboundMessage,
      };
      delete message.from;
      const raw = JSON.stringify({ ...input, whatsappInboundMessage: message });
      await api()
        .post('/webhooks/ycloud')
        .set('Content-Type', 'application/json')
        .set('YCloud-Signature', sign(raw))
        .send(raw)
        .expect(200);
      expect(await stored(input.id)).toMatchObject({
        status: 'REVIEW',
        errorCode: 'CONTACT_INSUFFICIENT',
      });
    });
    it('acknowledges known non-inbound events, unknown types, organic and system messages with durable exclusion codes', async () => {
      for (const type of ['whatsapp.message.updated', 'unknown.event']) {
        const input = event();
        input.type = type;
        await deliver(input).expect(200);
        expect(await stored(input.id)).toMatchObject({
          status: 'IGNORED',
          errorCode: 'EVENT_OUT_OF_SCOPE',
        });
      }
      const input = event();
      input.whatsappInboundMessage.referral.source_type = 'post';
      await deliver(input).expect(200);
      expect((await stored(input.id)).errorCode).toBe('ORGANIC_MESSAGE');
      for (const type of ['system', 'reaction', 'request_welcome']) {
        const excluded = event();
        excluded.whatsappInboundMessage.type = type;
        await deliver(excluded).expect(200);
        expect((await stored(excluded.id)).errorCode).toBe(
          'MESSAGE_OUT_OF_SCOPE',
        );
      }
      await service.processPending();
      expect(
        await db.yCloudInboundEvent.count({
          where: { status: 'IGNORED', leadId: { not: null } },
        }),
      ).toBe(0);
    });
    it('pauses reception and processing without consuming pending entries', async () => {
      const pending = event('14155550109');
      await deliver(pending).expect(200);
      config.set('ycloud.enabled', false);
      await deliver(event()).expect(503);
      await service.processPending();
      expect(await stored(pending.id)).toMatchObject({
        status: 'PENDING',
        attempts: 0,
      });
      config.set('ycloud.enabled', true);
      await service.processPending();
      expect((await stored(pending.id)).status).toBe('PROCESSED');
    });
    it('returns 503 when durable storage fails and accepts redelivery after recovery', async () => {
      const input = event('14155550110');
      const fail = jest
        .spyOn(app.get(PrismaService).yCloudInboundEvent, 'create')
        .mockRejectedValueOnce({ code: 'P1001' });
      await deliver(input).expect(503);
      fail.mockRestore();
      expect(
        await db.yCloudInboundEvent.findUnique({ where: { id: input.id } }),
      ).toBeNull();
      await deliver(input).expect(200);
      await service.processPending();
      expect((await stored(input.id)).status).toBe('PROCESSED');
    });
    it('diagnoses an invalid or inactive source and audits an ADMIN retry, including while paused', async () => {
      const input = event('14155550111');
      config.set('ycloud.leadSourceCode', 'DOES_NOT_EXIST');
      await deliver(input).expect(200);
      await service.processPending();
      expect(await stored(input.id)).toMatchObject({
        status: 'REVIEW',
        errorCode: 'SOURCE_UNAVAILABLE',
      });
      await api()
        .get('/crm/integrations/ycloud/events?status=REVIEW&pageSize=2')
        .set(auth())
        .expect(200);
      await api()
        .get(`/crm/integrations/ycloud/events/${input.id}`)
        .set(auth())
        .expect(200);
      await api()
        .get('/crm/integrations/ycloud/events')
        .set(auth(sellerToken))
        .expect(403);
      await api()
        .get(`/crm/integrations/ycloud/events/${input.id}`)
        .set(auth(sellerToken))
        .expect(403);
      await api()
        .post(`/crm/integrations/ycloud/events/${input.id}/retry`)
        .set(auth(sellerToken))
        .send({})
        .expect(403);
      await api().get('/crm/integrations/ycloud/events').expect(401);
      config.set('ycloud.enabled', false);
      config.set('ycloud.leadSourceCode', 'META_1');
      await api()
        .post(`/crm/integrations/ycloud/events/${input.id}/retry`)
        .set(auth())
        .send({})
        .expect(200);
      await service.processPending();
      expect((await stored(input.id)).status).toBe('PENDING');
      expect(
        await db.yCloudInboundRetry.findFirst({ where: { eventId: input.id } }),
      ).toMatchObject({
        actorId: adminId,
        previousErrorCode: 'SOURCE_UNAVAILABLE',
      });
      config.set('ycloud.enabled', true);
      await service.processPending();
      expect((await stored(input.id)).status).toBe('PROCESSED');
      await api()
        .post(`/crm/integrations/ycloud/events/${input.id}/retry`)
        .set(auth())
        .send({})
        .expect(409);
      await db.leadSource.update({
        where: { id: sourceId },
        data: { isActive: false },
      });
      const inactive = event('14155550112');
      await deliver(inactive).expect(200);
      await service.processPending();
      expect((await stored(inactive.id)).errorCode).toBe('SOURCE_UNAVAILABLE');
      await db.leadSource.update({
        where: { id: sourceId },
        data: { isActive: true },
      });
    });
    it('resolves an active source created through the existing administrative catalog', async () => {
      const response = await api()
        .post('/crm/sources')
        .set(auth())
        .send({ name: 'Canal YCloud sintético' })
        .expect(201);
      const source = response.body as { id: string; code: string };
      expect(source.code).toMatch(/^BASE_/);
      config.set('ycloud.leadSourceCode', source.code);
      const input = event('14155550120');
      await deliver(input).expect(200);
      await service.processPending();
      expect(await leadFor(input.id)).toMatchObject({
        sourceId: source.id,
        entrySourceId: source.id,
      });
    });
    it('rolls back partial commercial writes and round-robin state, then retries and exhausts durably', async () => {
      const input = event('14155550113');
      await deliver(input).expect(200);
      const state = await db.assignmentState.findUniqueOrThrow({
        where: { id: 1 },
      });
      const create = crm.createSystemLeadInTransaction.bind(crm);
      const fail = jest
        .spyOn(crm, 'createSystemLeadInTransaction')
        .mockImplementationOnce(async (tx, dto) => {
          await create(tx, dto);
          throw new Error('synthetic failure after lead creation');
        });
      await service.processPending();
      fail.mockRestore();
      expect(await stored(input.id)).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        errorCode: 'PROCESSING_FAILED',
        leadId: null,
      });
      expect(await db.lead.count({ where: { phoneKey: '+14155550113' } })).toBe(
        0,
      );
      expect(await db.assignmentState.findUnique({ where: { id: 1 } })).toEqual(
        state,
      );
      await db.yCloudInboundEvent.update({
        where: { id: input.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await service.processPending();
      expect(await stored(input.id)).toMatchObject({
        status: 'PROCESSED',
        attempts: 2,
      });
      const exhausted = event('14155550114');
      await deliver(exhausted).expect(200);
      await db.yCloudInboundEvent.update({
        where: { id: exhausted.id },
        data: { attempts: 7 },
      });
      const finalFailure = jest
        .spyOn(crm, 'createSystemLeadInTransaction')
        .mockRejectedValueOnce({ code: 'P2028' });
      await service.processPending();
      finalFailure.mockRestore();
      expect(await stored(exhausted.id)).toMatchObject({
        status: 'EXHAUSTED',
        attempts: 8,
      });
      await api()
        .post(`/crm/integrations/ycloud/events/${exhausted.id}/retry`)
        .set(auth())
        .send({})
        .expect(200);
      await service.processPending();
      expect(await stored(exhausted.id)).toMatchObject({
        status: 'PROCESSED',
        attempts: 1,
      });
    });
    it('recovers a PostgreSQL-aborted business statement through the savepoint', async () => {
      const input = event('14155550119');
      await deliver(input).expect(200);
      const create = crm.createSystemLeadInTransaction.bind(crm);
      const failure = jest
        .spyOn(crm, 'createSystemLeadInTransaction')
        .mockImplementationOnce(async (tx, dto) => {
          await create(tx, dto);
          await tx.$executeRaw`SELECT 1 / 0`;
          throw new Error('unreachable');
        });
      await service.processPending();
      failure.mockRestore();
      expect(await stored(input.id)).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        leadId: null,
      });
      expect(await db.lead.count({ where: { phoneKey: '+14155550119' } })).toBe(
        0,
      );
      await db.yCloudInboundEvent.update({
        where: { id: input.id },
        data: { nextAttemptAt: new Date(0) },
      });
      await service.processPending();
      expect((await stored(input.id)).status).toBe('PROCESSED');
    });
    it('resumes an already stored pending entry at worker startup', async () => {
      const input = event('14155550115');
      await deliver(input).expect(200);
      const restarted = new YCloudService(app.get(PrismaService), crm, config);
      restarted.onModuleInit();
      const deadline = Date.now() + 5000;
      while (
        (await stored(input.id)).status === 'PENDING' &&
        Date.now() < deadline
      )
        await new Promise((resolve) => setTimeout(resolve, 20));
      await restarted.onModuleDestroy();
      expect((await stored(input.id)).status).toBe('PROCESSED');
    });
    it('creates an unassigned lead without eligible sellers and gives older pending leads the preceding turns', async () => {
      await db.user.update({
        where: { id: sellerId },
        data: { receivesLeads: false },
      });
      const first = event('14155550116');
      await deliver(first).expect(200);
      await service.processPending();
      const firstLead = await leadFor(first.id);
      expect(firstLead.assignedToId).toBeNull();
      await db.user.update({
        where: { id: sellerId },
        data: { receivesLeads: true },
      });
      const second = event('14155550117');
      await deliver(second).expect(200);
      await service.processPending();
      expect((await leadFor(second.id)).assignedToId).toBeNull();
      await crm.distributePending();
      const assignments = await db.leadActivity.findMany({
        where: {
          kind: 'assigned',
          leadId: { in: [firstLead.id, (await leadFor(second.id)).id] },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
      expect(assignments.map((a) => a.leadId)).toEqual([
        firstLead.id,
        (await leadFor(second.id)).id,
      ]);
    });
    it('admits only allowlisted organic tests, preserving assignment, provenance and existing attribution', async () => {
      const source = await db.leadSource.create({
        data: { name: 'Prueba YCloud', code: 'BASE_YCLOUD_TEST' },
      });
      config.set('ycloud.leadSourceCode', source.code);
      config.set('ycloud.testSenders', ['+14155550201']);
      const before = {
        leads: await db.lead.count(),
        activities: await db.leadActivity.count(),
      };
      const disabled = nonAd();
      await deliver(disabled).expect(200);
      await service.processPending();
      expect(await stored(disabled.id)).toMatchObject({
        status: 'IGNORED',
        errorCode: 'ORGANIC_MESSAGE',
        leadId: null,
        isTestMessage: false,
      });
      expect(await db.lead.count()).toBe(before.leads);
      expect(await db.leadActivity.count()).toBe(before.activities);
      config.set('ycloud.allowNonAdTestMessages', true);
      // Ignored deliveries remain canonical after enabling the exception.
      expect((await deliver(disabled)).body).toMatchObject({
        result: 'duplicate',
      });
      const denied = nonAd('14155550202');
      await deliver(denied).expect(200);
      await service.processPending();
      expect(await stored(denied.id)).toMatchObject({
        status: 'IGNORED',
        leadId: null,
        isTestMessage: false,
      });
      expect(await db.lead.count()).toBe(before.leads);
      expect(await db.leadActivity.count()).toBe(before.activities);
      const accepted = nonAd();
      await deliver(accepted).expect(200);
      await service.processPending();
      const lead = await leadFor(accepted.id);
      expect(lead).toMatchObject({
        sourceId: source.id,
        entrySourceId: source.id,
        assignedToId: sellerId,
      });
      expect(await stored(accepted.id)).toMatchObject({
        status: 'PROCESSED',
        isTestMessage: true,
        attribution: {},
      });
      await deliver(accepted).expect(200);
      await service.processPending();
      expect(
        await db.leadActivity.count({
          where: { leadId: lead.id, kind: 'ycloud-inbound' },
        }),
      ).toBe(1);
      const link = nonAd();
      config.set('ycloud.leadSourceCode', 'META_1');
      await deliver(link).expect(200);
      await service.processPending();
      expect((await stored(link.id)).leadId).toBe(lead.id);
      expect(await leadFor(link.id)).toEqual(lead);
      const activities = await db.leadActivity.findMany({
        where: { leadId: lead.id, kind: 'ycloud-inbound' },
      });
      expect(activities).toHaveLength(2);
      for (const activity of activities)
        expect(activity.detail).toMatchObject({
          isTestMessage: true,
          adId: null,
        });
      const listing = await api()
        .get('/crm/integrations/ycloud/events?pageSize=100')
        .set(auth())
        .expect(200);
      const listed = listing.body as {
        allowNonAdTestMessages: boolean;
        items: unknown[];
      };
      expect(listed.allowNonAdTestMessages).toBe(true);
      expect(listed.items).toContainEqual(
        expect.objectContaining({ id: accepted.id, isTestMessage: true }),
      );
      expect(JSON.stringify(listing.body)).not.toContain('14155550201');
      await api()
        .get(`/crm/integrations/ycloud/events/${accepted.id}`)
        .set(auth(sellerToken))
        .expect(403);
      await api()
        .get(`/crm/leads/${lead.id}/history`)
        .set(auth(otherToken))
        .expect(404);
      config.set('ycloud.allowNonAdTestMessages', false);
      const restored = nonAd();
      await deliver(restored).expect(200);
      await service.processPending();
      expect(await stored(restored.id)).toMatchObject({
        status: 'IGNORED',
        leadId: null,
      });
      expect(await leadFor(accepted.id)).toEqual(lead);
    });
    it('keeps raw signature, size, WABA and recipient controls in test mode', async () => {
      config.set('ycloud.allowNonAdTestMessages', true);
      config.set('ycloud.testSenders', ['+14155550203']);
      const input = nonAd('14155550203');
      const raw = JSON.stringify(input);
      await api()
        .post('/webhooks/ycloud')
        .set('Content-Type', 'application/json')
        .set('YCloud-Signature', sign(raw + ' '))
        .send(raw)
        .expect(401);
      await deliver({
        ...input,
        whatsappInboundMessage: {
          ...input.whatsappInboundMessage,
          wabaId: '999',
        },
      }).expect(403);
      await deliver({
        ...input,
        whatsappInboundMessage: {
          ...input.whatsappInboundMessage,
          to: '14155550999',
        },
      }).expect(403);
      const large = JSON.stringify({ ...input, extra: 'x'.repeat(128 * 1024) });
      await api()
        .post('/webhooks/ycloud')
        .set('Content-Type', 'application/json')
        .set('YCloud-Signature', sign(large))
        .send(large)
        .expect(413);
      expect(
        await db.yCloudInboundEvent.findUnique({ where: { id: input.id } }),
      ).toBeNull();
      const ad = event('14155550203');
      await deliver(ad).expect(200);
      await service.processPending();
      expect(await stored(ad.id)).toMatchObject({
        status: 'PROCESSED',
        isTestMessage: false,
        attribution: { source_type: 'ad' },
      });
    });
    it('revokes pending, deferred and retried organic work across worker restarts without undoing commits', async () => {
      config.set('ycloud.allowNonAdTestMessages', true);
      config.set('ycloud.testSenders', ['+14155550204']);
      const pending = nonAd('14155550204');
      await deliver(pending).expect(200);
      await db.yCloudInboundEvent.update({
        where: { id: pending.id },
        data: { nextAttemptAt: new Date(Date.now() + 3_600_000) },
      });
      config.set('ycloud.allowNonAdTestMessages', false);
      const restarted = new YCloudService(app.get(PrismaService), crm, config);
      await restarted.processPending();
      expect(await stored(pending.id)).toMatchObject({
        status: 'IGNORED',
        errorCode: 'ORGANIC_MESSAGE',
        leadId: null,
      });
      config.set('ycloud.allowNonAdTestMessages', true);
      const removed = nonAd('14155550204');
      await deliver(removed).expect(200);
      config.set('ycloud.testSenders', []);
      await service.processPending();
      expect(await stored(removed.id)).toMatchObject({
        status: 'IGNORED',
        leadId: null,
      });
      config.set('ycloud.testSenders', ['+14155550204']);
      config.set('ycloud.leadSourceCode', 'DOES_NOT_EXIST');
      const retry = nonAd('14155550204');
      await deliver(retry).expect(200);
      await service.processPending();
      expect((await stored(retry.id)).status).toBe('REVIEW');
      config.set('ycloud.allowNonAdTestMessages', false);
      config.set('ycloud.leadSourceCode', 'META_1');
      await api()
        .post(`/crm/integrations/ycloud/events/${retry.id}/retry`)
        .set(auth())
        .send({})
        .expect(200);
      await service.processPending();
      expect(await stored(retry.id)).toMatchObject({
        status: 'IGNORED',
        leadId: null,
      });
      expect(
        await db.yCloudInboundRetry.count({ where: { eventId: retry.id } }),
      ).toBe(1);
      expect(await db.lead.count({ where: { phoneKey: '+14155550204' } })).toBe(
        0,
      );
      // An old inbox row cannot gain authorization from today's flag.
      config.set('ycloud.allowNonAdTestMessages', true);
      const legacy = nonAd('14155550204');
      await deliver(legacy).expect(200);
      await db.yCloudInboundEvent.update({
        where: { id: legacy.id },
        data: { isTestMessage: false },
      });
      await service.processPending();
      expect(await stored(legacy.id)).toMatchObject({
        status: 'IGNORED',
        leadId: null,
      });
    });
    it('applies existing history, search, metrics and mutation boundaries to vendor leads', async () => {
      const lead = await db.lead.findFirstOrThrow({
        where: { phoneKey: '+14155550101' },
      });
      await api()
        .get(`/crm/leads/${lead.id}/history`)
        .set(auth(sellerToken))
        .expect(200);
      await api()
        .get(`/crm/leads/${lead.id}/history`)
        .set(auth(otherToken))
        .expect(404);
      await api()
        .get(`/crm/leads/${lead.id}`)
        .set(auth(otherToken))
        .expect(404);
      await api()
        .patch(`/crm/leads/${lead.id}`)
        .set(auth(otherToken))
        .send({ name: 'No autorizado', version: lead.version })
        .expect(404);
      const list = await api()
        .get('/crm/leads?q=14155550101')
        .set(auth(otherToken))
        .expect(200);
      expect((list.body as { total: number }).total).toBe(0);
      await api()
        .post('/crm/leads')
        .set(auth(sellerToken))
        .send({ name: 'No autorizado', phone: '+14155550199', sourceId })
        .expect(403);
      await api()
        .get('/crm/reports/catalogs')
        .set(auth(otherToken))
        .expect(403);
    });
  },
);
