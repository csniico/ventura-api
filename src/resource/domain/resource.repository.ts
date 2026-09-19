import {
  BusinessHours,
  IResource,
  ResourceType,
  ResourceUnit,
} from './resource.entity'
import {
  IStockAdjustment,
  StockAdjustmentReason,
} from './stock-adjustment.entity'

/** Fields accepted when creating a resource (scoped to a business). */
export interface ICreateResource {
  businessId: string
  type: ResourceType
  name: string
  price: number
  primaryImage?: string | null
  primaryImageKey?: string | null
  supportingImages?: string[]
  supportingImageKeys?: string[]
  description?: string | null
  notes?: string | null
  availableQuantity?: number
  lowStockThreshold?: number
  baseUnit?: string | null
  units?: ResourceUnit[]
  businessHours?: BusinessHours | null
}

/** Partial patch applied to an existing resource. Only present keys are written. */
export interface IUpdateResource {
  name?: string
  price?: number
  primaryImage?: string | null
  primaryImageKey?: string | null
  supportingImages?: string[]
  supportingImageKeys?: string[]
  description?: string | null
  notes?: string | null
  availableQuantity?: number
  lowStockThreshold?: number
  baseUnit?: string | null
  units?: ResourceUnit[]
  businessHours?: BusinessHours | null
}

/** Options for a paginated, optionally-filtered resource listing. */
export interface ListResourcesOptions {
  skip: number
  limit: number
  q?: string
  type?: ResourceType
}

/** A single signed stock movement to record against a product. */
export interface IRecordAdjustment {
  businessId: string
  resourceId: string
  /** Signed change: positive adds stock, negative removes it. */
  delta: number
  reason: StockAdjustmentReason
  note?: string | null
  createdBy?: string | null
}

/** Options for a paginated stock-adjustment history listing. */
export interface ListAdjustmentsOptions {
  skip: number
  limit: number
}

/**
 * Data-access boundary for resources. Every read/write is scoped by
 * `businessId`. Business rules (type validation, image cleanup) live in the
 * service; atomic stock changes are exposed here since they must be a single DB
 * operation.
 */
export interface ResourceRepository {
  create(data: ICreateResource): Promise<IResource>
  findById(businessId: string, id: string): Promise<IResource | null>
  list(
    businessId: string,
    opts: ListResourcesOptions,
  ): Promise<{ data: IResource[]; total: number }>
  update(
    businessId: string,
    id: string,
    patch: IUpdateResource,
  ): Promise<IResource | null>
  delete(businessId: string, id: string): Promise<IResource | null>
  /**
   * Atomically decrement a product's stock by `quantity`, only if enough is
   * available and it is a product. Returns true on success, false otherwise.
   */
  decrementStock(
    businessId: string,
    id: string,
    quantity: number,
  ): Promise<boolean>
  /** Atomically restore a product's stock by `quantity`. No-op for non-products. */
  incrementStock(
    businessId: string,
    id: string,
    quantity: number,
  ): Promise<void>
  /** Count products at or below their low-stock threshold. */
  countLowStock(businessId: string): Promise<number>
  /**
   * Atomically apply a signed stock `delta` to a product and append a ledger
   * row (with the resulting `balanceAfter`) in the same transaction. Returns the
   * created adjustment, or null if it couldn't be applied (insufficient stock
   * for a negative delta, or the resource isn't a product).
   */
  recordAdjustment(data: IRecordAdjustment): Promise<IStockAdjustment | null>
  /** A product's stock-adjustment history, newest first, paginated. */
  listAdjustments(
    businessId: string,
    resourceId: string,
    opts: ListAdjustmentsOptions,
  ): Promise<{ data: IStockAdjustment[]; total: number }>
}

// Token for Nest DI (interfaces have no runtime representation to bind against).
export const RESOURCE_DATA_SOURCE = Symbol('RESOURCE_DATA_SOURCE')
