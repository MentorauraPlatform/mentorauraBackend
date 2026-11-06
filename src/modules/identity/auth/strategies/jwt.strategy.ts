import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../../common/prisma/prisma.service';

import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  isMentor?: boolean;
  role?: string;
}

type RequestLike = { cookies?: Record<string, unknown> } & Record<
  string,
  unknown
>;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret =
      configService.get<string>('jwt.secret') ?? 'super-secret-key';
    const bearerExtractor = ExtractJwt.fromAuthHeaderAsBearerToken();

    super({
      jwtFromRequest: (req: Request): string | null => {
        const bearerToken = bearerExtractor(req);
        if (bearerToken) {
          return bearerToken;
        }

        const cookies = req?.cookies as Record<string, string> | undefined;
        if (cookies?.access_token) {
          return cookies.access_token;
        }

        return null;
      },
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        role: true,
        isMentor: true,
        isActive: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    if (!user.isActive) {
      throw new UnauthorizedException(
        'User account has been suspended or deactivated',
      );
    }

    const rawRole = user.role?.toLowerCase();
    const role =
      rawRole === 'admin' || rawRole === 'super_admin'
        ? rawRole
        : user.isMentor || rawRole === 'mentor' || payload.role?.toLowerCase() === 'mentor'
          ? 'mentor'
          : 'mentee';

    return {
      userId: user.id,
      email: user.email,
      isMentor: Boolean(user.isMentor),
      role,
    };
  }
}
