import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { HealthResponseDto } from '../common/swagger/api-response.dto.js';

@Public()
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Consultar estado de la API' })
  @ApiOkResponse({ type: HealthResponseDto })
  getHealth(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
