import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer, CustomerDocument } from './schemas/customer.schema';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { Paginated, normalizePaging, paginate } from '../common/dto/paginated';
import { escapeRegex } from '../common/util/escape-regex';

export interface BulkImportResult {
  created: CustomerDocument[];
  skipped: { index: number; reason: string }[];
  failed: { index: number; reason: string }[];
}

@Injectable()
export class CustomerService {
  constructor(
    @InjectModel(Customer.name)
    private readonly customerModel: Model<CustomerDocument>,
  ) {}

  /**
   * Create a single customer for a business. If the customer has an email that
   * already exists within the business, it's a duplicate (409).
   */
  async create(
    businessId: string,
    dto: CreateCustomerDto,
  ): Promise<CustomerDocument> {
    if (dto.email && (await this.emailExists(businessId, dto.email))) {
      throw new ConflictException('A customer with this email already exists.');
    }
    return this.customerModel.create({ ...dto, businessId });
  }

  /**
   * Bulk import customers (e.g. from phone contacts). Inserts everything it
   * can: duplicates (by email within the business) are skipped, invalid rows
   * fail, and the rest are created. Returns a per-row report.
   */
  async bulkCreate(
    businessId: string,
    customers: CreateCustomerDto[],
  ): Promise<BulkImportResult> {
    const result: BulkImportResult = { created: [], skipped: [], failed: [] };

    // First pass (synchronous): flag within-batch email duplicates so the
    // concurrent inserts below can't race past each other.
    const seenEmails = new Set<string>();
    const isBatchDuplicate = customers.map((dto) => {
      const email = dto.email?.toLowerCase();
      if (!email) return false;
      if (seenEmails.has(email)) return true;
      seenEmails.add(email);
      return false;
    });

    const outcomes = await Promise.allSettled(
      customers.map(async (dto, index) => {
        if (isBatchDuplicate[index]) {
          return { status: 'skipped' as const, index };
        }
        // Skip if the email already exists for this business.
        if (dto.email && (await this.emailExists(businessId, dto.email))) {
          return { status: 'skipped' as const, index };
        }
        const doc = await this.customerModel.create({ ...dto, businessId });
        return { status: 'created' as const, index, doc };
      }),
    );

    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'rejected') {
        const reason =
          outcome.reason instanceof Error
            ? outcome.reason.message
            : String(outcome.reason);
        result.failed.push({ index, reason });
        return;
      }
      const value = outcome.value;
      if (value.status === 'created') {
        result.created.push(value.doc);
      } else {
        result.skipped.push({ index: value.index, reason: 'Duplicate email.' });
      }
    });

    return result;
  }

  /**
   * List a business's customers, newest first, paginated. Optional `q` matches
   * (case-insensitive) name, email, or phone.
   */
  async list(
    businessId: string,
    opts: { page?: number; limit?: number; q?: string } = {},
  ): Promise<Paginated<CustomerDocument>> {
    const { page, limit, skip } = normalizePaging(opts.page, opts.limit);
    const query: Record<string, unknown> = { businessId };
    if (opts.q?.trim()) {
      const rx = new RegExp(escapeRegex(opts.q.trim()), 'i');
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }];
    }

    const [data, total] = await Promise.all([
      this.customerModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.customerModel.countDocuments(query).exec(),
    ]);

    return paginate(data, total, page, limit);
  }

  /**
   * Get a single customer by id, scoped to the business.
   * Throws NotFound if it doesn't exist or belongs to another business.
   */
  async getById(
    businessId: string,
    customerId: string,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel
      .findOne({ _id: customerId, businessId })
      .exec();
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    return customer;
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
  ): Promise<CustomerDocument> {
    const customer = await this.getById(businessId, customerId);

    if (
      dto.email &&
      dto.email !== customer.email &&
      (await this.emailExists(businessId, dto.email))
    ) {
      throw new ConflictException('A customer with this email already exists.');
    }

    if (dto.name !== undefined) customer.name = dto.name;
    if (dto.email !== undefined) customer.email = dto.email;
    if (dto.phone !== undefined) customer.phone = dto.phone;
    if (dto.notes !== undefined) customer.notes = dto.notes;

    return customer.save();
  }

  /** Delete a customer, scoped to the business. Throws NotFound if missing. */
  async delete(
    businessId: string,
    customerId: string,
  ): Promise<CustomerDocument> {
    const customer = await this.customerModel
      .findOneAndDelete({ _id: customerId, businessId })
      .exec();
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }
    return customer;
  }

  /** Whether a customer with this email already exists in the business. */
  private async emailExists(
    businessId: string,
    email: string,
  ): Promise<boolean> {
    const existing = await this.customerModel
      .exists({ businessId, email })
      .exec();
    return !!existing;
  }
}
