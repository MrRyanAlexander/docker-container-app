import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');
  
  // Create a test admin user (you can modify this for your needs)
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      auth0Id: 'auth0|admin-test-id',
      name: 'Admin User',
      picture: null,
    },
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create a test regular user
  const testUser = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      auth0Id: 'auth0|user-test-id',
      name: 'Test User',
      picture: null,
    },
  });

  console.log('✅ Created test user:', testUser.email);

  // Create default user environment for test user
  const userEnv = await prisma.userEnv.upsert({
    where: { userId: testUser.id },
    update: {},
    create: {
      userId: testUser.id,
      config: {
        theme: 'dark',
        tools: ['nodejs', 'git', 'vim'],
        preferences: {
          autoSave: true,
          fontSize: 14
        }
      },
    },
  });

  console.log('✅ Created user environment for:', testUser.email);

  // Log the seed action
  await prisma.auditLog.create({
    data: {
      action: 'CREATE',
      containerId: '',
      userId: adminUser.id,
      details: 'Database seeded with initial users and configurations',
      adminUserId: adminUser.id,
    },
  });

  console.log('✅ Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 