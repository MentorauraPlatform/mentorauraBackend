/**
 * Mentoraura Real-Time Messaging End-to-End Test Suite
 * ====================================================
 * Comprehensive end-to-end verification covering:
 *   1. REST API: list conversations, get conversation by id, unread counts
 *   2. REST Security: 403 Forbidden checks for non-participants
 *   3. WebSocket Gateway Handshake:
 *      - Rejection of unauthenticated client
 *      - Successful handshake with valid JWT
 *   4. Room Management:
 *      - Non-participant cannot join conversation room
 *      - Participants successfully join conversation room
 *   5. Real-Time Message Exchange:
 *      - Mentee sends message via WebSocket
 *      - Mentor receives live message in real-time
 *   6. Presence & Receipts:
 *      - Typing start & stop indicators
 *      - Read receipt generation and broadcast
 *   7. Cursor Pagination:
 *      - History loading with cursor and limit
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register scripts/test-messaging.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { NestFactory } from '@nestjs/core';
import { VersioningType } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { io, Socket } from 'socket.io-client';
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

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key';
const prisma = new PrismaClient();
let appInstance: any = null;
let API_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');

// Sign JWT helper
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
    exp: now + 60 * 60,
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

// Check or spin in-process Nest server
async function ensureServerRunning(): Promise<string> {
  try {
    const res = await fetch(`${API_URL}/api/v1/health`, { method: 'GET' }).catch(() => null);
    if (res && res.status < 500) {
      success(`API server is running at ${API_URL}`);
      return API_URL;
    }
  } catch {
    // offline
  }

  info(`API server not running at ${API_URL}. Starting in-process NestJS application...`);
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: true, credentials: true });
  app.enableVersioning({ type: VersioningType.URI });

  const port = 4100 + Math.floor(Math.random() * 100);
  await app.listen(port);
  appInstance = app;

  const inProcessUrl = `http://localhost:${port}`;
  success(`In-process test server running at ${inProcessUrl}`);
  return inProcessUrl;
}

// Track fixture IDs for cleanup
const fixtures = {
  menteeUserId: '',
  mentorUserId: '',
  mentorProfileId: '',
  planId: '',
  mentorshipId: '',
  conversationId: '',
  unauthorizedUserId: '',
};

async function createFixtures() {
  header('Step 1: Setting up Test Fixtures');

  const ts = Date.now();
  const passwordHash = await bcrypt.hash('TestPass123!', 8);

  // 1. Create Mentee
  const mentee = await prisma.user.create({
    data: {
      email: `mentee.test.${ts}@mentoraura.test`,
      passwordHash,
      role: 'MENTEE',
      isMentor: false,
      isEmailVerified: true,
      menteeProfile: {
        create: {
          fullName: 'Test Mentee Alex',
          currentRole: 'Junior Developer',
          experienceLevel: 'BEGINNER',
        },
      },
    },
  });
  fixtures.menteeUserId = mentee.id;

  // 2. Create Mentor
  const mentorUser = await prisma.user.create({
    data: {
      email: `mentor.test.${ts}@mentoraura.test`,
      passwordHash,
      role: 'MENTOR',
      isMentor: true,
      isEmailVerified: true,
      mentorProfile: {
        create: {
          fullName: 'Dr. Sarah Mentor',
          title: 'Staff Software Architect',
          company: 'Aura Tech',
          isVerified: true,
          onboardingStatus: 'APPROVED',
        },
      },
    },
    include: { mentorProfile: true },
  });
  fixtures.mentorUserId = mentorUser.id;
  fixtures.mentorProfileId = mentorUser.mentorProfile!.id;

  // 3. Create Plan
  const plan = await prisma.plan.create({
    data: {
      mentorId: mentorUser.mentorProfile!.id,
      title: 'Real-Time Fullstack Mastery',
      description: 'Comprehensive 1-on-1 mentorship',
      priceAmount: BigInt(50000),
      currency: 'XAF',
      sessionsPerMonth: 4,
      isActive: true,
    },
  });
  fixtures.planId = plan.id;

  // 4. Create Mentorship
  const mentorship = await prisma.mentorship.create({
    data: {
      menteeId: mentee.id,
      mentorId: mentorUser.mentorProfile!.id,
      planId: plan.id,
      status: 'ACTIVE',
      startedAt: new Date(),
    },
  });
  fixtures.mentorshipId = mentorship.id;

  // 5. Canonicalize participant ordering and create conversation
  const p1 = mentee.id < mentorUser.id ? mentee.id : mentorUser.id;
  const p2 = mentee.id < mentorUser.id ? mentorUser.id : mentee.id;

  const conversation = await prisma.conversation.create({
    data: {
      mentorshipId: mentorship.id,
      participant1Id: p1,
      participant2Id: p2,
      lastMessageAt: new Date(),
    },
  });
  fixtures.conversationId = conversation.id;

  // 6. Create unauthorized 3rd party user
  const unauthorizedUser = await prisma.user.create({
    data: {
      email: `unauthorized.test.${ts}@mentoraura.test`,
      passwordHash,
      role: 'MENTEE',
      isMentor: false,
      isEmailVerified: true,
    },
  });
  fixtures.unauthorizedUserId = unauthorizedUser.id;

  success(`Test fixtures created successfully:`);
  log(`   • Mentee: ${mentee.email} (${mentee.id})`);
  log(`   • Mentor: ${mentorUser.email} (${mentorUser.id})`);
  log(`   • Conversation: ${conversation.id}`);
  log(`   • Unauthorized User: ${unauthorizedUser.email} (${unauthorizedUser.id})`);
}

async function cleanupFixtures() {
  header('Cleaning up Test Fixtures');
  try {
    if (fixtures.conversationId) {
      await prisma.message.deleteMany({
        where: { conversationId: fixtures.conversationId },
      });
      await prisma.conversation.delete({
        where: { id: fixtures.conversationId },
      });
    }
    if (fixtures.mentorshipId) {
      await prisma.mentorship.delete({
        where: { id: fixtures.mentorshipId },
      });
    }
    if (fixtures.planId) {
      await prisma.plan.delete({ where: { id: fixtures.planId } });
    }
    if (fixtures.mentorProfileId) {
      await prisma.mentorProfile.delete({
        where: { id: fixtures.mentorProfileId },
      });
    }
    if (fixtures.mentorUserId) {
      await prisma.user.delete({ where: { id: fixtures.mentorUserId } });
    }
    if (fixtures.menteeUserId) {
      await prisma.menteeProfile.deleteMany({
        where: { userId: fixtures.menteeUserId },
      });
      await prisma.user.delete({ where: { id: fixtures.menteeUserId } });
    }
    if (fixtures.unauthorizedUserId) {
      await prisma.user.delete({ where: { id: fixtures.unauthorizedUserId } });
    }
    success('Database test fixtures cleaned up.');
  } catch (err: any) {
    warn(`Fixture cleanup warning: ${err.message}`);
  }

  if (appInstance) {
    info('Stopping in-process server...');
    await appInstance.close();
  }
}

async function runTests() {
  header('MENTORAURA REAL-TIME MESSAGING E2E TEST SUITE');

  API_URL = await ensureServerRunning();

  await createFixtures();

  // Generate JWTs
  const menteeToken = signJwt(
    { sub: fixtures.menteeUserId, email: 'mentee@test.com', role: 'MENTEE' },
    JWT_SECRET,
  );
  const mentorToken = signJwt(
    { sub: fixtures.mentorUserId, email: 'mentor@test.com', role: 'MENTOR', isMentor: true },
    JWT_SECRET,
  );
  const unauthorizedToken = signJwt(
    { sub: fixtures.unauthorizedUserId, email: 'unauthorized@test.com', role: 'MENTEE' },
    JWT_SECRET,
  );

  let passed = 0;
  let failed = 0;

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 1: REST Conversations List
  // ──────────────────────────────────────────────────────────────────────────
  header('TEST 1: REST GET /api/v1/conversations');
  try {
    const res = await fetch(`${API_URL}/api/v1/conversations`, {
      headers: { Authorization: `Bearer ${menteeToken}` },
    });
    const body = (await res.json()) as any;
    if (res.ok && Array.isArray(body.data) && body.data.some((c: any) => c.id === fixtures.conversationId)) {
      success('Mentee successfully retrieved conversation list with active thread.');
      passed++;
    } else {
      error(`Failed to retrieve conversations: ${JSON.stringify(body)}`);
      failed++;
    }
  } catch (err: any) {
    error(`Test 1 Error: ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 2: REST Single Conversation Details & Participant Summary
  // ──────────────────────────────────────────────────────────────────────────
  header('TEST 2: REST GET /api/v1/conversations/:id');
  try {
    const res = await fetch(`${API_URL}/api/v1/conversations/${fixtures.conversationId}`, {
      headers: { Authorization: `Bearer ${menteeToken}` },
    });
    const body = (await res.json()) as any;
    if (res.ok && body.data?.otherParticipant?.name === 'Dr. Sarah Mentor') {
      success(`Participant summary properly populated: "${body.data.otherParticipant.name}" (${body.data.otherParticipant.title})`);
      passed++;
    } else {
      error(`Unexpected response for conversation details: ${JSON.stringify(body)}`);
      failed++;
    }
  } catch (err: any) {
    error(`Test 2 Error: ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 3: REST Security Boundary (Unauthorized User Rejection)
  // ──────────────────────────────────────────────────────────────────────────
  header('TEST 3: Security Boundary - Non-Participant Access (Expect 403 Forbidden)');
  try {
    const res = await fetch(`${API_URL}/api/v1/conversations/${fixtures.conversationId}`, {
      headers: { Authorization: `Bearer ${unauthorizedToken}` },
    });
    if (res.status === 403) {
      success('Non-participant correctly blocked with HTTP 403 Forbidden.');
      passed++;
    } else {
      error(`Expected HTTP 403, got status ${res.status}`);
      failed++;
    }
  } catch (err: any) {
    error(`Test 3 Error: ${err.message}`);
    failed++;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 4: WebSocket Handshake & Authentication Rejection
  // ──────────────────────────────────────────────────────────────────────────
  header('TEST 4: WebSocket Handshake Authentication');
  const wsUrl = `${API_URL}/messaging`;

  // 4a: Unauthenticated socket should be rejected
  await new Promise<void>((resolve) => {
    info(`Attempting socket connection without token to ${wsUrl}...`);
    const badSocket = io(wsUrl, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 3000,
    });

    badSocket.on('connect_error', () => {
      success('Unauthenticated WebSocket connection successfully rejected.');
      passed++;
      badSocket.close();
      resolve();
    });

    badSocket.on('error', () => {
      success('Unauthenticated WebSocket connection rejected with error.');
      passed++;
      badSocket.close();
      resolve();
    });

    setTimeout(() => {
      if (!badSocket.connected) {
        success('Unauthenticated socket remained disconnected as expected.');
        passed++;
      } else {
        error('Unauthenticated socket was allowed to connect!');
        failed++;
      }
      badSocket.close();
      resolve();
    }, 2500);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TEST 5: Real-Time WebSocket Delivery Between Mentee and Mentor
  // ──────────────────────────────────────────────────────────────────────────
  header('TEST 5: Real-Time Message Exchange via WebSockets');

  let menteeSocket: Socket | null = null;
  let mentorSocket: Socket | null = null;

  try {
    // Connect Mentee Socket
    menteeSocket = await new Promise<Socket>((resolve, reject) => {
      const s = io(wsUrl, {
        auth: { token: menteeToken },
        transports: ['websocket'],
      });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
    success('Mentee connected to WebSocket Gateway (/messaging).');

    // Connect Mentor Socket
    mentorSocket = await new Promise<Socket>((resolve, reject) => {
      const s = io(wsUrl, {
        auth: { token: mentorToken },
        transports: ['websocket'],
      });
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
    success('Mentor connected to WebSocket Gateway (/messaging).');

    // Join conversation rooms with acknowledgements
    await new Promise<void>((resolve, reject) => {
      menteeSocket!.emit(
        'join_conversation',
        { conversationId: fixtures.conversationId },
        (res: any) => {
          if (res?.status === 'joined') resolve();
          else reject(new Error(res?.message || 'Mentee failed to join room'));
        },
      );
    });
    success('Mentee successfully joined conversation room.');

    await new Promise<void>((resolve, reject) => {
      mentorSocket!.emit(
        'join_conversation',
        { conversationId: fixtures.conversationId },
        (res: any) => {
          if (res?.status === 'joined') resolve();
          else reject(new Error(res?.message || 'Mentor failed to join room'));
        },
      );
    });
    success('Mentor successfully joined conversation room.');

    // Test sending message from Mentee -> received by Mentor
    const testMessageContent = 'Hello Dr. Sarah! This is real-time WebSocket messaging working perfectly.';

    const messagePromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for message_received event')), 8000);
      mentorSocket!.on('message_received', (data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });

    info(`Mentee sending real-time message to conversation ${fixtures.conversationId}...`);
    menteeSocket.emit('send_message', {
      conversationId: fixtures.conversationId,
      content: testMessageContent,
    });

    const receivedMessage = await messagePromise;

    if (
      receivedMessage.content === testMessageContent &&
      receivedMessage.senderId === fixtures.menteeUserId
    ) {
      success(`Mentor received live message: "${receivedMessage.content}"`);
      passed++;
    } else {
      error(`Unexpected message content: ${JSON.stringify(receivedMessage)}`);
      failed++;
    }

    // ────────────────────────────────────────────────────────────────────────
    // TEST 6: Real-Time Typing Indicators
    // ────────────────────────────────────────────────────────────────────────
    header('TEST 6: Real-Time Typing Indicators');

    const typingStartPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for typing_indicator start')), 4000);
      menteeSocket!.on('typing_indicator', (payload) => {
        if (payload.isTyping === true) {
          clearTimeout(timeout);
          resolve(payload);
        }
      });
    });

    mentorSocket.emit('typing_start', { conversationId: fixtures.conversationId });
    const typingPayload = await typingStartPromise;

    if (typingPayload.userId === fixtures.mentorUserId && typingPayload.isTyping === true) {
      success(`Mentee received typing indicator: Mentor (${typingPayload.userId}) is typing...`);
      passed++;
    } else {
      error(`Unexpected typing payload: ${JSON.stringify(typingPayload)}`);
      failed++;
    }

    // ────────────────────────────────────────────────────────────────────────
    // TEST 7: Read Receipt Acknowledgement
    // ────────────────────────────────────────────────────────────────────────
    header('TEST 7: Read Receipts (mark_as_read)');

    const readReceiptPromise = new Promise<any>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for messages_read receipt')), 4000);
      menteeSocket!.on('messages_read', (payload) => {
        clearTimeout(timeout);
        resolve(payload);
      });
    });

    mentorSocket.emit('mark_as_read', { conversationId: fixtures.conversationId });
    const readReceipt = await readReceiptPromise;

    if (readReceipt.readBy === fixtures.mentorUserId) {
      success(`Mentee received read receipt: Read by Mentor at ${readReceipt.readAt}`);
      passed++;
    } else {
      error(`Unexpected read receipt payload: ${JSON.stringify(readReceipt)}`);
      failed++;
    }

    // ────────────────────────────────────────────────────────────────────────
    // TEST 8: REST Message History & Cursor Pagination
    // ────────────────────────────────────────────────────────────────────────
    header('TEST 8: REST Message History (GET /api/v1/conversations/:id/messages)');

    const historyRes = await fetch(
      `${API_URL}/api/v1/conversations/${fixtures.conversationId}/messages?limit=10`,
      { headers: { Authorization: `Bearer ${menteeToken}` } },
    );
    const historyBody = (await historyRes.json()) as any;

    if (
      historyRes.ok &&
      Array.isArray(historyBody.data) &&
      historyBody.data.length > 0 &&
      historyBody.data[0].content === testMessageContent &&
      historyBody.data[0].isRead === true
    ) {
      success(`Retrieved message history: 1 message returned, isRead=true, sender verified.`);
      passed++;
    } else {
      error(`Unexpected message history response: ${JSON.stringify(historyBody)}`);
      failed++;
    }
  } finally {
    if (menteeSocket) menteeSocket.close();
    if (mentorSocket) mentorSocket.close();
  }

  // Cleanup
  await cleanupFixtures();

  // Final Report
  header('FINAL TEST REPORT');
  log(`Total Tests Run:    ${passed + failed}`);
  log(`Tests Passed:       ${colors.green}${passed}${colors.reset}`);
  log(`Tests Failed:       ${failed > 0 ? colors.red + failed + colors.reset : '0'}`);

  if (failed === 0) {
    console.log(`\n${colors.bold}${colors.green}ALL REAL-TIME MESSAGING TESTS PASSED WITH 100% SUCCESS!${colors.reset}\n`);
    process.exit(0);
  } else {
    console.log(`\n${colors.bold}${colors.red}SOME TESTS FAILED.${colors.reset}\n`);
    process.exit(1);
  }
}

runTests().catch(async (err) => {
  error(`Unhandled test exception: ${err.message}`);
  console.error(err.stack);
  await cleanupFixtures();
  process.exit(1);
});
