import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import type { Request } from 'express';

export interface JwtPayload {
  sub: string;
  email: string;
  isMentor?: boolean;
  role?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
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

  validate(payload: JwtPayload) {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const role = payload.role ?? (payload.isMentor ? 'mentor' : 'mentee');

    return {
      userId: payload.sub,
      email: payload.email,
      isMentor: payload.isMentor ?? false,
      role,
    };
  }
}
