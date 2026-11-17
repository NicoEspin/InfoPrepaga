import { CommercialStage, LeadStatus, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Workbook } from 'exceljs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const adminId = '2a3ae490-5739-4adc-9184-adf060c4add2';
const demoPassword = 'InfoPrepaga-Demo-2026!';
const firstEmail = 'contacto01@example.test';

export function assertDemoTarget() {
  const connection = new URL(
    process.env.DATABASE_URL ?? 'postgresql://invalid',
  );
  if (
    process.env.NODE_ENV !== 'development' ||
    !['localhost', '127.0.0.1', '[::1]'].includes(connection.hostname) ||
    connection.pathname !== '/infoprepaga_demo'
  ) {
    throw new Error(
      'Demo requires NODE_ENV=development and a loopback database named infoprepaga_demo',
    );
  }
}

export async function seedDemo(
  tx: Prisma.TransactionClient,
  adminRole: string,
  sellerRole: string,
) {
  // Serialize with the same row used by CRM writes. Keep the marker and all
  // fixtures in one transaction so a failed run can be retried.
  await tx.$queryRaw`SELECT id FROM assignment_state WHERE id = 1 FOR UPDATE`;
  const previous = await tx.user.findUnique({ where: { id: adminId } });
  if (previous?.email === 'admin.demo@example.test') return;
  if ((await tx.user.count()) || (await tx.lead.count())) {
    throw new Error('The first demo seed requires an empty migrated database');
  }

  const password = await bcrypt.hash(demoPassword, 12);
  const admin = await tx.user.create({
    data: {
      id: adminId,
      email: 'admin.demo@example.test',
      firstName: 'Administración',
      lastName: 'Demo',
      password,
      roles: { create: { roleId: adminRole } },
    },
  });
  const activeSellers = [];
  for (const [firstName, receivesLeads, isActive] of [
    ['Abril', true, true],
    ['Bruno', true, true],
    ['Clara', false, true],
    ['Diego', false, false],
  ] as const) {
    const seller = await tx.user.create({
      data: {
        firstName,
        lastName: 'Demo',
        email: `${firstName.toLowerCase()}.demo@example.test`,
        password,
        receivesLeads,
        isActive,
        roles: { create: { roleId: sellerRole } },
      },
    });
    if (isActive) activeSellers.push(seller);
    await tx.accountAudit.create({
      data: {
        actorId: admin.id,
        targetId: seller.id,
        kind: 'created',
        detail: { role: 'VENDEDOR' },
      },
    });
  }

  const sources = await tx.leadSource.findMany({
    where: { code: { in: ['LANDING_IP', 'WHATSAPP_CM', 'META_1'] } },
    orderBy: { code: 'asc' },
  });
  sources.push(
    await tx.leadSource.create({
      data: { code: 'BASE_DEMO', name: 'Base demo Excel', isBase: true },
    }),
  );
  const now = Date.now();
  const date = (days: number) => new Date(now + days * 86_400_000);
  const stages = Object.values(CommercialStage);
  const statuses = Object.values(LeadStatus);

  // Enough active rows for pagination, plus both non-commercial portfolios.
  for (let index = 0; index < 36; index++) {
    const portfolioClass =
      index < 30 ? 'ACTIVE' : index < 33 ? 'HISTORICAL' : 'UNCLASSIFIED';
    const historical = index >= 28;
    const owner =
      portfolioClass === 'ACTIVE'
        ? activeSellers[index % activeSellers.length]
        : undefined;
    const source = sources[index % sources.length];
    const stage =
      portfolioClass === 'ACTIVE' ? stages[index % stages.length] : 'NEW';
    const createdAt = date(-24 + (index % 19));
    const updatedAt = date(-4);
    const name = `Contacto demo ${String(index + 1).padStart(2, '0')}`;
    const email =
      index === 0 ? firstEmail : `contacto${index + 1}@example.test`;
    const lead = await tx.lead.create({
      data: {
        name,
        email,
        emailKey: email,
        company: index % 2 === 0 ? 'Empresa ficticia' : null,
        sourceId: source.id,
        entrySourceId: source.id,
        assignedToId: owner?.id,
        portfolioClass,
        intakeMode: historical ? 'HISTORICAL' : 'NEW',
        autoAssignmentEligible: !historical,
        originDate: historical ? date(-180) : null,
        declaredLastManagedAt: historical ? date(-90) : null,
        commercialStage: stage,
        commercialStartedAt: createdAt,
        status: statuses[index % statuses.length],
        version: stage === 'NEW' ? 1 : 2,
        createdAt,
        updatedAt,
        activities: {
          create: [
            {
              actorId: admin.id,
              kind: 'registered',
              detail: { sourceId: source.id },
              createdAt,
            },
            ...(owner
              ? [
                  {
                    actorId: admin.id,
                    kind: 'assigned',
                    detail: { assignedToId: owner.id, automatic: false },
                    createdAt,
                  },
                ]
              : []),
          ],
        },
      },
    });
    if (stage !== 'NEW') {
      const movement = await tx.commercialMovement.create({
        data: {
          leadId: lead.id,
          from: 'NEW',
          to: stage,
          effectiveAt: updatedAt,
          responsibleId: owner?.id,
          sourceId: source.id,
          actorId: admin.id,
          leadVersion: lead.version,
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          actorId: admin.id,
          kind: 'commercial-stage',
          createdAt: updatedAt,
          detail: {
            movementId: movement.id,
            from: movement.from,
            to: movement.to,
            responsibleId: movement.responsibleId,
            sourceId: source.id,
            effectiveAt: updatedAt.toISOString(),
          },
        },
      });
    }
    if (owner && index < 12) {
      const note = await tx.leadNote.create({
        data: {
          leadId: lead.id,
          authorId: owner.id,
          text: 'Nota de prueba para revisar el historial del contacto.',
          createdAt: updatedAt,
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          actorId: owner.id,
          kind: 'note',
          detail: { noteId: note.id, text: note.text },
          createdAt: updatedAt,
        },
      });
      const slot = Math.floor(index / activeSellers.length) % 3;
      const task = await tx.commercialTask.create({
        data: {
          leadId: lead.id,
          ownerId: owner.id,
          createdById: admin.id,
          contact: name,
          title: [
            'Revisar cotización',
            'Agendar llamada',
            'Preparar propuesta',
          ][slot],
          priority: (['HIGH', 'MEDIUM', 'LOW'] as const)[slot],
          duration: [30, 60, 90][slot],
          dueAt: date(slot - 1),
          completedAt: index >= 9 ? date(-1) : null,
          version: index >= 9 ? 2 : 1,
          createdAt: updatedAt,
        },
      });
      await tx.leadActivity.create({
        data: {
          leadId: lead.id,
          actorId: admin.id,
          kind: 'scheduled',
          detail: { taskId: task.id, title: task.title },
          createdAt: updatedAt,
        },
      });
      if (task.completedAt) {
        await tx.leadActivity.create({
          data: {
            leadId: lead.id,
            actorId: owner.id,
            kind: 'task-completed',
            detail: { taskId: task.id },
            createdAt: task.completedAt,
          },
        });
      }
    }
  }
  await tx.commercialTask.create({
    data: {
      ownerId: admin.id,
      createdById: admin.id,
      contact: 'Equipo demo',
      title: 'Revisar pendientes de la semana',
      dueAt: date(0),
    },
  });
}

