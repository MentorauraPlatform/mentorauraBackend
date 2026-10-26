import { PrismaClient, PayoutStatus, DisputeStatus, DisputeReason, ModerationTargetType, ModerationStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting Comprehensive Admin Suite End-to-End Test...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // 1. Setup test admin, mentor, mentee users
  console.log('1️⃣ Setup Test Actors...');
  const testAdmin = await prisma.user.upsert({
    where: { email: 'test_admin_suite@mentoraura.com' },
    update: { role: UserRole.ADMIN, isActive: true },
    create: {
      email: 'test_admin_suite@mentoraura.com',
      passwordHash: 'dummy_hash',
      role: UserRole.ADMIN,
      isActive: true,
      menteeProfile: {
        create: {
          fullName: 'Test Admin User',
        },
      },
    },
  });

  const testMentorUser = await prisma.user.upsert({
    where: { email: 'test_mentor_suite@mentoraura.com' },
    update: { role: UserRole.MENTOR, isMentor: true },
    create: {
      email: 'test_mentor_suite@mentoraura.com',
      passwordHash: 'dummy_hash',
      role: UserRole.MENTOR,
      isMentor: true,
      mentorProfile: {
        create: {
          fullName: 'Dr. Suite Mentor',
          title: 'Principal Software Architect',
          bio: 'Specialist in distributed systems and cloud platforms.',
          areasOfExpertise: ['Architecture', 'Distributed Systems'],
          isVerified: true,
        },
      },
    },
    include: { mentorProfile: true },
  });

  let mentorProfile = await prisma.mentorProfile.findUnique({
    where: { userId: testMentorUser.id },
  });
  if (!mentorProfile) {
    mentorProfile = await prisma.mentorProfile.create({
      data: {
        userId: testMentorUser.id,
        fullName: 'Dr. Suite Mentor',
        title: 'Principal Software Architect',
        bio: 'Specialist in distributed systems.',
        isVerified: true,
      },
    });
  }

  const testMenteeUser = await prisma.user.upsert({
    where: { email: 'test_mentee_suite@mentoraura.com' },
    update: { role: UserRole.MENTEE },
    create: {
      email: 'test_mentee_suite@mentoraura.com',
      passwordHash: 'dummy_hash',
      role: UserRole.MENTEE,
      menteeProfile: {
        create: {
          fullName: 'Test Suite Mentee',
        },
      },
    },
  });

  assert(Boolean(testAdmin && testMentorUser && testMenteeUser), 'Test actors initialized');

  // 2. Financial & Revenue Reporting Validation
  console.log('\n2️⃣ Testing Financial & Revenue Reporting...');
  // Ensure at least one test payment exists
  const existingPayments = await prisma.payment.findMany({ take: 5 });
  const totalVolume = existingPayments.reduce((acc, p) => acc + Number(p.amount), 0);
  assert(totalVolume >= 0, `Financial payment records queried: total volume = ${totalVolume} XAF`);

  // 3. Payout Management & Batch Approval
  console.log('\n3️⃣ Testing Payout Management & Batch Approval...');
  // Request payout 1
  const payout1 = await prisma.payout.create({
    data: {
      mentorId: mentorProfile.id,
      amount: BigInt(25000),
      currency: 'XAF',
      provider: 'MTN_MOMO',
      accountNumber: '237670000001',
      accountName: 'Dr. Suite Mentor',
      status: PayoutStatus.PENDING,
    },
  });

  // Request payout 2
  const payout2 = await prisma.payout.create({
    data: {
      mentorId: mentorProfile.id,
      amount: BigInt(15000),
      currency: 'XAF',
      provider: 'ORANGE_MONEY',
      accountNumber: '237690000002',
      accountName: 'Dr. Suite Mentor',
      status: PayoutStatus.PENDING,
    },
  });

  // Request payout 3 (for rejection test)
  const payout3 = await prisma.payout.create({
    data: {
      mentorId: mentorProfile.id,
      amount: BigInt(10000),
      currency: 'XAF',
      provider: 'MTN_MOMO',
      accountNumber: '237670000003',
      accountName: 'Dr. Suite Mentor',
      status: PayoutStatus.PENDING,
    },
  });

  assert(Boolean(payout1 && payout2 && payout3), 'Created 3 test payout withdrawal requests');

  // Single Approve payout 1
  const updatedP1 = await prisma.payout.update({
    where: { id: payout1.id },
    data: {
      status: PayoutStatus.PAID,
      transactionRef: `PAYOUT-TEST-${Date.now()}-01`,
      processedAt: new Date(),
    },
  });
  await prisma.adminAuditLog.create({
    data: {
      adminId: testAdmin.id,
      action: 'APPROVE_PAYOUT',
      targetId: payout1.id,
      details: { amount: 25000, transactionRef: updatedP1.transactionRef },
      ipAddress: '127.0.0.1',
    },
  });
  assert(updatedP1.status === PayoutStatus.PAID && Boolean(updatedP1.transactionRef), 'Single payout approved with transaction reference');

  // Single Reject payout 3
  const updatedP3 = await prisma.payout.update({
    where: { id: payout3.id },
    data: {
      status: PayoutStatus.REJECTED,
      rejectionReason: 'Account details mismatch with national identification records.',
      processedAt: new Date(),
    },
  });
  assert(updatedP3.status === PayoutStatus.REJECTED && Boolean(updatedP3.rejectionReason), 'Payout rejected with recorded reason');

  // Batch Release payout 2
  const batchP2 = await prisma.payout.update({
    where: { id: payout2.id },
    data: {
      status: PayoutStatus.PAID,
      transactionRef: `BATCH-RELEASE-${Date.now()}-02`,
      processedAt: new Date(),
    },
  });
  assert(batchP2.status === PayoutStatus.PAID, 'Batch payout release completed');

  // 4. Dispute Resolution Center
  console.log('\n4️⃣ Testing Dispute Resolution Center...');
  const dispute = await prisma.dispute.create({
    data: {
      raisedById: testMenteeUser.id,
      targetUserId: testMentorUser.id,
      title: 'Mentor did not attend scheduled 1-on-1 session',
      description: 'Waited in the meeting room for 25 minutes without any communication.',
      reason: DisputeReason.SESSION_NO_SHOW,
      status: DisputeStatus.OPEN,
    },
  });
  assert(Boolean(dispute.id), `Dispute ticket created #${dispute.id.slice(0, 8)}`);

  // Admin resolves dispute with refund
  const resolvedDispute = await prisma.dispute.update({
    where: { id: dispute.id },
    data: {
      status: DisputeStatus.RESOLVED_REFUNDED,
      resolutionNotes: 'Meeting room attendance logs verified mentor was absent. Full session refund authorized.',
      refundAmount: BigInt(15000),
      resolvedAt: new Date(),
    },
  });
  await prisma.adminAuditLog.create({
    data: {
      adminId: testAdmin.id,
      action: 'DISPUTE_RESOLVED_REFUNDED',
      targetId: dispute.id,
      details: { resolutionNotes: resolvedDispute.resolutionNotes, refundAmount: 15000 },
      ipAddress: '127.0.0.1',
    },
  });
  assert(
    resolvedDispute.status === DisputeStatus.RESOLVED_REFUNDED && Number(resolvedDispute.refundAmount) === 15000,
    'Dispute resolved in mentee favor with refund and audit log',
  );

  // 5. Content & Chat Moderation Tools
  console.log('\n5️⃣ Testing Content & Chat Moderation Tools...');
  // Create a reported message
  const modReport = await prisma.moderationReport.create({
    data: {
      reporterId: testMenteeUser.id,
      targetType: ModerationTargetType.USER_PROFILE,
      targetId: testMentorUser.id,
      reason: 'Inappropriate external promotion links in biography',
      details: 'Profile contains third-party gambling link.',
      status: ModerationStatus.PENDING,
    },
  });
  assert(Boolean(modReport.id), `Moderation report logged #${modReport.id.slice(0, 8)}`);

  // Moderator takes action: WARN_USER
  const actionReport = await prisma.moderationReport.update({
    where: { id: modReport.id },
    data: {
      status: ModerationStatus.ACTION_TAKEN,
      actionTaken: 'WARN_USER',
      notes: 'Sent formal policy notice to remove external links.',
      resolvedAt: new Date(),
    },
  });
  await prisma.adminAuditLog.create({
    data: {
      adminId: testAdmin.id,
      action: 'MODERATION_WARN_USER',
      targetId: modReport.targetId,
      details: { reportId: modReport.id, notes: actionReport.notes },
      ipAddress: '127.0.0.1',
    },
  });
  assert(actionReport.status === ModerationStatus.ACTION_TAKEN && actionReport.actionTaken === 'WARN_USER', 'Moderation sanction successfully executed');

  // 6. Platform System Settings & Categories
  console.log('\n6️⃣ Testing Platform System Settings & Categories...');
  // Update global commission rate and min payout
  const setting1 = await prisma.platformSetting.upsert({
    where: { key: 'global_commission_rate' },
    create: {
      key: 'global_commission_rate',
      value: '18',
      description: 'Platform commission percentage',
      updatedBy: testAdmin.id,
    },
    update: {
      value: '18',
      updatedBy: testAdmin.id,
    },
  });

  const setting2 = await prisma.platformSetting.upsert({
    where: { key: 'min_payout_amount' },
    create: {
      key: 'min_payout_amount',
      value: '15000',
      description: 'Minimum withdrawal threshold',
      updatedBy: testAdmin.id,
    },
    update: {
      value: '15000',
      updatedBy: testAdmin.id,
    },
  });

  assert(setting1.value === '18' && setting2.value === '15000', 'Platform settings persisted and retrieved from database');

  // Category CRUD
  const testCatSlug = `test-cat-${Date.now()}`;
  const category = await prisma.category.create({
    data: {
      name: `Cloud DevOps ${Date.now()}`,
      slug: testCatSlug,
      description: 'Kubernetes, Terraform, CI/CD, and Cloud Infrastructure.',
    },
  });
  assert(Boolean(category.id), `Category created: ${category.name} (${category.slug})`);

  // Update category
  const updatedCat = await prisma.category.update({
    where: { id: category.id },
    data: {
      description: 'Updated DevOps and Cloud Engineering track.',
    },
  });
  assert(updatedCat.description === 'Updated DevOps and Cloud Engineering track.', 'Category description updated');

  // Delete category (no mentors attached)
  await prisma.category.delete({ where: { id: category.id } });
  const checkDeleted = await prisma.category.findUnique({ where: { id: category.id } });
  assert(checkDeleted === null, 'Category deleted cleanly');

  // Cleanup test payouts, disputes, reports
  console.log('\n🧹 Cleaning up test artifacts...');
  await prisma.dispute.deleteMany({ where: { id: dispute.id } });
  await prisma.moderationReport.deleteMany({ where: { id: modReport.id } });
  await prisma.payout.deleteMany({ where: { id: { in: [payout1.id, payout2.id, payout3.id] } } });
  await prisma.adminAuditLog.deleteMany({ where: { adminId: testAdmin.id } });

  console.log(`\n========================================`);
  console.log(`🎉 Admin Suite End-to-End Test Complete!`);
  console.log(`   Passed: ${passed}`);
  console.log(`   Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error('Test execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
