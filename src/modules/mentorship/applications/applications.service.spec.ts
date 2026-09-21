import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsService } from './applications.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MentorshipApplicationStatus } from '@prisma/client';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: any;
  let eventEmitter: any;

  const mockPrisma = {
    plan: {
      findUnique: jest.fn(),
    },
    mentorProfile: {
      findUnique: jest.fn(),
    },
    mentorshipApplication: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    mentorship: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('applyToPlan', () => {
    it('should throw NotFoundException if plan not found', async () => {
      prisma.plan.findUnique.mockResolvedValue(null);

      await expect(
        service.applyToPlan('mentee-1', { planId: 'plan-99' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if plan is not active', async () => {
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-1',
        isActive: false,
        mentor: { isVerified: true, onboardingStatus: 'COMPLETE' },
      });

      await expect(
        service.applyToPlan('mentee-1', { planId: 'plan-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if mentor is not verified or onboarding incomplete', async () => {
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-1',
        isActive: true,
        mentor: { isVerified: false, onboardingStatus: 'INCOMPLETE' },
      });

      await expect(
        service.applyToPlan('mentee-1', { planId: 'plan-1' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if mentee has existing pending application', async () => {
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-1',
        mentorId: 'mentor-prof-1',
        isActive: true,
        mentor: { isVerified: true, onboardingStatus: 'COMPLETE' },
      });

      prisma.mentorshipApplication.findFirst.mockResolvedValue({
        id: 'app-existing',
        status: MentorshipApplicationStatus.PENDING,
      });

      await expect(
        service.applyToPlan('mentee-1', { planId: 'plan-1' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should successfully create application and emit submitted event', async () => {
      prisma.plan.findUnique.mockResolvedValue({
        id: 'plan-1',
        mentorId: 'mentor-prof-1',
        isActive: true,
        mentor: { isVerified: true, onboardingStatus: 'COMPLETE' },
      });
      prisma.mentorshipApplication.findFirst.mockResolvedValue(null);
      prisma.mentorshipApplication.create.mockResolvedValue({
        id: 'app-1',
        menteeId: 'mentee-1',
        mentorId: 'mentor-prof-1',
        planId: 'plan-1',
        message: 'Hello!',
        status: MentorshipApplicationStatus.PENDING,
      });

      const result = await service.applyToPlan('mentee-1', {
        planId: 'plan-1',
        message: 'Hello!',
      });

      expect(result.data.id).toBe('app-1');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'mentorship.application.submitted',
        expect.objectContaining({ applicationId: 'app-1', menteeId: 'mentee-1' }),
      );
    });
  });

  describe('getMentorApplications', () => {
    it('should resolve mentorProfileId and fetch mentor applications', async () => {
      prisma.mentorProfile.findUnique.mockResolvedValue({ id: 'mentor-prof-1' });
      prisma.mentorshipApplication.findMany.mockResolvedValue([
        { id: 'app-1', mentorId: 'mentor-prof-1' },
      ]);

      const result = await service.getMentorApplications('user-mentor-1');

      expect(prisma.mentorProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-mentor-1' },
        select: { id: true },
      });
      expect(prisma.mentorshipApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { mentorId: 'mentor-prof-1' },
        }),
      );
      expect(result.data).toHaveLength(1);
    });
  });

  describe('acceptApplication', () => {
    it('should throw ForbiddenException if mentor profile does not match application', async () => {
      prisma.mentorProfile.findUnique.mockResolvedValue({ id: 'mentor-prof-1' });
      prisma.mentorshipApplication.findUnique.mockResolvedValue({
        id: 'app-1',
        mentorId: 'different-mentor-prof',
        status: MentorshipApplicationStatus.PENDING,
      });

      await expect(
        service.acceptApplication('user-mentor-1', 'app-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should accept application, create INTRO mentorship, and emit accepted event', async () => {
      prisma.mentorProfile.findUnique.mockResolvedValue({ id: 'mentor-prof-1' });
      prisma.mentorshipApplication.findUnique.mockResolvedValue({
        id: 'app-1',
        menteeId: 'mentee-1',
        mentorId: 'mentor-prof-1',
        planId: 'plan-1',
        status: MentorshipApplicationStatus.PENDING,
      });

      prisma.$transaction.mockImplementation(async (callback: any) => {
        return callback({
          mentorshipApplication: {
            update: jest.fn().mockResolvedValue({
              id: 'app-1',
              status: MentorshipApplicationStatus.ACCEPTED,
            }),
          },
          mentorship: {
            create: jest.fn().mockResolvedValue({
              id: 'mentorship-1',
              status: 'INTRO',
            }),
          },
        });
      });

      const result = await service.acceptApplication('user-mentor-1', 'app-1');

      expect(result.data.status).toBe(MentorshipApplicationStatus.ACCEPTED);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'mentorship.application.accepted',
        expect.objectContaining({
          applicationId: 'app-1',
          mentorshipId: 'mentorship-1',
        }),
      );
    });
  });

  describe('withdrawApplication', () => {
    it('should allow mentee to withdraw pending application', async () => {
      prisma.mentorshipApplication.findUnique.mockResolvedValue({
        id: 'app-1',
        menteeId: 'mentee-1',
        status: MentorshipApplicationStatus.PENDING,
      });
      prisma.mentorshipApplication.update.mockResolvedValue({
        id: 'app-1',
        status: MentorshipApplicationStatus.WITHDRAWN,
      });

      const result = await service.withdrawApplication('mentee-1', 'app-1');

      expect(result.data.status).toBe(MentorshipApplicationStatus.WITHDRAWN);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'mentorship.application.withdrawn',
        expect.objectContaining({ applicationId: 'app-1', menteeId: 'mentee-1' }),
      );
    });

    it('should throw ForbiddenException if mentee does not own application', async () => {
      prisma.mentorshipApplication.findUnique.mockResolvedValue({
        id: 'app-1',
        menteeId: 'other-mentee',
        status: MentorshipApplicationStatus.PENDING,
      });

      await expect(
        service.withdrawApplication('mentee-1', 'app-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
