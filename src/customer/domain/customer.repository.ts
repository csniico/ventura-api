import { ICustomer } from './customer.entity'

/** Fields accepted when creating a customer (always scoped to a business). */
export interface ICreateCustomer {
  businessId: string
  name: string
  email?: string | null
  phone?: string | null
  notes?: string | null
}

/** Partial patch applied to an existing customer. Only present keys are written. */
export interface IUpdateCustomer {
  name?: string
  email?: string | null
  phone?: string | null
  notes?: string | null
}

/** Options for a paginated, optionally-filtered customer listing. */
export interface ListCustomersOptions {
  skip: number
  limit: number
  q?: string
}

/**
 * Data-access boundary for customers. Every read/write is scoped by
 * `businessId`. Business rules (duplicate-email checks, bulk orchestration,
 * pagination envelope) live in the service.
 */
export interface CustomerRepository {
  create(data: ICreateCustomer): Promise<ICustomer>
  /** Get a customer by id within a business, or null. */
  findById(businessId: string, id: string): Promise<ICustomer | null>
  /** Whether a customer with this email exists in the business. */
  emailExists(businessId: string, email: string): Promise<boolean>
  /** A page of a business's customers (newest first) plus the total count. */
  list(
    businessId: string,
    opts: ListCustomersOptions,
  ): Promise<{ data: ICustomer[]; total: number }>
  /** Apply a patch to a customer within a business. Null if none. */
  update(
    businessId: string,
    id: string,
    patch: IUpdateCustomer,
  ): Promise<ICustomer | null>
  /** Delete a customer within a business, returning it. Null if none. */
  delete(businessId: string, id: string): Promise<ICustomer | null>
}

// Token for Nest DI (interfaces have no runtime representation to bind against).
export const CUSTOMER_DATA_SOURCE = Symbol('CUSTOMER_DATA_SOURCE')
