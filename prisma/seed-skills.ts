import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_SKILLS = [
  'JavaScript',
  'TypeScript',
  'Python',
  'React',
  'Node.js',
  'Next.js',
  'System Design',
  'Career Growth',
  'Leadership',
  'Communication',
  'Data Science',
  'Machine Learning',
  'DevOps',
  'AWS',
  'PostgreSQL',
];

async function main() {
  for (const name of DEFAULT_SKILLS) {
    await prisma.skill.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log('Skills seeded');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
