export enum ResourceType {
  PRODUCT = 'product',
  SERVICE = 'service',
}

/** Service-only opening hours keyed by weekday. */
export type BusinessHours = Record<string, { open: string; close: string }>

/**
 * An alternate sell/buy unit for a product (bulk-to-retail). `factor` is how
 * many base units one of this unit equals (e.g. a carton of 24 → factor 24);
 * `price` is the price for one of this unit. Stock is always tracked in base
 * units, so an order in this unit decrements `quantity * factor`.
 */
export interface ResourceUnit {
  name: string
  factor: number
  price: number
}

/**
 * Domain contract for a sellable resource — a product (has stock) or a service
 * (has business hours), unified so orders can reference any sellable by one id.
 * Mirrors the public `ResourceResponse`. `businessId` scopes every read/write
 * (shared-schema tenancy).
 */
export interface IResource {
  id: string
  shortId: string
  businessId: string
  type: ResourceType
  name: string
  price: number
  primaryImage?: string | null
  primaryImageKey?: string | null
  supportingImages: string[]
  supportingImageKeys: string[]
  description?: string | null
  notes?: string | null
  availableQuantity: number
  lowStockThreshold: number
  /** Label for the unit stock is counted in (e.g. "piece"); null = unitless. */
  baseUnit?: string | null
  /** Alternate bulk units for sale/purchase; base unit is implicit (factor 1). */
  units: ResourceUnit[]
  businessHours?: BusinessHours | null
  createdAt: Date
  updatedAt: Date
}
