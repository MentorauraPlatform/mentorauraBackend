import { Test, TestingModule } from '@nestjs/testing';
import { LifecycleService } from './lifecycle.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('LifecycleService', () => {
  let service: LifecycleService;
  let prisma: any;
  let eventEmitter: any;

  const mockPrisma = {
    mentorProfile: {
      findUnique: jest.fn(),
    },
    mentorship: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LifecycleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<LifecycleService>(LifecycleService);
    prisma = module.get<PrismaService>(PrismaService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  describe('getMentorship', () => {
    it('should resolve mentee ownership using menteeId', async () => {
      mockPrisma.mentorship.findFirst.mockResolvedValue({
        id: 'm-1',
        menteeId: 'user-mentee-1',
        mentorId: 'mentor-prof-1',
        status: 'ACTIVE',
      });

      const result = await service.getMentorship('m-1', 'user-mentee-1', 'mentee');

      expect(prisma.mentorship.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm-1', menteeId: 'user-mentee-1' },
        }),
      );
      expect(result.id).toBe('m-1');
    });

    it('should resolve mentor ownership by looking up mentorProfileId', async () => {
      mockPrisma.mentorProfile.findUnique.mockResolvedValue({ id: 'mentor-prof-1' });
      mockPrisma.mentorship.findFirst.mockResolvedValue({
        id: 'm-1',
        mentorId: 'mentor-prof-1',
        status: 'ACTIVE',
      });

      const result = await service.getMentorship('m-1', 'user-mentor-1', 'mentor');

      expect(prisma.mentorProfile.findUnique).toHaveBeenCalledWith({
        where: { userId: 'user-mentor-1' },
        select: { id: true },
      });
      expect(prisma.mentorship.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'm-1', mentorId: 'mentor-prof-1' },
        }),
      );
      expect(result.id).toBe('m-1');
    });

    it('should throw NotFoundException if mentorship does not exist', async () => {
      mockPrisma.mentorship.findFirst.mockResolvedValue(null);

      await expect(
        service.getMentorship('m-99', 'user-mentee-1', 'mentee'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('State Machine Transitions', () => {
    describe('activateMentorship (INTRO -> ACTIVE)', () => {
      it('should activate INTRO mentorship successfully', async () => {
        mockPrisma.mentorship.findFirst.mockResolvedValue({
          id: 'm-1',
          menteeId: 'user-mentee-1',
          status: 'INTRO',
        });
        mockPrisma.mentorship.update.mockResolvedValue({
          id: 'm-1',
          status: 'ACTIVE',
        });

        const result = await service.activateMentorship('m-1', 'user-mentee-1', 'mentee');

        expect(result.data.status).toBe('ACTIVE');
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'mentorship.activated',
          expect.objectContaining({ mentorshipId: 'm-1' }),
        );
      });

      it('should throw BadRequestException if status is not INTRO', async () => {
        mockPrisma.mentorship.findFirst.mockResolvedValue({
          id: 'm-1',
          menteeId: 'user-mentee-1',
          status: 'ACTIVE',
        });

        await expect(
          service.activateMentorship('m-1', 'user-mentee-1', 'mentee'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('pauseMentorship (ACTIVE -> PAUSED)', () => {
      it('should pause ACTIVE mentorship', async () => {
        mockPrisma.mentorProfile.findUnique.mockResolvedValue({ id: 'mentor-prof-1' });
        mockPrisma.mentorship.findFirst.mockResolvedValue({
          id: 'm-1',
          mentorId: 'mentor-prof-1',
          status: 'ACTIVE',
        });
        mockPrisma.mentorship.update.mockResolvedValue({
          id: 'm-1',
          status: 'PAUSED',
        });

        const result = await service.pauseMentorship('m-1', 'user-mentor-1');

        expect(result.data.status).toBe('PAUSED');
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'mentorship.paused',
          expect.objectContaining({ mentorshipId: 'm-1' }),
        );
      });

      it('should throw BadRequestException if trying to pause non-ACTIVE mentorship', async () => {
        mockPrisma.mentorProfile.findUnique.mockResolvedValue({ id: 'mentor-prof-1' });
        mockPrisma.mentorship.findFirst.mockResolvedValue({
          id: 'm-1',
          mentorId: 'mentor-prof-1',
          status: 'INTRO',
        });

        await expect(
          service.pauseMentorship('m-1', 'user-mentor-1'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('resumeMentorship (PAUSED -> ACTIVE)', () => {
      it('should resume PAUSED mentorship', async () => {
        mockPrisma.mentorProfile.findUnique.mockResolvedValue({ id: 'mentor-prof-1' });
        mockPrisma.mentorship.findFirst.mockResolvedValue({
          id: 'm-1',
          mentorId: 'mentor-prof-1',
          status: 'PAUSED',
        });
        mockPrisma.mentorship.update.mockResolvedValue({
          id: 'm-1',
          status: 'ACTIVE',
        });

        const result = await service.resumeMentorship('m-1', 'user-mentor-1');

        expect(result.data.status).toBe('ACTIVE');
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'mentorship.resumed',
          expect.objectContaining({ mentorshipId: 'm-1' }),
        );
      });

      it('should throw BadRequestException if trying to resume non-PAUSED mentorship', async () => {
        mockPrisma.mentorProfile.findUnique.mockResolvedValue({ id: 'mentor-prof-1' });
        mockPrisma.mentorship.findFirst.mockResolvedValue({
          id: 'm-1',
          mentorId: 'mentor-prof-1',
          status: 'ACTIVE',
        });

        await expect(
          service.resumeMentorship('m-1', 'user-mentor-1'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('completeMentorship (ACTIVE -> COMPLETED)', () => {
      it('should complete ACTIVE mentorship', async () => {
        mockPrisma.mentorship.findFirst.mockResolvedValue({
          id: 'm-1',
          menteeId: 'user-mentee-1',
          status: 'ACTIVE',
        });
        mockPrisma.mentorship.update.mockResolvedValue({
          id: 'm-1',
          status: 'COMPLETED',
        });

        const result = await service.completeMentorship('m-1', 'user-mentee-1', 'mentee');

        expect(result.data.status).toBe('COMPLETED');
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'mentorship.completed',
          expect.objectContaining({ mentorshipId: 'm-1' }),
        );
      });

      it('should reject completing mentorship from PAUSED state', async () => {
        mockPrisma.mentorship.findFirst.mockResolvedValue({
          id: 'm-1',
          menteeId: 'user-mentee-1',
          status: 'PAUSED',
        });

        await expect(
          service.completeMentorship('m-1', 'user-mentee-1', 'mentee'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('cancelMentorship (INTRO/ACTIVE/PAUSED -> CANCELLED)', () => {
      it('should cancel mentorship and record cancellation reason', async () => {
        mockPrisma.mentorship.findFirst.mockResolvedValue({
          id: 'm-1',
          menteeId: 'user-mentee-1',
          status: 'ACTIVE',
        });
        mockPrisma.mentorship.update.mockResolvedValue({
          id: 'm-1',
          status: 'CANCELLED',
          cancellationReason: 'Schedule conflict',
        });

        const result = await service.cancelMentorship(
          'm-1',
          'user-mentee-1',
          'mentee',
          'Schedule conflict',
        );

        expect(result.data.status).toBe('CANCELLED');
        expect(prisma.mentorship.update).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              status: 'CANCELLED',
              cancellationReason: 'Schedule conflict',
            }),
          }),
        );
        expect(eventEmitter.emit).toHaveBeenCalledWith(
          'mentorship.cancelled',
          expect.objectContaining({
            mentorshipId: 'm-1',
            reason: 'Schedule conflict',
          }),
        );
      });

      it('should reject cancelling COMPLETED mentorship', async () => {
        mockPrisma.mentorship.findFirst.mockResolvedValue({
          id: 'm-1',
          menteeId: 'user-mentee-1',
          status: 'COMPLETED',
        });

        await expect(
          service.cancelMentorship('m-1', 'user-mentee-1', 'mentee', 'Too late'),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });
});
