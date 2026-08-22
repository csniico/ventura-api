import { BusinessHours, IBusiness, Socials } from './business.entity';

/** Fields accepted when creating a business. */
export interface ICreateBusiness {
  name: string;
  ownerId: string;
  categories: string[];
  socials: Socials;
}

/**
 * Partial patch applied to an existing business. Only keys present are written;
 * an absent key is left untouched (mirrors the frontend's field-at-a-time updates).
 */
export interface IUpdateBusiness {
  name?: string;
  categories?: string[];
  description?: string | null;
  tagLine?: string | null;
  logo?: string | null;
  logoKey?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
  businessHours?: BusinessHours | null;
  socials?: Socials;
}

/**
 * Data-access boundary for businesses. Business rules (ownership checks, owner
 * linking, logo cleanup) live in the service; this only touches the database.
 */
export interface BusinessRepository {
  findById(id: string): Promise<IBusiness | null>;
  findByOwner(ownerId: string): Promise<IBusiness | null>;
  create(data: ICreateBusiness): Promise<IBusiness>;
  /** Apply a patch to the business with `id`. Returns null if none exists. */
  update(id: string, patch: IUpdateBusiness): Promise<IBusiness | null>;
  /** Permanently remove a business (used to roll back a failed owner link). */
  delete(id: string): Promise<void>;
}

// Token for Nest DI (interfaces have no runtime representation to bind against).
export const BUSINESS_DATA_SOURCE = Symbol('BUSINESS_DATA_SOURCE');
