import 'dotenv/config';
import { PrismaClient, Role, UserStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Start seeding...');

  // ─────────────────────────────────────────────────────────────
  // 1. Boards
  const boardsToCreate = [
    { name: 'Cambridge', code: 'CAM' },
    { name: 'Edexcel', code: 'EDX' }
  ];
  
  const createdBoards: Record<string, any> = {};

  for (const boardData of boardsToCreate) {
    let board = await prisma.board.findFirst({ where: { name: boardData.name } });
    if (!board) {
      board = await prisma.board.create({
        data: {
          name: boardData.name,
          code: boardData.code,
          isActive: true,
        }
      });
      console.log(`  - Created Board: ${boardData.name}`);
    } else {
      console.log(`  - Board exists: ${boardData.name}`);
    }
    createdBoards[boardData.name] = board;
  }

  // 2. Levels per board
  const levelsToCreate = [
    { boardName: 'Cambridge', name: 'IGCSE', orderIndex: 1 },
    { boardName: 'Cambridge', name: 'O Level', orderIndex: 2 },
    { boardName: 'Cambridge', name: 'A Level', orderIndex: 3 },
    { boardName: 'Edexcel', name: 'IGCSE', orderIndex: 1 },
    { boardName: 'Edexcel', name: 'A Level', orderIndex: 2 },
  ];

  for (const levelData of levelsToCreate) {
    const board = createdBoards[levelData.boardName];
    const existingLevel = await prisma.level.findFirst({
      where: { boardId: board.id, name: levelData.name }
    });

    if (!existingLevel) {
      await prisma.level.create({
        data: {
          boardId: board.id,
          name: levelData.name,
          orderIndex: levelData.orderIndex,
          isActive: true,
        }
      });
      console.log(`  - Created Level: ${levelData.name} for ${levelData.boardName}`);
    } else {
      console.log(`  - Level exists: ${levelData.name} for ${levelData.boardName}`);
    }
  }

  // Clean up Edexcel O Level if it was accidentally seeded before
  if (createdBoards['Edexcel']) {
    const deletedOLevel = await prisma.level.deleteMany({
      where: { boardId: createdBoards['Edexcel'].id, name: 'O Level' }
    });
    if (deletedOLevel.count > 0) {
      console.log('  - Cleaned up removed level: O Level for Edexcel');
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Subjects
  // ─────────────────────────────────────────────────────────────
  console.log('Seeding Subjects (with Syllabus Codes)...');
  
  // Clean up any old generic subjects from previous seeds
  await prisma.subject.deleteMany({
    where: {
      name: { in: ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English Language', 'Economics', 'Accounting', 'Business Studies', 'Computer Science'] }
    }
  });

  const subjects = [
    // Cambridge O Level
    'Mathematics (4024)',
    'Physics (5054)',
    'Chemistry (5070)',
    'Biology (5090)',
    'English Language (1123)',
    'Economics (2281)',
    'Accounting (7707)',
    'Business Studies (7115)',
    'Computer Science (2210)',

    // Cambridge IGCSE
    'Mathematics (0580)',
    'Physics (0625)',
    'Chemistry (0620)',
    'Biology (0610)',
    'English Language (0500)',
    'Economics (0455)',
    'Accounting (0452)',
    'Business Studies (0450)',
    'Computer Science (0478)',

    // Cambridge A Level
    'Mathematics (9709)',
    'Physics (9702)',
    'Chemistry (9701)',
    'Biology (9700)',
    'Economics (9708)',
    'Accounting (9706)',
    'Business (9609)',
    'Computer Science (9618)',

    // Edexcel IGCSE
    'Mathematics A (4MA1)',
    'Physics (4PH1)',
    'Chemistry (4CH1)',
    'Biology (4BI1)',
    'English Language A (4EA1)',
    'Economics (4EC1)',
    'Accounting (4AC1)',
    'Business (4BS1)',
    'Computer Science (4CP0)',

    // Edexcel A Level (IAL)
    'Mathematics (YMA01)',
    'Physics (YPH11)',
    'Chemistry (YCH11)',
    'Biology (YBI11)',
    'Economics (YEC11)',
    'Accounting (YAC11)',
    'Business (YBS11)',
    'Information Technology (YIT11)',
  ];

  for (const subjectName of subjects) {
    const existingSubject = await prisma.subject.findFirst({ where: { name: subjectName } });
    if (!existingSubject) {
      await prisma.subject.create({
        data: { name: subjectName, isActive: true }
      });
      console.log(`  - Created Subject: ${subjectName}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 3. Platform Settings
  // ─────────────────────────────────────────────────────────────
  console.log('Seeding Platform Settings...');
  const settings = [
    { key: 'VIDEO_COMPLETION_THRESHOLD_PCT', value: '90' },
    { key: 'ORDER_EXPIRY_WINDOW_HOURS', value: '48' },
    { key: 'PAYOUT_DISPUTE_WINDOW_DAYS', value: '7' },
  ];

  for (const setting of settings) {
    await prisma.platformSetting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: { key: setting.key, value: setting.value },
    });
    console.log(`  - Setting: ${setting.key} = ${setting.value}`);
  }

  // ─────────────────────────────────────────────────────────────
  // 4. Admin User
  // ─────────────────────────────────────────────────────────────
  console.log('Seeding Admin User...');
  const adminEmail = 'admin@lms.local';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash('AdminPassword123!', 10);
    const adminUser = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        isEmailVerified: true,
        status: 'ACTIVE',
        roles: {
          create: {
            role: 'ADMIN',
          }
        }
      }
    });
    console.log(`  - Created Admin User: ${adminEmail} (password: AdminPassword123!)`);
  } else {
    console.log(`  - Admin user already exists: ${adminEmail}`);
  }

  console.log('✅ Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
