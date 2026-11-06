import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import type { ApiResponseSchemaHost } from '@nestjs/swagger';
type SchemaObject = ApiResponseSchemaHost['schema'];
import { LeadStatus, TaskPriority } from '@prisma/client';

const str: SchemaObject = { type: 'string' };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const date: SchemaObject = { type: 'string', format: 'date-time' };
const bool: SchemaObject = { type: 'boolean' };
const int: SchemaObject = { type: 'integer' };
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const identity = object({
  id: uuid,
  firstName: nullable(str),
  lastName: nullable(str),
  email: str,
});
const source = object({
  id: uuid,
  code: str,
  name: str,
  isBase: bool,
  isActive: bool,
  createdAt: date,
});
const leadProperties = {
  id: uuid,
  name: str,
  email: nullable(str),
  phone: nullable(str),
  company: nullable(str),
  observations: str,
  status: { type: 'string', enum: Object.values(LeadStatus) } as SchemaObject,
  sourceId: uuid,
  source,
  assignedToId: nullable(uuid),
  assignedTo: nullable(identity),
  version: int,
  createdAt: date,
  updatedAt: date,
};
const task = object({
  id: uuid,
  leadId: nullable(uuid),
  ownerId: uuid,
  createdById: nullable(uuid),
  contact: str,
  title: str,
  priority: { type: 'string', enum: Object.values(TaskPriority) },
  dueAt: date,
  duration: int,
  completedAt: nullable(date),
  version: int,
  createdAt: date,
  updatedAt: date,
  lead: nullable(object({ id: uuid, name: str, assignedToId: nullable(uuid) })),
  owner: identity,
});
const schemas = {
  appearances: object({
    items: array(
      object({
        id: uuid,
        fileName: str,
        batchId: uuid,
        sheet: str,
        rowNumber: int,
        source: object({ id: uuid, name: str, isActive: bool }),
        originalAdvisor: str,
        corrections: nullable(
          object({
            email: nullable(str),
            phone: nullable(str),
            formulaPhoneOmitted: bool,
          }),
        ),
        observations: str,
        originalDate: str,
        group: str,
        createdAt: date,
      }),
    ),
    total: int,
    page: int,
    pageSize: int,
    legacy: nullable({ type: 'object', additionalProperties: true }),
  }),
  source,
  lead: object(leadProperties),
  task,
  profile: object({
    ...leadProperties,
    importData: nullable({ type: 'object', additionalProperties: true }),
    nextActivity: nullable(task),
  }),
  activity: object({
    id: uuid,
    leadId: uuid,
    actorId: nullable(uuid),
    actor: nullable(identity),
    kind: str,
    detail: { type: 'object', additionalProperties: true },
    createdAt: date,
  }),
  note: object({
    id: uuid,
    leadId: uuid,
    authorId: uuid,
    text: str,
    createdAt: date,
  }),
  catalogs: object({
    statuses: array(
      object({
        id: { type: 'string', enum: Object.values(LeadStatus) },
        name: str,
      }),
    ),
    sources: array(source),
  }),
  users: array(
    object({
      ...(identity.properties as Record<string, SchemaObject>),
      isActive: bool,
      receivesLeads: bool,
      roles: array(
        object({
          role: object({
            name: { type: 'string', enum: ['ADMIN', 'VENDEDOR'] },
          }),
        }),
      ),
    }),
  ),
  settings: object({ id: uuid, isActive: bool, receivesLeads: bool }),
};
export function CrmResponse(
  kind: keyof typeof schemas,
  paged = false,
  status = 200,
) {
  const schema = paged
    ? object({
        items: array(schemas[kind]),
        total: int,
        page: int,
        pageSize: int,
        ...(kind === 'task'
          ? { counts: object({ pending: int, completed: int }) }
          : {}),
      })
    : schemas[kind];
  return applyDecorators(
    ApiResponse({ status, schema }),
    ...[400, 401, 403, 404, 409, 429].map((code) =>
      ApiResponse({
        status: code,
        description: {
          400: 'Entrada inválida',
          401: 'Sesión inválida',
          403: 'Acceso restringido',
          404: 'Registro no encontrado o fuera de alcance',
          409: 'Conflicto; actualizar antes de reintentar',
          429: 'Límite de solicitudes',
        }[code],
      }),
    ),
  );
}
