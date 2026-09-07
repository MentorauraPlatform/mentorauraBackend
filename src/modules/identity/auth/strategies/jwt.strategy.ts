import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

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
  constructor(configService: ConfigService) {
    const secret =
      configService.get<string>('jwt.secret') ?? 'super-secret-key';
    const bearerExtractor = ExtractJwt.fromAuthHeaderAsBearerToken();

    super({
      jwtFromRequest: (req: RequestLike) => {
        const bearerToken = bearerExtractor(req as any);
        if (bearerToken) {
          return bearerToken;
        }

        // guard cookies access with typed request
        if (
          req &&
          typeof req === 'object' &&
          req.cookies &&
          typeof req.cookies === 'object'
        ) {
          const token = req.cookies['access_token'];
          if (typeof token === 'string') return token;
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
