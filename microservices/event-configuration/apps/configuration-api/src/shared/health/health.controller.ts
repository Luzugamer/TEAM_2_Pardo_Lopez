import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get()
  @ApiOperation({ summary: 'Service liveness and database connectivity probe' })
  check() {
    return {
      status: 'ok',
      service: 'configuration-api',
      database: this.databaseService.getIsConnected() ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    };
  }
}
