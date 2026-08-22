import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import {
  EmailChangeRepository,
  IPendingEmailChange,
} from '../domain/email-change.repository';
import { PostgresEmailChangeEntity } from '../domain/postgres.email-change-entity';

@Injectable()
export class PostgresEmailChangeRepository implements EmailChangeRepository {
  constructor(private readonly em: EntityManager) {}

  async deleteByUserId(userId: string): Promise<void> {
    await this.em.nativeDelete(PostgresEmailChangeEntity, { userId });
  }

  async create(data: IPendingEmailChange): Promise<void> {
    // em.create stages the insert on the unit of work; flush executes it.
    this.em.create(PostgresEmailChangeEntity, data);
    await this.em.flush();
  }

  async findValid(
    userId: string,
    code: string,
    now: Date,
  ): Promise<IPendingEmailChange | null> {
    const change = await this.em.findOne(PostgresEmailChangeEntity, {
      userId,
      code,
      expiresAt: { $gt: now },
    });
    if (!change) {
      return null;
    }
    return {
      userId: change.userId,
      newEmail: change.newEmail,
      code: change.code,
      expiresAt: change.expiresAt,
    };
  }
}
