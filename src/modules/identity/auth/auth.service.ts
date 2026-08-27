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
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Register a new user and create an initial profile (Mentee/Mentor)
   */
  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const role = dto.role ?? 'MENTEE';

    // Transaction to create User and Profile(s) atomically
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash,
          role,
        },
      });

      // Every user gets a MenteeProfile by default
      await tx.menteeProfile.create({
        data: {
          userId: newUser.id,
          fullName: dto.fullName,
        },
      });

      // If user registers as a MENTOR, also create their MentorProfile
      if (String(role) === 'MENTOR') {
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

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      tokens,
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

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
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
        role: string;
      }>(dto.refreshToken, { secret: refreshSecret });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User account inactive or not found');
      }

      const tokens = await this.generateTokens(user.id, user.email, user.role);

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
        role: true,
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
      data: user,
    };
  }

  /**
   * Generate Access Token and Refresh Token pair
   */
  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

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
