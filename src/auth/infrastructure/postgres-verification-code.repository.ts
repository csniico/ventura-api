import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { IVerificationCode } from '../domain/verification-code.entity';
import {
  ICreateVerificationCode,
  VerificationCodeRepository,
} from '../domain/verification-code.repository';
import {
  PostgresVerificationCode,
  PostgresVerificationCodeEntity,
} from '../domain/postgres.verification-code-entity';

@Injectable()
export class PostgresVerificationCodeRepository implements VerificationCodeRepository {
  constructor(private readonly em: EntityManager) {}

  private toDomain(entity: PostgresVerificationCode): IVerificationCode {
    return {
      id: entity.id,
      email: entity.email,
      code: entity.code,
      expiresAt: entity.expiresAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }

  async create(data: ICreateVerificationCode): Promise<IVerificationCode> {
    const record = this.em.create(PostgresVerificationCodeEntity, data);
    await this.em.flush();
    return this.toDomain(record);
  }

  async findByEmailAndCode(
    email: string,
    code: string,
  ): Promise<IVerificationCode | null> {
    const record = await this.em.findOne(PostgresVerificationCodeEntity, {
      email,
      code,
    });
    return record ? this.toDomain(record) : null;
  }

  async deleteByEmail(email: string): Promise<void> {
    await this.em.nativeDelete(PostgresVerificationCodeEntity, { email });
  }
}
