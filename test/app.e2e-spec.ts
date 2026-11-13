import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';

jest.mock('@nestjs/schedule', () => ({
  ScheduleModule: {
    forRoot: () => ({
      module: class MockScheduleModule {},
    }),
  },
  Cron: () => () => {},
  CronExpression: {
    EVERY_10_MINUTES: '0 */10 * * * *',
    EVERY_HOUR: '0 0 * * * *',
  },
}));

import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/common/prisma/prisma.service';
import { MailService } from './../src/common/services/mail.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('MentorAura Platform (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let configService: ConfigService;

  const MENTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
  const MENTOR_PROFILE_ID = '22222222-2222-4222-8222-222222222222';
  const MENTEE_USER_ID = '33333333-3333-4333-8333-333333333333';
  const ADMIN_USER_ID = '44444444-4444-4444-8444-444444444444';
  const SUPER_ADMIN_USER_ID = '55555555-5555-4555-8555-555555555555';
  const MENTORSHIP_ID = '66666666-6666-4666-8666-666666666666';
  const MESSAGE_ID = '77777777-7777-4777-8777-777777777777';

  const usersStore: Record<string, any> = {
    [MENTOR_USER_ID]: {
      id: MENTOR_USER_ID,
      email: 'mentor@mentoraura.test',
      role: 'MENTEE', // Tests that isMentor=true overrides default DB 'MENTEE' column
      isMentor: true,
      isActive: true,
      isEmailVerified: true,
    },
    [MENTEE_USER_ID]: {
      id: MENTEE_USER_ID,
      email: 'mentee@mentoraura.test',
      role: 'MENTEE',
      isMentor: false,
      isActive: true,
      isEmailVerified: true,
    },
    [ADMIN_USER_ID]: {
      id: ADMIN_USER_ID,
      email: 'admin@mentoraura.test',
      role: 'ADMIN',
      isMentor: false,
      isActive: true,
      isEmailVerified: true,
    },
    [SUPER_ADMIN_USER_ID]: {
      id: SUPER_ADMIN_USER_ID,
      email: 'superadmin@mentoraura.test',
      role: 'SUPER_ADMIN',
      isMentor: false,
      isActive: true,
      isEmailVerified: true,
    },
  };

  let mockPrisma: any;

  beforeAll(async () => {
    mockPrisma = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ id: MENTOR_PROFILE_ID }]),
      $transaction: jest.fn(async (cb: any) => {
        if (typeof cb === 'function') {
          return cb(mockPrisma);
        }
        return Promise.all(cb);
      }),
      user: {
        findUnique: jest.fn(({ where }: any) => {
          if (where?.id && usersStore[where.id])
            return Promise.resolve(usersStore[where.id]);
          if (where?.email) {
            const found = Object.values(usersStore).find(
              (u) => u.email === where.email,
            );
            return Promise.resolve(found || null);
          }
          return Promise.resolve(null);
        }),
        create: jest.fn(({ data }: any) =>
          Promise.resolve({
            id: '88888888-8888-4888-8888-888888888888',
            ...data,
            createdAt: new Date(),
          }),
        ),
        update: jest.fn(({ where, data }: any) =>
          Promise.resolve({
            ...(usersStore[where.id] || { id: where.id }),
            ...data,
          }),
        ),
      },
      mentorProfile: {
        findUnique: jest.fn(({ where }: any) => {
          if (
            where?.userId === MENTOR_USER_ID ||
            where?.id === MENTOR_PROFILE_ID
          ) {
            return Promise.resolve({
              id: MENTOR_PROFILE_ID,
              userId: MENTOR_USER_ID,
              fullName: 'Dr. Ada Lovelace',
              title: 'Principal Architect',
              isVerified: true,
              onboardingStatus: 'COMPLETE',
            });
          }
          return Promise.resolve(null);
        }),
        create: jest.fn(({ data }: any) =>
          Promise.resolve({
            id: MENTOR_PROFILE_ID,
            ...data,
          }),
        ),
      },
      menteeProfile: {
        create: jest.fn(({ data }: any) =>
          Promise.resolve({
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            ...data,
          }),
        ),
      },
      platformSetting: {
        findMany: jest.fn().mockResolvedValue([
          { key: 'commission_rate', value: '10' },
          { key: 'min_payout_amount', value: '5000' },
        ]),
        findFirst: jest
          .fn()
          .mockResolvedValue({ key: 'commission_rate', value: '10' }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ key: 'min_payout_amount', value: '5000' }),
      },
      payment: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { amount: BigInt(50000), currency: 'XAF', status: 'SUCCESS' },
          ]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      payout: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(({ data }: any) =>
          Promise.resolve({
            id: '99999999-9999-4999-8999-999999999999',
            ...data,
            status: 'PENDING',
            createdAt: new Date(),
          }),
        ),
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'notif-1',
            userId: MENTEE_USER_ID,
            type: 'BOOKING',
            title: 'Session Confirmed',
            message: 'Your session is confirmed.',
            isRead: false,
            createdAt: new Date(),
          },
        ]),
        count: jest.fn().mockResolvedValue(1),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      dispute: {
        create: jest.fn(({ data }: any) =>
          Promise.resolve({
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            ...data,
            status: 'OPEN',
            createdAt: new Date(),
          }),
        ),
      },
      moderationReport: {
        create: jest.fn(({ data }: any) =>
          Promise.resolve({
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            ...data,
            status: 'PENDING',
            createdAt: new Date(),
          }),
        ),
      },
      mentorship: {
        findFirst: jest.fn(() =>
          Promise.resolve({
            id: MENTORSHIP_ID,
            menteeId: MENTEE_USER_ID,
            mentorId: MENTOR_PROFILE_ID,
            status: 'INTRO',
            mentor: { id: MENTOR_PROFILE_ID, userId: MENTOR_USER_ID },
            plan: {
              id: 'plan-1',
              title: 'Pro Plan',
              priceAmount: BigInt(25000),
              currency: 'XAF',
            },
            payments: [], // No SUCCESS payment yet
          }),
        ),
        findUnique: jest.fn(({ where }: any) => {
          if (where?.id === MENTORSHIP_ID) {
            return Promise.resolve({
              id: MENTORSHIP_ID,
              menteeId: MENTEE_USER_ID,
              mentorId: MENTOR_PROFILE_ID,
              status: 'INTRO',
              mentor: { id: MENTOR_PROFILE_ID, userId: MENTOR_USER_ID },
              plan: {
                id: 'plan-1',
                title: 'Pro Plan',
                priceAmount: BigInt(25000),
                currency: 'XAF',
              },
              payments: [], // No SUCCESS payment yet
            });
          }
          return Promise.resolve(null);
        }),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const mockMailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(true),
      sendAdminInvitationEmail: jest.fn().mockResolvedValue(true),
      sendPasswordResetOtpEmail: jest.fn().mockResolvedValue(true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(MailService)
      .useValue(mockMailService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    jwtService = moduleFixture.get<JwtService>(JwtService);
    configService = moduleFixture.get<ConfigService>(ConfigService);
  });

  afterAll(async () => {
    await app.close();
  });

  const signToken = (userId: string, email: string, role: string) => {
    const secret =
      configService.get<string>('jwt.secret') ||
      process.env.JWT_SECRET ||
      'secret';
    return jwtService.sign({ sub: userId, email, role }, { secret });
  };

  describe('1. Public Health & Root Endpoints (@Public)', () => {
    it('GET /api/v1 should return 200 without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1').expect(200);
      expect(res.text).toBe('Hello World!');
    });

    it('GET /api/v1/health should return healthy status without authentication', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/health')
        .expect(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('2. Authentication & Role Assignment', () => {
    it('POST /api/v1/auth/register should assign role MENTOR when isMentor is true', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: 'newmentor@mentoraura.test',
          password: 'Password123!',
          fullName: 'New Mentor',
          isMentor: true,
        })
        .expect(201);

      expect(res.body.user.isMentor).toBe(true);
      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'newmentor@mentoraura.test',
            isMentor: true,
            role: 'MENTOR',
          }),
        }),
      );
    });

    it('GET /api/v1/notifications should reject unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .expect(401);
    });
  });

  describe('3. Mentor Payout Balance & Request Endpoints', () => {
    it('GET /api/v1/payouts/balance should allow mentor (even if DB role column is MENTEE but isMentor=true)', async () => {
      const mentorToken = signToken(
        MENTOR_USER_ID,
        'mentor@mentoraura.test',
        'MENTOR',
      );
      const res = await request(app.getHttpServer())
        .get('/api/v1/payouts/balance')
        .set('Authorization', `Bearer ${mentorToken}`)
        .expect(200);

      expect(res.body.data).toMatchObject({
        mentorId: MENTOR_PROFILE_ID,
        totalGrossRevenue: 50000,
        availableBalance: 45000,
        commissionPercent: 10,
      });
    });

    it('POST /api/v1/payouts/request should allow mentor to request a valid payout', async () => {
      const mentorToken = signToken(
        MENTOR_USER_ID,
        'mentor@mentoraura.test',
        'MENTOR',
      );
      const res = await request(app.getHttpServer())
        .post('/api/v1/payouts/request')
        .set('Authorization', `Bearer ${mentorToken}`)
        .send({
          amount: 10000,
          provider: 'MTN_MOMO',
          accountNumber: '237670000000',
        })
        .expect(201);

      expect(res.body.data.amount).toBe(10000);
      expect(res.body.data.status).toBe('PENDING');
    });

    it('GET /api/v1/payouts/balance should forbid a mentee with 403', async () => {
      const menteeToken = signToken(
        MENTEE_USER_ID,
        'mentee@mentoraura.test',
        'MENTEE',
      );
      await request(app.getHttpServer())
        .get('/api/v1/payouts/balance')
        .set('Authorization', `Bearer ${menteeToken}`)
        .expect(403);
    });
  });

  describe('4. In-App Notifications Flow', () => {
    it('GET /api/v1/notifications and PATCH /api/v1/notifications/read-all should work for authenticated user', async () => {
      const menteeToken = signToken(
        MENTEE_USER_ID,
        'mentee@mentoraura.test',
        'MENTEE',
      );

      const listRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${menteeToken}`)
        .expect(200);

      expect(Array.isArray(listRes.body.data)).toBe(true);
      expect(listRes.body.meta.unreadCount).toBe(1);

      const readAllRes = await request(app.getHttpServer())
        .patch('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${menteeToken}`)
        .expect(200);

      expect(readAllRes.body.data.updatedCount).toBe(1);
    });
  });

  describe('5. Disputes & Content Moderation Filing (ValidationPipe Whitelist)', () => {
    it('POST /api/v1/disputes should accept valid dispute payload with class-validator decorators', async () => {
      const menteeToken = signToken(
        MENTEE_USER_ID,
        'mentee@mentoraura.test',
        'MENTEE',
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/disputes')
        .set('Authorization', `Bearer ${menteeToken}`)
        .send({
          title: 'Mentor did not attend session',
          description: 'Waited 30 minutes on the video link.',
          reason: 'SESSION_NO_SHOW',
          mentorshipId: MENTORSHIP_ID,
        })
        .expect(201);

      expect(res.body.data.title).toBe('Mentor did not attend session');
      expect(res.body.data.reason).toBe('SESSION_NO_SHOW');
    });

    it('POST /api/v1/moderation/reports should accept valid content report payload', async () => {
      const menteeToken = signToken(
        MENTEE_USER_ID,
        'mentee@mentoraura.test',
        'MENTEE',
      );

      const res = await request(app.getHttpServer())
        .post('/api/v1/moderation/reports')
        .set('Authorization', `Bearer ${menteeToken}`)
        .send({
          targetType: 'MESSAGE',
          targetId: MESSAGE_ID,
          reason: 'Spam or solicitation',
          details: 'Requested off-platform wire transfer.',
        })
        .expect(201);

      expect(res.body.data.targetType).toBe('MESSAGE');
      expect(res.body.data.targetId).toBe(MESSAGE_ID);
    });
  });

  describe('6. Security Guards: Paid Mentorship Activation & Admin Privilege Escalation', () => {
    it('PATCH /api/v1/mentorships/:id/activate should block unpaid activation of paid plans with 400', async () => {
      const menteeToken = signToken(
        MENTEE_USER_ID,
        'mentee@mentoraura.test',
        'MENTEE',
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/mentorships/${MENTORSHIP_ID}/activate`)
        .set('Authorization', `Bearer ${menteeToken}`)
        .send({})
        .expect(400);
    });

    it('PATCH /api/v1/admin/users/:id/active should forbid regular ADMIN from suspending SUPER_ADMIN', async () => {
      const adminToken = signToken(
        ADMIN_USER_ID,
        'admin@mentoraura.test',
        'ADMIN',
      );

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${SUPER_ADMIN_USER_ID}/active`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ isActive: false })
        .expect(403);
    });
  });
});
