import { ApiResponse, type ApiResponseSchemaHost } from '@nestjs/swagger';
type Schema = ApiResponseSchemaHost['schema'];
const str: Schema = { type: 'string' },
  uuid: Schema = { type: 'string', format: 'uuid' },
  date: Schema = { type: 'string', format: 'date-time' },
  bool: Schema = { type: 'boolean' };
const nullable = (schema: Schema): Schema => ({ ...schema, nullable: true });
const object = (properties: Record<string, Schema>): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});
const person = object({
  id: uuid,
  email: str,
  firstName: nullable(str),
  lastName: nullable(str),
});
const fields = {
  kind: { type: 'string', enum: ['ORIGIN', 'ADVISOR', 'DEFAULT'] } as Schema,
  scope: str,
  key: str,
  sourceId: nullable(uuid),
  assignedToId: nullable(uuid),
  confirmedById: uuid,
  updatedAt: date,
};
const row = object({
  ...fields,
  source: nullable(object({ id: uuid, name: str, isActive: bool })),
  assignedTo: nullable(
    object({
      id: uuid,
      email: str,
      firstName: nullable(str),
      lastName: nullable(str),
      isActive: bool,
      deletedAt: nullable(date),
    }),
  ),
  confirmedBy: person,
});
const schemas = {
  list: object({
    items: { type: 'array', items: row },
    total: { type: 'integer' },
    page: { type: 'integer' },
    pageSize: { type: 'integer' },
  }),
  changed: object(fields),
  removed: object({ ok: bool }),
};
export const MappingResponse = (kind: keyof typeof schemas) =>
  ApiResponse({ status: 200, schema: schemas[kind] });