export async function writeDemoWorkbook() {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('PIPA');
  sheet.addRows([
    [
      'Fecha',
      'Nombre',
      'Teléfono',
      'Horario',
      'Email',
      'Régimen',
      'Asesor',
      'Observaciones',
      'Gestion_actual',
      'Responsable_actual',
      'Ultima_gestion',
    ],
    [
      '2025-01-10',
      'Contacto demo 01',
      '',
      '',
      firstEmail,
      '',
      'Abril Demo',
      'Coincidencia con la seed',
      'SI',
      'Abril Demo',
      '2025-01-20',
    ],
    [
      '2025-01-11',
      'Alta Excel demo',
      '',
      '',
      'alta.excel@example.test',
      '',
      'Bruno Demo',
      'Alta nueva o cartera activa',
      'SI',
      'Bruno Demo',
      '2025-01-20',
    ],
    [
      '2025-01-11',
      'Alta Excel demo',
      '',
      '',
      'alta.excel@example.test',
      '',
      'Bruno Demo',
      'Segunda aparición compatible',
      'SI',
      'Bruno Demo',
      '2025-01-21',
    ],
    [
      '2025-01-12',
      'Archivo Excel demo',
      '',
      '',
      'archivo.excel@example.test',
      '',
      'Abril Demo',
      'Contacto histórico',
      'NO',
    ],
    [
      '2025-01-13',
      'Pendiente Excel demo',
      '',
      '',
      'pendiente.excel@example.test',
      '',
      '',
      'Clasificación pendiente',
      'REVISAR',
    ],
    [
      '2025-01-14',
      'Excepción Excel demo',
      '123',
      '',
      'excepcion.excel@example.test',
      '',
      'Alias desconocido',
      'Corregir teléfono o quitarlo',
    ],
  ]);
  const path = join(
    await mkdtemp(join(tmpdir(), 'infoprepaga-excel-')),
    'leads-demo.xlsx',
  );
  await workbook.xlsx.writeFile(path);
  return path;
}
