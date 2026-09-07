import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');
  
  // TODO: Add reference data:
  // - Boards and levels
  // - Subjects
  // - Platform settings (video completion threshold, etc.)
  // - A first admin user

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
