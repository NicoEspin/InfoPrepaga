import { ApiResponse } from '@nestjs/swagger';
import type { ApiResponseSchemaHost } from '@nestjs/swagger';
type S = ApiResponseSchemaHost['schema'];
const str: S = { type: 'string' },
  int: S = { type: 'integer' },
  bool: S = { type: 'boolean' },
  date: S = { type: 'string', format: 'date-time' },
  uuid: S = { type: 'string', format: 'uuid' };
const obj = (properties: Record<string, S>): S => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
});
const arr = (items: S): S => ({ type: 'array', items });
const nullable = (s: S): S => ({ ...s, nullable: true });
const metric = obj({
  entered: int,
  periodClosures: int,
  cohortClosures: int,
  conversion: nullable(str),
  stages: { type: 'object', additionalProperties: { type: 'integer' } },
  investment: nullable(str),
  investmentPartial: bool,
  cpl: nullable(str),
  cpc: nullable(str),
});
const group = obj({ id: nullable(str), name: str, metrics: metric });
const source = obj({ id: uuid, name: str, isActive: bool });
const person = obj({ id: nullable(str), name: str, isActive: bool });
const snapshot = obj({
  calculationVersion: int,
  name: str,
  generatedAt: date,
  author: obj({ id: uuid, name: str }),
  from: str,
  to: str,
  timezone: str,
  cutoff: date,
  partial: bool,
  allResponsibles: bool,
  sources: arr(
    obj({ id: uuid, name: str, isActive: bool, investment: nullable(str) }),
  ),
  responsibles: arr(person),
  summary: metric,
  bySource: arr(group),
  byResponsible: arr(group),
  warnings: arr(str),
});
const report = obj({
  id: uuid,
  name: str,
  authorId: uuid,
  generatedAt: date,
  operationKey: uuid,
  requestHash: str,
  snapshot,
});
const schemas = {
  snapshot,
  report,
  catalogs: obj({ sources: arr(source), responsibles: arr(person) }),
  list: obj({
    items: arr(obj({ id: uuid, name: str, authorId: uuid, generatedAt: date })),
    total: int,
    page: int,
    pageSize: int,
  }),
};
export const ReportResponse = (type: keyof typeof schemas, status = 200) =>
  ApiResponse({ status, schema: schemas[type] });
