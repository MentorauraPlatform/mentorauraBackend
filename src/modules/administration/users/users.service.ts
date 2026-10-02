import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { MailService } from '../../../common/services/mail.service';

export interface InviteAdminDto {
  email: string;
  role?: 'ADMIN' | 'SUPER_ADMIN';
  password?: string;
  fullName?: string;
}

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async getUsers(query: { role?: string; q?: string; page?: number; limit?: number }) {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.max(Number(query.limit) || 10, 1);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (query.role) {
      where.role = query.role.toUpperCase();
    }

    if (query.q) {
      where.email = { contains: query.q, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          isMentor: true,
          isActive: true,
          isEmailVerified: true,
          createdAt: true,
          menteeProfile: { select: { fullName: true, avatarUrl: true } },
          mentorProfile: { select: { fullName: true, isVerified: true, onboardingStatus: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data: items,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async inviteAdmin(callerId: string, dto: InviteAdminDto) {
    const cleanEmail = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
    });

    if (existing) {
      throw new ConflictException(`User with email '${cleanEmail}' already exists`);
    }

    const targetRole = dto.role === 'SUPER_ADMIN' ? UserRole.SUPER_ADMIN : UserRole.ADMIN;
    const rawPassword = dto.password || crypto.randomBytes(16).toString('hex') + 'A1!';
    const passwordHash = await bcrypt.hash(rawPassword, 12);

    const rawInviteToken = crypto.randomBytes(32).toString('hex');
    const hashedInviteToken = crypto.createHash('sha256').update(rawInviteToken).digest('hex');
    const invitationExpires = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours

    const newAdmin = await this.prisma.user.create({
      data: {
        email: cleanEmail,
        passwordHash,
        role: targetRole,
        isActive: true,
        isEmailVerified: true,
        invitationToken: hashedInviteToken,
        invitationExpires,
        menteeProfile: {
          create: {
            fullName: dto.fullName || (targetRole === UserRole.SUPER_ADMIN ? 'Super Admin' : 'Admin User'),
          },
        },
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId: callerId,
        action: 'ADMIN_INVITED',
        targetId: newAdmin.id,
        details: { email: newAdmin.email, role: newAdmin.role },
      },
    });

    await this.mailService.sendAdminInvitationEmail(cleanEmail, targetRole, rawInviteToken);

    return { data: newAdmin, inviteToken: rawInviteToken };
  }

  async toggleUserActive(callerId: string, targetUserId: string, isActive: boolean) {
    if (callerId === targetUserId) {
      throw new ForbiddenException('Admins cannot change their own active status');
    }

    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException(`User '${targetUserId}' not found`);
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isActive },
      select: { id: true, email: true, role: true, isActive: true },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId: callerId,
        action: isActive ? 'USER_ACTIVATED' : 'USER_SUSPENDED',
        targetId: targetUserId,
        details: { email: target.email, isActive },
      },
    });

    return { data: updated };
  }
}
