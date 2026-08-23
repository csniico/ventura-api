import type { Provider } from '@nestjs/common'
import { nanoid } from 'nanoid/non-secure'
import { IMail } from '../mail/domain/mail.entity'
import {
  ICreateMail,
  MAIL_DATA_SOURCE,
  MailRepository,
} from '../mail/domain/mail.repository'

/**
 * In-memory `MailRepository` for tests. Records each send attempt with a
 * generated id/shortId, without a database.
 */
export class FakeMailRepository implements MailRepository {
  private readonly rows: IMail[] = []
  private seq = 0

  create(data: ICreateMail): Promise<IMail> {
    const now = new Date()
    const mail: IMail = {
      id: `80000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      shortId: nanoid(8),
      to: data.to,
      from: data.from,
      subject: data.subject,
      type: data.type,
      status: data.status,
      providerId: data.providerId ?? null,
      error: data.error ?? null,
      createdAt: now,
      updatedAt: now,
    }
    this.rows.push(mail)
    return Promise.resolve({ ...mail })
  }

  // --- Test-only helpers (not part of the port) ---
  _clear(): void {
    this.rows.length = 0
    this.seq = 0
  }
  _all(): IMail[] {
    return this.rows.map((m) => ({ ...m }))
  }
  _count(): number {
    return this.rows.length
  }
}

/** Provider binding the `MAIL_DATA_SOURCE` token to a fresh fake, plus a handle. */
export function fakeMailRepositoryProvider(): {
  provider: Provider
  mails: FakeMailRepository
} {
  const mails = new FakeMailRepository()
  return { mails, provider: { provide: MAIL_DATA_SOURCE, useValue: mails } }
}
