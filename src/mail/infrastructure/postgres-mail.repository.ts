import { EntityManager } from '@mikro-orm/postgresql'
import { Injectable } from '@nestjs/common'
import { IMail } from '../domain/mail.entity'
import { ICreateMail, MailRepository } from '../domain/mail.repository'
import {
  PostgresMail,
  PostgresMailEntity,
} from '../domain/postgres.mail-entity'

@Injectable()
export class PostgresMailRepository implements MailRepository {
  constructor(private readonly em: EntityManager) {}

  private toDomain(entity: PostgresMail): IMail {
    return {
      id: entity.id,
      shortId: entity.shortId,
      to: entity.to,
      from: entity.from,
      subject: entity.subject,
      type: entity.type,
      status: entity.status,
      providerId: entity.providerId,
      error: entity.error,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    }
  }

  async create(data: ICreateMail): Promise<IMail> {
    const mail = this.em.create(PostgresMailEntity, data)
    await this.em.flush()
    return this.toDomain(mail)
  }
}
