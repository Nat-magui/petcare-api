import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ERROR_CODE } from '../common/errors/error-code.js';
import { ApiPetCareErrors } from '../common/swagger/api-errors.decorator.js';
import {
  LoginResponseDto,
  PublicUserResponseDto,
  RefreshResponseDto,
} from '../common/swagger/api-response.dto.js';
import { SWAGGER_BEARER_AUTH } from '../common/swagger/swagger.config.js';
import {
  getAuthThrottleLimit,
  getAuthThrottleTtl,
} from '../config/security.config.js';
import type { PublicUser } from '../users/users.types.js';
import {
  AuthService,
  type LoginResponse,
  type RefreshResponse,
} from './auth.service.js';
import type { AuthenticatedRequest } from './auth.types.js';
import { Public } from './decorators/public.decorator.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Registrar usuario' })
  @ApiCreatedResponse({ type: PublicUserResponseDto })
  @ApiPetCareErrors({
    400: [ERROR_CODE.VALIDATION_ERROR],
    409: [ERROR_CODE.AUTH_EMAIL_IN_USE],
    429: [ERROR_CODE.RATE_LIMIT_EXCEEDED],
    500: [ERROR_CODE.INTERNAL_ERROR],
  })
  @Throttle({
    default: {
      limit: getAuthThrottleLimit,
      ttl: getAuthThrottleTtl,
    },
  })
  register(@Body() registerDto: RegisterDto): Promise<PublicUser> {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Iniciar sesión' })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiPetCareErrors({
    400: [ERROR_CODE.VALIDATION_ERROR],
    401: [ERROR_CODE.AUTH_INVALID_CREDENTIALS],
    429: [ERROR_CODE.RATE_LIMIT_EXCEEDED],
    500: [ERROR_CODE.INTERNAL_ERROR],
  })
  @Throttle({
    default: {
      limit: getAuthThrottleLimit,
      ttl: getAuthThrottleTtl,
    },
  })
  login(@Body() loginDto: LoginDto): Promise<LoginResponse> {
    return this.authService.login(loginDto);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token' })
  @ApiOkResponse({ type: RefreshResponseDto })
  @ApiPetCareErrors({
    400: [ERROR_CODE.VALIDATION_ERROR],
    401: [ERROR_CODE.AUTH_REFRESH_INVALID],
    500: [ERROR_CODE.INTERNAL_ERROR],
  })
  refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<RefreshResponse> {
    return this.authService.refresh(refreshTokenDto);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar sesión' })
  @ApiNoContentResponse({ description: 'Sesión refresh revocada.' })
  @ApiPetCareErrors({
    400: [ERROR_CODE.VALIDATION_ERROR],
    401: [ERROR_CODE.AUTH_REFRESH_INVALID],
    500: [ERROR_CODE.INTERNAL_ERROR],
  })
  logout(@Body() refreshTokenDto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(refreshTokenDto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Obtener perfil autenticado' })
  @ApiBearerAuth(SWAGGER_BEARER_AUTH)
  @ApiOkResponse({ type: PublicUserResponseDto })
  @ApiPetCareErrors({
    401: [ERROR_CODE.AUTH_ACCESS_REQUIRED],
    500: [ERROR_CODE.INTERNAL_ERROR],
  })
  getCurrentUser(@Req() request: AuthenticatedRequest): Promise<PublicUser> {
    return this.authService.getCurrentUser(request.user.userId);
  }
}
