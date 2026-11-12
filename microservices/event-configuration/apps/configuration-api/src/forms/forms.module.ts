import { Module } from '@nestjs/common';
import { DatabaseService } from '../shared/database/database.service';
import { SERIALIZABLE_TRANSACTION } from '../shared/application/serializable-transaction.port';
import { EventsModule } from '../events/events.module';
import { FormsController } from './presentation/forms.controller';
import { FormsService } from './application/forms.service';
import { FormsPgRepository } from './infrastructure/forms-pg.repository';
import { FORM_VALIDATOR } from './application/form-validator.port';
import { FormsSchemaValidator } from './infrastructure/forms-schema.validator';
import { FORMS_REPOSITORY } from './domain/forms.repository';
@Module({ imports: [EventsModule], controllers: [FormsController], providers: [FormsService, FormsPgRepository, FormsSchemaValidator, { provide: FORMS_REPOSITORY, useExisting: FormsPgRepository }, { provide: FORM_VALIDATOR, useExisting: FormsSchemaValidator }, { provide: SERIALIZABLE_TRANSACTION, useExisting: DatabaseService }], exports: [FormsService] })
export class FormsModule {}
