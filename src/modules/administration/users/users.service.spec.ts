import { Test, TestingModule } from '@nestjs/testing';
import { AdminUsersService } from './users.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { MailService } from '../../../common/services/mail.service';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let prisma: any;
  let mailService: any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'new-admin-id',
            email: data.email,
            role: data.role,
            createdAt: new Date(),
          }),
        ),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({ id: where.id, email: 'target@example.com', role: 'ADMIN', ...data }),
        ),
      },
      adminAuditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-log-1' }),
      },
    };

    mailService = {
      sendAdminInvitationEmail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<AdminUsersService>(AdminUsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('inviteAdmin', () => {
    it('should create new admin user and send invitation email', async () => {
      prisma.user.findUnique.mockResolvedValueOnce(null);

      const result = await service.inviteAdmin('super-admin-id', {
        email: 'officer@mentoraura.com',
        role: 'ADMIN',
      });

      expect(result.data.email).toBe('officer@mentoraura.com');
      expect(result.data.role).toBe(UserRole.ADMIN);
      expect(result.inviteToken).toBeDefined();
      expect(mailService.sendAdminInvitationEmail).toHaveBeenCalledWith(
        'officer@mentoraura.com',
        UserRole.ADMIN,
        result.inviteToken,
      );
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ADMIN_INVITED',
            adminId: 'super-admin-id',
          }),
        }),
      );
    });

    it('should throw ConflictException if user email already exists', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'existing-id' });

      await expect(
        service.inviteAdmin('super-admin-id', { email: 'officer@mentoraura.com' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('toggleUserActive', () => {
    it('should disallow admin from suspending their own account', async () => {
      await expect(
        service.toggleUserActive('admin-id', 'admin-id', false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update user active status and write audit log', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'user-2', email: 'user@example.com' });

      const result = await service.toggleUserActive('admin-id', 'user-2', false);
      expect(result.data.isActive).toBe(false);
      expect(prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'USER_SUSPENDED',
            adminId: 'admin-id',
          }),
        }),
      );
    });
  });
});
