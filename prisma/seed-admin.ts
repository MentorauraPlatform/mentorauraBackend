import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.INITIAL_ADMIN_EMAIL || 'admins@mentoraura.com';
  const rawPassword = process.env.INITIAL_ADMIN_PASSWORD || 'Admin123!';
  const fullName = process.env.INITIAL_ADMIN_NAME || 'Super Administrator';
  const passwordHash = await bcrypt.hash(rawPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isEmailVerified: true,
    },
    create: {
      email,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      isEmailVerified: true,
    },
  });

  await prisma.menteeProfile.upsert({
    where: { userId: admin.id },
    update: { fullName },
    create: {
      userId: admin.id,
      fullName,
    },
  });

  console.log(`[SeedAdmin] Super Admin user ready: ${admin.email} (ID: ${admin.id}, Name: ${fullName})`);
}

main()
  .catch((e) => {
    console.error('[SeedAdmin] Error seeding admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
