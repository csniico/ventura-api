export enum ResourceType {
  PRODUCT = 'product',
  SERVICE = 'service',
}

/** Service-only opening hours keyed by weekday. */
export type BusinessHours = Record<string, { open: string; close: string }>;

/**
 * Domain contract for a sellable resource — a product (has stock) or a service
 * (has business hours), unified so orders can reference any sellable by one id.
 * Mirrors the public `ResourceResponse`. `businessId` scopes every read/write
 * (shared-schema tenancy).
 */
export interface IResource {
  id: string;
  shortId: string;
  businessId: string;
  type: ResourceType;
  name: string;
  price: number;
  primaryImage?: string | null;
  primaryImageKey?: string | null;
  supportingImages: string[];
  supportingImageKeys: string[];
  description?: string | null;
  notes?: string | null;
  availableQuantity: number;
  lowStockThreshold: number;
  businessHours?: BusinessHours | null;
  createdAt: Date;
  updatedAt: Date;
}
