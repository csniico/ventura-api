import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  normalizePaging,
  Paginated,
  paginate,
} from '../../common/dto/paginated'
import { ICustomer } from '../domain/customer.entity'
import type { CustomerRepository } from '../domain/customer.repository'
import { CUSTOMER_DATA_SOURCE } from '../domain/customer.repository'
import { CreateCustomerDto } from '../dto/create-customer.dto'
import { UpdateCustomerDto } from '../dto/update-customer.dto'

export interface BulkImportResult {
  created: ICustomer[]
  skipped: { index: number; reason: string }[]
  failed: { index: number; reason: string }[]
}

/**
 * Postgres-backed customer service. Data access goes through the
 * `CustomerRepository` abstraction (DIP); business rules (duplicate-email
 * checks, bulk orchestration, pagination envelope) live here. Every operation
 * is scoped to a `businessId`. Methods return the domain `ICustomer`; mapping to
 * `CustomerResponse` happens at the controller boundary.
 */
@Injectable()
export class CustomerService {
  constructor(
    @Inject(CUSTOMER_DATA_SOURCE)
    private readonly customerRepository: CustomerRepository,
  ) {}

  /**
   * Create a single customer for a business. If the customer has an email that
   * already exists within the business, it's a duplicate (409).
   */
  async create(businessId: string, dto: CreateCustomerDto): Promise<ICustomer> {
    if (
      dto.email &&
      (await this.customerRepository.emailExists(businessId, dto.email))
    ) {
      throw new ConflictException('A customer with this email already exists.')
    }
    return this.customerRepository.create({ businessId, ...dto })
  }

  /**
   * Bulk import customers (e.g. from phone contacts). Inserts everything it can:
   * duplicates (by email within the business, or repeated within the batch) are
   * skipped, invalid rows fail, and the rest are created. Returns a per-row
   * report. Processed sequentially so concurrent inserts can't race.
   */
  async bulkCreate(
    businessId: string,
    customers: CreateCustomerDto[],
  ): Promise<BulkImportResult> {
    const result: BulkImportResult = { created: [], skipped: [], failed: [] }

    // Flag within-batch email duplicates (case-insensitive).
    const seenEmails = new Set<string>()
    const isBatchDuplicate = customers.map((dto) => {
      const email = dto.email?.toLowerCase()
      if (!email) return false
      if (seenEmails.has(email)) return true
      seenEmails.add(email)
      return false
    })

    for (let index = 0; index < customers.length; index++) {
      const dto = customers[index]
      try {
        if (
          isBatchDuplicate[index] ||
          (dto.email &&
            (await this.customerRepository.emailExists(businessId, dto.email)))
        ) {
          result.skipped.push({ index, reason: 'Duplicate email.' })
          continue
        }
        const created = await this.customerRepository.create({
          businessId,
          ...dto,
        })
        result.created.push(created)
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        result.failed.push({ index, reason })
      }
    }

    return result
  }

  /**
   * List a business's customers, newest first, paginated. Optional `q` matches
   * (case-insensitive) name, email, or phone.
   */
  async list(
    businessId: string,
    opts: { page?: number; limit?: number; q?: string } = {},
  ): Promise<Paginated<ICustomer>> {
    const { page, limit, skip } = normalizePaging(opts.page, opts.limit)
    const { data, total } = await this.customerRepository.list(businessId, {
      skip,
      limit,
      q: opts.q,
    })
    return paginate(data, total, page, limit)
  }

  /**
   * Get a single customer by id, scoped to the business.
   * Throws NotFound if it doesn't exist or belongs to another business.
   */
  async getById(businessId: string, customerId: string): Promise<ICustomer> {
    const customer = await this.customerRepository.findById(
      businessId,
      customerId,
    )
    if (!customer) {
      throw new NotFoundException('Customer not found.')
    }
    return customer
  }

  /**
   * Update a customer, scoped to the business. Only the fields present in the
   * DTO are changed. If the email is changed to one already used by another
   * customer in the business, it's a duplicate (409).
   */
  async update(
    businessId: string,
    customerId: string,
    dto: UpdateCustomerDto,
  ): Promise<ICustomer> {
    const customer = await this.getById(businessId, customerId)

    if (
      dto.email &&
      dto.email !== customer.email &&
      (await this.customerRepository.emailExists(businessId, dto.email))
    ) {
      throw new ConflictException('A customer with this email already exists.')
    }

    const updated = await this.customerRepository.update(
      businessId,
      customerId,
      dto,
    )
    return updated ?? customer
  }

  /** Delete a customer, scoped to the business. Throws NotFound if missing. */
  async delete(businessId: string, customerId: string): Promise<ICustomer> {
    const removed = await this.customerRepository.delete(businessId, customerId)
    if (!removed) {
      throw new NotFoundException('Customer not found.')
    }
    return removed
  }
}
