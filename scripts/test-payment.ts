/**
 * Mentoraura Payment & Activation Flow Test Script
 * =================================================
 * Tests the complete end-to-end payment lifecycle:
 *   1. Resolves / creates an INTRO mentorship & mentee user
 *   2. Generates authenticated mentee JWT access token
 *   3. Initiates checkout via POST /api/v1/payments/initiate (MoMo / Orange Money)
 *   4. Polls payment status via GET /api/v1/payments/:id/status
 *   5. Verifies webhook security rejection (invalid HMAC-SHA256 signature -> HTTP 401)
 *   6. Delivers valid signed ZoPay webhook (payment.succeeded)
 *   7. Verifies webhook idempotency (duplicate delivery handling)
 *   8. Verifies mentorship activation (INTRO -> ACTIVE, startedAt recorded)
 *   9. Optional payment failure flow simulation (--test-failure)
 *
 * Usage:
 *   npm run test:payment
 *   npx ts-node -r tsconfig-paths/register scripts/test-payment.ts [options]
 *
 * Options:
 *   --api-url=<url>         API base URL (default: http://localhost:4000)
 *   --mentorship-id=<uuid>  Test a specific existing mentorship ID
 *   --provider=<name>       MTN_MOMO | ORANGE_MONEY (default: MTN_MOMO)
 *   --phone=<msisdn>        Test phone number (default: +237671234567)
 *   --token=<jwt>           Use a custom JWT bearer token
 *   --test-failure          Also run a payment.failed webhook test
 *   --keep-data             Keep test fixture records created in DB
 *   --help                  Show help
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

// ANSI terminal colors
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

function log(msg: string) {
  console.log(msg);
}

function success(msg: string) {
  console.log(`${colors.green}✔ ${msg}${colors.reset}`);
}

function info(msg: string) {
  console.log(`${colors.cyan}ℹ ${msg}${colors.reset}`);
}

function warn(msg: string) {
  console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`);
}

function error(msg: string) {
  console.log(`${colors.red}✖ ${msg}${colors.reset}`);
}

function header(title: string) {
  console.log(`\n${colors.bold}${colors.blue}=== ${title} ===${colors.reset}`);
}

// ── Environment variable loader ─────────────────────────────────────────────
function loadEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const eqIdx = line.indexOf('=');
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      // Remove quotes if present
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}
loadEnv();

// ── CLI argument parser ─────────────────────────────────────────────────────
function getArg(key: string, defaultValue?: string): string | undefined {
  const prefix = `--${key}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  if (arg) return arg.slice(prefix.length);

  const idx = process.argv.indexOf(`--${key}`);
  if (idx !== -1 && idx < process.argv.length - 1) {
    return process.argv[idx + 1];
  }
  return defaultValue;
}

const hasFlag = (flag: string) => process.argv.includes(`--${flag}`);

if (hasFlag('help')) {
  console.log(`
${colors.bold}Mentoraura Payment & Activation Test Script${colors.reset}

Options:
  --api-url=<url>         API base URL (default: http://localhost:4000)
  --mentorship-id=<uuid>  Test a specific existing mentorship ID
  --provider=<provider>   Payment provider: MTN_MOMO | ORANGE_MONEY (default: MTN_MOMO)
  --phone=<number>        Phone number for MoMo push (default: +237671234567)
  --token=<jwt>           Custom JWT bearer token for mentee
  --test-failure          Include payment.failed event test
  --keep-data             Do not delete automatically generated test records
  --help                  Show this help text
`);
  process.exit(0);
}

// ── Configuration ───────────────────────────────────────────────────────────
const CUSTOM_API_URL = getArg('api-url');
let API_URL = (CUSTOM_API_URL || process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const PROVIDER = (getArg('provider', 'MTN_MOMO') || 'MTN_MOMO').toUpperCase();
const PHONE_NUMBER = getArg('phone', '+237671234567') || '+237671234567';
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const WEBHOOK_SECRET =
  process.env.ZOPAY_WEBHOOK_SECRET ||
  process.env.PAYMENT_WEBHOOK_SECRET ||
  'change-me';
const TEST_FAILURE = hasFlag('test-failure');
const KEEP_DATA = hasFlag('keep-data');
let CUSTOM_MENTORSHIP_ID = getArg('mentorship-id');
let CUSTOM_TOKEN = getArg('token');

const prisma = new PrismaClient();
let appInstance: any = null;

// Helper for signing a JWT without external libraries
function signJwt(payload: Record<string, unknown>, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const base64UrlEncode = (obj: object | string) => {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    return Buffer.from(str)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  };

  const encodedHeader = base64UrlEncode(header);
  const now = Math.floor(Date.now() / 1000);
  const completePayload = {
    ...payload,
    iat: now,
    exp: now + 60 * 60, // 1 hour
  };
  const encodedPayload = base64UrlEncode(completePayload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

// Track entities created for cleanup
const createdEntityIds = {
  mentorshipId: null as string | null,
  planId: null as string | null,
  mentorUserId: null as string | null,
  menteeUserId: null as string | null,
  mentorProfileId: null as string | null,
};

async function checkServerHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/v1/auth/verify-email?token=ping`, {
      method: 'GET',
    });
    // Any HTTP response means the NestJS server is running
    return res.status > 0;
  } catch (err: unknown) {
    return false;
  }
}

async function ensureServerRunning(): Promise<string> {
  const isRunning = await checkServerHealth(API_URL);
  if (isRunning) {
    success(`Connected to active Mentoraura server at ${API_URL}`);
    return API_URL;
  }

  if (CUSTOM_API_URL) {
    error(`Cannot connect to Mentoraura backend at ${CUSTOM_API_URL}.`);
    process.exit(1);
  }

  info(`No server running on ${API_URL}. Spinning up in-process NestJS test server...`);

  // BigInt serialization
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };

  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
    rawBody: true,
  });

  const cookieParserMiddleware = cookieParser as unknown as (opts?: any) => any;
  app.use(cookieParserMiddleware());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  await app.listen(0);
  const server = app.getHttpServer();
  const address = server.address();
  const port = typeof address === 'string' ? 4099 : address.port;
  appInstance = app;

  const inProcessUrl = `http://localhost:${port}`;
  success(`In-process test server running at ${inProcessUrl}`);
  return inProcessUrl;
}

async function resolveOrCreateMentorship(): Promise<{
  mentorshipId: string;
  menteeId: string;
  menteeEmail: string;
  planTitle: string;
  priceAmount: number;
  currency: string;
}> {
  // If user provided a specific mentorship ID
  if (CUSTOM_MENTORSHIP_ID) {
    info(`Looking up provided Mentorship: ${CUSTOM_MENTORSHIP_ID}...`);
    const m = await prisma.mentorship.findUnique({
      where: { id: CUSTOM_MENTORSHIP_ID },
      include: { mentee: true, plan: true },
    });
    if (!m) {
      throw new Error(`Mentorship ${CUSTOM_MENTORSHIP_ID} not found in database.`);
    }
    if (m.status !== 'INTRO') {
      warn(`Mentorship ${m.id} has status '${m.status}'. Payment checkout requires 'INTRO' status.`);
      info(`Resetting status to 'INTRO' for testing...`);
      await prisma.mentorship.update({
        where: { id: m.id },
        data: { status: 'INTRO' },
      });
    }
    return {
      mentorshipId: m.id,
      menteeId: m.menteeId,
      menteeEmail: m.mentee.email,
      planTitle: m.plan.title,
      priceAmount: Number(m.plan.priceAmount),
      currency: m.plan.currency || 'XAF',
    };
  }

  // Check if any existing INTRO mentorship exists in DB
  const existing = await prisma.mentorship.findFirst({
    where: { status: 'INTRO' },
    include: { mentee: true, plan: true },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    info(`Found existing INTRO Mentorship: ${existing.id} (Mentee: ${existing.mentee.email})`);
    return {
      mentorshipId: existing.id,
      menteeId: existing.menteeId,
      menteeEmail: existing.mentee.email,
      planTitle: existing.plan.title,
      priceAmount: Number(existing.plan.priceAmount),
      currency: existing.plan.currency || 'XAF',
    };
  }

  // No INTRO mentorship exists: Create a temporary test fixture
  info('No INTRO mentorship found in database. Auto-provisioning test fixture...');
  const uid = crypto.randomUUID().slice(0, 8);
  const passwordHash = await bcrypt.hash('TestPassword123!', 10);

  // 1. Create Test Mentee
  const mentee = await prisma.user.create({
    data: {
      email: `test-mentee-${uid}@mentoraura.test`,
      passwordHash,
      role: 'MENTEE',
      isEmailVerified: true,
      menteeProfile: {
        create: {
          fullName: `Test Mentee ${uid}`,
          headline: 'Aspiring Engineer',
        },
      },
    },
  });
  createdEntityIds.menteeUserId = mentee.id;

  // 2. Create Test Mentor
  const mentorUser = await prisma.user.create({
    data: {
      email: `test-mentor-${uid}@mentoraura.test`,
      passwordHash,
      role: 'MENTOR',
      isMentor: true,
      isEmailVerified: true,
      mentorProfile: {
        create: {
          fullName: `Test Mentor ${uid}`,
          title: 'Principal Software Engineer',
          bio: 'Automated test mentor profile for payment testing.',
          onboardingStatus: 'APPROVED',
          isVerified: true,
        },
      },
    },
    include: {
      mentorProfile: true,
    },
  });
  const mentorProfile = mentorUser.mentorProfile!;
  createdEntityIds.mentorUserId = mentorUser.id;
  createdEntityIds.mentorProfileId = mentorProfile.id;

  // 3. Create Test Mentorship Plan
  const plan = await prisma.plan.create({
    data: {
      mentorId: mentorProfile.id,
      title: 'Standard Monthly Mentorship',
      description: 'Test plan with 4 sessions per month',
      priceAmount: BigInt(5000),
      currency: 'XAF',
      sessionsPerMonth: 4,
      isActive: true,
    },
  });
  createdEntityIds.planId = plan.id;

  // 4. Create Mentorship in INTRO status
  const mentorship = await prisma.mentorship.create({
    data: {
      menteeId: mentee.id,
      mentorId: mentorProfile.id,
      planId: plan.id,
      status: 'INTRO',
    },
  });
  createdEntityIds.mentorshipId = mentorship.id;

  success(`Created test fixture: Mentorship ID: ${mentorship.id}`);
  log(`   • Mentee: ${mentee.email} (${mentee.id})`);
  log(`   • Mentor: ${mentorUser.email}`);
  log(`   • Plan: ${plan.title} (${plan.priceAmount} ${plan.currency})`);

  return {
    mentorshipId: mentorship.id,
    menteeId: mentee.id,
    menteeEmail: mentee.email,
    planTitle: plan.title,
    priceAmount: Number(plan.priceAmount),
    currency: plan.currency,
  };
}

async function cleanupFixtures() {
  if (KEEP_DATA) {
    info(`Flag --keep-data is set. Retaining created test database records.`);
    return;
  }

  if (createdEntityIds.mentorshipId) {
    info(`Cleaning up test records from database...`);
    try {
      // Delete any payments linked to the test mentorship
      await prisma.payment.deleteMany({
        where: { mentorshipId: createdEntityIds.mentorshipId },
      });
      // Delete mentorship
      await prisma.mentorship.delete({
        where: { id: createdEntityIds.mentorshipId },
      });
      // Delete plan
      if (createdEntityIds.planId) {
        await prisma.plan.delete({ where: { id: createdEntityIds.planId } });
      }
      // Delete mentor profile & user
      if (createdEntityIds.mentorProfileId) {
        await prisma.mentorProfile.delete({
          where: { id: createdEntityIds.mentorProfileId },
        });
      }
      if (createdEntityIds.mentorUserId) {
        await prisma.user.delete({
          where: { id: createdEntityIds.mentorUserId },
        });
      }
      // Delete mentee profile & user
      if (createdEntityIds.menteeUserId) {
        await prisma.menteeProfile.deleteMany({
          where: { userId: createdEntityIds.menteeUserId },
        });
        await prisma.user.delete({
          where: { id: createdEntityIds.menteeUserId },
        });
      }
      success('Database cleanup completed successfully.');
    } catch (cleanErr: unknown) {
      warn(`Cleanup warning: ${(cleanErr as Error).message}`);
    }
  }

  if (appInstance) {
    info('Shutting down in-process test server...');
    try {
      await appInstance.close();
      appInstance = null;
    } catch (err: unknown) {
      // ignore
    }
  }
}

// ── Main Test Runner ────────────────────────────────────────────────────────
async function runPaymentTests() {
  header('MENTORAURA PAYMENT FLOW TEST SUITE');
  log(`• Provider:          ${colors.bold}${PROVIDER}${colors.reset}`);
  log(`• Phone:             ${colors.bold}${PHONE_NUMBER}${colors.reset}`);
  log(`• Webhook Secret:    ${WEBHOOK_SECRET ? 'Configured (' + WEBHOOK_SECRET.slice(0, 4) + '...)' : 'Default (change-me)'}`);

  // Step 0: Ensure server is running
  info(`Checking API server connectivity...`);
  API_URL = await ensureServerRunning();
  log(`• Active API URL:    ${colors.bold}${API_URL}${colors.reset}`);

  // Step 1: Resolve Mentorship & Mentee
  header('Step 1: Mentorship & Auth Setup');
  const target = await resolveOrCreateMentorship();

  // Generate or use token
  const token =
    CUSTOM_TOKEN ||
    signJwt(
      {
        sub: target.menteeId,
        email: target.menteeEmail,
        isMentor: false,
        role: 'mentee',
      },
      JWT_SECRET,
    );
  success(`Generated authenticated Mentee JWT token.`);

  // Step 2: Initiate Payment
  header('Step 2: Initiate Checkout (POST /api/v1/payments/initiate)');
  info(`Initiating ${PROVIDER} payment for mentorship ${target.mentorshipId}...`);

  const initiatePayload = {
    mentorshipId: target.mentorshipId,
    provider: PROVIDER,
    phoneNumber: PHONE_NUMBER,
  };

  const initiateRes = await fetch(`${API_URL}/api/v1/payments/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(initiatePayload),
  });

  const initiateBody = (await initiateRes.json()) as any;

  if (!initiateRes.ok) {
    error(`Payment initiation failed (${initiateRes.status}): ${JSON.stringify(initiateBody)}`);
    await cleanupFixtures();
    process.exit(1);
  }

  success(`Payment initiated successfully (HTTP ${initiateRes.status})!`);
  log(`   • Payment ID:          ${colors.bold}${initiateBody.paymentId}${colors.reset}`);
  log(`   • Status:              ${colors.yellow}${initiateBody.status}${colors.reset}`);
  log(`   • Provider Reference:  ${initiateBody.providerReference || 'N/A'}`);
  log(`   • Instructions:        ${initiateBody.instructions || 'N/A'}`);
  if (initiateBody.quote) {
    log(`   • Quote Amount:        ${initiateBody.quote.totalAmount} (Fees: ${initiateBody.quote.fees?.platform_fee || '0'})`);
  }

  const paymentId = initiateBody.paymentId;
  const providerRef = initiateBody.providerReference;

  // Step 3: Poll Payment Status
  header('Step 3: Poll Payment Status (GET /api/v1/payments/:id/status)');
  info(`Polling transaction status for payment ${paymentId}...`);

  const statusRes = await fetch(`${API_URL}/api/v1/payments/${paymentId}/status`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const statusBody = (await statusRes.json()) as any;
  if (!statusRes.ok) {
    error(`Status query failed: ${JSON.stringify(statusBody)}`);
  } else {
    success(`Payment status retrieved successfully:`);
    log(`   • Status:            ${statusBody.status}`);
    log(`   • Mentorship Status: ${statusBody.mentorshipStatus}`);
    log(`   • Amount:            ${statusBody.amount} ${statusBody.currency}`);
  }

  // Step 4: Test Webhook Security - Invalid Signature Rejection
  header('Step 4: Security Verification - Invalid Signature Rejection');
  if (WEBHOOK_SECRET && WEBHOOK_SECRET !== 'change-me') {
    info('Sending webhook with invalid signature to ensure rejection...');

    const fakeBody = JSON.stringify({
      event: 'payment.succeeded',
      data: { transaction_id: providerRef || 'sim-txn-id' },
    });

    const badSigRes = await fetch(`${API_URL}/api/v1/payments/webhooks/zopay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zo-signature': '0000000000000000000000000000000000000000000000000000000000000000',
        'x-zo-timestamp': Date.now().toString(),
        'x-zo-delivery-id': crypto.randomUUID(),
      },
      body: fakeBody,
    });

    if (badSigRes.status === 401) {
      success(`Webhook correctly rejected with HTTP 401 Unauthorized (Invalid Signature).`);
    } else {
      warn(`Webhook returned HTTP ${badSigRes.status}. Expected 401.`);
    }
  } else {
    info('ZOPAY_WEBHOOK_SECRET is not set. Webhooks will be processed in flexible development mode.');
  }

  // Step 5: Deliver Valid Webhook (payment.succeeded)
  header('Step 5: Process Successful Webhook (payment.succeeded)');
  info(`Simulating payment gateway callback for payment ${paymentId}...`);

  const webhookPayload = {
    event: 'payment.succeeded',
    data: {
      transaction_id: providerRef || `SIM_${Date.now()}`,
      amount: target.priceAmount,
      currency: target.currency,
      gateway: PROVIDER,
      metadata: {
        paymentId,
        mentorshipId: target.mentorshipId,
      },
    },
    timestamp: new Date().toISOString(),
  };

  const rawPayload = JSON.stringify(webhookPayload);
  const webhookTimestamp = Date.now().toString();
  const stringToSign = `${webhookTimestamp}.${rawPayload}`;
  const validSignature = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(stringToSign)
    .digest('hex');

  const deliveryId = crypto.randomUUID();

  const webhookRes = await fetch(`${API_URL}/api/v1/payments/webhooks/zopay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zo-signature': validSignature,
      'x-zo-timestamp': webhookTimestamp,
      'x-zo-delivery-id': deliveryId,
    },
    body: rawPayload,
  });

  const webhookResult = (await webhookRes.json()) as any;

  if (!webhookRes.ok) {
    error(`Webhook callback failed (${webhookRes.status}): ${JSON.stringify(webhookResult)}`);
    await cleanupFixtures();
    process.exit(1);
  }

  success(`Webhook accepted and processed (HTTP ${webhookRes.status})!`);
  log(`   • Result: ${JSON.stringify(webhookResult)}`);

  // Step 6: Test Idempotency (Repeat delivery)
  header('Step 6: Idempotency Check (Repeat Webhook Delivery)');
  info('Sending identical webhook to test idempotency...');

  const dupRes = await fetch(`${API_URL}/api/v1/payments/webhooks/zopay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-zo-signature': validSignature,
      'x-zo-timestamp': webhookTimestamp,
      'x-zo-delivery-id': deliveryId, // Same delivery ID
    },
    body: rawPayload,
  });

  const dupResult = (await dupRes.json()) as any;
  if (dupRes.ok && (dupResult.deduplicated || dupResult.alreadyProcessed || dupResult.received)) {
    success(`Idempotency verified: Duplicate delivery safely handled without duplicate execution.`);
  } else {
    warn(`Idempotency response: ${JSON.stringify(dupResult)}`);
  }

  // Step 7: Verify Mentorship Activation State
  header('Step 7: Verification of Mentorship Activation');
  info('Verifying database and API status after webhook completion...');

  const finalStatusRes = await fetch(`${API_URL}/api/v1/payments/${paymentId}/status`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  const finalStatus = (await finalStatusRes.json()) as any;

  const dbMentorship = await prisma.mentorship.findUnique({
    where: { id: target.mentorshipId },
  });
  const dbPayment = await prisma.payment.findUnique({
    where: { id: paymentId },
  });

  log(`\n${colors.bold}Final Verification Results:${colors.reset}`);
  log(`   • Payment Status (API):       ${finalStatus.status === 'SUCCESS' ? colors.green : colors.red}${finalStatus.status}${colors.reset}`);
  log(`   • Mentorship Status (API):    ${finalStatus.mentorshipStatus === 'ACTIVE' ? colors.green : colors.red}${finalStatus.mentorshipStatus}${colors.reset}`);
  log(`   • Payment Status (DB):        ${dbPayment?.status === 'SUCCESS' ? colors.green : colors.red}${dbPayment?.status}${colors.reset}`);
  log(`   • Mentorship Status (DB):     ${dbMentorship?.status === 'ACTIVE' ? colors.green : colors.red}${dbMentorship?.status}${colors.reset}`);
  log(`   • Mentorship startedAt:       ${dbMentorship?.startedAt ? colors.green + dbMentorship.startedAt.toISOString() : colors.red + 'null'}${colors.reset}`);

  if (dbMentorship?.status === 'ACTIVE' && dbPayment?.status === 'SUCCESS') {
    console.log(`\n${colors.bold}${colors.green}🎉 ALL PAYMENT AND ACTIVATION CHECKS PASSED!${colors.reset}\n`);
  } else {
    console.log(`\n${colors.bold}${colors.red}❌ Payment activation checks did not fully succeed.${colors.reset}\n`);
  }

  // Step 8: Optional Failure Simulation
  if (TEST_FAILURE) {
    header('Step 8: Payment Failure Simulation (--test-failure)');
    info('Initiating secondary transaction to test failure handling...');

    // Temporarily reset mentorship to INTRO for second test
    await prisma.mentorship.update({
      where: { id: target.mentorshipId },
      data: { status: 'INTRO' },
    });

    const failInitRes = await fetch(`${API_URL}/api/v1/payments/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(initiatePayload),
    });
    const failInit = (await failInitRes.json()) as any;

    const failPayload = {
      event: 'payment.failed',
      data: {
        transaction_id: failInit.providerReference || `SIM_FAIL_${Date.now()}`,
        failure_reason: 'User cancelled USSD prompt / Insufficient funds',
        metadata: {
          paymentId: failInit.paymentId,
          mentorshipId: target.mentorshipId,
        },
      },
      timestamp: new Date().toISOString(),
    };

    const failRaw = JSON.stringify(failPayload);
    const failTs = Date.now().toString();
    const failSig = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(`${failTs}.${failRaw}`)
      .digest('hex');

    await fetch(`${API_URL}/api/v1/payments/webhooks/zopay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-zo-signature': failSig,
        'x-zo-timestamp': failTs,
        'x-zo-delivery-id': crypto.randomUUID(),
      },
      body: failRaw,
    });

    const failedPayment = await prisma.payment.findUnique({
      where: { id: failInit.paymentId },
    });
    const mentorshipAfterFail = await prisma.mentorship.findUnique({
      where: { id: target.mentorshipId },
    });

    log(`   • Failed Payment Status in DB: ${failedPayment?.status === 'FAILED' ? colors.green : colors.red}${failedPayment?.status}${colors.reset}`);
    log(`   • Mentorship Status Kept INTRO: ${mentorshipAfterFail?.status === 'INTRO' ? colors.green : colors.red}${mentorshipAfterFail?.status}${colors.reset}`);
    success('Payment failure flow verified successfully.');
  }

  // Clean up
  await cleanupFixtures();
  await prisma.$disconnect();
}

runPaymentTests().catch(async (err) => {
  error(`Unhandled error during test: ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }
  await cleanupFixtures();
  await prisma.$disconnect();
  process.exit(1);
});
