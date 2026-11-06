import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import ExcelJS from 'exceljs';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import type { App } from 'supertest/types';
import { LeadImportService } from '../src/crm/lead-import.service';
type Preview = Awaited<ReturnType<LeadImportService['get']>>;
const database = process.env.CRM_TEST_DATABASE_URL;
const suite = database ? describe : describe.skip;
suite(
  'Lead imports with real PostgreSQL, authentication and transactions',
  () => {
    let app: INestApplication<App>;
    let db: PrismaClient;
    let sourceId: string;
    let sellerId: string;
    let admin: string;
    let otherAdmin: string;
    let vendor: string;
    let ownerId: string;
    const password = 'Synthetic-import-password-2026';
    const api = () => request(app.getHttpServer());
    const auth = (token = admin) => ({ Authorization: `Bearer ${token}` });
    const preview = async (id: string, page = 1) =>
      (
        await api()
          .get(`/crm/lead-imports/${id}?page=${page}`)
          .set(auth())
          .expect(200)
      ).body as Preview;
    async function workbook(emails: string[], sheetName = 'Fede') {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet(sheetName);
      sheet.addRow([
        'FECHA',
        'NOMBRE',
        'TEL',
        'HORARIO',
        'MAIL',
        'SEGMENTO',
        'ASESOR',
        'OBSERVACION',
      ]);
      emails.forEach((email, i) =>
        sheet.addRow([
          '2/8',
          `Contacto ${email.toLowerCase()}`,
          null,
          'Tarde',
          email,
          'Grupo',
          i === 0 ? 'Asesor Excel' : '',
          'Nota sintética',
        ]),
      );
      return Buffer.from(await book.xlsx.writeBuffer());
    }
    async function upload(emails: string[]) {
      const response = await api()
        .post('/crm/lead-imports')
        .set(auth())
        .attach('file', await workbook(emails), 'synthetic.xlsx')
        .expect(201);
      return (response.body as { id: string }).id;
    }
    async function patch(id: string, changes: object) {
      const current = await preview(id);
      return api()
        .patch(`/crm/lead-imports/${id}`)
        .set(auth())
        .send({
          version: current.version,
          reviewToken: current.reviewToken,
          ...changes,
        })
        .expect(200);
    }
    async function prepare(id: string) {
      await patch(id, {
        mappings: [
          { sheet: 'Fede', sourceId },
          { advisor: 'Asesor Excel', assignedToId: sellerId },
        ],
      });
      return preview(id);
    }
    beforeAll(async () => {
      const url = new URL(database!);
      if (
        !['127.0.0.1', 'localhost'].includes(url.hostname) ||
        url.pathname !== '/starter_test'
      )
        throw new Error('Use only localhost/starter_test');
      url.searchParams.set(
        'schema',
        `imports_${randomUUID().replaceAll('-', '')}`,
      );
      process.env.DATABASE_URL = url.href;
      process.env.NODE_ENV = 'test';
      process.env.JWT_ACCESS_SECRET =
        'synthetic-import-integration-test-secret-2026';
      execFileSync(
        process.execPath,
        [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'],
        { cwd: process.cwd(), env: process.env, stdio: 'pipe' },
      );
      db = new PrismaClient();
      const adminRole = await db.role.create({ data: { name: 'ADMIN' } });
      const sellerRole = await db.role.create({ data: { name: 'VENDEDOR' } });
      for (const [email, roleId] of [
        ['admin@example.test', adminRole.id],
        ['other@example.test', adminRole.id],
        ['seller@example.test', sellerRole.id],
      ]) {
        const user = await db.user.create({
          data: {
            email,
            password: await bcrypt.hash(password, 4),
            roles: { create: { roleId } },
          },
        });
        if (email === 'seller@example.test') sellerId = user.id;
        if (email === 'admin@example.test') ownerId = user.id;
      }
      sourceId = (await db.leadSource.findFirstOrThrow()).id;
      const { AppModule } = await import('../src/app.module.js');
      const module = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = module.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.init();
      await app.listen(0, '127.0.0.1');
      for (const email of [
        'admin@example.test',
        'other@example.test',
        'seller@example.test',
      ]) {
        const response = await api()
          .post('/auth/login')
          .send({ email, password })
          .expect(200);
        const token = (response.body as { accessToken: string }).accessToken;
        if (email.startsWith('admin')) admin = token;
        else if (email.startsWith('other')) otherAdmin = token;
        else vendor = token;
      }
    }, 90000);
    afterAll(async () => {
      if (app) await app.close();
      if (db) await db.$disconnect();
    });
    it('denies every operation to vendors and isolates batches between admins', async () => {
      const id = await upload(['scope@example.test']);
      const current = await preview(id);
      const rowId = current.items[0].id;
      await api().get('/crm/lead-imports').expect(401);
      await api().get('/crm/lead-imports').set(auth(vendor)).expect(403);
      await api()
        .post('/crm/lead-imports')
        .set(auth(vendor))
        .attach(
          'file',
          await workbook(['private@example.test']),
          'synthetic.xlsx',
        )
        .expect(403);
      for (const token of [vendor, otherAdmin]) {
        const status = token === vendor ? 403 : 404;
        await api()
          .get(`/crm/lead-imports/${id}`)
          .set(auth(token))
          .expect(status);
        await api()
          .patch(`/crm/lead-imports/${id}`)
          .set(auth(token))
          .send({ version: 1 })
          .expect(status);
        await api()
          .patch(`/crm/lead-imports/${id}/rows/${rowId}`)
          .set(auth(token))
          .send({ version: 1, decision: 'INCLUDE' })
          .expect(status);
        for (const action of ['review', 'confirm'])
          await api()
            .post(`/crm/lead-imports/${id}/${action}`)
            .set(auth(token))
            .send({ version: 1 })
            .expect(status);
      }
      const foreign = await api()
        .get('/crm/lead-imports')
        .set(auth(otherAdmin))
        .expect(200);
      expect(foreign.body).toEqual([]);
      await api()
        .patch(`/crm/lead-imports/${id}`)
        .set(auth())
        .send({ version: 1, mappings: [{ sheet: null }] })
        .expect(400);
      await api().get(`/crm/lead-imports/${id}?page=0`).set(auth()).expect(400);
    });
    it('backfills legacy keys, consolidates safe rows and updates provenance without altering commercial state', async () => {
      const existing = await db.lead.create({
        data: {
          name: 'Contacto legacy@example.test',
          email: ' LEGACY@EXAMPLE.TEST ',
          phone: '011 15 2345 6789',
          sourceId,
          contactKeysVersion: 0,
          status: 'PROSPECT',
          assignedToId: null,
          observations: 'Información comercial reciente',
        },
      });
      const id = await upload([
        'legacy@example.test',
        'repeat@example.test',
        'REPEAT@example.test',
        'unique@example.test',
      ]);
      let current = await prepare(id);
      expect(current.summary).toMatchObject({
        creates: 2,
        updates: 1,
        merged: 1,
        contactErrors: 0,
      });
      expect(current.items.map((row) => row.action)).toEqual([
        'UPDATE',
        'CREATE',
        'MERGE',
        'CREATE',
      ]);
      expect(
        (await db.lead.findUniqueOrThrow({ where: { id: existing.id } }))
          .phoneKey,
      ).toBe('+5491123456789');
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
      current = await preview(id);
      expect(current.summary.imported).toBe(4);
      expect(current.items[1].leadId).toBe(current.items[2].leadId);
      expect(
        await db.leadImportAppearance.count({ where: { batchId: id } }),
      ).toBe(4);
      expect(
        await db.lead.findUniqueOrThrow({ where: { id: existing.id } }),
      ).toMatchObject({
        status: 'PROSPECT',
        assignedToId: null,
        observations: 'Información comercial reciente',
        sourceId,
      });
      await api()
        .get(`/crm/leads/${existing.id}`)
        .set(auth(vendor))
        .expect(404);
      const imported = await db.lead.findUniqueOrThrow({
        where: { id: current.items[1].leadId! },
      });
      expect(imported.importData).toMatchObject({
        sheet: 'Fede',
        originalDate: '2/8',
      });
      const before = await db.leadActivity.count();
      const again = await upload([
        'legacy@example.test',
        'repeat@example.test',
        'REPEAT@example.test',
        'unique@example.test',
      ]);
      const replay = await preview(again);
      expect(
        replay.items.every((row) => row.replay && row.action === 'SKIP'),
      ).toBe(true);
      await api()
        .post(`/crm/lead-imports/${again}/confirm`)
        .set(auth())
        .send({ version: replay.version })
        .expect(201);
      expect(await db.leadActivity.count()).toBe(before);
    });
    it('fills only missing contact fields and serializes reimports from separate batches', async () => {
      const existing = await db.lead.create({
        data: {
          name: 'Complementario sintético',
          phone: '0351 15 234 5678',
          phoneKey: '+5493512345678',
          sourceId,
          assignedToId: sellerId,
          status: 'PROSPECT',
          observations: 'Actual',
        },
      });
      const book = new ExcelJS.Workbook();
      book
        .addWorksheet('Fede')
        .addRow([
          '5/8',
          existing.name,
          '+54 9 351 234 5678',
          null,
          'complement@example.test',
          null,
          '',
          'Historia adicional',
        ]);
      const bytes = Buffer.from(await book.xlsx.writeBuffer());
      const batches: string[] = [];
      for (let i = 0; i < 2; i++) {
        const response = await api()
          .post('/crm/lead-imports')
          .set(auth())
          .attach('file', bytes, 'synthetic-complement.xlsx')
          .expect(201);
        const id = (response.body as { id: string }).id;
        batches.push(id);
        await patch(id, { mappings: [{ sheet: 'Fede', sourceId }] });
      }
      const previews = await Promise.all(batches.map((id) => preview(id)));
      expect(previews[0].summary.updates).toBe(1);
      const results = await Promise.all(
        batches.map((id, i) =>
          api()
            .post(`/crm/lead-imports/${id}/confirm`)
            .set(auth())
            .send({ version: previews[i].version }),
        ),
      );
      expect(results.map((response) => response.status)).toEqual([201, 201]);
      const lead = await db.lead.findUniqueOrThrow({
        where: { id: existing.id },
      });
      expect(lead).toMatchObject({
        email: 'complement@example.test',
        phone: existing.phone,
        assignedToId: sellerId,
        status: 'PROSPECT',
        observations: 'Actual',
        sourceId,
      });
      expect(
        await db.leadImportAppearance.count({ where: { leadId: existing.id } }),
      ).toBe(1);
      expect(
        await db.leadActivity.count({
          where: { leadId: existing.id, kind: 'imported_history' },
        }),
      ).toBe(1);
      expect(await db.leadNote.count({ where: { leadId: existing.id } })).toBe(
        0,
      );
    });
    it('requires review for new matches and rejects acknowledgements based on an old preview', async () => {
      const id = await upload(['race@example.test']);
      let current = await prepare(id);
      await api()
        .post('/crm/leads')
        .set(auth())
        .send({
          name: 'Contacto race@example.test',
          email: 'RACE@example.test',
          sourceId,
        })
        .expect(201);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(409);
      await api()
        .post(`/crm/lead-imports/${id}/review`)
        .set(auth())
        .send({ version: current.version, reviewToken: current.reviewToken })
        .expect(409);
      await api()
        .patch(`/crm/lead-imports/${id}/rows/${current.items[0].id}`)
        .set(auth())
        .send({
          version: current.version,
          decision: 'INCLUDE',
          acknowledgeDuplicates: true,
          reviewToken: current.reviewToken,
        })
        .expect(409);
      current = await preview(id);
      expect(current.summary.requiresReview).toBe(true);
      await api()
        .post(`/crm/lead-imports/${id}/review`)
        .set(auth())
        .send({ version: current.version, reviewToken: current.reviewToken })
        .expect(201);
      await patch(id, { duplicates: 'INCLUDE' });
      current = await preview(id);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
      expect((await preview(id)).summary.imported).toBe(1);
    });
    it('rejects invalid contacts and changed sellers or sources, allows correction and omitting rows', async () => {
      const id = await upload(['bad email']);
      let current = await prepare(id);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(400);
      await api()
        .patch(`/crm/lead-imports/${id}/rows/${current.items[0].id}`)
        .set(auth())
        .send({ version: current.version, email: 'corrected@example.test' })
        .expect(200);
      current = await preview(id);
      await db.user.update({
        where: { id: sellerId },
        data: { isActive: false },
      });
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(400);
      await db.user.update({
        where: { id: sellerId },
        data: { isActive: true },
      });
      await api()
        .patch(`/crm/lead-imports/${id}/rows/${current.items[0].id}`)
        .set(auth())
        .send({ version: current.version, decision: 'OMIT' })
        .expect(200);
      current = await preview(id);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
      expect((await preview(id)).summary.imported).toBe(0);
    });
    it('commits bounded chunks, resumes safely and serializes concurrent confirmations', async () => {
      const id = await upload(
        Array.from({ length: 101 }, (_, i) => `chunk${i}@example.test`),
      );
      let current = await prepare(id);
      const responses = await Promise.all(
        [0, 1].map(() =>
          api()
            .post(`/crm/lead-imports/${id}/confirm`)
            .set(auth())
            .send({ version: current.version }),
        ),
      );
      expect(responses.map((response) => response.status).sort()).toEqual([
        201, 409,
      ]);
      current = await preview(id);
      expect(current.status).toBe('IMPORTING');
      expect(current.summary.imported).toBe(100);
      expect(current.rowTotal).toBe(101);
      expect((await preview(id, 3)).items).toHaveLength(1);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
      current = await preview(id);
      expect(current.summary.imported).toBe(101);
      expect(
        await db.lead.count({ where: { email: { startsWith: 'chunk' } } }),
      ).toBe(101);
      const events = await db.leadActivity.count({
        where: {
          kind: 'imported',
          actorId: ownerId,
          detail: { path: ['batchId'], equals: id },
        },
      });
      expect(events).toBe(101);
    });
    it('compares normalized phones across selected sheets and keeps same-name contacts distinct', async () => {
      const book = new ExcelJS.Workbook();
      const fede = book.addWorksheet('Fede');
      fede.addRow(['FECHA', 'NOMBRE', 'TEL', 'HORARIO', 'MAIL']);
      fede.addRow(['3/8', 'Mismo Nombre', '011 15 2345 6795']);
      fede.addRow([
        '3/8',
        'Mismo Nombre',
        null,
        null,
        'same-name@example.test',
      ]);
      const leaflet = book.addWorksheet('folletos');
      leaflet.addRow([
        'FECHA',
        'nombre',
        'tel',
        'regimen',
        'asesor',
        'observacion',
      ]);
      leaflet.addRow(['3/8', 'Otro Nombre', '+54 9 11 2345 6795']);
      book.addWorksheet('Pagos').addRow(['No importar']);
      const response = await api()
        .post('/crm/lead-imports')
        .set(auth())
        .attach(
          'file',
          Buffer.from(await book.xlsx.writeBuffer()),
          'synthetic.xlsx',
        )
        .expect(201);
      const id = (response.body as { id: string }).id;
      await patch(id, {
        mappings: [
          { sheet: 'Fede', sourceId },
          { sheet: 'folletos', sourceId },
        ],
      });
      let current = await preview(id);
      expect(current.summary).toMatchObject({
        pending: 1,
        duplicates: 2,
        review: 2,
      });
      expect(current.items[1].duplicate).toBe(false);
      await patch(id, { sheets: ['folletos'] });
      current = await preview(id);
      expect(current.summary).toMatchObject({ pending: 1, duplicates: 0 });
      await patch(id, { sheets: ['Fede', 'folletos'] });
      current = await preview(id);
      expect(current.summary.pending).toBe(1);
      const conflicting = current.items.find(
        (row) => row.name === 'Otro Nombre',
      )!;
      await api()
        .patch(`/crm/lead-imports/${id}/rows/${conflicting.id}`)
        .set(auth())
        .send({ version: current.version, name: 'Mismo Nombre' })
        .expect(200);
      current = await preview(id);
      expect(current.summary).toMatchObject({
        pending: 3,
        review: 0,
        creates: 2,
        merged: 1,
      });
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
      const imported = (await preview(id)).items.find(
        (row) => row.phone && row.leadId,
      )!;
      const lead = await db.lead.findUniqueOrThrow({
        where: { id: imported.leadId! },
      });
      await api()
        .patch(`/crm/leads/${lead.id}`)
        .set(auth())
        .send({
          version: lead.version,
          phone: '+54 9 11 2345 6796',
          email: ' EDITED@EXAMPLE.TEST ',
        })
        .expect(400);
      await api()
        .patch(`/crm/leads/${lead.id}`)
        .set(auth())
        .send({
          version: lead.version,
          phone: '+54 9 11 2345 6796',
          email: 'EDITED@EXAMPLE.TEST',
        })
        .expect(200);
      expect(
        await db.lead.findUniqueOrThrow({ where: { id: lead.id } }),
      ).toMatchObject({
        emailKey: 'edited@example.test',
        phoneKey: '+5491123456796',
      });
    });
    it('keeps formula rows blocked until corrected without discarding the rest of the file', async () => {
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Fede');
      sheet.addRow(['FECHA', 'NOMBRE', 'TEL', 'HORARIO', 'MAIL']);
      sheet.addRow([
        '2/8',
        'Fórmula',
        { formula: '1+1', result: 2 },
        null,
        'formula@example.test',
      ]);
      sheet.addRow([
        '2/8',
        'Texto seguro',
        null,
        null,
        { text: 'link@example.test', hyperlink: 'mailto:link@example.test' },
      ]);
      const response = await api()
        .post('/crm/lead-imports')
        .set(auth())
        .attach(
          'file',
          Buffer.from(await book.xlsx.writeBuffer()),
          'synthetic.xlsx',
        )
        .expect(201);
      const id = (response.body as { id: string }).id;
      await patch(id, { mappings: [{ sheet: 'Fede', sourceId }] });
      let current = await preview(id);
      expect(current.summary.invalid).toBe(1);
      expect(current.items[0].phone).toBe('');
      expect(current.items[1].email).toBe('link@example.test');
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(400);
      await api()
        .patch(`/crm/lead-imports/${id}/rows/${current.items[0].id}`)
        .set(auth())
        .send({ version: current.version, phone: '+54 9 11 2345 6797' })
        .expect(200);
      current = await preview(id);
      expect(current.summary.invalid).toBe(0);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
    });
    it('prepares 5000 candidates and paginates without returning the whole file', async () => {
      const id = await upload(
        Array.from({ length: 5000 }, (_, i) => `limit${i}@example.test`),
      );
      const current = await preview(id, 100);
      expect(current.rowTotal).toBe(5000);
      expect(current.items).toHaveLength(50);
      expect(current.summary.pending).toBe(5000);
    }, 30000);
    it('reuses confirmed case variants and explicit aliases without creating sources or users', async () => {
      const before = {
        users: await db.user.count(),
        sources: await db.leadSource.count(),
      };
      const id = await upload(['mapping-first@example.test']);
      await patch(id, {
        mappings: [
          { sheet: 'Fede', sourceId },
          {
            advisor: 'Asesor Excel',
            aliases: ['AE', 'asesor excel'],
            assignedToId: sellerId,
          },
        ],
      });
      const book = new ExcelJS.Workbook();
      book
        .addWorksheet('Fede')
        .addRow([
          '5/8',
          'Contacto alias',
          null,
          null,
          'alias@example.test',
          null,
          ' ae ',
        ]);
      const response = await api()
        .post('/crm/lead-imports')
        .set(auth())
        .attach(
          'file',
          Buffer.from(await book.xlsx.writeBuffer()),
          'alias.xlsx',
        )
        .expect(201);
      const current = await preview((response.body as { id: string }).id);
      expect(current.items[0]).toMatchObject({
        sourceId,
        assignedToId: sellerId,
        assignmentResolved: true,
        action: 'CREATE',
      });
      expect({
        users: await db.user.count(),
        sources: await db.leadSource.count(),
      }).toEqual(before);
      expect(
        await db.leadImportMapping.count({
          where: { kind: 'ADVISOR', key: 'ae' },
        }),
      ).toBe(1);
    });
    it('administers mappings with role guards, collision checks, optimistic concurrency and audit', async () => {
      const identity = { kind: 'ADVISOR', scope: '*', key: 'stage2-alias' };
      const rule = await db.leadImportMapping.create({
        data: { ...identity, assignedToId: sellerId, confirmedById: ownerId },
      });
      await db.leadImportMapping.create({
        data: {
          ...identity,
          key: 'stage2-collision',
          assignedToId: sellerId,
          confirmedById: ownerId,
        },
      });
      const before = {
        users: await db.user.count(),
        leads: await db.lead.count(),
        sources: await db.leadSource.count(),
      };
      await api().get('/crm/import-mappings').expect(401);
      await api().get('/crm/import-mappings').set(auth(vendor)).expect(403);
      const version = {
        ...identity,
        expectedUpdatedAt: rule.updatedAt.toISOString(),
      };
      for (const method of ['patch', 'delete'] as const)
        await api()
          [method]('/crm/import-mappings')
          .set(auth(vendor))
          .send(version)
          .expect(403);
      const listed = await api()
        .get('/crm/import-mappings?q=stage2-alias&pageSize=1')
        .set(auth())
        .expect(200);
      expect((listed.body as { total: number }).total).toBe(1);
      await api()
        .patch('/crm/import-mappings')
        .set(auth())
        .send({ ...version, newKey: ' STAGE2-COLLISION ' })
        .expect(409);
      await api()
        .patch('/crm/import-mappings')
        .set(auth())
        .send({ ...version, assignedToId: randomUUID() })
        .expect(400);
      await api()
        .patch('/crm/import-mappings')
        .set(auth())
        .send({ ...version, sourceId })
        .expect(400);
      const results = await Promise.all(
        [null, sellerId].map((assignedToId) =>
          api()
            .patch('/crm/import-mappings')
            .set(auth())
            .send({ ...version, assignedToId }),
        ),
      );
      expect(results.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      await api()
        .delete('/crm/import-mappings')
        .set(auth())
        .send(version)
        .expect(409);
      let changed = await db.leadImportMapping.findUniqueOrThrow({
        where: { kind_scope_key: identity },
      });
      await api()
        .patch('/crm/import-mappings')
        .set(auth())
        .send({
          ...identity,
          expectedUpdatedAt: changed.updatedAt.toISOString(),
          newKey: ' Stage2 Renamed ',
        })
        .expect(200);
      changed = await db.leadImportMapping.findUniqueOrThrow({
        where: { kind_scope_key: { ...identity, key: 'stage2 renamed' } },
      });
      await api()
        .delete('/crm/import-mappings')
        .set(auth())
        .send({
          ...identity,
          key: changed.key,
          expectedUpdatedAt: changed.updatedAt.toISOString(),
        })
        .expect(200);
      expect(
        await db.leadImportMapping.count({ where: { key: changed.key } }),
      ).toBe(0);
      expect(
        await db.leadImportMappingEvent.count({
          where: {
            actorId: ownerId,
            action: 'DELETE',
            before: { path: ['key'], equals: changed.key },
          },
        }),
      ).toBe(1);
      expect({
        users: await db.user.count(),
        leads: await db.lead.count(),
        sources: await db.leadSource.count(),
      }).toEqual(before);
      // Confirming an upload cannot silently replace a previously saved alias.
      const id = await upload(['alias-conflict@example.test']);
      const current = await preview(id);
      await api()
        .patch(`/crm/lead-imports/${id}`)
        .set(auth())
        .send({
          version: current.version,
          mappings: [
            {
              advisor: 'Asesor Excel',
              aliases: ['stage2-collision'],
              assignedToId: ownerId,
            },
          ],
        })
        .expect(409);
    });
    it('returns scoped, paginated durable provenance after expiry without duplicating the initial appearance', async () => {
      const id = await upload(['stage2-history@example.test']);
      const current = await prepare(id);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
      const done = await preview(id),
        leadId = done.items[0].leadId!;
      const history = await api()
        .get(`/crm/leads/${leadId}/import-appearances?pageSize=1`)
        .set(auth())
        .expect(200);
      const payload = history.body as {
        items: Array<{
          fileName: string;
          sheet: string;
          originalAdvisor: string;
          originalDate: string;
          observations: string;
        }>;
        total: number;
        legacy: unknown;
      };
      expect(payload).toMatchObject({ total: 1, legacy: null });
      expect(payload.items[0]).toMatchObject({
        fileName: 'synthetic.xlsx',
        sheet: 'Fede',
        originalAdvisor: 'Asesor Excel',
        originalDate: '2/8',
        observations: 'Nota sintética',
      });
      await api()
        .get(`/crm/leads/${leadId}/import-appearances`)
        .set(auth(vendor))
        .expect(200);
      const foreign = await db.lead.create({
        data: { name: 'Historia ajena sintética', sourceId },
      });
      await api()
        .get(`/crm/leads/${foreign.id}/import-appearances`)
        .set(auth(vendor))
        .expect(404);
      await api()
        .get(`/crm/leads/${leadId}/import-appearances?pageSize=101`)
        .set(auth())
        .expect(400);
      await db.leadImportBatch.update({
        where: { id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await app.get(LeadImportService).purgeExpired();
      expect(
        (
          (
            await api()
              .get(`/crm/leads/${leadId}/import-appearances`)
              .set(auth())
              .expect(200)
          ).body as { total: number }
        ).total,
      ).toBe(1);
    });
    it('cleans optional contact errors only after explicit review, preserving originals and blocking identity conflicts', async () => {
      const book = new ExcelJS.Workbook(),
        sheet = book.addWorksheet('Fede');
      sheet.addRow(['FECHA', 'NOMBRE', 'TEL', 'HORARIO', 'MAIL']);
      sheet.addRow([
        '5/8',
        'Bulk Alfa',
        '0341 15 234 5688',
        null,
        'invalid-bulk-email',
      ]);
      sheet.addRow([
        '5/8',
        'Bulk Beta',
        'invalid-bulk-phone',
        null,
        'bulk-beta@example.test',
      ]);
      sheet.addRow([
        '5/8',
        'Bulk Gamma',
        { formula: '1+1', result: 2 },
        null,
        'bulk-gamma@example.test',
      ]);
      sheet.addRow([
        '5/8',
        'Conflicto Uno',
        '011 15 2345 6801',
        null,
        'invalid-conflict-email',
      ]);
      sheet.addRow(['5/8', 'Conflicto Dos', '011 15 2345 6801']);
      const bytes = Buffer.from(await book.xlsx.writeBuffer());
      const uploadFile = async () => {
        const response = await api()
          .post('/crm/lead-imports')
          .set(auth())
          .attach('file', bytes, 'synthetic-bulk.xlsx')
          .expect(201);
        const id = (response.body as { id: string }).id;
        await patch(id, { mappings: [{ sheet: 'Fede', sourceId }] });
        return id;
      };
      const id = await uploadFile();
      let current = await preview(id);
      expect(current.summary.cleanupCandidates).toEqual({
        INVALID_EMAIL: 1,
        INVALID_PHONE: 1,
        FORMULA_PHONE: 1,
      });
      await api()
        .patch(`/crm/lead-imports/${id}`)
        .set(auth())
        .send({ version: current.version, bulkCleanup: 'INVALID_EMAIL' })
        .expect(409);
      for (const kind of ['INVALID_EMAIL', 'INVALID_PHONE', 'FORMULA_PHONE']) {
        await patch(id, { bulkCleanup: kind });
        current = await preview(id);
      }
      expect(current.summary).toMatchObject({ pending: 3, review: 2 });
      expect(current.items[0].metadata).toMatchObject({
        reviewedOriginal: { email: 'invalid-bulk-email' },
      });
      expect(current.items[1].metadata).toMatchObject({
        reviewedOriginal: { phone: 'invalid-bulk-phone' },
      });
      expect(current.items[2].metadata).toMatchObject({
        reviewedOriginal: { formulaPhoneOmitted: true },
      });
      expect(current.items[3]).toMatchObject({
        email: 'invalid-conflict-email',
        action: 'REVIEW',
      });
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version, excludePending: true })
        .expect(201);
      current = await preview(id);
      const provenance = await api()
        .get(`/crm/leads/${current.items[0].leadId}/import-appearances`)
        .set(auth())
        .expect(200);
      expect(
        (provenance.body as { items: Array<{ corrections: object }> }).items[0]
          .corrections,
      ).toMatchObject({ email: 'invalid-bulk-email' });
      const repeated = await uploadFile();
      for (const kind of ['INVALID_EMAIL', 'INVALID_PHONE', 'FORMULA_PHONE'])
        await patch(repeated, { bulkCleanup: kind });
      const replay = await preview(repeated);
      expect(replay.items.filter((row) => row.replay)).toHaveLength(3);
      expect(
        await db.leadImportAppearance.count({ where: { batchId: id } }),
      ).toBe(3);
      const ambiguous = await upload(['ambiguous-update@example.test']);
      await prepare(ambiguous);
      await db.lead.create({
        data: {
          name: 'Otra identidad',
          email: 'ambiguous-update@example.test',
          emailKey: 'ambiguous-update@example.test',
          sourceId,
        },
      });
      let ambiguousPreview = await preview(ambiguous);
      await api()
        .patch(
          `/crm/lead-imports/${ambiguous}/rows/${ambiguousPreview.items[0].id}`,
        )
        .set(auth())
        .send({
          version: ambiguousPreview.version,
          reviewToken: ambiguousPreview.reviewToken,
          decision: 'INCLUDE',
          acknowledgeDuplicates: true,
        })
        .expect(200);
      ambiguousPreview = await preview(ambiguous);
      expect(ambiguousPreview.items[0]).toMatchObject({
        action: 'REVIEW',
        selected: false,
      });
      await api()
        .post(`/crm/lead-imports/${ambiguous}/confirm`)
        .set(auth())
        .send({ version: ambiguousPreview.version })
        .expect(400);
    });
    it('requires explicit exclusion, imports valid rows and filters exceptions on the server', async () => {
      const id = await upload(['exclude-valid@example.test', 'invalid']);
      let current = await prepare(id);
      const exceptions = await api()
        .get(`/crm/lead-imports/${id}?filter=REVIEW`)
        .set(auth())
        .expect(200);
      expect((exceptions.body as Preview).rowTotal).toBe(1);
      expect((exceptions.body as Preview).items[0]).toMatchObject({
        action: 'REVIEW',
        selected: false,
      });
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(400);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version, excludePending: true })
        .expect(201);
      current = await preview(id);
      expect(current.summary.imported).toBe(1);
      expect(
        await db.leadImportBatch.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({ excluded: 1, omitted: 1 });
    });
    it('runs both maintenance jobs while idle without acquiring the commercial lock', async () => {
      // Drain leftovers first; no real-world records are used in this disposable schema.
      await db.user.update({
        where: { id: sellerId },
        data: { receivesLeads: true },
      });
      const { CrmService } = await import('../src/crm/crm.service.js');
      const crm = app.get(CrmService);
      while (await crm.distributePending()) {
        /* bounded batches */
      }
      await app.get(LeadImportService).purgeExpired();
      const release: { value?: () => void } = {};
      let locked!: () => void;
      const acquired = new Promise<void>((resolve) => {
        locked = resolve;
      });
      const held = db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM assignment_state WHERE id=1 FOR UPDATE`;
          locked();
          await new Promise<void>((resolve) => {
            release.value = resolve;
          });
        },
        { timeout: 30000 },
      );
      await acquired;
      try {
        await expect(
          Promise.race([
            Promise.all([
              crm.distributePending(),
              app.get(LeadImportService).purgeExpired(),
            ]),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error('Idle job waited on commercial lock')),
                1500,
              ),
            ),
          ]),
        ).resolves.toBeDefined();
        const deferred = await db.lead.create({
          data: {
            name: 'Synthetic deferred assignment',
            email: 'deferred-job@example.test',
            sourceId,
          },
        });
        const expired = await db.leadImportBatch.create({
          data: {
            ownerId,
            fileName: 'synthetic-expired.xlsx',
            sheets: [],
            warnings: [],
            total: 0,
            expiresAt: new Date(Date.now() - 1000),
          },
        });
        await expect(crm.distributePending()).resolves.toBe(0);
        await app.get(LeadImportService).purgeExpired();
        expect(
          (await db.lead.findUniqueOrThrow({ where: { id: deferred.id } }))
            .assignedToId,
        ).toBeNull();
        expect(
          (
            await db.leadImportBatch.findUniqueOrThrow({
              where: { id: expired.id },
            })
          ).status,
        ).toBe('REVIEW');
        // Exact old control flow: both idle jobs entered the shared write lock
        // before checking for work, exhausting the 15s transaction deadline.
        const unlock = setTimeout(() => release.value!(), 16000);
        const legacyPaths = await Promise.allSettled([
          crm.write((tx) =>
            tx.lead.findMany({ where: { assignedToId: null }, take: 50 }),
          ),
          crm.write((tx) =>
            tx.leadImportBatch.findMany({
              where: { expiresAt: { lte: new Date() } },
              take: 100,
            }),
          ),
        ]);
        clearTimeout(unlock);
        for (const result of legacyPaths) {
          expect(result.status).toBe('rejected');
          if (result.status === 'rejected')
            expect((result.reason as { code: string }).code).toBe('P2028');
        }
      } finally {
        release.value!();
        await held;
      }
      await expect(crm.distributePending()).resolves.toBeGreaterThan(0);
      await app.get(LeadImportService).purgeExpired();
      expect(
        await db.leadImportBatch.count({
          where: { fileName: 'synthetic-expired.xlsx', status: 'REVIEW' },
        }),
      ).toBe(0);
    }, 25000);
    it('rehearses scoped test cleanup and recovery while preserving all users, sources and unrelated leads', async () => {
      const maintenance = createRequire(__filename)(
        '../../scripts/reset-test-imports.cjs',
      ) as {
        snapshot: (
          tx: import('@prisma/client').Prisma.TransactionClient,
          ids: string[],
        ) => Promise<{ leads: Array<{ id: string }> }>;
        remove: (
          tx: import('@prisma/client').Prisma.TransactionClient,
          backup: unknown,
        ) => Promise<void>;
        restore: (
          tx: import('@prisma/client').Prisma.TransactionClient,
          backup: unknown,
        ) => Promise<void>;
        assertEnvironment: (url: string, mode: string) => unknown;
      };
      expect(() =>
        maintenance.assertEnvironment(
          'postgresql://user@remote.invalid/db',
          'production',
        ),
      ).toThrow();
      const id = await upload(['cleanup-only@example.test']);
      const current = await prepare(id);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
      const counts = {
        users: await db.user.count(),
        sources: await db.leadSource.count(),
        leads: await db.lead.count(),
        mappings: await db.leadImportMapping.count(),
      };
      const backup = await db.$transaction((tx) =>
        maintenance.snapshot(tx, [id]),
      );
      expect(backup.leads).toHaveLength(1);
      const marker = new Error('rehearsal rollback');
      await expect(
        db.$transaction(async (tx) => {
          await maintenance.remove(tx, backup);
          expect(await tx.lead.count()).toBe(counts.leads - 1);
          await maintenance.restore(tx, backup);
          expect(
            await tx.lead.findUnique({ where: { id: backup.leads[0].id } }),
          ).not.toBeNull();
          throw marker;
        }),
      ).rejects.toBe(marker);
      expect({
        users: await db.user.count(),
        sources: await db.leadSource.count(),
        leads: await db.lead.count(),
        mappings: await db.leadImportMapping.count(),
      }).toEqual(counts);
      await db.leadNote.create({
        data: {
          leadId: backup.leads[0].id,
          authorId: ownerId,
          text: 'Synthetic subsequent work',
        },
      });
      await expect(
        db.$transaction((tx) => maintenance.snapshot(tx, [id])),
      ).rejects.toThrow('subsequent activity');
    });
    it('purges expired review data while retaining counters and imported lead metadata', async () => {
      const id = await upload(['expire@example.test']);
      const current = await prepare(id);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
      const leadId = (await preview(id)).items[0].leadId!;
      await db.leadImportBatch.update({
        where: { id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await app.get(LeadImportService).purgeExpired();
      expect(await db.leadImportRow.count({ where: { batchId: id } })).toBe(0);
      expect(
        await db.leadImportBatch.findUniqueOrThrow({ where: { id } }),
      ).toMatchObject({ status: 'EXPIRED', imported: 1, fileName: '' });
      expect(
        (await db.lead.findUniqueOrThrow({ where: { id: leadId } })).importData,
      ).toMatchObject({ batchId: id });
      await api().get(`/crm/lead-imports/${id}`).set(auth()).expect(409);
    });
  },
);
