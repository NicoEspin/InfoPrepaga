import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
          `Contacto ${i}`,
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
    it('backfills legacy keys, omits external duplicates, recalculates internal selections and preserves metadata', async () => {
      const existing = await db.lead.create({
        data: {
          name: 'Existente',
          email: ' LEGACY@EXAMPLE.TEST ',
          phone: '011 15 2345 6789',
          sourceId,
          contactKeysVersion: 0,
        },
      });
      const id = await upload([
        'legacy@example.test',
        'repeat@example.test',
        'REPEAT@example.test',
        'unique@example.test',
      ]);
      let current = await prepare(id);
      expect(
        (await db.lead.findUniqueOrThrow({ where: { id: existing.id } }))
          .phoneKey,
      ).toBe('+5491123456789');
      expect(current.items[0]).toMatchObject({
        selected: false,
        duplicate: true,
      });
      expect(current.items[1].selected).toBe(true);
      expect(current.items[2].selected).toBe(false);
      await api()
        .patch(`/crm/lead-imports/${id}/rows/${current.items[1].id}`)
        .set(auth())
        .send({ version: current.version, decision: 'OMIT' })
        .expect(200);
      current = await preview(id);
      expect(current.items[2].selected).toBe(true);
      await patch(id, { duplicates: 'INCLUDE' });
      current = await preview(id);
      await api()
        .post(`/crm/lead-imports/${id}/confirm`)
        .set(auth())
        .send({ version: current.version })
        .expect(201);
      const finished = await preview(id);
      expect(finished.status).toBe('COMPLETE');
      expect(finished.summary.imported).toBe(4);
      const lead = await db.lead.findUniqueOrThrow({
        where: { id: finished.items[0].leadId! },
      });
      expect(lead.assignedToId).toBe(sellerId);
      expect(lead.status).toBe('NEW');
      expect(lead.email).toBe('legacy@example.test');
      expect(lead.importData).toMatchObject({
        originalDate: '2/8',
        originalAdvisor: 'Asesor Excel',
        schedule: 'Tarde',
        segment: 'Grupo',
        sheet: 'Fede',
      });
      expect(await db.commercialTask.count()).toBe(0);
      const profile = await api()
        .get(`/crm/leads/${lead.id}`)
        .set(auth(vendor))
        .expect(200);
      expect((profile.body as { importData: object }).importData).toEqual(
        lead.importData,
      );
      const otherLead = finished.items.find(
        (row) => row.leadId && row.leadId !== lead.id,
      )!;
      await api()
        .get(`/crm/leads/${otherLead.leadId}`)
        .set(auth(vendor))
        .expect(404);
    });
    it('requires review for new matches and rejects acknowledgements based on an old preview', async () => {
      const id = await upload(['race@example.test']);
      let current = await prepare(id);
      await api()
        .post('/crm/leads')
        .set(auth())
        .send({
          name: 'Alta concurrente',
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
      expect(current.summary).toMatchObject({ pending: 2, duplicates: 2 });
      expect(current.items[1].duplicate).toBe(false);
      await patch(id, { sheets: ['folletos'] });
      current = await preview(id);
      expect(current.summary).toMatchObject({ pending: 1, duplicates: 0 });
      await patch(id, { sheets: ['Fede', 'folletos'] });
      current = await preview(id);
      expect(current.summary.pending).toBe(2);
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
