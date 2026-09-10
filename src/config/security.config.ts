import type { ConfigService } from '@nestjs/config';

export const DEFAULT_CORS_ORIGIN = 'http://localhost:3000';
export const DEFAULT_GLOBAL_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_GLOBAL_THROTTLE_LIMIT = 100;
export const DEFAULT_AUTH_THROTTLE_TTL_MS = 60_000;
export const DEFAULT_AUTH_THROTTLE_LIMIT = 10;

const TEST_THROTTLE_LIMIT = 10_000;

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function testAwareLimit(defaultLimit: number): number {
  return process.env.NODE_ENV === 'test' ? TEST_THROTTLE_LIMIT : defaultLimit;
}

export function getCorsOrigin(configService: ConfigService): string {
  const configuredOrigin = configService.get<string>('CORS_ORIGIN');

  if (configuredOrigin) return configuredOrigin;
  if (configService.get<string>('NODE_ENV') === 'production') {
    throw new Error('CORS_ORIGIN must be configured in production');
  }

  return DEFAULT_CORS_ORIGIN;
}

export function getGlobalThrottleTtl(configService: ConfigService): number {
  return positiveInteger(
    configService.get<string>('THROTTLE_TTL_MS'),
    DEFAULT_GLOBAL_THROTTLE_TTL_MS,
  );
}

export function getGlobalThrottleLimit(configService: ConfigService): number {
  return positiveInteger(
    configService.get<string>('THROTTLE_LIMIT'),
    testAwareLimit(DEFAULT_GLOBAL_THROTTLE_LIMIT),
  );
}

export function getAuthThrottleTtl(): number {
  return positiveInteger(
    process.env.AUTH_THROTTLE_TTL_MS,
    DEFAULT_AUTH_THROTTLE_TTL_MS,
  );
}

export function getAuthThrottleLimit(): number {
  return positiveInteger(
    process.env.AUTH_THROTTLE_LIMIT,
    testAwareLimit(DEFAULT_AUTH_THROTTLE_LIMIT),
  );
}
