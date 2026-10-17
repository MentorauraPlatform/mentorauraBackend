import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { SkillLevel } from '@prisma/client';
import { OnboardingService } from './onboarding.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let prisma: {
    menteeProfile: Record<string, jest.Mock>;
    skill: Record<string, jest.Mock>;
    userSkill: Record<string, jest.Mock>;
  };

  beforeEach(async () => {
    prisma = {
      menteeProfile: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      skill: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      userSkill: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(OnboardingService);
  });

  describe('createProfile', () => {
    it('creates a profile when none exists', async () => {
      prisma.menteeProfile.findUnique.mockResolvedValue(null);
      prisma.menteeProfile.create.mockResolvedValue({ id: 'p1', userId: 'u1', fullName: 'Jane' });

      const result = await service.createProfile('u1', { fullName: 'Jane' } as any);

      expect(prisma.menteeProfile.create).toHaveBeenCalled();
      expect(result.data.fullName).toBe('Jane');
    });

    it('throws ConflictException when a profile already exists', async () => {
      prisma.menteeProfile.findUnique.mockResolvedValue({ id: 'p1' });

      await expect(service.createProfile('u1', { fullName: 'Jane' } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('getMyProfile', () => {
    it('returns the profile when found', async () => {
      prisma.menteeProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });

      const result = await service.getMyProfile('u1');

      expect(result.data.id).toBe('p1');
    });

    it('throws NotFoundException when missing', async () => {
      prisma.menteeProfile.findUnique.mockResolvedValue(null);

      await expect(service.getMyProfile('u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateInterests', () => {
    it('updates interests when a profile exists', async () => {
      prisma.menteeProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      prisma.menteeProfile.update.mockResolvedValue({ id: 'p1', interests: ['Tech'] });

      const result = await service.updateInterests('u1', { interests: ['Tech'] } as any);

      expect(prisma.menteeProfile.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { interests: ['Tech'] },
      });
      expect(result.data.interests).toEqual(['Tech']);
    });

    it('throws NotFoundException when no profile exists', async () => {
      prisma.menteeProfile.findUnique.mockResolvedValue(null);

      await expect(service.updateInterests('u1', { interests: ['Tech'] } as any)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addSkill', () => {
    beforeEach(() => {
      prisma.menteeProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
    });

    it('creates a new Skill row when the skill name does not exist yet', async () => {
      prisma.skill.findUnique.mockResolvedValue(null);
      prisma.skill.create.mockResolvedValue({ id: 's1', name: 'Python' });
      prisma.userSkill.findFirst.mockResolvedValue(null);
      prisma.userSkill.create.mockResolvedValue({
        id: 'us1',
        level: SkillLevel.BEGINNER,
        skill: { id: 's1', name: 'Python' },
      });

      const result = await service.addSkill('u1', { name: 'Python' } as any);

      expect(prisma.skill.create).toHaveBeenCalledWith({ data: { name: 'Python' } });
      expect(result.data.skill.name).toBe('Python');
    });

    it('reuses an existing Skill row with the same name', async () => {
      prisma.skill.findUnique.mockResolvedValue({ id: 's1', name: 'Python' });
      prisma.userSkill.findFirst.mockResolvedValue(null);
      prisma.userSkill.create.mockResolvedValue({
        id: 'us1',
        level: SkillLevel.BEGINNER,
        skill: { id: 's1', name: 'Python' },
      });

      await service.addSkill('u1', { name: 'Python' } as any);

      expect(prisma.skill.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the user already has that skill', async () => {
      prisma.skill.findUnique.mockResolvedValue({ id: 's1', name: 'Python' });
      prisma.userSkill.findFirst.mockResolvedValue({ id: 'us1' });

      await expect(service.addSkill('u1', { name: 'Python' } as any)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('removeSkill', () => {
    it('deletes the UserSkill row when found', async () => {
      prisma.menteeProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      prisma.userSkill.findFirst.mockResolvedValue({ id: 'us1' });
      prisma.userSkill.delete.mockResolvedValue({});

      const result = await service.removeSkill('u1', 's1');

      expect(prisma.userSkill.delete).toHaveBeenCalledWith({ where: { id: 'us1' } });
      expect(result.message).toBe('Skill removed successfully');
    });

    it('throws NotFoundException when the skill is not on the profile', async () => {
      prisma.menteeProfile.findUnique.mockResolvedValue({ id: 'p1', userId: 'u1' });
      prisma.userSkill.findFirst.mockResolvedValue(null);

      await expect(service.removeSkill('u1', 's1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('submitOnboarding', () => {
    it('marks the profile complete when not already completed', async () => {
      prisma.menteeProfile.findUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        onboardingCompleted: false,
      });
      prisma.menteeProfile.update.mockResolvedValue({
        id: 'p1',
        onboardingCompleted: true,
      });

      const result = await service.submitOnboarding('u1', { confirmed: true } as any);

      expect(prisma.menteeProfile.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { onboardingCompleted: true },
      });
      expect(result.data.onboardingCompleted).toBe(true);
    });

    it('throws BadRequestException when onboarding is already complete', async () => {
      prisma.menteeProfile.findUnique.mockResolvedValue({
        id: 'p1',
        userId: 'u1',
        onboardingCompleted: true,
      });

      await expect(service.submitOnboarding('u1', { confirmed: true } as any)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
