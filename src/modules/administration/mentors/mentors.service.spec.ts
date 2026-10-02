import { Test, TestingModule } from '@nestjs/testing';
import { AdminMentorsService } from './mentors.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('AdminMentorsService', () => {
  let service: AdminMentorsService;
  let prisma: any;
  let eventEmitter: any;

  const mockMentorProfile = {
    id: 'mentor-123',
    userId: 'user-456',
    fullName: 'Jane Doe',
    title: 'Senior Engineer',
    onboardingStatus: 'PENDING',
    isVerified: false,
  };

  beforeEach(async () => {
    prisma = {
      mentorProfile: {
        findMany: jest.fn().mockResolvedValue([mockMentorProfile]),
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn().mockResolvedValue(mockMentorProfile),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ ...mockMentorProfile, ...data }),
        ),
      },
      user: {
        update: jest.fn().mockResolvedValue({ id: 'user-456', isMentor: true }),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
      $transaction: jest.fn().mockImplementation((cb) => cb(prisma)),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminMentorsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<AdminMentorsService>(AdminMentorsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getMentorApplications', () => {
    it('should query applications and map SUBMITTED to PENDING/SUBMITTED', async () => {
      const result = await service.getMentorApplications({ status: 'SUBMITTED', page: 1, limit: 10 });
      expect(result.data).toHaveLength(1);
      expect(prisma.mentorProfile.findMany).toHaveBeenCalled();
      const whereArg = (prisma.mentorProfile.findMany as jest.Mock).mock.calls[0][0].where;
      expect(whereArg.onboardingStatus).toEqual({ in: ['SUBMITTED', 'PENDING'] });
    });
  });

  describe('approveMentorApplication', () => {
    it('should approve mentor, update isVerified, and emit approval event', async () => {
      const result = await service.approveMentorApplication('admin-1', 'mentor-123', '127.0.0.1');
      expect(result.data.isVerified).toBe(true);
      expect(result.data.onboardingStatus).toBe('COMPLETE');
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'MENTOR_APPROVED',
            adminId: 'admin-1',
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'mentor.application.approved',
        expect.objectContaining({
          mentorProfileId: 'mentor-123',
          userId: 'user-456',
        }),
      );
    });

    it('should throw NotFoundException if mentor does not exist', async () => {
      prisma.mentorProfile.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.approveMentorApplication('admin-1', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('rejectMentorApplication', () => {
    it('should reject mentor, record reason, and emit rejection event', async () => {
      const result = await service.rejectMentorApplication(
        'admin-1',
        'mentor-123',
        { rejectionReason: 'Insufficient credentials' },
        '127.0.0.1',
      );
      expect(result.data.isVerified).toBe(false);
      expect(result.data.onboardingStatus).toBe('REJECTED');
      expect(result.data.rejectionReason).toBe('Insufficient credentials');
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'MENTOR_REJECTED',
          }),
        }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'mentor.application.rejected',
        expect.objectContaining({
          reason: 'Insufficient credentials',
        }),
      );
    });

    it('should throw BadRequestException if rejection reason is empty', async () => {
      await expect(
        service.rejectMentorApplication('admin-1', 'mentor-123', { rejectionReason: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
