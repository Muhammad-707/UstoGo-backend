import { ApiProperty } from '@nestjs/swagger';

export class LivenessResponseDto {
  @ApiProperty({ example: 'ok', description: 'Always "ok" — the process answered' })
  status!: 'ok';

  @ApiProperty({ example: 12.482, description: 'Process uptime in seconds' })
  uptimeSeconds!: number;

  @ApiProperty({ example: '2026-07-29T10:15:00.000Z' })
  timestamp!: string;
}

export class HealthCheckDto {
  @ApiProperty({ example: 'up', enum: ['up', 'down'], enumName: 'HealthStatus' })
  status!: 'up' | 'down';

  @ApiProperty({ example: 3, description: 'How long the probe took, in milliseconds' })
  latencyMs!: number;
}

export class ReadinessResponseDto {
  @ApiProperty({ example: 'ok' })
  status!: 'ok';

  @ApiProperty({
    type: HealthCheckDto,
    isArray: false,
    description: 'One entry per dependency, keyed by name',
    example: {
      database: { status: 'up', latencyMs: 3 },
      objectStorage: { status: 'up', latencyMs: 11 },
    },
  })
  checks!: Record<string, HealthCheckDto>;

  @ApiProperty({ example: '2026-07-29T10:15:00.000Z' })
  timestamp!: string;
}
