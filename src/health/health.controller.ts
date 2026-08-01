import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';

import { Public } from '@common/decorators/public.decorator';
import { ErrorResponseDto } from '@common/dto/error-response.dto';

import { LivenessResponseDto, ReadinessResponseDto } from './dto/health.response.dto';
import { HealthService } from './health.service';

/**
 * Registered outside the `/api/v1` prefix (see `main.ts`): the container HEALTHCHECK in
 * DEPLOYMENT.md §4 and the external uptime probe in §8 both target `/health`, and an
 * operational probe should not move when the API is versioned.
 *
 * `@SkipThrottle()` at the controller level: `@Public()` only bypasses `JwtAuthGuard`,
 * not the global `IdentifierThrottlerGuard`. Render (and any other platform probe) polls
 * this endpoint far more often than a real client would, especially right after a
 * deploy while the instance is still coming up — without this it trips the global
 * 100-req/min bucket and Render sees that as a failed health check (429), even though
 * the process is healthy.
 */
@ApiTags('Health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Liveness probe',
    description:
      'Public — no authentication required. Answers 200 whenever the process is running, ' +
      'and checks nothing else. A liveness probe that consults a dependency restarts the ' +
      'application when the dependency fails, which loses the instance and fixes nothing.',
  })
  @ApiOkResponse({ type: LivenessResponseDto })
  liveness(): LivenessResponseDto {
    return {
      status: 'ok',
      uptimeSeconds: Number(process.uptime().toFixed(3)),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @Public()
  @ApiOperation({
    summary: 'Readiness probe',
    description:
      'Public — no authentication required. Verifies that PostgreSQL and the object store ' +
      'are reachable. Returns 503 while any dependency is down, so the load balancer stops ' +
      'routing before the instance stops answering.',
  })
  @ApiOkResponse({ type: ReadinessResponseDto })
  @ApiServiceUnavailableResponse({
    description: 'SERVICE_UNAVAILABLE — `details` names each failing dependency',
    type: ErrorResponseDto,
  })
  async readiness(): Promise<ReadinessResponseDto> {
    const { checks } = await this.health.checkReadiness();

    return { status: 'ok', checks, timestamp: new Date().toISOString() };
  }
}
