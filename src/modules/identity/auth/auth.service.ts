import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RegisterDto, UserRole } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

import * as crypto from 'crypto';
import { MailService } from '../../../common/services/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  /**
   * Register a new user and create an initial profile (Mentee/Mentor) with email verification
   */
  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const isMentor = dto.isMentor ?? dto.role === UserRole.MENTOR;

    // Generate high-entropy 32-byte crypto verification token
    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = crypto
      .createHash('sha256')
      .update(rawVerificationToken)
      .digest('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours expiry

    // Transaction to create User and Profile(s) atomically
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          isMentor,
          isEmailVerified: false,
          emailVerificationToken: hashedVerificationToken,
          emailVerificationExpires,
        },
      });

      // Create default MenteeProfile for all users
      await tx.menteeProfile.create({
        data: {
          userId: newUser.id,
          fullName: dto.fullName,
        },
      });

      // If user is a mentor, also create MentorProfile
      if (isMentor) {
        await tx.mentorProfile.create({
          data: {
            userId: newUser.id,
            fullName: dto.fullName,
            title: 'Mentor',
          },
        });
      }

      return newUser;
    });

    // Send verification email via Gmail SMTP
    await this.mailService.sendVerificationEmail(
      user.email,
      dto.fullName,
      rawVerificationToken,
    );

    const isUserMentor = Boolean(user.isMentor);
    const tokens = await this.generateTokens(user.id, user.email, isUserMentor);

    return {
      message:
        'Registration successful! Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email,
        isMentor: isUserMentor,
        isEmailVerified: false,
      },
      tokens,
    };
  }

  /**
   * Verify email token and activate user account
   */
  async verifyEmail(token: string) {
    if (!token) {
      throw new UnauthorizedException('Verification token is required');
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: hashedToken,
        emailVerificationExpires: { gt: new Date() },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    return {
      message: 'Email address verified successfully!',
    };
  }

  /**
   * Resend email verification link
   */
  async resendVerificationEmail(email: string) {
    if (!email) {
      throw new UnauthorizedException('Email address is required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: {
        menteeProfile: { select: { fullName: true } },
        mentorProfile: { select: { fullName: true } },
      },
    });

    if (!user) {
      // Return success message for privacy so user existence is not leaked
      return {
        message:
          'If an account with that email exists, a verification link has been sent.',
      };
    }

    if (user.isEmailVerified) {
      return { message: 'This email address is already verified.' };
    }

    const rawVerificationToken = crypto.randomBytes(32).toString('hex');
    const hashedVerificationToken = crypto
      .createHash('sha256')
      .update(rawVerificationToken)
      .digest('hex');
    const emailVerificationExpires = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: hashedVerificationToken,
        emailVerificationExpires,
      },
    });

    const fullName =
      user.menteeProfile?.fullName ?? user.mentorProfile?.fullName ?? 'User';

    await this.mailService.sendVerificationEmail(
      user.email,
      fullName,
      rawVerificationToken,
    );

    return {
      message: 'A new verification email has been sent successfully.',
    };
  }

  /**
   * Validate user credentials and return auth tokens
   */
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        menteeProfile: { select: { fullName: true, avatarUrl: true } },
        mentorProfile: { select: { fullName: true } },
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException(
        'Please verify your email address before logging in. Check your inbox for the verification link.',
      );
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isUserMentor = Boolean(user.isMentor);
    const tokens = await this.generateTokens(user.id, user.email, isUserMentor);

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        isMentor: isUserMentor,
        fullName:
          user.menteeProfile?.fullName ?? user.mentorProfile?.fullName ?? '',
        avatarUrl: user.menteeProfile?.avatarUrl ?? null,
      },
      tokens,
    };
  }

  /**
   * Refresh JWT access token using a valid refresh token
   */
  async refreshToken(dto: RefreshTokenDto) {
    try {
      const refreshSecret =
        this.configService.get<string>('jwt.refreshSecret') ??
        'super-refresh-secret-key';

      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        email: string;
        isMentor: boolean;
      }>(dto.refreshToken, { secret: refreshSecret });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User account inactive or not found');
      }

      const isUserMentor = Boolean(user.isMentor);
      const tokens = await this.generateTokens(
        user.id,
        user.email,
        isUserMentor,
      );

      return {
        message: 'Token refreshed successfully',
        tokens,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Get authenticated user profile
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        isMentor: true,
        isActive: true,
        createdAt: true,
        userSkills: {
          include: {
            skill: true,
          },
        },
        menteeProfile: {
          select: {
            id: true,
            fullName: true,
            avatarUrl: true,
            headline: true,
            goals: true,
            interests: true,
          },
        },
        mentorProfile: {
          select: {
            id: true,
            fullName: true,
            title: true,
            company: true,
            bio: true,
            isVerified: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User profile not found');
    }

    return {
      data: {
        ...user,
        role: user.isMentor ? 'mentor' : 'mentee',
      },
    };
  }

  /**
   * Request 6-digit OTP for password reset
   */
  async requestPasswordResetOtp(email: string) {
    if (!email || typeof email !== 'string') {
      return {
        message:
          'If an account with that email exists, a 6-digit verification code has been sent.',
      };
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({
      where: { email: cleanEmail },
      include: {
        menteeProfile: { select: { fullName: true } },
        mentorProfile: { select: { fullName: true } },
      },
    });

    if (!user || !user.isActive) {
      return {
        message:
          'If an account with that email exists, a 6-digit verification code has been sent.',
      };
    }

    const rawOtp = crypto.randomInt(100000, 1000000).toString();
    const otpHash = crypto.createHash('sha256').update(rawOtp).digest('hex');
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetOtpHash: otpHash,
        passwordResetOtpExpires: otpExpires,
        passwordResetOtpAttempts: 0,
      },
    });

    const fullName =
      user.menteeProfile?.fullName ?? user.mentorProfile?.fullName ?? 'User';

    try {
      await this.mailService.sendPasswordResetOtpEmail(
        user.email,
        fullName,
        rawOtp,
      );
    } catch (error) {
      console.error('Failed to dispatch password reset email:', error);
    }

    return {
      message:
        'A 6-digit verification code has been sent to your email address.',
    };
  }

  /**
   * Verify 6-digit OTP code validity
   */
  async verifyPasswordResetOtp(email: string, otp: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or verification code');
    }

    if (user.passwordResetOtpAttempts >= 5) {
      throw new UnauthorizedException(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    if (
      !user.passwordResetOtpHash ||
      !user.passwordResetOtpExpires ||
      user.passwordResetOtpExpires < new Date()
    ) {
      throw new UnauthorizedException(
        'Verification code has expired. Please request a new code.',
      );
    }

    const computedHash = crypto.createHash('sha256').update(otp).digest('hex');

    if (computedHash !== user.passwordResetOtpHash) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetOtpAttempts: { increment: 1 },
        },
      });
      throw new UnauthorizedException('Invalid 6-digit verification code');
    }

    return {
      message: 'Verification code confirmed.',
      valid: true,
    };
  }

  /**
   * Reset user password using verified 6-digit OTP code
   */
  async resetPasswordWithOtp(email: string, otp: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or verification code');
    }

    if (user.passwordResetOtpAttempts >= 5) {
      throw new UnauthorizedException(
        'Maximum verification attempts exceeded. Please request a new code.',
      );
    }

    if (
      !user.passwordResetOtpHash ||
      !user.passwordResetOtpExpires ||
      user.passwordResetOtpExpires < new Date()
    ) {
      throw new UnauthorizedException(
        'Verification code has expired. Please request a new code.',
      );
    }

    const computedHash = crypto.createHash('sha256').update(otp).digest('hex');

    if (computedHash !== user.passwordResetOtpHash) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetOtpAttempts: { increment: 1 },
        },
      });
      throw new UnauthorizedException('Invalid 6-digit verification code');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: newPasswordHash,
        passwordResetOtpHash: null,
        passwordResetOtpExpires: null,
        passwordResetOtpAttempts: 0,
      },
    });

    return {
      message:
        'Your password has been reset successfully! You can now log in with your new password.',
    };
  }

  /**
   * Generate Access Token and Refresh Token pair
   */
  private async generateTokens(
    userId: string,
    email: string,
    isMentor: boolean,
  ) {
    const role = isMentor ? 'mentor' : 'mentee';
    const payload = { sub: userId, email, isMentor, role };

    const accessSecret =
      this.configService.get<string>('jwt.secret') ?? 'super-secret-key';
    const accessExpiresIn =
      this.configService.get<string>('jwt.expiresIn') ?? '15m';

    const refreshSecret =
      this.configService.get<string>('jwt.refreshSecret') ??
      'super-refresh-secret-key';
    const refreshExpiresIn =
      this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d';

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: accessSecret,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expiresIn: accessExpiresIn as any,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: refreshSecret,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expiresIn: refreshExpiresIn as any,
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessExpiresIn,
    };
  }
}
