import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
const prisma = new PrismaClient();
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (Boolean(email) !== Boolean(password))
    throw new Error('Provide both bootstrap variables');
  if (
    password &&
    (Buffer.byteLength(password, 'utf8') > 72 || password.length < 12)
  ) {
    throw new Error('Use at least 12 characters and at most 72 UTF-8 bytes');
  }
  const hash = password ? await bcrypt.hash(password, 12) : undefined;
  await prisma.$transaction(async (tx) => {
    const unexpected = await tx.role.count({
      where: { name: { notIn: ['ADMIN', 'VENDEDOR'] } },
    });
    if (unexpected)
      throw new Error('Legacy roles found; review an explicit data migration');
    const admin = await tx.role.upsert({
      where: { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN' },
    });
    await tx.role.upsert({
      where: { name: 'VENDEDOR' },
      update: {},
      create: { name: 'VENDEDOR' },
    });
    for (const resource of ['users', 'roles', 'permissions']) {
      for (const action of ['read', 'manage']) {
        const permission = await tx.permission.upsert({
          where: { action_resource: { action, resource } },
          update: {},
          create: { action, resource },
        });
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: admin.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: { roleId: admin.id, permissionId: permission.id },
        });
      }
    }
    if (email && hash) {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing)
        throw new Error('Account exists; seed never resets accounts');
      await tx.user.create({
        data: {
          email,
          password: hash,
          roles: { create: { roleId: admin.id } },
        },
      });
    }
  });
  console.log('Seed completed without resetting existing accounts');
}
main()
  .catch(() => {
    console.error(
      'Seed failed. Check role compatibility and bootstrap configuration.',
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
