/**
 * Domain contract for a customer. Mirrors the public API shape
 * (see `CustomerResponse`). `businessId` is a plain `business.id` string that
 * scopes every read/write (shared-schema tenancy).
 */
export interface ICustomer {
  id: string;
  shortId: string;
  businessId: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
