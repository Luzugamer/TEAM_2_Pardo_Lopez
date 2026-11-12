import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../shared/database/database.service';
import { PublicationUnitOfWork } from '../../application/ports/publication-dependencies.port';

@Injectable()
export class DatabasePublicationUnitOfWork implements PublicationUnitOfWork {
  constructor(private readonly database: DatabaseService) {}
  run<T>(organizationId: string, work: () => Promise<T>): Promise<T> {
    return this.database.getIsConnected()
      ? this.database.withSerializableTransaction(organizationId, work)
      : work();
  }
}
