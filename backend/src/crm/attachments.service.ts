import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { PrismaService } from '../prisma/prisma.service';
import { leadScope } from './access';
import { PageDto } from './crm.dto';
import { RenameAttachmentDto } from './attachments.dto';
import { R2Service } from './r2.service';

export type AttachmentFile = {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
};
const select = {
  id: true,
  leadId: true,
  name: true,
  contentType: true,
  size: true,
  state: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;
type Tx = Prisma.TransactionClient;

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly r2: R2Service,
  ) {}

  private write<T>(action: (tx: Tx) => Promise<T>) {
    return this.prisma.$transaction(
      async (tx) => {
        // Same lock as CRM reassignment: ownership cannot change during a write.
        const rows = await tx.$queryRaw<
          { id: number }[]
        >`SELECT id FROM assignment_state WHERE id = 1 FOR UPDATE`;
        if (rows.length !== 1)
          throw new Error('Missing commercial migration lock row');
        return action(tx);
      },
      { maxWait: 10000, timeout: 15000 },
    );
  }
  private async visible(tx: Tx, leadId: string, actor: AuthenticatedUser) {
    if (
      !(await tx.lead.findFirst({
        where: { AND: [{ id: leadId }, leadScope(actor)] },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Lead no encontrado');
  }
  private async attachment(
    tx: Tx,
    leadId: string,
    id: string,
    actor: AuthenticatedUser,
  ) {
    await this.visible(tx, leadId, actor);
    const item = await tx.leadAttachment.findFirst({
      where: { id, leadId, lead: leadScope(actor) },
    });
    if (!item) throw new NotFoundException('Adjunto no encontrado');
    return item;
  }
  private audit(
    tx: Tx,
    leadId: string,
    actor: AuthenticatedUser,
    kind: string,
    id: string,
  ) {
    return tx.leadActivity.create({
      data: { leadId, actorId: actor.id, kind, detail: { attachmentId: id } },
    });
  }
  async list(leadId: string, query: PageDto, actor: AuthenticatedUser) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.visible(tx, leadId, actor);
        const where = { leadId, lead: leadScope(actor) };
        const [items, total] = await Promise.all([
          tx.leadAttachment.findMany({
            where,
            select,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            skip: (query.page - 1) * query.pageSize,
            take: query.pageSize,
          }),
          tx.leadAttachment.count({ where }),
        ]);
        return { items, total, page: query.page, pageSize: query.pageSize };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  async upload(
    leadId: string,
    file: AttachmentFile | undefined,
    actor: AuthenticatedUser,
  ) {
    if (
      !file ||
      !file.size ||
      file.size > 10 * 1024 * 1024 ||
      file.buffer.length !== file.size
    )
      throw new BadRequestException('Seleccioná un archivo de hasta 10 MB');
    const name = file.originalname.trim();
    if (!name || name.length > 180 || /[\p{Cc}/\\]/u.test(name))
      throw new BadRequestException('Nombre de archivo inválido');
    // Detect supported formats from bytes rather than trusting browser MIME metadata.
    const bytes = file.buffer;
    const contentType =
      bytes.subarray(0, 5).toString() === '%PDF-'
        ? 'application/pdf'
        : bytes
              .subarray(0, 8)
              .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          ? 'image/png'
          : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            ? 'image/jpeg'
            : null;
    if (!contentType)
      throw new BadRequestException('Solo se admiten archivos PDF, PNG y JPEG');
    const id = randomUUID();
    const item = await this.write(async (tx) => {
      await this.visible(tx, leadId, actor);
      this.r2.assertConfigured();
      // Persist the key before R2: even an interrupted upload remains discoverable for deletion.
      return tx.leadAttachment.create({
        data: {
          id,
          leadId,
          objectKey: `leads/${leadId}/${id}`,
          name,
          contentType,
          size: file.size,
        },
      });
    });
    return this.write(async (tx) => {
      const current = await this.attachment(tx, leadId, id, actor);
      if (current.state !== 'UPLOADING')
        throw new ConflictException('La carga ya no está disponible');
      await this.r2.put(item.objectKey, file.buffer, contentType);
      const result = await tx.leadAttachment.update({
        where: { id },
        data: { state: 'READY' },
        select,
      });
      await this.audit(tx, leadId, actor, 'attachment-uploaded', id);
      return result;
    });
  }
  rename(
    leadId: string,
    id: string,
    dto: RenameAttachmentDto,
    actor: AuthenticatedUser,
  ) {
    return this.write(async (tx) => {
      const item = await this.attachment(tx, leadId, id, actor);
      if (item.state !== 'READY' || item.version !== dto.version)
        throw new ConflictException('El adjunto cambió. Actualizá la vista.');
      const result = await tx.leadAttachment.update({
        where: { id },
        data: { name: dto.name, version: { increment: 1 } },
        select,
      });
      await this.audit(tx, leadId, actor, 'attachment-renamed', id);
      return result;
    });
  }
  download(leadId: string, id: string, actor: AuthenticatedUser) {
    return this.write(async (tx) => {
      const item = await this.attachment(tx, leadId, id, actor);
      if (item.state !== 'READY')
        throw new ConflictException('El archivo no está disponible');
      const result = await this.r2.download(item.objectKey, item.name);
      await this.audit(tx, leadId, actor, 'attachment-downloaded', id);
      return result;
    });
  }
  async remove(leadId: string, id: string, actor: AuthenticatedUser) {
    await this.write(async (tx) => {
      await this.attachment(tx, leadId, id, actor);
      await tx.leadAttachment.update({
        where: { id },
        data: { state: 'DELETING' },
      });
    });
    return this.write(async (tx) => {
      const item = await this.attachment(tx, leadId, id, actor);
      // R2 delete is idempotent; retain DELETING on failure for safe retry after restart.
      await this.r2.remove(item.objectKey);
      await tx.leadAttachment.delete({ where: { id } });
      await this.audit(tx, leadId, actor, 'attachment-deleted', id);
      return { deleted: true };
    });
  }
}
