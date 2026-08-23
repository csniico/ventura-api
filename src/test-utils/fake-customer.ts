import type { Provider } from '@nestjs/common'
import { nanoid } from 'nanoid/non-secure'
import { CustomerService } from '../customer/application/customer.service'
import { ICustomer } from '../customer/domain/customer.entity'
import {
  CUSTOMER_DATA_SOURCE,
  CustomerRepository,
  ICreateCustomer,
  IUpdateCustomer,
  ListCustomersOptions,
} from '../customer/domain/customer.repository'

/**
 * In-memory `CustomerRepository` for tests. Reproduces the Postgres entity's
 * write-time semantics and business-scoped queries. `list` matches the real
 * repo: newest first, case-insensitive `q` over name/email/phone, paginated.
 */
export class FakeCustomerRepository implements CustomerRepository {
  private readonly rows = new Map<string, ICustomer>()
  private seq = 0

  create(data: ICreateCustomer): Promise<ICustomer> {
    const now = new Date()
    const customer: ICustomer = {
      id: `20000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`,
      shortId: nanoid(8),
      businessId: data.businessId,
      name: data.name,
      email: data.email ?? null,
      phone: data.phone ?? null,
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    }
    this.rows.set(customer.id, customer)
    return Promise.resolve({ ...customer })
  }
  findById(businessId: string, id: string): Promise<ICustomer | null> {
    const c = this.rows.get(id)
    return Promise.resolve(c && c.businessId === businessId ? { ...c } : null)
  }
  emailExists(businessId: string, email: string): Promise<boolean> {
    const found = [...this.rows.values()].some(
      (c) => c.businessId === businessId && c.email === email,
    )
    return Promise.resolve(found)
  }
  list(
    businessId: string,
    opts: ListCustomersOptions,
  ): Promise<{ data: ICustomer[]; total: number }> {
    let rows = [...this.rows.values()].filter(
      (c) => c.businessId === businessId,
    )
    const q = opts.q?.trim().toLowerCase()
    if (q) {
      rows = rows.filter((c) =>
        [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)),
      )
    }
    // Newest first (insertion order proxies createdAt).
    rows.reverse()
    const total = rows.length
    const data = rows
      .slice(opts.skip, opts.skip + opts.limit)
      .map((c) => ({ ...c }))
    return Promise.resolve({ data, total })
  }
  update(
    businessId: string,
    id: string,
    patch: IUpdateCustomer,
  ): Promise<ICustomer | null> {
    const existing = this.rows.get(id)
    if (!existing || existing.businessId !== businessId) {
      return Promise.resolve(null)
    }
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    )
    const merged = { ...existing, ...clean, updatedAt: new Date() }
    this.rows.set(id, merged)
    return Promise.resolve({ ...merged })
  }
  delete(businessId: string, id: string): Promise<ICustomer | null> {
    const existing = this.rows.get(id)
    if (!existing || existing.businessId !== businessId) {
      return Promise.resolve(null)
    }
    this.rows.delete(id)
    return Promise.resolve({ ...existing })
  }

  // --- Test-only helpers (not part of the port) ---
  _clear(): void {
    this.rows.clear()
    this.seq = 0
  }
  _count(): number {
    return this.rows.size
  }
}

/**
 * Providers for a fake-backed `CustomerService` plus a handle to the fake store.
 */
export function fakeCustomerServiceProviders(): {
  providers: Provider[]
  customers: FakeCustomerRepository
} {
  const customers = new FakeCustomerRepository()
  return {
    customers,
    providers: [
      CustomerService,
      { provide: CUSTOMER_DATA_SOURCE, useValue: customers },
    ],
  }
}
