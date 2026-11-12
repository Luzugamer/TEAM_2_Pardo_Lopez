import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './shared/database/database.module';
import { HealthController } from './shared/health/health.controller';
import { IdempotencyModule } from './shared/idempotency/idempotency.module';
import { EventsModule } from './events/events.module';
import { PublishingModule } from './publishing/publishing.module';
import { ScheduleModule } from './schedule/schedule.module';
import { FormsModule } from './forms/forms.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    IdempotencyModule,
    EventsModule,
    PublishingModule,
    ScheduleModule,
    FormsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

