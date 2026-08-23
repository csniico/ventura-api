import { MikroORM, RequestContext } from '@mikro-orm/core'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import type { InvoiceRepository } from '../domain/invoice.repository'
import { INVOICE_DATA_SOURCE } from '../domain/invoice.repository'

/**
 * Daily job that promotes past-due SENT / PARTIALLY_PAID invoices to OVERDUE.
 * Without it the OVERDUE status would never be reached, since nothing on the
 * request path compares `dueDate` to the clock.
 */
@Injectable()
export class InvoiceOverdueTask {
  private readonly logger = new Logger(InvoiceOverdueTask.name)

  constructor(
    private readonly orm: MikroORM,
    @Inject(INVOICE_DATA_SOURCE)
    private readonly invoiceRepository: InvoiceRepository,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async markOverdue(): Promise<void> {
    // A cron tick has no HTTP request context, so wrap the work in a fresh EM
    // fork via RequestContext so the repository's context-bound EM resolves.
    await RequestContext.create(this.orm.em, async () => {
      const count = await this.invoiceRepository.markOverdue(new Date())
      if (count > 0) {
        this.logger.log(`Marked ${count} invoice(s) as OVERDUE.`)
      }
    })
  }
}
