import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from '../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';

@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('resend-verification')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend email verification link' })
  @ApiResponse({ status: 200, description: 'Verification email resent' })
  async resendVerification(@Body('email') email: string) {
    return this.authService.resendVerificationEmail(email);
  }

  @Public()
  @Get('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address with token' })
  @ApiResponse({
    status: 200,
    description: 'Email address verified successfully',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  async verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Logged in successfully' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto, @Res() res: Response) {
    const result = await this.authService.login(dto);

    res.cookie('access_token', result.tokens.accessToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', result.tokens.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json(result);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh Access Token using Refresh Token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto, @Res() res: Response) {
    const result = await this.authService.refreshToken(dto);

    res.cookie('access_token', result.tokens.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60 * 1000,
    });

    res.cookie('refresh_token', result.tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json(result);
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getMe(user.userId);
  }
}
